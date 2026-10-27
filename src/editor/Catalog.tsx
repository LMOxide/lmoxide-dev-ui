import { useMemo, useState } from 'react'
import type { Ctx } from './WorldEditor'
import type { Kind, Placeable, WallSettings, WaveRef } from './types'
import { NEW_WALL, WallFields } from './Walls'
import { WaveSelect } from './WaveSelect'

const KINDS: [Kind | 'all', string][] = [
  ['all', 'All'],
  ['enemy', 'Enemies'],
  ['npc', 'NPCs'],
  ['smashable', 'Smashables'],
  ['buildie', 'Buildies'],
  ['interactable', 'Interactables'],
]

/** Buildies and interactables aren't looks a character can wear: the server shows a ghost. */
const wearable = (p: Placeable) => p.kind === 'enemy' || p.kind === 'npc' || p.kind === 'smashable'

const same = (a: Placeable | null, b: Placeable | null) => !!a && !!b && a.kind === b.kind && a.name === b.name && a.monster_data === b.monster_data && a.template === b.template

/** Pick something, wear it, walk to where it stood, place it. */
export function Catalog({ ctx, catalog }: { ctx: Ctx; catalog: Placeable[] }) {
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Placeable | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [wave, setWave] = useState<WaveRef | null>(null)
  /** a trigger wall being set up (instead of a spawn) */
  const [wall, setWall] = useState<WallSettings | null>(null)
  const { backend, account, state } = ctx

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (p) => (kind === 'all' || p.kind === kind) && (!q || p.name.toLowerCase().includes(q) || String(p.monster_data ?? '').includes(q) || String(p.template ?? '').includes(q)),
    )
  }, [catalog, kind, query])

  function choose(p: Placeable) {
    setWall(null)
    setChosen(p)
    setLevel(p.level ?? null)
  }

  const what = chosen && { ...chosen, level: chosen.kind === 'enemy' ? level : chosen.level }
  const wearing = same(state.wearing, chosen)

  return (
    <>
      <h2>Place</h2>
      <div className="sv-row">
        <button className={wall ? 'primary' : ''} onClick={() => (wall ? setWall(null) : (setWall(NEW_WALL), setChosen(null)))} title="A wall that does something when a player walks through it">
          Trigger wall / radius
        </button>
        <span className="muted small">or pick a spawn below</span>
      </div>
      {wall && (
        <div className="sv-panel focus">
          <label className="sv-field">
            <span>name</span>
            <input placeholder="optional" value={wall.name} onChange={(e) => setWall({ ...wall, name: e.target.value })} />
          </label>
          <WallFields value={wall} scripts={ctx.notes.scripts} looks={ctx.looks} targets={ctx.targets} playfield={ctx.state.playfield} onChange={(w) => setWall({ ...wall, ...w })} />
          <div className="sv-row">
            <button
              className="primary"
              onClick={async () => {
                const o = await ctx.run(() => backend.placeTrigger(account, wall, ctx.feature), 'all')
                if (o) ctx.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
              }}
              title="Standing in its middle, facing the way players walk through it"
            >
              Place here
            </button>
          </div>
          <p className="muted small">Stand where its middle goes, facing the way players walk through it. It is selected after placing: resize, recolour and move it there.</p>
        </div>
      )}
      {chosen && what && (
        <div className="sv-panel focus">
          <div className="sv-row">
            <b className="sv-grow">{chosen.name}</b>
            <span className="badge">{chosen.kind}</span>
          </div>
          <div className="muted small mono">
            {chosen.monster_data != null && `look ${chosen.monster_data} `}
            {chosen.template != null && `template ${chosen.template}`}
          </div>
          {chosen.kind === 'enemy' && (
            <label className="sv-field">
              <span>Level</span>
              <input className="sv-num" type="number" min={1} value={level ?? ''} onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : null)} />
            </label>
          )}
          <label className="sv-field">
            <span>Spawned</span>
            <WaveSelect scripts={ctx.notes.scripts} value={wave} onChange={setWave} />
          </label>
          <div className="sv-row">
            {wearing ? (
              <button onClick={() => ctx.run(() => backend.wear(account, null))}>Take off</button>
            ) : (
              <button onClick={() => ctx.run(() => backend.wear(account, what))} title={wearable(chosen) ? 'Your character takes its look' : 'A ghost of it follows you'}>
                {wearable(chosen) ? 'Wear it' : 'Show ghost'}
              </button>
            )}
            <button
              className="primary"
              onClick={async () => {
                const o = await ctx.run(() => backend.place(account, what, wave, ctx.feature), 'all')
                if (o) ctx.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
              }}
              title="Where you stand, facing your way"
            >
              Place here
            </button>
          </div>
          <p className="muted small">Walk to where it stood and face its way, then place it. It is selected after placing, to fine-tune.</p>
        </div>
      )}
      <div className="sv-row">
        <input className="sv-grow" placeholder="Search names, looks, templates" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="sv-row tight">
        {KINDS.map(([k, label]) => (
          <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="sv-list">
        {shown.map((p) => (
          <li key={`${p.kind}:${p.name}:${p.monster_data}:${p.template}`} className={same(p, chosen) ? 'on' : ''} onClick={() => choose(p)}>
            <span className="sv-name">{p.name}</span>
            {p.used && <span className="muted small">{p.used}</span>}
          </li>
        ))}
        {!shown.length && <li className="muted">Nothing matches.</li>}
      </ul>
    </>
  )
}
