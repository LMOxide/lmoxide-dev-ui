import { SuggestInput, type Suggestion } from './Suggest'
import type { Script, TriggerTargets, Vec3, WallAction, WallSettings } from './types'

/** "Achievement_PirateTown" / "BA_Explore_Docks" -> "PirateTown" / "Docks" (the raw name stays the value). */
const prettyArea = (n: string) => n.replace(/^(Achievement_|BA_Explore_|Explore_)/, '').replace(/_/g, ' ')

export const NEW_WALL: WallSettings = { name: '', size: [6, 3, 1], color: 'red', action: 'other', once: false }

type ActionType = 'script' | 'discover' | 'dialog' | 'message' | 'other'

const ACTIONS: [ActionType, string][] = [
  ['script', 'starts a script'],
  ['discover', 'discovers a location'],
  ['dialog', 'opens a dialogue'],
  ['message', 'shows a message'],
  ['other', 'something else (comment)'],
]

const typeOf = (a: WallAction): ActionType => (a === 'other' ? 'other' : (Object.keys(a)[0] as ActionType))

function fresh(t: ActionType, scripts: Script[]): WallAction {
  if (t === 'script') return { script: { script: scripts[0]?.id ?? null, wave: null } }
  if (t === 'discover') return { discover: { name: null, achievement: null } }
  if (t === 'dialog') return { dialog: { dialog: null } }
  if (t === 'message') return { message: { text: '' } }
  return 'other'
}

const SIZE_LABELS = ['width', 'height', 'depth']

/** A trigger wall's size, look, what crossing it does, and whether only once. */
export function WallFields({
  value,
  onChange,
  scripts,
  looks,
  targets,
  playfield,
}: {
  value: WallSettings
  onChange: (w: Partial<WallSettings>) => void
  scripts: Script[]
  looks: string[]
  targets: TriggerTargets | null
  playfield: number
}) {
  const a = value.action
  const t = typeOf(a)
  const setSize = (i: number, v: number) => onChange({ size: value.size.map((x, j) => (j === i ? Math.max(0.1, Math.round(v * 10) / 10) : x)) as Vec3 })
  return (
    <>
      {SIZE_LABELS.map((label, i) => (
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
          {looks.map((l) => (
            <button key={l} className={`chip ${value.color === l ? 'on' : ''}`} onClick={() => onChange({ color: l })}>
              {l}
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
  const locations: Suggestion[] = (targets?.locations ?? []).map((l) => ({
    value: l.name,
    label: prettyArea(l.name),
    detail: `${l.playfield_name ?? l.playfield}${l.achievements.length ? ` · ${l.achievements.length} achievement${l.achievements.length > 1 ? 's' : ''}` : ''}`,
    near: l.playfield === playfield,
  }))
  const location = targets?.locations.find((l) => l.name === action.name)
  const achievements: Suggestion[] = (targets?.achievements ?? []).map((x) => ({
    value: String(x.id),
    label: x.name,
    detail: `${x.category}${x.locations.length > 1 ? ` · ${x.locations.length} locations` : ''}`,
    near: !!location?.achievements.includes(x.id) || x.locations.some((l) => l.playfield === playfield),
  }))
  const achievement = targets?.achievements.find((x) => String(x.id) === action.achievement)
  return (
    <>
      <div className="sv-field">
        <span>location</span>
        <SuggestInput
          value={action.name}
          placeholder="optional: the area found here"
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
        <SuggestInput value={action.achievement ?? null} placeholder="optional: what it counts toward" suggestions={achievements} onChange={(v) => onChange({ ...action, achievement: v })} />
      </div>
      {achievement && achievement.locations.length > 1 && (
        <div className="sv-field">
          <span />
          <div className="small">
            Needs all {achievement.locations.length} locations:{' '}
            {achievement.locations.map((l, i) => (
              <span key={l.name + l.playfield}>
                {i > 0 && ', '}
                {l.name === action.name ? <b>{prettyArea(l.name)} (this wall)</b> : prettyArea(l.name)}
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
