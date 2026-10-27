import { useState } from 'react'
import { FeatureSelect } from './Features'
import type { Ctx } from './WorldEditor'
import type { Mark } from './types'

/**
 * Marks in game: an effect on everything one author changed last, or everything of a feature,
 * shown only to you (never saved, like hiding). Each mark has its own look.
 */
export function Marks({ ctx, authors }: { ctx: Ctx; authors: string[] }) {
  const marks = ctx.state.marks ?? []
  const [open, setOpen] = useState(marks.length > 0)
  const looks = ctx.markLooks
  const save = (next: Mark[]) => ctx.run(() => ctx.backend.setMarks(ctx.account, next).then(ctx.setState))
  const used = new Set(marks.map((m) => m.look))
  const nextLook = looks.find((l) => !used.has(l)) ?? looks[0] ?? ''
  if (!open) {
    return (
      <div className="sv-row">
        <button className="link small" onClick={() => setOpen(true)} disabled={!looks.length} title="Mark what an author or a feature changed with an effect in game">
          Marks in game{marks.length ? ` (${marks.length})` : ''}…
        </button>
      </div>
    )
  }
  return (
    <div className="sv-marks">
      <div className="sv-row">
        <b className="small sv-grow">Marks in game</b>
        <button className="link small" onClick={() => setOpen(false)}>
          hide
        </button>
      </div>
      {marks.map((m, i) => (
        <div className="sv-row tight" key={i}>
          <select value={m.by} onChange={(e) => save(marks.map((x, j) => (j === i ? { ...x, by: e.target.value as Mark['by'], value: e.target.value === 'feature' ? 'live' : (authors[0] ?? '') } : x)))}>
            <option value="author">by author</option>
            <option value="feature">feature</option>
          </select>
          {m.by === 'author' ? (
            <select value={m.value} onChange={(e) => save(marks.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
              {!authors.includes(m.value) && <option value={m.value}>{m.value || '—'}</option>}
              {authors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <FeatureSelect features={ctx.features} value={m.value} onChange={(v) => save(marks.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
          )}
          <select value={m.look} onChange={(e) => save(marks.map((x, j) => (j === i ? { ...x, look: e.target.value } : x)))} title="How they are marked">
            {looks.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={() => save(marks.filter((_, j) => j !== i))} title="Remove this mark">
            ×
          </button>
        </div>
      ))}
      <div className="sv-row">
        <button onClick={() => save([...marks, { by: 'author', value: authors[0] ?? '', look: nextLook }])} disabled={!authors.length}>
          + mark an author
        </button>
        <button onClick={() => save([...marks, { by: 'feature', value: ctx.feature, look: nextLook }])}>+ mark a feature</button>
      </div>
    </div>
  )
}
