import { SuggestInput, type Suggestion } from './Suggest'
import type { Script, TriggerTargets, Vec3, WallAction, WallLook, WallSettings } from './types'

/** "Achievement_PirateTown" / "BA_Explore_Docks" -> "PirateTown" / "Docks" (the raw name stays the value). */
const prettyArea = (n: string) => n.replace(/^(Achievement_|BA_Explore_|Explore_)/, '').replace(/_/g, ' ')

type Location = TriggerTargets['locations'][number]
type Achievement = TriggerTargets['achievements'][number]

/** A location as players know it ("Volcano Summit"), else its area's name tidied ("Docks"). */
const placeName = (l: { name: string; title?: string | null }) => l.title || prettyArea(l.name)

/** An achievement as the game shows it: "Paleontologist > Fiery Explorer [1613]". */
const achievementLabel = (a: Achievement) => `${a.group ? `${a.group} > ` : ''}${a.title || a.name} [${a.id}]`

export const NEW_WALL: WallSettings = { name: '', size: [6, 3, 1], radius: null, color: 'green', action: 'other', once: false }

type ActionType = 'script' | 'discover' | 'dialog' | 'portal' | 'message' | 'collect' | 'other'

const ACTIONS: [ActionType, string][] = [
  ['script', 'starts a script'],
  ['discover', 'discovers a location'],
  ['dialog', 'opens a dialogue'],
  ['portal', 'opens a portal'],
  ['message', 'shows a message'],
  ['collect', 'gives a collectible'],
  ['other', 'something else (comment)'],
]

const typeOf = (a: WallAction): ActionType => (a === 'other' ? 'other' : (Object.keys(a)[0] as ActionType))

function fresh(t: ActionType, scripts: Script[]): WallAction {
  if (t === 'script') return { script: { script: scripts[0]?.id ?? null, wave: null } }
  if (t === 'discover') return { discover: { name: null, achievement: null } }
  if (t === 'dialog') return { dialog: { dialog: null } }
  if (t === 'portal') return { portal: { window: null, to: null } }
  if (t === 'message') return { message: { text: '' } }
  if (t === 'collect') return { collect: { drop: null } }
  return 'other'
}

const SIZE_LABELS = ['width', 'height', 'depth']

/** A trigger wall's (or radius's) shape and size, look, what crossing it does, and whether only once. */
export function WallFields({
  value,
  onChange,
  scripts,
  looks,
  targets,
  playfield,
  collects = [],
}: {
  value: WallSettings
  onChange: (w: Partial<WallSettings>) => void
  scripts: Script[]
  looks: WallLook[]
  targets: TriggerTargets | null
  playfield: number
  /** what a wall can give (collect achievements and drops) */
  collects?: Suggestion[]
}) {
  const a = value.action
  const t = typeOf(a)
  const setSize = (i: number, v: number) => onChange({ size: value.size.map((x, j) => (j === i ? Math.max(0.1, Math.round(v * 10) / 10) : x)) as Vec3 })
  const circle = value.radius !== null
  const setRadius = (v: number) => onChange({ radius: Math.min(100, Math.max(0.5, Math.round(v * 10) / 10)) })
  const shapeLooks = looks.filter((l) => l.shape === (circle ? 'radius' : 'wall'))
  const firstLook = (shape: WallLook['shape']) => looks.find((l) => l.shape === shape)?.color ?? 'green'
  return (
    <>
      <div className="sv-field">
        <span>shape</span>
        <div className="segmented" role="tablist">
          <button className={circle ? '' : 'on'} onClick={() => circle && onChange({ radius: null, color: firstLook('wall') })} title="A wall: crossing it sets it off">
            Wall
          </button>
          <button
            className={circle ? 'on' : ''}
            onClick={() => !circle && onChange({ radius: Math.max(1, Math.round(value.size[0] * 5) / 10), color: firstLook('radius') })}
            title="A circle around its spot: walking into it, from any side, sets it off"
          >
            Radius
          </button>
        </div>
      </div>
      {circle && (
        <div className="sv-field">
          <span>radius</span>
          <div className="sv-row tight sv-nudge">
            <button onClick={() => setRadius(value.radius! - 1)}>−1</button>
            <button onClick={() => setRadius(value.radius! - 0.5)}>−.5</button>
            <input className="sv-num" type="number" min={0.5} step={0.5} value={value.radius!} onChange={(e) => e.target.value !== '' && setRadius(Number(e.target.value))} />
            <button onClick={() => setRadius(value.radius! + 0.5)}>+.5</button>
            <button onClick={() => setRadius(value.radius! + 1)}>+1</button>
            <span className="muted small">m</span>
          </div>
        </div>
      )}
      {SIZE_LABELS.map((label, i) => ({ label, i })).filter(({ i }) => !circle || i === 1).map(({ label, i }) => (
        <div className="sv-field" key={label}>
          <span>{label}</span>
          <div className="sv-row tight sv-nudge">
            <button onClick={() => setSize(i, value.size[i] - 1)}>−1</button>
            <button onClick={() => setSize(i, value.size[i] - 0.5)}>−.5</button>
            <input className="sv-num" type="number" min={0.1} step={0.5} value={value.size[i]} onChange={(e) => e.target.value !== '' && setSize(i, Number(e.target.value))} />
            <button onClick={() => setSize(i, value.size[i] + 0.5)}>+.5</button>
            <button onClick={() => setSize(i, value.size[i] + 1)}>+1</button>
            <span className="muted small">m</span>
          </div>
        </div>
      ))}
      <div className="sv-field">
        <span>look</span>
        <div className="sv-row tight">
          {shapeLooks.map((l) => (
            <button key={l.color} className={`chip ${value.color === l.color ? 'on' : ''}`} onClick={() => onChange({ color: l.color })}>
              {l.color}
            </button>
          ))}
        </div>
      </div>
      <label className="sv-field">
        <span>crossing</span>
        <select value={t} onChange={(e) => onChange({ action: fresh(e.target.value as ActionType, scripts) })}>
          {ACTIONS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {typeof a === 'object' && 'script' in a && (
        <label className="sv-field">
          <span>script</span>
          <select
            value={`${a.script.script ?? ''}\n${a.script.wave ?? ''}`}
            onChange={(e) => {
              const [script, wave] = e.target.value.split('\n')
              onChange({ action: { script: { script: script || null, wave: wave || null } } })
            }}
          >
            <option value={'\n'}>none chosen yet</option>
            {scripts.map((s) => (
              <optgroup key={s.id} label={s.name || 'script'}>
                <option value={`${s.id}\n`}>{s.name || 'script'}: its first wave</option>
                {s.waves.map((w, i) => (
                  <option key={w.id} value={`${s.id}\n${w.id}`}>
                    {w.name || `wave ${i + 1}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {typeof a === 'object' && 'discover' in a && <DiscoverFields action={a.discover} targets={targets} playfield={playfield} onChange={(d) => onChange({ action: { discover: d } })} />}
      {typeof a === 'object' && 'dialog' in a && (
        <div className="sv-field">
          <span>dialogue</span>
          <SuggestInput
            value={a.dialog.dialog}
            placeholder="optional: the NPC or what they say"
            suggestions={(targets?.dialogs ?? []).map((d) => ({
              value: d.id,
              label: `${d.npc}: ${d.line.length > 60 ? `${d.line.slice(0, 60)}…` : d.line}`,
              detail: d.playfield_name ?? String(d.playfield),
              near: d.playfield === playfield,
            }))}
            onChange={(v) => onChange({ action: { dialog: { dialog: v } } })}
          />
        </div>
      )}
      {typeof a === 'object' && 'portal' in a && (
        <div className="sv-field">
          <span>portal</span>
          <SuggestInput
            value={a.portal.window === null ? null : String(a.portal.window)}
            placeholder="where it leads (its teleport window)"
            suggestions={(targets?.portals ?? []).map((p) => ({
              value: String(p.window),
              label: `${p.to_name ?? p.to}${p.plain ? ' (asks Yes/No)' : ''}`,
              detail: `window ${p.window}`,
              near: p.playfields.includes(playfield),
            }))}
            onChange={(v) => {
              const p = targets?.portals?.find((x) => String(x.window) === v)
              const n = v === null ? NaN : Number(v)
              onChange({ action: { portal: { window: Number.isFinite(n) ? n : null, to: p?.to ?? null } } })
            }}
          />
        </div>
      )}
      {typeof a === 'object' && 'collect' in a && (
        <div className="sv-field">
          <span>collectible</span>
          <SuggestInput value={a.collect.drop} placeholder="what crossing it gives (a collectible, a drop)" suggestions={collects} onChange={(v) => onChange({ action: { collect: { drop: v } } })} />
        </div>
      )}
      {typeof a === 'object' && 'message' in a && (
        <label className="sv-field">
          <span>message</span>
          <input value={a.message.text} onChange={(e) => onChange({ action: { message: { text: e.target.value } } })} />
        </label>
      )}
      <label className="check small">
        <input type="checkbox" checked={value.once} onChange={(e) => onChange({ once: e.target.checked })} /> only the first time each player crosses it
      </label>
    </>
  )
}

type Discover = { name: string | null; achievement?: string | null }

/**
 * Where a "discovers a location" wall is, and the achievement it counts toward: both suggested
 * (this playfield's first). Picking a location that counts toward one achievement picks it too;
 * an achievement that needs several locations lists them.
 */
function DiscoverFields({ action, targets, playfield, onChange }: { action: Discover; targets: TriggerTargets | null; playfield: number; onChange: (d: Discover) => void }) {
  const byId = new Map((targets?.achievements ?? []).map((a) => [a.id, a]))
  // a wall stores only the area's name, and some worlds share one ("Achievement_Volcano" on
  // Volcano Island and in Dinosaur Rise): this playfield's comes first, so it is the one shown
  const all = [...(targets?.locations ?? [])].sort((a, b) => Number(b.playfield === playfield) - Number(a.playfield === playfield))
  const locations: Suggestion[] = all.map((l: Location) => {
    const achs = l.achievements.map((id) => byId.get(id)).filter((a): a is Achievement => !!a)
    return {
      value: l.name,
      label: `${placeName(l)} (${l.playfield_name ?? l.playfield})`,
      detail: [l.name, ...achs.map((a) => a.title || a.name)].join(' · '),
      keywords: `${l.playfield} ${achs.map((a) => `${a.group ?? ''} ${a.text ?? ''} ${a.name} ${a.category} ${a.id}`).join(' ')}`,
      near: l.playfield === playfield,
    }
  })
  const location = all.find((l) => l.name === action.name)
  const achievements: Suggestion[] = (targets?.achievements ?? []).map((x) => ({
    value: String(x.id),
    label: achievementLabel(x),
    detail: `${x.text || x.category}${x.locations.length > 1 ? ` · ${x.locations.length} locations` : ''}`,
    keywords: `${x.name} ${x.category} ${x.locations.map((l) => placeName(l)).join(' ')}`,
    near: !!location?.achievements.includes(x.id) || x.locations.some((l) => l.playfield === playfield),
  }))
  const achievement = targets?.achievements.find((x) => String(x.id) === action.achievement)
  return (
    <>
      <div className="sv-field">
        <span>location</span>
        <SuggestInput
          value={action.name}
          placeholder="optional: the place found here (name, world, achievement)"
          suggestions={locations}
          onChange={(name) => {
            const l = targets?.locations.find((x) => x.name === name)
            // a location that counts toward one achievement: that one
            const only = l && l.achievements.length === 1 && !action.achievement ? String(l.achievements[0]) : action.achievement
            onChange({ name, achievement: only ?? null })
          }}
        />
      </div>
      <div className="sv-field">
        <span>achievement</span>
        <SuggestInput value={action.achievement ?? null} placeholder="optional: what it counts toward (title, world, id)" suggestions={achievements} onChange={(v) => onChange({ ...action, achievement: v })} />
      </div>
      {achievement?.text && (
        <div className="sv-field">
          <span />
          <div className="small muted">“{achievement.text}”</div>
        </div>
      )}
      {achievement && achievement.locations.length > 1 && (
        <div className="sv-field">
          <span />
          <div className="small">
            Needs all {achievement.locations.length} locations:{' '}
            {achievement.locations.map((l, i) => (
              <span key={l.name + l.playfield}>
                {i > 0 && ', '}
                {l.name === action.name ? <b>{placeName(l)} (this wall)</b> : placeName(l)}
              </span>
            ))}
            . Each needs its own wall.
          </div>
        </div>
      )}
      {location && location.achievements.length > 1 && !action.achievement && (
        <div className="sv-field">
          <span />
          <div className="small muted">This location counts toward {location.achievements.length} achievements; pick the one this wall is about.</div>
        </div>
      )}
    </>
  )
}
