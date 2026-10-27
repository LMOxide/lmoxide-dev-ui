import { useState } from 'react'
import { AreaEditor, useDraft } from './AreaEditor'
import { areaCenter, distance } from './geometry'
import { TagBadges, TagSelect } from './Tags'
import type { Ctx } from './WorldEditor'
import { NOTE_KINDS, type Note, type NoteKind, type Review } from './types'

export const KIND_LABELS: Record<NoteKind, string> = {
  mission_area: 'Mission area',
  achievement: 'Achievement found',
  dialog: 'Dialogue begins',
  script: 'Script triggered',
  comment: 'Comment',
}

export const newId = (prefix: string) => `${prefix}-web-${crypto.getRandomValues(new Uint32Array(2)).reduce((s, v) => s + v.toString(16).padStart(8, '0'), '')}`

export function StatusSelect({ value, onChange }: { value: Review; onChange: (r: Review) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Review)} title="For whoever checks and implements it">
      <option value="unreviewed">unreviewed</option>
      <option value="accepted">accepted</option>
      <option value="rejected">rejected</option>
    </select>
  )
}

/** Areas someone has to check and implement: missions, achievements, dialogues, scripts, comments. */
export function NotesPanel({ ctx }: { ctx: Ctx }) {
  const { backend, state, notes } = ctx
  const [open, setOpen] = useState<string | null>(null)

  async function add() {
    const note: Note = { id: newId('n'), kind: 'comment', area: { point: [...state.pos] }, reference: null, comment: '', status: 'unreviewed', tags: ctx.newTags }
    const saved = await ctx.run(() => backend.saveNote(state.playfield, note), 'all')
    if (saved) setOpen(saved.id)
  }

  const sorted = [...notes.notes].sort((a, b) => distance(areaCenter(a.area), state.pos) - distance(areaCenter(b.area), state.pos))
  return (
    <>
      <div className="sv-row">
        <button className="primary" onClick={add}>
          New note here
        </button>
        <span className="muted small">Name what it is only if you found it; a comment is always welcome.</span>
      </div>
      {sorted.map((n) =>
        open === n.id ? (
          <NoteEditor key={n.id} ctx={ctx} note={n} onClose={() => setOpen(null)} />
        ) : (
          <div key={n.id} className="sv-panel" onClick={() => setOpen(n.id)} style={{ cursor: 'pointer' }}>
            <div className="sv-row">
              <span className="badge wave">{KIND_LABELS[n.kind]}</span>
              <span className="sv-name">{n.reference || n.comment || <i className="muted">no details</i>}</span>
              <TagBadges tags={n.tags} />
              <span className="badge">{n.status}</span>
              <span className="sv-dist">{distance(areaCenter(n.area), state.pos).toFixed(0)} m</span>
            </div>
          </div>
        ),
      )}
      {!notes.notes.length && <p className="muted">No notes in this playfield yet.</p>}
    </>
  )
}

function NoteEditor({ ctx, note, onClose }: { ctx: Ctx; note: Note; onClose: () => void }) {
  const { backend, account, state } = ctx
  const [draft, update] = useDraft(note, (n) => ctx.run(() => backend.saveNote(state.playfield, n), 'all'))
  const [reallyDelete, setReallyDelete] = useState(false)
  return (
    <div className="sv-panel focus">
      <label className="sv-field">
        <span>what</span>
        <select value={draft.kind} onChange={(e) => update((d) => ({ ...d, kind: e.target.value as NoteKind }))}>
          {NOTE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="sv-field">
        <span>which</span>
        <input placeholder="optional: its name or id, if you found it" value={draft.reference ?? ''} onChange={(e) => update((d) => ({ ...d, reference: e.target.value || null }))} />
      </label>
      <label className="sv-field">
        <span>comment</span>
        <textarea rows={3} placeholder="what happens here, what starts it, anything you remember" value={draft.comment} onChange={(e) => update((d) => ({ ...d, comment: e.target.value }))} />
      </label>
      <div className="sv-field">
        <span>where</span>
        <AreaEditor value={draft.area} pos={state.pos} onChange={(a) => a && update((d) => ({ ...d, area: a }))} />
      </div>
      <div className="sv-field">
        <span>review</span>
        <StatusSelect value={draft.status} onChange={(s) => update((d) => ({ ...d, status: s }))} />
      </div>
      <div className="sv-field">
        <span>tags</span>
        <TagSelect ctx={ctx} value={draft.tags ?? []} onChange={(tags) => update((d) => ({ ...d, tags }))} />
      </div>
      <div className="sv-row">
        <button onClick={onClose}>Done</button>
        <button onClick={() => ctx.run(() => backend.teleport(account, areaCenter(draft.area)))}>Go to it</button>
        {reallyDelete ? (
          <button className="sv-danger" onClick={() => ctx.run(() => backend.deleteNote(state.playfield, note.id), 'all').then(onClose)}>
            Really delete
          </button>
        ) : (
          <button className="sv-danger" onClick={() => setReallyDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
