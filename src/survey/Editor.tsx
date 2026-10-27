import { useEffect, useRef, useState } from 'react'
import { distance, fmtPos, isHidden, toDegrees, toRadians } from './geometry'
import type { Ctx } from './Survey'
import { editable, type ObjectChanges, type SurveyObject, type Vec3, type WaveRef } from './types'
import { WaveSelect } from './WaveSelect'

/** How long typing waits before the change is sent (and shown in game). */
const SEND_MS = 150

const AXES = ['x', 'y', 'z'] as const

interface Draft {
  pos: Vec3
  heading: number // degrees
  level: number | null
  name: string
  comment: string
  wave: WaveRef | null
}

const draftOf = (o: SurveyObject): Draft => ({
  pos: [...o.pos],
  heading: toDegrees(o.heading),
  level: o.level ?? null,
  name: o.name,
  comment: o.comment ?? '',
  wave: o.wave ?? null,
})

/** The selected object: move, turn, confirm, delete, hide. */
export function Editor({ ctx, object }: { ctx: Ctx; object: SurveyObject }) {
  const { backend, account, state } = ctx
  const [draft, setDraft] = useState<Draft>(() => draftOf(object))
  const [sending, setSending] = useState(false)
  const [reallyDelete, setReallyDelete] = useState(false)
  const pending = useRef<ObjectChanges>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const can = editable(object.category)
  const hidden = isHidden(object, new Set(state.hidden), state.focus)

  // someone else (or the game) changed it: take their values unless we're mid-edit
  useEffect(() => {
    if (!timer.current && !sending) setDraft(draftOf(object))
  }, [object, sending])

  useEffect(() => () => void flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const changes = pending.current
    pending.current = {}
    if (!Object.keys(changes).length) return
    setSending(true)
    const o = await ctx.run(() => backend.edit(object.id, changes))
    setSending(false)
    if (o) ctx.upsert(o, object.id)
  }

  function change(d: Partial<Draft>) {
    const next = { ...draft, ...d }
    setDraft(next)
    const c = pending.current
    if (d.pos) c.pos = next.pos
    if (d.heading !== undefined) c.heading = toRadians(next.heading)
    if (d.level !== undefined) c.level = next.level
    if (d.name !== undefined) c.name = next.name
    if (d.comment !== undefined) c.comment = next.comment
    if (d.wave !== undefined) c.wave = next.wave
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SEND_MS)
  }

  const setAxis = (i: number, v: number) => change({ pos: draft.pos.map((p, j) => (j === i ? Math.round(v * 100) / 100 : p)) as Vec3 })
  const turn = (deg: number) => change({ heading: (((draft.heading + deg) % 360) + 360) % 360 })

  return (
    <div className="sv-panel">
      <div className="sv-row">
        <b className="sv-grow">{object.name}</b>
        <span className={`badge ${object.category}`}>{object.category}</span>
        <span className="badge">{object.kind}</span>
      </div>
      <div className="muted small mono">
        {object.monster_data != null && `look ${object.monster_data} · `}
        {object.template != null && `template ${object.template} · `}
        {object.id}
      </div>
      <div className="muted small">
        {distance(object.pos, state.pos).toFixed(1)} m from you
        {object.author && ` · by ${object.author}`}
        {object.updated ? ` · ${new Date(object.updated * 1000).toLocaleString()}` : ''}
        {sending && ' · sending…'}
      </div>

      {can ? (
        <>
          {object.category === 'guessed' && (
            <p className="banner warn small">
              A guess. <b>Confirm</b> it if it's right; moving or changing it makes it surveyed too.
            </p>
          )}
          {AXES.map((a, i) => (
            <div className="sv-field" key={a}>
              <span>{a}</span>
              <div className="sv-row tight sv-nudge">
                <button onClick={() => setAxis(i, draft.pos[i] - 1)}>−1</button>
                <button onClick={() => setAxis(i, draft.pos[i] - 0.1)}>−.1</button>
                <input className="sv-num" type="number" step={0.1} value={draft.pos[i]} onChange={(e) => e.target.value !== '' && setAxis(i, Number(e.target.value))} />
                <button onClick={() => setAxis(i, draft.pos[i] + 0.1)}>+.1</button>
                <button onClick={() => setAxis(i, draft.pos[i] + 1)}>+1</button>
              </div>
            </div>
          ))}
          <div className="sv-field">
            <span>heading</span>
            <div className="sv-row tight sv-nudge">
              <button onClick={() => turn(-45)}>−45</button>
              <button onClick={() => turn(-5)}>−5</button>
              <input className="sv-num" type="number" min={0} max={359} value={draft.heading} onChange={(e) => e.target.value !== '' && change({ heading: Number(e.target.value) })} />
              <button onClick={() => turn(5)}>+5</button>
              <button onClick={() => turn(45)}>+45</button>
            </div>
          </div>
          <div className="sv-row">
            <button onClick={() => change({ pos: [...state.pos] })} title={fmtPos(state.pos)}>
              Move to me
            </button>
            <button onClick={() => change({ heading: toDegrees(state.heading) })}>Face my way</button>
            <button onClick={() => change({ pos: [...state.pos], heading: toDegrees(state.heading) })}>Both</button>
          </div>
          {object.kind === 'enemy' && (
            <label className="sv-field">
              <span>level</span>
              <input className="sv-num" type="number" min={1} value={draft.level ?? ''} onChange={(e) => change({ level: e.target.value ? Number(e.target.value) : null })} />
            </label>
          )}
          <label className="sv-field">
            <span>name</span>
            <input value={draft.name} onChange={(e) => change({ name: e.target.value })} />
          </label>
          <label className="sv-field">
            <span>spawned</span>
            <WaveSelect scripts={ctx.notes.scripts} value={draft.wave} onChange={(w) => change({ wave: w })} />
          </label>
          <label className="sv-field">
            <span>comment</span>
            <textarea rows={2} value={draft.comment} onChange={(e) => change({ comment: e.target.value })} />
          </label>
        </>
      ) : (
        <>
          <p className="muted small">
            Recorded from the {object.category === 'client' ? 'client data' : object.category === 'demo' ? 'recorded demo session' : 'live server'}: it can only be hidden.
          </p>
          <p className="mono small">
            {fmtPos(object.pos)} · {toDegrees(object.heading)}°
          </p>
        </>
      )}

      <div className="sv-row">
        {object.category === 'guessed' && (
          <button className="primary" onClick={() => ctx.run(() => flush().then(() => backend.confirm(object.id)), 'all')}>
            Confirm
          </button>
        )}
        <button onClick={() => ctx.run(() => backend.hide(account, [object.id], !hidden))}>{hidden ? 'Show' : 'Hide'}</button>
        <button onClick={() => ctx.run(() => backend.teleport(account, object.pos))}>Go to it</button>
        <button className="ghost" onClick={() => ctx.run(() => backend.select(account, null))}>
          Deselect
        </button>
        {can &&
          (reallyDelete ? (
            <>
              <button className="sv-danger" onClick={() => ctx.run(() => backend.remove(object.id), 'all')}>
                Really delete
              </button>
              <button className="ghost" onClick={() => setReallyDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="sv-danger" onClick={() => setReallyDelete(true)} title={object.category === 'guessed' ? 'This guess is wrong: it is not spawned any more' : 'Delete this placement'}>
              Delete
            </button>
          ))}
      </div>
    </div>
  )
}
