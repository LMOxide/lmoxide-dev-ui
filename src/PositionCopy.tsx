import { useCallback, useEffect, useRef, useState } from 'react'
import { Heading } from './Heading'
import { KEYS, loadJson, saveJson } from './storage'
import { playfieldName, type GameData } from './suggest'
import type { Player } from './types'

export type Separator = 'tab' | 'space' | 'comma'

export interface CoordFormat {
  sep: Separator
  /** the heading after z */
  rotation: boolean
  /** decimal places for every value */
  decimals: number
}

/** Tab separated with the rotation: pastes into a spreadsheet as four cells. */
const DEFAULT_FORMAT: CoordFormat = { sep: 'tab', rotation: true, decimals: 1 }

const MAX_DECIMALS = 6

const SEPARATORS: [Separator, string, string][] = [
  ['tab', 'Tab separated', '\t'],
  ['space', 'Space separated', ' '],
  ['comma', 'Comma separated', ','],
]

/** x y z (and r, the heading in degrees) as copied. */
export function formatPosition(pos: [number, number, number], heading: number | null | undefined, f: CoordFormat): string {
  const parts = pos.map((v) => v.toFixed(f.decimals))
  if (f.rotation && heading != null) {
    // 359.96 at 1 decimal is 0.0, not 360.0
    const step = 10 ** f.decimals
    parts.push(((((Math.round(heading * step) / step) % 360) + 360) % 360).toFixed(f.decimals))
  }
  return parts.join(SEPARATORS.find(([s]) => s === f.sep)![2])
}

/** The copy format (remembered) and a copy of the player's position with a short-lived "copied" state. */
/** Where someone is: a debugger player, or the world editor's own character. */
export type Whereabouts = Pick<Player, 'position' | 'heading' | 'playfield'>

export function usePositionCopy(online: Whereabouts | undefined) {
  const [format, setFormatState] = useState<CoordFormat>(() => ({ ...DEFAULT_FORMAT, ...loadJson<Partial<CoordFormat>>(KEYS.coordFormat, {}) }))
  const setFormat = (f: CoordFormat) => {
    setFormatState(f)
    saveJson(KEYS.coordFormat, f)
  }
  const [copied, setCopied] = useState<'ok' | 'failed' | 'none' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pos = online?.position
  const text = pos ? formatPosition(pos, online?.heading, format) : ''
  const flash = (state: 'ok' | 'failed' | 'none') => {
    setCopied(state)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 1500)
  }
  const copy = useCallback(() => {
    if (!text) return flash('none')
    if (!navigator.clipboard) return flash('failed')
    navigator.clipboard.writeText(text).then(
      () => flash('ok'),
      () => flash('failed'),
    )
  }, [text])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { format, setFormat, text, copy, copied }
}

export type PositionCopy = ReturnType<typeof usePositionCopy>

/** Ctrl+Shift+C anywhere on the page copies the position . */
function useCopyKey(copy: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.code !== 'KeyC') return
      e.preventDefault()
      copy()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copy])
}

/** Bottom right, always: where the chosen player is, a copy button (Ctrl+Shift+C) and the copy format. */
export function PositionDock({ data, place, online, pc, empty = 'no player chosen' }: { data?: GameData; /** the playfield's name (else from `data`) */ place?: string; online: Whereabouts | undefined; pc: PositionCopy; /** shown with nobody */ empty?: string }) {
  const { format, setFormat, text, copy, copied } = pc
  const [open, setOpen] = useState(false)
  useCopyKey(copy)
  const pos = online?.position
  const sepLabel = SEPARATORS.find(([s]) => s === format.sep)![1]
  return (
    <div className={`position-dock${copied ? ` flash-${copied}` : ''}`}>
      {open && (
        <div className="position-dock-menu" role="dialog" aria-label="Copy format">
          <fieldset>
            <legend className="muted small">Copy as</legend>
            {SEPARATORS.map(([s, label]) => (
              <label key={s}>
                <input type="radio" name="coord-sep" checked={format.sep === s} onChange={() => setFormat({ ...format, sep: s })} /> {label}
              </label>
            ))}
            <label>
              Decimal places{' '}
              <input
                type="number"
                className="decimals"
                min={0}
                max={MAX_DECIMALS}
                value={format.decimals}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (Number.isFinite(n)) setFormat({ ...format, decimals: Math.min(MAX_DECIMALS, Math.max(0, n)) })
                }}
              />
            </label>
            <label>
              <input type="checkbox" checked={format.rotation} onChange={(e) => setFormat({ ...format, rotation: e.target.checked })} /> With rotation
            </label>
          </fieldset>
          <p className="muted small">
            {pos ? (
              <>
                Copies <code className="preview">{text.replace(/\t/g, '⇥')}</code>
              </>
            ) : (
              <>
                e.g. <code className="preview">{formatPosition([12.5, 3, -40.2], 90, format).replace(/\t/g, '⇥')}</code>
              </>
            )}
          </p>
          <p className="muted small">
            <kbd>Ctrl Shift C</kbd> copies from anywhere on the page.
          </p>
        </div>
      )}
      <div className="position-dock-bar">
        <button
          className="position-dock-copy"
          onClick={copy}
          disabled={!pos}
          title={pos ? `Copy ${sepLabel.toLowerCase()}${format.rotation ? ', with rotation' : ''} (Ctrl+Shift+C)` : 'No position to copy'}
        >
          {(place ?? (online?.playfield != null && data ? playfieldName(data, online.playfield) : null)) && <span className="pf">{place ?? playfieldName(data!, online!.playfield!)}</span>}
          <span className="mono">
            {pos ? (
              <>
                {pos.map((v) => v.toFixed(format.decimals)).join(', ')}
                {online?.heading != null && <Heading degrees={online.heading} compact />}
              </>
            ) : (
              <span className="muted">{!online ? empty : online.playfield == null ? 'not in play yet' : 'no position'}</span>
            )}
          </span>
          <span className="state" aria-live="polite">
            {copied === 'ok' ? '✓ Copied' : copied === 'failed' ? 'Copy failed' : copied === 'none' ? 'Nothing to copy' : 'Copy'}
          </span>
        </button>
        <button className={`position-dock-gear${open ? ' on' : ''}`} onClick={() => setOpen(!open)} title="Copy format" aria-expanded={open}>
          {format.sep === 'tab' ? '⇥' : format.sep === 'comma' ? ',' : '␣'}
          {format.rotation ? 'r' : ''} ▾
        </button>
      </div>
    </div>
  )
}
