import type { Script, Vec3, WallAction, WallSettings } from './types'

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
  if (t === 'discover') return { discover: { name: null } }
  if (t === 'dialog') return { dialog: { dialog: null } }
  if (t === 'message') return { message: { text: '' } }
  return 'other'
}

const SIZE_LABELS = ['width', 'height', 'depth']

/** A trigger wall's size, look, what crossing it does, and whether only once. */
export function WallFields({ value, onChange, scripts, looks }: { value: WallSettings; onChange: (w: Partial<WallSettings>) => void; scripts: Script[]; looks: string[] }) {
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
      {typeof a === 'object' && 'discover' in a && (
        <label className="sv-field">
          <span>where</span>
          <input placeholder="optional: the location or achievement" value={a.discover.name ?? ''} onChange={(e) => onChange({ action: { discover: { name: e.target.value || null } } })} />
        </label>
      )}
      {typeof a === 'object' && 'dialog' in a && (
        <label className="sv-field">
          <span>dialogue</span>
          <input placeholder="optional: its number (!dialog) or name" value={a.dialog.dialog ?? ''} onChange={(e) => onChange({ action: { dialog: { dialog: e.target.value || null } } })} />
        </label>
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
