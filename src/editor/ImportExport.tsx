import { useEffect, useState } from 'react'
import type { SurveyBackend } from './backend'
import type { Bundle, MergeOptions, MergeReport, Prefer, SetInfo, SurveyObject } from './types'

const EMPTY_INFO: SetInfo = { name: '', authors: [], comment: '' }

/** A set file (Export's), or one playfield's placements or notes file from a set's folder. */
export function toBundle(json: unknown, file: string): Bundle {
  const j = json as Record<string, unknown>
  if (j && typeof j.playfields === 'object') return j as unknown as Bundle
  if (j && typeof j.playfield === 'number') {
    const content = {
      placements: (j.placements as unknown[]) ?? [],
      notes: (j.notes as Bundle['playfields'][string]['notes']) ?? [],
      scripts: (j.scripts as Bundle['playfields'][string]['scripts']) ?? [],
    }
    return { format: 1, info: EMPTY_INFO, playfields: { [j.playfield]: content } }
  }
  throw new Error(`${file}: not a survey set, placements or notes file`)
}

function combine(bundles: Bundle[]): Bundle {
  const out: Bundle = { format: 1, info: { ...EMPTY_INFO, authors: [] }, playfields: {} }
  for (const b of bundles) {
    out.info.name ||= b.info?.name ?? ''
    for (const a of b.info?.authors ?? []) if (!out.info.authors.includes(a)) out.info.authors.push(a)
    for (const [pf, c] of Object.entries(b.playfields)) {
      const o = (out.playfields[pf] ??= { placements: [], notes: [], scripts: [] })
      o.placements.push(...(c.placements ?? []))
      o.notes.push(...(c.notes ?? []))
      o.scripts.push(...(c.scripts ?? []))
    }
  }
  return out
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'survey'

export function ImportExport({ backend, playfield, objects, onClose, onImported }: { backend: SurveyBackend; playfield: number | null; objects: SurveyObject[]; onClose: () => void; onImported: () => void }) {
  const [info, setInfo] = useState<SetInfo | null>(null)
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [distance, setDistance] = useState(1)
  const [heading, setHeading] = useState(20)
  const [prefer, setPrefer] = useState<Prefer>('newer')
  const [take, setTake] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MergeReport | null>(null)
  const [done, setDone] = useState<MergeReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    backend.setInfo().then(setInfo).catch((e) => setError(String(e)))
  }, [backend])

  const options = (): MergeOptions => ({ distance, heading, prefer, take: [...take] })

  // a new tolerance or preference: the preview is out of date
  useEffect(() => setPreview(null), [distance, heading, prefer, bundle])

  async function read(list: FileList | null) {
    setError('')
    setDone(null)
    try {
      const all = await Promise.all([...(list ?? [])].map(async (f) => toBundle(JSON.parse(await f.text()), f.name)))
      setBundle(all.length ? combine(all) : null)
      setFiles([...(list ?? [])].map((f) => f.name))
      setTake(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function exportSet(pf: number | null) {
    try {
      const b = await backend.exportSet(pf)
      const date = new Date().toISOString().slice(0, 10)
      download(`${slug(b.info.name)}${pf === null ? '' : `-${pf}`}-${date}.survey.json`, b)
    } catch (e) {
      setError(String(e))
    }
  }

  async function merge(dryRun: boolean) {
    if (!bundle) return
    setError('')
    try {
      const r = await backend.importSet(bundle, options(), dryRun)
      if (dryRun) setPreview(r)
      else {
        setDone(r)
        setPreview(null)
        setBundle(null)
        onImported()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Names for the report's ids: theirs from the files, ours from this playfield. */
  const nameOf = (id: string) => {
    for (const c of Object.values(bundle?.playfields ?? {})) {
      const p = (c.placements as { id?: string; name?: string }[]).find((x) => x.id === id)
      if (p?.name) return p.name
    }
    return objects.find((o) => o.id === id)?.name ?? null
  }

  const counts = bundle && Object.values(bundle.playfields).reduce((c, p) => [c[0] + p.placements.length, c[1] + p.notes.length, c[2] + p.scripts.length], [0, 0, 0])

  return (
    <div className="sv-modal-back" onClick={onClose}>
      <div className="card sv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sv-row">
          <h2 className="sv-grow">Your set</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="banner warn">{error}</p>}
        {info && (
          <>
            <label className="sv-field">
              <span>name</span>
              <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} onBlur={() => backend.saveSetInfo(info).catch((e) => setError(String(e)))} />
            </label>
            <label className="sv-field">
              <span>comment</span>
              <input value={info.comment} onChange={(e) => setInfo({ ...info, comment: e.target.value })} onBlur={() => backend.saveSetInfo(info).catch((e) => setError(String(e)))} />
            </label>
            {info.authors.length > 0 && <p className="muted small">By {info.authors.join(', ')}</p>}
          </>
        )}
        <div className="sv-row">
          <b>Export</b>
          <button disabled={playfield === null} onClick={() => exportSet(playfield)}>
            This playfield
          </button>
          <button onClick={() => exportSet(null)}>Whole set</button>
          <span className="muted small">One file to share; others import it into their set.</span>
        </div>

        <h3>Import and merge</h3>
        <p className="muted small">
          Someone's exported set, or files from a set's folder (<code>4600.placements.json</code>, <code>4600.notes.json</code>). Duplicates are skipped, and so is anything of
          the same kind and look as yours within the distance and angle below.
        </p>
        <input type="file" accept=".json,application/json" multiple onChange={(e) => read(e.target.files)} />
        {bundle && counts && (
          <p className="small">
            {files.join(', ')}: {Object.keys(bundle.playfields).length} playfields, {counts[0]} placements, {counts[1]} notes, {counts[2]} scripts
            {bundle.info.authors.length > 0 && ` by ${bundle.info.authors.join(', ')}`}
          </p>
        )}
        <div className="sv-row">
          <label>
            same thing within <input className="sv-num" type="number" min={0} step={0.1} value={distance} onChange={(e) => setDistance(Number(e.target.value))} /> m
          </label>
          <label>
            and <input className="sv-num" type="number" min={0} max={180} value={heading} onChange={(e) => setHeading(Number(e.target.value))} /> °
          </label>
          <label>
            conflicts keep{' '}
            <select value={prefer} onChange={(e) => setPrefer(e.target.value as Prefer)}>
              <option value="newer">the newer change</option>
              <option value="ours">mine</option>
              <option value="theirs">theirs</option>
            </select>
          </label>
        </div>
        <div className="sv-row">
          <button disabled={!bundle} onClick={() => merge(true)}>
            Preview
          </button>
          <button className="primary" disabled={!bundle || !preview} onClick={() => merge(false)} title={preview ? '' : 'Preview first'}>
            Import
          </button>
        </div>
        {preview && <Report report={preview} take={take} setTake={setTake} nameOf={nameOf} />}
        {done && (
          <p className="banner small">
            Imported: {done.added.length} added, {done.duplicates.length} duplicates and {done.near.length} near-duplicates skipped, {done.conflicts.length} conflicts settled.
          </p>
        )}
      </div>
    </div>
  )
}

function Report({ report, take, setTake, nameOf }: { report: MergeReport; take: Set<string>; setTake: (s: Set<string>) => void; nameOf: (id: string) => string | null }) {
  const toggle = (id: string) => {
    const s = new Set(take)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setTake(s)
  }
  return (
    <div className="sv-panel">
      <p className="small">
        <b>{report.added.length}</b> to add, <b>{report.duplicates.length}</b> duplicates skipped, <b>{report.near.length}</b> near-duplicates skipped,{' '}
        <b>{report.conflicts.length}</b> conflicts.
      </p>
      {report.near.length > 0 && (
        <>
          <h3>Near-duplicates (skipped unless ticked)</h3>
          <ul className="sv-list sv-report">
            {report.near.map((n) => (
              <li key={n.theirs}>
                <label className="check">
                  <input type="checkbox" checked={take.has(n.theirs)} onChange={() => toggle(n.theirs)} /> take anyway
                </label>
                <span className="sv-name small" title={`theirs ${n.theirs}, yours ${n.ours}`}>
                  {nameOf(n.theirs) ?? n.theirs} ≈ your {nameOf(n.ours) ?? n.ours}
                </span>
                <span className="sv-dist">
                  {n.playfield} · {n.distance.toFixed(2)} m
                </span>
              </li>
            ))}
          </ul>
          {take.size > 0 && <p className="muted small">Preview again to see the ticked ones counted.</p>}
        </>
      )}
      {report.conflicts.length > 0 && (
        <>
          <h3>Conflicts</h3>
          <ul className="sv-list sv-report">
            {report.conflicts.map((c) => (
              <li key={c.theirs + c.ours}>
                <span className="sv-name small" title={c.theirs === c.ours ? c.ours : `${c.theirs} vs ${c.ours}`}>
                  {nameOf(c.ours) ?? nameOf(c.theirs) ?? c.ours}
                </span>
                <span className="badge">{c.kept === 'ours' ? 'keeps yours' : 'takes theirs'}</span>
                <span className="sv-dist">{c.playfield}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
