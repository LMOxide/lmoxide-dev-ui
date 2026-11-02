import { useEffect, useState } from 'react'
import type { SurveyBackend } from './backend'
import type { Branch, CommitRequest, Unpublished } from './types'
import { download } from '../notes'

/** How many records of these changes there are. */
export const recordCount = (list: Unpublished[]) => list.reduce((n, c) => n + c.items.length, 0)

const STATUS: Record<Branch['status'], string> = {
  open: 'nothing to merge',
  pending: 'waiting for an admin',
  rejected: 'changes asked for',
  merged: 'merged',
  reset: 'reset',
  deleted: 'deleted',
}

const NEW = '\u0000new'

/**
 * Changes saved in the working copy but not committed: committing puts them, with a message, on
 * one of the editor's branches; an admin reviews a branch as a whole and merges it into the
 * content (or rejects it with a reason: commit fixes to the same branch). Yours first; others'
 * can be committed for them (on their branch of that name).
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
  const [branches, setBranches] = useState<Branch[] | null>(null)
  /** the chosen branch (its name), or NEW */
  const [target, setTarget] = useState<string>(NEW)
  const [newName, setNewName] = useState('')
  const [openBranch, setOpenBranch] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const mine = unpublished.filter((c) => c.mine)
  const others = unpublished.filter((c) => !c.mine)
  const live = branches?.filter((b) => !b.closed) ?? []
  const closed = branches?.filter((b) => b.closed) ?? []

  async function loadBranches(pick?: string) {
    try {
      const list = await backend.branches()
      setBranches(list)
      const openOnes = list.filter((b) => !b.closed)
      if (pick) setTarget(pick)
      else if (target === NEW && !newName && openOnes.length) setTarget(openOnes[openOnes.length - 1].title)
    } catch {
      setBranches(null)
    }
  }
  useEffect(() => {
    loadBranches()
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

  const branchName = target === NEW ? newName.trim() : target
  const ready = !!message.trim() && !!branchName

  const commit = (req: Omit<CommitRequest, 'message' | 'branch'>) =>
    run(async () => {
      if (!message.trim()) throw new Error('Write a commit message first: what you changed and why.')
      if (!branchName) throw new Error('Pick a branch, or name a new one.')
      const r = await backend.commit({ ...req, message, branch: branchName })
      setUnpublished(r.unpublished)
      setMessage('')
      setNewName('')
      setDone(`Committed ${r.records} record${r.records === 1 ? '' : 's'} to ${r.branch} (${r.commit.slice(0, 8)}): an admin reviews the branch and merges it into the game's content.`)
      await loadBranches(branchName)
    })

  /** Downloads everything the caller changed since the last commit (committed or not). */
  const exportMine = () =>
    run(async () => {
      const e = await backend.exportChanges()
      const stamp = new Date(e.created * 1000).toISOString().slice(0, 19).replace(/[T:]/g, '-')
      download(`world-editor-changes-${e.by || 'mine'}-${stamp}.json`, JSON.stringify(e, null, 2), 'application/json')
      setDone(`Exported ${e.records.length} record${e.records.length === 1 ? '' : 's'} (committed or not, since the content's last commit).`)
    })

  const downloadBranch = (b: Branch, format: 'patch' | 'bundle') =>
    run(async () => {
      const blob = await backend.downloadBranch(b.branch, format)
      download(`${b.branch.replace(/\//g, '-')}.${format}`, blob, format === 'patch' ? 'text/x-patch' : 'application/x-git-bundle')
      setDone(format === 'patch' ? `Downloaded ${b.branch} as patches (apply them with git am in a clone of the content repository).` : `Downloaded ${b.branch} as a git bundle (git fetch <file> ${b.branch} in a clone of the content repository).`)
    })

  const reset = (b: Branch, remove: boolean) =>
    run(async () => {
      const r = await backend.resetBranch(b.branch, remove)
      setConfirming(null)
      setDone(`${remove ? 'Deleted' : 'Reset'} ${b.branch}: ${r.reverted} record${r.reverted === 1 ? '' : 's'} put back as the content has them.`)
      if (remove && target === b.title) setTarget(NEW)
      await loadBranches()
      setUnpublished(await backend.unpublished())
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
        <button disabled={busy || !ready} onClick={() => commit({ playfield: c.playfield, feature: c.feature, author: c.author })} title={c.mine ? `Commit these to ${branchName || 'the branch'}, with the message above` : `Commit these on ${c.author}'s branch ${branchName || ''}, with the message above`}>
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

  const branchRow = (b: Branch) => {
    const id = b.closed ? `${b.branch} ${b.tip}` : b.branch
    const isOpen = openBranch === id
    const reason = b.decision?.reason ?? b.closed?.decision?.reason
    return (
      <li key={id}>
        <div className="sv-row">
          <button className="ghost" onClick={() => setOpenBranch(isOpen ? null : id)} aria-expanded={isOpen}>
            {isOpen ? '▾' : '▸'}
          </button>
          <div className="sv-grow">
            <b>{b.title}</b> <span className={`badge${b.status === 'rejected' ? ' warn' : ''}`}>{STATUS[b.status]}</span>
            <div className="small muted">
              {b.branch} · {b.commits.length} commit{b.commits.length === 1 ? '' : 's'} · {b.records.length} record{b.records.length === 1 ? '' : 's'}
              {b.updated ? ` · ${new Date(b.updated * 1000).toLocaleString()}` : ''}
              {b.conflicts ? ` · ${b.conflicts} changed in the content since` : ''}
              {b.decision && ` · rejected by ${b.decision.by}`}
              {b.closed && ` · ${b.closed.status} by ${b.closed.by} ${new Date(b.closed.at * 1000).toLocaleString()}`}
            </div>
            {reason && <div className="small">Reason: {reason}</div>}
          </div>
          {!b.closed && b.commits.length > 0 && (
            <>
              <button disabled={busy} onClick={() => downloadBranch(b, 'patch')} title="Its commits not in the content, as patches (git am)">
                Patches
              </button>
              <button disabled={busy} onClick={() => downloadBranch(b, 'bundle')} title="The branch as a git bundle (git fetch <file>)">
                Bundle
              </button>
            </>
          )}
          {!b.closed &&
            (confirming === b.branch ? (
              <>
                <button disabled={busy} className="danger" onClick={() => reset(b, false)} title="Drop its commits; its records in the world editor go back to the content's">
                  Reset
                </button>
                <button disabled={busy} className="danger" onClick={() => reset(b, true)} title="As reset, and the branch is gone">
                  Delete
                </button>
                <button className="ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button disabled={busy} className="ghost" onClick={() => setConfirming(b.branch)} title="Reset or delete this branch">
                Reset…
              </button>
            ))}
        </div>
        {confirming === b.branch && <p className="small banner warn">Resetting drops this branch's commits and puts its records in the world editor back as the content has them (your later edits to them stay).</p>}
        {isOpen && (
          <div className="sv-publish-items small">
            <ul className="plain">
              {b.commits.map((c) => (
                <li key={c.hash}>
                  <span className="muted">{c.hash.slice(0, 8)}</span> <b>{c.subject}</b>
                  {c.by !== c.author && <span className="muted"> · committed by {c.by}</span>}
                  {c.message.includes('\n') && <pre className="small">{c.message.split('\n').slice(1).join('\n').trim()}</pre>}
                </li>
              ))}
            </ul>
            <ul className="plain">
              {b.records.map((r) => (
                <li key={r.id + r.feature}>
                  <span className={`badge${r.change === 'removed' ? ' warn' : ''}`}>{r.change}</span> {r.id} <span className="muted">{r.feature}</span>
                  {r.conflict && <span className="badge warn" title="The content changed this record since the branch started; merging puts the branch's version over it">changed in the content since</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </li>
    )
  }

  const pending = live.filter((b) => b.status === 'pending').length

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
          saying what you changed and why, on a branch of yours; an admin reviews each branch as a whole and merges it into the game's content, or rejects it with a reason (commit your
          fixes to the same branch and it is reviewed again).
        </p>
        {error && <p className="banner warn">{error}</p>}
        {done && <p className="banner">{done}</p>}
        <div className="sv-row">
          <label className="small sv-grow">
            Branch{' '}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {live.map((b) => (
                <option key={b.branch} value={b.title}>
                  {b.title} ({STATUS[b.status]})
                </option>
              ))}
              <option value={NEW}>New branch…</option>
            </select>{' '}
            {target === NEW && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name, e.g. Isle of Yarr navy camp" />}
          </label>
        </div>
        <label className="small">
          Commit message (the first line is its title)
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Isle of Yarr: the navy camp\n\nWhat you changed and why (footage, the live capture, a guess).'} style={{ width: '100%' }} />
        </label>
        <div className="sv-row">
          <h3 className="sv-grow">Yours: {recordCount(mine) || 'nothing'} uncommitted</h3>
          <button disabled={busy} onClick={exportMine} title="Download everything you changed since the content's last commit, committed or not (JSON: every record before and after)">
            Export mine
          </button>
          <button className={mine.length ? 'primary' : ''} disabled={busy || !mine.length || !ready} onClick={() => commit({})}>
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
          <h3 className="sv-grow">Your branches{branches ? `: ${pending} waiting` : ''}</h3>
          {closed.length > 0 && (
            <button className="ghost" onClick={() => setShowClosed(!showClosed)}>
              {showClosed ? 'Hide' : 'Show'} merged and reset ({closed.length})
            </button>
          )}
        </div>
        {branches === null ? (
          <p className="muted small">This server can't list branches.</p>
        ) : live.length || (showClosed && closed.length) ? (
          <ul className="plain">
            {[...live].reverse().map(branchRow)}
            {showClosed && [...closed].reverse().map(branchRow)}
          </ul>
        ) : (
          <p className="muted small">None yet.</p>
        )}
      </div>
    </div>
  )
}
