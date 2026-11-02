import { useEffect, useState } from 'react'
import type { SurveyBackend } from './backend'
import type { CommitRequest, Contribution, Unpublished } from './types'
import { download } from '../notes'

/** How many records of these changes there are. */
export const recordCount = (list: Unpublished[]) => list.reduce((n, c) => n + c.items.length, 0)

const STATUS: Record<Contribution['status'], string> = { pending: 'waiting for an admin', merged: 'merged', rejected: 'rejected' }

/**
 * Changes saved in the working copy but not committed: committing puts them, with a message, on
 * the editor's own branch for an admin to merge into the content. Yours first; others' can be
 * committed for them (on their branch). Your commits below, with what admins decided.
 */
export function Commit({
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
  const [message, setMessage] = useState('')
  const [commits, setCommits] = useState<Contribution[] | null>(null)
  const [openCommit, setOpenCommit] = useState<string | null>(null)
  const mine = unpublished.filter((c) => c.mine)
  const others = unpublished.filter((c) => !c.mine)

  async function loadCommits() {
    try {
      setCommits(await backend.commits())
    } catch {
      setCommits(null)
    }
  }
  useEffect(() => {
    loadCommits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend])

  async function run(f: () => Promise<void>) {
    setBusy(true)
    setError('')
    setDone('')
    try {
      await f()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const commit = (req: Omit<CommitRequest, 'message'>) =>
    run(async () => {
      if (!message.trim()) throw new Error('Write a commit message first: what you changed and why.')
      const r = await backend.commit({ ...req, message })
      setUnpublished(r.unpublished)
      setMessage('')
      setDone(`Committed ${r.records} record${r.records === 1 ? '' : 's'} to ${r.branch} (${r.commit.slice(0, 8)}): an admin merges it into the game's content.`)
      await loadCommits()
    })

  /** Downloads everything the caller changed since the last commit (committed or not). */
  const exportMine = () =>
    run(async () => {
      const e = await backend.exportChanges()
      const stamp = new Date(e.created * 1000).toISOString().slice(0, 19).replace(/[T:]/g, '-')
      download(`world-editor-changes-${e.by || 'mine'}-${stamp}.json`, JSON.stringify(e, null, 2), 'application/json')
      setDone(`Exported ${e.records.length} record${e.records.length === 1 ? '' : 's'} (committed or not, since the content's last commit).`)
    })

  const downloadCommits = (format: 'patch' | 'bundle') =>
    run(async () => {
      const blob = await backend.downloadCommits(format)
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
      download(`world-editor-commits-${stamp}.${format}`, blob, format === 'patch' ? 'text/x-patch' : 'application/x-git-bundle')
      setDone(format === 'patch' ? 'Downloaded your unmerged commits as patches (apply them with git am in a clone of the content repository).' : 'Downloaded your branch as a git bundle (git fetch <file> into a clone of the content repository).')
    })

  const key = (c: Unpublished) => `${c.playfield} ${c.feature} ${c.author}`
  const group = (c: Unpublished) => (
    <li key={key(c)}>
      <div className="sv-row">
        <button className="ghost" onClick={() => setOpen(open === key(c) ? null : key(c))} aria-expanded={open === key(c)}>
          {open === key(c) ? '▾' : '▸'}
        </button>
        <div className="sv-grow">
          <b>{c.playfield_name}</b> <span className="muted small">{c.feature_path || c.feature}</span>
          {!c.mine && c.author && <span className="badge">{c.author}</span>}
          <div className="small muted">{c.summary}</div>
        </div>
        <button disabled={busy || !message.trim()} onClick={() => commit({ playfield: c.playfield, feature: c.feature, author: c.author })} title={c.mine ? 'Commit these with the message above' : `Commit these on ${c.author}'s branch, with the message above`}>
          Commit
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

  const pending = commits?.filter((c) => c.status === 'pending').length ?? 0
  const contribution = (c: Contribution) => (
    <li key={c.hash}>
      <div className="sv-row">
        <button className="ghost" onClick={() => setOpenCommit(openCommit === c.hash ? null : c.hash)} aria-expanded={openCommit === c.hash}>
          {openCommit === c.hash ? '▾' : '▸'}
        </button>
        <div className="sv-grow">
          <b>{c.subject}</b> <span className={`badge${c.status === 'rejected' ? ' warn' : ''}`}>{STATUS[c.status]}</span>
          <div className="small muted">
            {new Date(c.created * 1000).toLocaleString()} · {c.records.length} record{c.records.length === 1 ? '' : 's'} · {c.hash.slice(0, 8)}
            {c.by !== c.author && ` · committed by ${c.by}`}
            {c.decision && ` · ${c.decision.status} by ${c.decision.by}`}
          </div>
          {c.decision?.reason && <div className="small">Reason: {c.decision.reason}</div>}
        </div>
      </div>
      {openCommit === c.hash && (
        <div className="sv-publish-items small">
          {c.message.includes('\n') && <pre className="small">{c.message}</pre>}
          <ul className="plain">
            {c.records.map((r) => (
              <li key={r.id + r.feature}>
                <span className={`badge${r.change === 'removed' ? ' warn' : ''}`}>{r.change}</span> {r.id} <span className="muted">{r.feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )

  return (
    <div className="sv-modal-back" onClick={onClose}>
      <div className="card sv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sv-row">
          <h2 className="sv-grow">Commit</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          What you do here is saved in the world editor's copy of the content as you work, so nothing is lost if the page or the game closes. Committing puts your changes, with a message
          saying what you changed and why, on your own branch; an admin merges each commit into the game's content (or rejects it with a reason).
        </p>
        {error && <p className="banner warn">{error}</p>}
        {done && <p className="banner">{done}</p>}
        <label className="small">
          Commit message (the first line is its title)
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Isle of Yarr: the navy camp\n\nWhat you changed and why (footage, the live capture, a guess).'} style={{ width: '100%' }} />
        </label>
        <div className="sv-row">
          <h3 className="sv-grow">Yours: {recordCount(mine) || 'nothing'} uncommitted</h3>
          <button disabled={busy} onClick={exportMine} title="Download everything you changed since the content's last commit, committed or not (JSON: every record before and after)">
            Export mine
          </button>
          <button className={mine.length ? 'primary' : ''} disabled={busy || !mine.length || !message.trim()} onClick={() => commit({})}>
            Commit all of yours
          </button>
        </div>
        <ul className="plain">{mine.map(group)}</ul>
        {others.length > 0 && (
          <>
            <div className="sv-row">
              <h3 className="sv-grow">Others': {recordCount(others)} uncommitted</h3>
            </div>
            <ul className="plain">{others.map(group)}</ul>
          </>
        )}
        <div className="sv-row">
          <h3 className="sv-grow">Your commits{commits ? `: ${pending} waiting` : ''}</h3>
          <button disabled={busy || !pending} onClick={() => downloadCommits('patch')} title="Your commits not merged yet, as patches (git am)">
            Download patches
          </button>
          <button disabled={busy || !pending} onClick={() => downloadCommits('bundle')} title="Your branch as a git bundle (git fetch <file>)">
            Download bundle
          </button>
        </div>
        {commits === null ? <p className="muted small">This server can't list commits.</p> : commits.length ? <ul className="plain">{[...commits].reverse().map(contribution)}</ul> : <p className="muted small">None yet.</p>}
      </div>
    </div>
  )
}
