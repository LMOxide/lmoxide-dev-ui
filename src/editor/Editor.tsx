import { useEffect, useRef, useState } from 'react'
import { awayFrom, distance, fmtPos, isHidden, toDegrees, toRadians } from './geometry'
import { valuesOf, type Entry } from './history'
import { FeatureSelect } from './Features'
import { TagBadges, TagSelect } from './Tags'
import { Combobox } from '@/components/combobox'
import { spawnOptions } from './Details'
import { WallFields } from './Walls'
import type { Ctx } from './WorldEditor'
import { editable, type Kind, type ObjectChanges, type Placeable, type SurveyObject, type Vec3, type WallSettings, type WaveRef } from './types'
import { WaveSelect } from './WaveSelect'
import { Heading } from '@/Heading'

/** How long typing waits before the change is sent (and shown in game). */
const SEND_MS = 150

const AXES = ['x', 'y', 'z'] as const

interface Draft {
  kind: Kind | 'trigger'
  /** trigger walls */
  wall: WallSettings | null
  monster_data: number | null
  template: number | null
  patrol: Vec3[]
  pos: Vec3
  heading: number // degrees
  level: number | null
  name: string
  comment: string
  wave: WaveRef | null
  /** bouncers: where it throws you */
  target: Vec3 | null
}

const draftOf = (o: SurveyObject): Draft => ({
  kind: o.kind,
  wall: o.kind === 'trigger' ? { name: o.name, size: [...(o.size ?? [6, 3, 1])] as Vec3, radius: o.radius ?? null, color: o.color === 'red' || !o.color ? 'green' : o.color, action: o.action ?? 'other', once: !!o.once } : null,
  monster_data: o.monster_data ?? null,
  template: o.template ?? null,
  patrol: (o.patrol ?? []).map((p) => [...p] as Vec3),
  pos: [...o.pos],
  heading: toDegrees(o.heading),
  level: o.level ?? null,
  name: o.name,
  comment: o.comment ?? '',
  wave: o.wave ?? null,
  target: o.target ? ([...o.target] as Vec3) : null,
})

/** The selected object: move, turn, confirm, delete, hide. */
export function Editor({ ctx, object }: { ctx: Ctx; object: SurveyObject }) {
  const { backend, account, state } = ctx
  const [draft, setDraft] = useState<Draft>(() => draftOf(object))
  const [sending, setSending] = useState(false)
  const [reallyDelete, setReallyDelete] = useState(false)
  const [picking, setPicking] = useState(false)
  const pending = useRef<ObjectChanges>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const can = editable(object.category)
  const hidden = isHidden(object, new Set(state.hidden), state.shown_waves, ctx.notes.scripts)
  const walks = draft.kind === 'enemy' || draft.kind === 'npc'
  /** in the surveyor's world: what uses where they stand works */
  const here = (object.playfield ?? state.playfield) === state.playfield

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
    const before = valuesOf(object, Object.keys(changes) as (keyof ObjectChanges)[])
    const o = await ctx.run(() => backend.edit(object.id, changes))
    setSending(false)
    if (!o) return
    ctx.upsert(o, object.id)
    // a guess comes back as a new placement replacing it
    if (o.id !== object.id) ctx.history.record({ kind: 'replace', guess: object.id, id: o.id, name: o.name, after: o })
    else ctx.history.record({ kind: 'edit', id: o.id, name: o.name, before, after: changes, at: Date.now() })
  }

  /** Reset: an edited or confirmed guess back to the guess; else every change made to it since
   * this page was opened undone. */
  const edits = ctx.history.undoStack.filter((e): e is Extract<Entry, { kind: 'edit' }> => e.kind === 'edit' && e.id === object.id)
  const canReset = !!object.replaces || edits.length > 0
  async function reset() {
    if (object.replaces) {
      const guess = await ctx.run(() => backend.forget(object.id), 'all')
      ctx.history.record({ kind: 'reset', id: object.id, name: object.name, snapshot: object })
      if (guess) ctx.run(() => backend.select(account, guess.id))
      return
    }
    // the earliest value of each field changed
    const back: ObjectChanges = {}
    for (const e of [...edits].reverse()) Object.assign(back, e.before)
    const before = valuesOf(object, Object.keys(back) as (keyof ObjectChanges)[])
    const o = await ctx.run(() => backend.edit(object.id, back), 'all')
    if (o) ctx.history.record({ kind: 'edit', id: o.id, name: o.name, before, after: back, at: 0 })
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
    if (d.kind !== undefined) Object.assign(c, { kind: next.kind, monster_data: next.monster_data, template: next.template })
    if (d.patrol !== undefined) c.patrol = next.patrol
    if (d.target !== undefined) c.target = next.target
    if (d.wall && next.wall) Object.assign(c, { size: next.wall.size, radius: next.wall.radius, color: next.wall.color, action: next.wall.action, once: next.wall.once })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SEND_MS)
  }

  const setAxis = (i: number, v: number) => change({ pos: draft.pos.map((p, j) => (j === i ? Math.round(v * 100) / 100 : p)) as Vec3 })
  const turn = (deg: number) => change({ heading: (((draft.heading + deg) % 360) + 360) % 360 })

  /** Another spawn in its place: its look, name and level; a patrol only if it can walk one. */
  function changeInto(p: Placeable) {
    setPicking(false)
    const keepsPatrol = p.kind === 'enemy' || p.kind === 'npc'
    change({ kind: p.kind, monster_data: p.monster_data ?? null, template: p.template ?? null, name: p.name, level: p.level ?? draft.level, patrol: keepsPatrol ? draft.patrol : [] })
  }
  const setPatrol = (patrol: Vec3[]) => change({ patrol })
  const movePoint = (i: number, by: number) => {
    const p = [...draft.patrol]
    ;[p[i], p[i + by]] = [p[i + by], p[i]]
    setPatrol(p)
  }

  return (
    <div className="sv-panel">
      <div className="sv-row">
        <b className="sv-grow">{can ? draft.name : object.name}</b>
        <span className={`badge ${object.category}`}>{object.category}</span>
        <span className="badge">{can ? draft.kind : object.kind}</span>
        {can && !picking && draft.kind !== 'trigger' && (
          <button onClick={() => setPicking(true)} title="Make it another enemy, NPC, smashable, ...">
            Change into…
          </button>
        )}
      </div>
      {picking && (
        <div className="sv-row">
          <Combobox
            className="sv-grow"
            defaultOpen
            options={spawnOptions(ctx.catalog)}
            value={null}
            onChange={(v) => {
              const p = ctx.catalog.find((x) => `${x.kind}:${x.name}:${x.monster_data ?? ''}:${x.template ?? ''}` === v)
              if (p) changeInto(p)
            }}
            placeholder="Change into… (name, kind, look, template)"
            search="Search names, looks, templates…"
          />
          <button className="ghost" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      )}
      <div className="muted small mono">
        {(can ? draft.monster_data : object.monster_data) != null && `look ${can ? draft.monster_data : object.monster_data} · `}
        {(can ? draft.template : object.template) != null && `template ${can ? draft.template : object.template} · `}
        {object.id}
      </div>
      <div className="muted small">
        {here ? `${distance(object.pos, state.pos).toFixed(1)} m from you` : 'in another world than you'}
        {object.author && ` · by ${object.author}`}
        {object.updated ? ` · ${new Date(object.updated * 1000).toLocaleString()}` : ''}
        {sending && ' · sending…'}
      </div>
      {can && object.kind !== 'buildie' && (
        <label className="sv-field" title="What it is for; a server applies features by its own rules. Changing it moves the object (a guess becomes surveyed).">
          <span>feature</span>
          <FeatureSelect
            features={ctx.features}
            value={object.feature ?? 'live'}
            onChange={async (feature) => {
              const o = await ctx.run(() => backend.edit(object.id, { feature }), 'all')
              if (o) ctx.upsert(o, object.id)
            }}
          />
        </label>
      )}
      {can && object.kind !== 'buildie' && (
        <div className="sv-field">
          <span>tags</span>
          <TagSelect
            ctx={ctx}
            value={object.tags ?? []}
            onChange={async (tags) => {
              const o = await ctx.run(() => backend.edit(object.id, { tags }), 'all')
              if (!o) return
              ctx.upsert(o, object.id)
              if (o.id !== object.id) ctx.history.record({ kind: 'replace', guess: object.id, id: o.id, name: o.name, after: o })
              else ctx.history.record({ kind: 'edit', id: o.id, name: o.name, before: { tags: object.tags ?? [] }, after: { tags }, at: 0 })
            }}
          />
        </div>
      )}
      {!can && <TagBadges tags={object.tags} />}

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
              <Heading degrees={draft.heading} angle={false} />
            </div>
          </div>
          {here && (
            <>
          <div className="sv-row">
            <button onClick={() => change({ pos: [...state.pos] })} title={fmtPos(state.pos)}>
              Move to me
            </button>
            <button onClick={() => change({ heading: toDegrees(state.heading) })} title="Face the way you face">
              Face my way
            </button>
            <button onClick={() => change({ pos: [...state.pos], heading: toDegrees(state.heading) })}>Both</button>
          </div>
          <div className="sv-row">
            <button onClick={() => change({ heading: toDegrees(state.heading + Math.PI / 2) })} title="Square to the way you face (a wall along your way instead of across it)">
              Perpendicular to me
            </button>
            <button onClick={() => change({ heading: toDegrees(awayFrom(state.pos, draft.pos, state.heading)) })} title="Its back to you (an enemy that hasn't seen you yet)">
              Face away from me
            </button>
            <button onClick={() => change({ heading: toDegrees(awayFrom(state.pos, draft.pos, state.heading) + Math.PI) })} title="Looking at you">
              Face me
            </button>
          </div>
            </>
          )}
          {draft.kind === 'enemy' && (
            <label className="sv-field">
              <span>level</span>
              <input className="sv-num" type="number" min={1} value={draft.level ?? ''} onChange={(e) => change({ level: e.target.value ? Number(e.target.value) : null })} />
            </label>
          )}
          <label className="sv-field">
            <span>name</span>
            <input value={draft.name} onChange={(e) => change({ name: e.target.value })} />
          </label>
          {draft.wall ? (
            <WallFields value={draft.wall} scripts={ctx.notes.scripts} looks={ctx.looks} targets={ctx.targets} playfield={object.playfield ?? ctx.state.playfield} collects={ctx.collects} onChange={(w) => change({ wall: { ...draft.wall!, ...w } })} />
          ) : (
            <label className="sv-field">
              <span>spawned</span>
              <WaveSelect scripts={ctx.notes.scripts} value={draft.wave} onChange={(w) => change({ wave: w })} />
            </label>
          )}
          {draft.kind === 'bouncer' && (
            <div className="sv-field sv-top-label">
              <span>throws to</span>
              <div>
                {draft.target ? (
                  <div className="sv-row tight sv-nudge">
                    {AXES.map((a, i) => (
                      <input
                        key={a}
                        className="sv-num"
                        type="number"
                        step={0.5}
                        title={a}
                        value={draft.target![i]}
                        onChange={(e) => e.target.value !== '' && change({ target: draft.target!.map((v, j) => (j === i ? Number(e.target.value) : v)) as Vec3 })}
                      />
                    ))}
                    <span className="muted small">{distance(draft.pos, draft.target).toFixed(0)} m away</span>
                  </div>
                ) : (
                  <div className="muted small">Not set: it throws nobody anywhere yet. Walk to where players land and set it.</div>
                )}
                {(object.chain?.length ?? 0) > 0 && <div className="muted small">then on through {object.chain!.length} more landing points</div>}
                <div className="sv-row">
                  <button className="primary" disabled={!here} title={here ? 'Players land where you stand' : 'Be in its world in game'} onClick={() => change({ target: [...state.pos] as Vec3 })}>
                    Land here
                  </button>
                  {draft.target && (
                    <button disabled={!here} onClick={() => ctx.run(() => backend.teleport(account, draft.target!))} title="Go to where it throws you">
                      Go to landing
                    </button>
                  )}
                  {draft.target && (
                    <button className="ghost sv-danger" onClick={() => change({ target: null })}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <label className="sv-field">
            <span>comment</span>
            <textarea rows={2} value={draft.comment} onChange={(e) => change({ comment: e.target.value })} />
          </label>
          {walks && (
            <div className="sv-field sv-top-label">
              <span>patrol</span>
              <div>
                {draft.patrol.length === 0 && <div className="muted small">Optional. None: it stays where it is. Walk its route and add each point; it loops back to the first.</div>}
                <ol className="sv-points small">
                  {draft.patrol.map((p, i) => (
                    <li key={i}>
                      <span className="muted">{i + 1}.</span>
                      <span className="mono sv-grow">{fmtPos(p)}</span>
                      <span className="sv-dist">{distance(p, state.pos).toFixed(0)} m</span>
                      <span className="sv-row tight sv-nudge">
                        <button disabled={i === 0} onClick={() => movePoint(i, -1)} title="Earlier on the route">
                          ↑
                        </button>
                        <button disabled={i === draft.patrol.length - 1} onClick={() => movePoint(i, 1)} title="Later on the route">
                          ↓
                        </button>
                        <button disabled={!here} onClick={() => setPatrol(draft.patrol.map((q, j) => (j === i ? ([...state.pos] as Vec3) : q)))} title="Move this point to where you stand">
                          here
                        </button>
                        <button disabled={!here} onClick={() => ctx.run(() => backend.teleport(account, p))} title="Go to this point">
                          go
                        </button>
                        <button onClick={() => setPatrol(draft.patrol.filter((_, j) => j !== i))} title="Remove this point">
                          ×
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="sv-row">
                  <button className="primary" disabled={!here} title={here ? undefined : 'Be in its world in game'} onClick={() => setPatrol([...draft.patrol, [...state.pos] as Vec3])}>
                    Add a point here
                  </button>
                  {draft.patrol.length === 0 && (
                    <button onClick={() => setPatrol([[...draft.pos] as Vec3])} title="Its route starts where it stands">
                      Start at its spot
                    </button>
                  )}
                  {draft.patrol.length > 0 && (
                    <button className="ghost sv-danger" onClick={() => setPatrol([])}>
                      Clear route
                    </button>
                  )}
                </div>
                {draft.patrol.length === 1 && <div className="muted small">A route needs two or more points.</div>}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="muted small">
            Recorded from the {object.category === 'client' ? 'client data' : object.category === 'demo' ? 'recorded demo session' : 'live server'}: it can only be hidden.
          </p>
          <p className="mono small">
            {fmtPos(object.pos)} · <Heading degrees={toDegrees(object.heading)} />
          </p>
          {(object.patrol?.length ?? 0) > 1 && <p className="small">Patrols a route of {object.patrol!.length} points.</p>}
        </>
      )}

      <div className="sv-row">
        {object.category === 'guessed' && (
          <button
            className="primary"
            onClick={async () => {
              const o = await ctx.run(() => flush().then(() => backend.confirm(object.id)), 'all')
              if (o) ctx.history.record({ kind: 'replace', guess: object.id, id: o.id, name: o.name, after: o })
            }}
          >
            Confirm
          </button>
        )}
        {here && (
          <>
            <button onClick={() => ctx.run(() => backend.hide(account, [object.id], !hidden))}>{hidden ? 'Show' : 'Hide'}</button>
            <button onClick={() => ctx.run(() => backend.teleport(account, object.pos))}>Go to it</button>
            <button className="ghost" onClick={() => ctx.run(() => backend.select(account, null))}>
              Deselect
            </button>
          </>
        )}
        {can && (
          <button
            disabled={!canReset}
            onClick={reset}
            title={
              object.replaces
                ? 'Back to the guess it replaces (its changes are dropped)'
                : canReset
                  ? 'Undo every change to it since this page was opened'
                  : 'Nothing changed since this page was opened'
            }
          >
            {object.replaces ? 'Reset to guess' : 'Reset'}
          </button>
        )}
        {can &&
          (reallyDelete ? (
            <>
              <button
                className="sv-danger"
                onClick={async () => {
                  const r = await ctx.run(() => backend.remove(object.id), 'all')
                  if (r) ctx.history.record({ kind: 'delete', id: object.id, name: object.name, record: r.id, snapshot: object, guess: object.category === 'guessed' })
                }}
              >
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
