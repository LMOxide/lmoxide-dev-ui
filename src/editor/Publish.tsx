import { useState } from 'react'
import type { SurveyBackend } from './backend'
import type { PublishRequest, Unpublished } from './types'

/** How many records of these changes there are. */
export const recordCount = (list: Unpublished[]) => list.reduce((n, c) => n + c.items.length, 0)

/**
 * Changes saved on the survey server but not published: play servers (the approval queue) only
 * see what is published. Yours first; anyone's can be published.
 */
export function Publish({
  backend,
  unpublished,
  setUnpublished,
  onClose,
}: {
  backend: SurveyBackend
  unpublished: Unpublished[]
  setUnpublished: (u: Unpublished[]) => void
  onClose: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const mine = unpublished.filter((c) => c.mine)
  const others = unpublished.filter((c) => !c.mine)

  async function publish(req: PublishRequest) {
    setBusy(true)
    setError('')
    try {
      const r = await backend.publish(req)
      setUnpublished(r.unpublished)
      setDone(`Published ${r.records} record${r.records === 1 ? '' : 's'}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const key = (c: Unpublished) => `${c.playfield} ${c.feature} ${c.author}`
  const group = (c: Unpublished) => (
    <li key={key(c)}>
      <div className="sv-row">
        <button className="ghost" onClick={() => setOpen(open === key(c) ? null : key(c))} aria-expanded={open === key(c)}>
          {open === key(c) ? '▾' : '▸'}
        </button>
        <div className="sv-grow">
          <b>{c.playfield_name}</b> <span className="muted small">{c.feature_path || c.feature}</span>
          {!c.mine && <span className="badge">{c.author}</span>}
          <div className="small muted">{c.summary}</div>
        </div>
        <button disabled={busy} onClick={() => publish({ playfield: c.playfield, feature: c.feature, author: c.author })}>
          Publish
        </button>
      </div>
      {open === key(c) && (
        <ul className="plain sv-publish-items">
          {c.items.map((i) => (
            <li key={i.kind + i.id} className="small">
              <span className={`badge${i.op === 'removed' ? ' warn' : ''}`}>{i.op}</span> {i.name} <span className="muted">{i.kind}</span>
              {i.details?.length ? <span className="muted"> · {i.details.join(', ')}</span> : null}
              {i.tags?.length ? <span className="muted"> · {i.tags.map((t) => `#${t}`).join(' ')}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  )

  return (
    <div className="sv-modal-back" onClick={onClose}>
      <div className="card sv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sv-row">
          <h2 className="sv-grow">Publish</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          What you do here is saved on the world editor's server as you work, so nothing is lost if the page or the game closes. Play servers only take in what is
          published (and then approve it, or their rules do).
        </p>
        {error && <p className="banner warn">{error}</p>}
        {done && <p className="banner">{done}</p>}
        <div className="sv-row">
          <h3 className="sv-grow">Yours: {recordCount(mine) || 'nothing'} unpublished</h3>
          <button disabled={busy || !mine.length} onClick={() => publish({})}>
            Publish all of yours
          </button>
        </div>
        <ul className="plain">{mine.map(group)}</ul>
        {others.length > 0 && (
          <>
            <div className="sv-row">
              <h3 className="sv-grow">Others': {recordCount(others)} unpublished</h3>
            </div>
            <ul className="plain">{others.map(group)}</ul>
          </>
        )}
      </div>
    </div>
  )
}
