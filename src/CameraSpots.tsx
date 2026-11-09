import { useRef, useState } from 'react'
import { KEYS, loadJson, saveJson } from './storage'
import { playfieldName, type GameData } from './suggest'
import type { Player } from './types'

/** A god-camera view saved from the client's Alt+F9 line (lmoxide docs/GOD-CAMERA.md). */
export interface CameraSpot {
  id: string
  name: string
  pos: [number, number, number]
  /** quaternion x, y, z, w */
  rot: [number, number, number, number]
  fov: number
  /** where the player was when it was saved (the line itself has no playfield) */
  playfield: number | null
  /** unix ms */
  saved: number
}

const NUM = String.raw`(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)`
const LINE = new RegExp(String.raw`camera\.god\s*\{\s*pos\s*=\s*\{\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*\}\s*,\s*rot\s*=\s*\{\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*\}\s*(?:,\s*fov\s*=\s*${NUM}\s*)?\}`, 'i')

/** The client's `/luac camera.god{pos={x, y, z}, rot={x, y, z, w}, fov=f}` (Alt+F9 in god camera). */
export function parseCameraLine(text: string): Pick<CameraSpot, 'pos' | 'rot' | 'fov'> | null {
  const m = LINE.exec(text)
  if (!m) return null
  const n = m.slice(1).map((v) => (v === undefined ? NaN : Number(v)))
  return { pos: [n[0], n[1], n[2]], rot: [n[3], n[4], n[5], n[6]], fov: Number.isFinite(n[7]) ? n[7] : 0 }
}

/** The chat line that puts the god camera back there (fov 0 keeps the current one). */
export function cameraLine(s: Pick<CameraSpot, 'pos' | 'rot' | 'fov'>): string {
  const f = (v: number) => v.toFixed(6).replace(/\.?0+$/, '')
  return `/luac camera.god{pos={${s.pos.map(f).join(', ')}}, rot={${s.rot.map(f).join(', ')}}, fov=${f(s.fov)}}`
}

/** Compass heading (0 = +z, clockwise) and tilt (negative = looking down) of a camera rotation, for the list. */
function look(rot: CameraSpot['rot']): { heading: number; tilt: number } {
  const [x, y, z, w] = rot
  // the camera's forward (+z) turned by the quaternion
  const fx = 2 * (x * z + w * y)
  const fy = 2 * (y * z - w * x)
  const fz = 1 - 2 * (x * x + y * y)
  const deg = (r: number) => (r * 180) / Math.PI
  return { heading: (deg(Math.atan2(fx, fz)) + 360) % 360, tilt: deg(Math.asin(Math.max(-1, Math.min(1, fy)))) }
}

function useSpots(): [CameraSpot[], (f: (old: CameraSpot[]) => CameraSpot[]) => void] {
  const [spots, setState] = useState<CameraSpot[]>(() => loadJson<CameraSpot[]>(KEYS.cameraSpots, []))
  const set = (f: (old: CameraSpot[]) => CameraSpot[]) =>
    setState((old) => {
      const next = f(old)
      saveJson(KEYS.cameraSpots, next)
      return next
    })
  return [spots, set]
}

function isSpot(v: unknown): v is CameraSpot {
  const s = v as CameraSpot
  return !!s && typeof s.name === 'string' && Array.isArray(s.pos) && s.pos.length === 3 && Array.isArray(s.rot) && s.rot.length === 4
}

/** Visuals → Camera spots: keep god-camera views (Alt+F9 lines) and put them back in game. */
export function CameraSpots({ data, online, send, canSend, may }: { data: GameData; online: Player | undefined; send: (cmd: string) => void; canSend: boolean; may: (cmd: string) => boolean }) {
  const [spots, setSpots] = useSpots()
  const [line, setLine] = useState('')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const parsed = parseCameraLine(line)
  const here = online?.playfield ?? null
  const place = (pf: number | null) => (pf == null ? 'unknown playfield' : playfieldName(data, pf))

  function flash(id: string) {
    setCopied(id)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 1500)
  }

  function save() {
    if (!parsed) return
    const spot: CameraSpot = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || `Spot ${spots.length + 1}`,
      ...parsed,
      playfield: here,
      saved: Date.now(),
    }
    setSpots((old) => [spot, ...old])
    setLine('')
    setName('')
    setMessage('')
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      setLine(text)
      setMessage(parseCameraLine(text) ? '' : 'The clipboard has no camera line: press Alt+F9 in god camera first.')
    } catch {
      setMessage('The browser won’t read the clipboard here (it needs https or localhost): paste into the box with Ctrl+V.')
    }
  }

  function copy(s: CameraSpot) {
    const text = cameraLine(s)
    if (!navigator.clipboard) return setMessage(`Copy failed; the line is: ${text}`)
    navigator.clipboard.writeText(text).then(
      () => flash(s.id),
      () => setMessage(`Copy failed; the line is: ${text}`),
    )
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ kind: 'lmoxide-camera-spots', spots }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'camera-spots.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function importJson(file: File) {
    file.text().then((text) => {
      try {
        const raw = JSON.parse(text)
        const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray(raw?.spots) ? raw.spots : []
        const got = list.filter(isSpot)
        setSpots((old) => {
          const known = new Set(old.map((s) => s.id))
          return [...old, ...got.filter((s) => !known.has(s.id))]
        })
        setMessage(`Imported ${got.length} spot${got.length === 1 ? '' : 's'}.`)
      } catch {
        setMessage('That file isn’t a camera spots export.')
      }
    })
  }

  // this playfield's first, then the others by playfield
  const sorted = [...spots].sort((a, b) => Number(b.playfield === here) - Number(a.playfield === here) || (a.playfield ?? 0) - (b.playfield ?? 0))

  return (
    <div className="camera-spots">
      <p className="muted small">
        In game: <kbd>Ctrl Alt V</kbd> god camera, frame the view (<kbd>WASD</kbd> <kbd>Q</kbd>/<kbd>E</kbd>, right mouse to look), <kbd>Alt F9</kbd> copies it. Save it here. To go back: <b>Copy</b>, then in game chat <kbd>Ctrl V</kbd>{' '}
        <kbd>Enter</kbd>. Spots stay in this browser. All keys: lmoxide <code>docs/GOD-CAMERA.md</code>.
      </p>
      <form
        className="camera-save"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="/luac camera.god{pos={…}, rot={…}, fov=…}" aria-label="Camera line" className="mono" />
        <button type="button" onClick={pasteClipboard} title="Read the Alt+F9 line from the clipboard">
          Paste
        </button>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Spot name" />
        <button type="submit" disabled={!parsed}>
          Save
        </button>
      </form>
      {line && !parsed && <p className="muted small">Not a camera line yet: it looks like <code>/luac camera.god{'{'}pos={'{'}x, y, z{'}'}, rot={'{'}x, y, z, w{'}'}, fov=f{'}'}</code>.</p>}
      {parsed && (
        <p className="muted small">
          Saves ({parsed.pos.map((v) => v.toFixed(1)).join(', ')}) in {place(here)}.
        </p>
      )}
      {message && <p className="small">{message}</p>}
      {sorted.length === 0 ? (
        <p className="muted small">No camera spots yet.</p>
      ) : (
        <ul className="camera-list">
          {sorted.map((s) => {
            const { heading, tilt } = look(s.rot)
            const elsewhere = s.playfield != null && s.playfield !== here
            return (
              <li key={s.id}>
                <input
                  className="camera-name"
                  value={s.name}
                  aria-label="Spot name"
                  onChange={(e) => setSpots((old) => old.map((o) => (o.id === s.id ? { ...o, name: e.target.value } : o)))}
                />
                <span className="muted small">
                  {place(s.playfield)} · <span className="mono">({s.pos.map((v) => v.toFixed(1)).join(', ')})</span> · facing {heading.toFixed(0)}°, tilt {tilt.toFixed(0)}°
                  {s.fov ? ` · fov ${s.fov.toFixed(0)}` : ''}
                </span>
                <span className="camera-actions">
                  <button onClick={() => copy(s)} title={cameraLine(s)}>
                    {copied === s.id ? '✓ Copied' : 'Copy'}
                  </button>
                  {elsewhere && (
                    <button disabled={!canSend || !may('!tp')} onClick={() => send(`!tp ${s.playfield}`)} title={`!tp ${s.playfield}: the camera only shows the playfield you are in`}>
                      Teleport to {place(s.playfield)}
                    </button>
                  )}
                  <button className="danger" onClick={() => setSpots((old) => old.filter((o) => o.id !== s.id))} title="Delete this spot">
                    ✕
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="camera-io">
        <button onClick={exportJson} disabled={spots.length === 0}>
          Export
        </button>
        <label className="button">
          Import
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
        </label>
      </p>
    </div>
  )
}
