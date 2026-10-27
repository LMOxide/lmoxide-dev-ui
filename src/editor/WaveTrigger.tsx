// What starts a script's wave (Wave.trigger), as far as the surveyor could tell.

import { newId } from './NotesPanel'
import type { Ctx } from './WorldEditor'
import type { Script, Trigger, Wave } from './types'

type TriggerType = 'none' | 'after' | 'health_below' | 'enter_area' | 'wave_cleared' | 'other'

export const TRIGGERS: [TriggerType, string][] = [
  ['none', "don't know"],
  ['after', 'some time passes'],
  ['health_below', 'an enemy loses health'],
  ['enter_area', 'a player walks in'],
  ['wave_cleared', 'a wave is defeated'],
  ['other', 'something else (comment)'],
]

const typeOf = (t: Trigger | null): TriggerType => (t === null ? 'none' : t === 'other' ? 'other' : (Object.keys(t)[0] as TriggerType))

export const newWave = (n: number): Wave => ({ id: newId('w'), name: `wave ${n}`, trigger: null, comment: '' })

export function TriggerEditor({ ctx, script, wave, onChange }: { ctx: Ctx; script: Script; wave: Wave; onChange: (t: Trigger | null) => void }) {
  const t = wave.trigger
  const type = typeOf(t)
  const selected = ctx.state.selected ? ctx.objects.find((o) => o.id === ctx.state.selected) : undefined

  function setType(k: TriggerType) {
    if (k === 'none') onChange(null)
    else if (k === 'other') onChange('other')
    else if (k === 'after') onChange({ after: { seconds: 10 } })
    else if (k === 'health_below') onChange({ health_below: { placement: null, percent: 50 } })
    else if (k === 'enter_area') onChange({ enter_area: { note: null } })
    else onChange({ wave_cleared: { wave: script.waves.find((w) => w.id !== wave.id)?.id ?? '' } })
  }

  return (
    <div className="sv-row small">
      <span className="muted">starts when</span>
      <select value={type} onChange={(e) => setType(e.target.value as TriggerType)}>
        {TRIGGERS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {t && typeof t === 'object' && 'after' in t && (
        <label>
          <input className="sv-num" type="number" min={0} value={t.after.seconds} onChange={(e) => onChange({ after: { seconds: Number(e.target.value) } })} /> s after the start or the last wave
        </label>
      )}
      {t && typeof t === 'object' && 'health_below' in t && (
        <>
          <span>{t.health_below.placement ? (ctx.objects.find((o) => o.id === t.health_below.placement)?.name ?? 'missing') : 'an enemy'}</span>
          <button disabled={!selected} title="Use the selected object" onClick={() => selected && onChange({ health_below: { ...t.health_below, placement: selected.id } })}>
            use selection
          </button>
          <label>
            below <input className="sv-num" type="number" min={1} max={99} value={t.health_below.percent} onChange={(e) => onChange({ health_below: { ...t.health_below, percent: Number(e.target.value) } })} /> %
          </label>
        </>
      )}
      {t && typeof t === 'object' && 'enter_area' in t && (
        <select value={t.enter_area.note ?? ''} onChange={(e) => onChange({ enter_area: { note: e.target.value || null } })}>
          <option value="">the script's area</option>
          {ctx.notes.notes.map((n) => (
            <option key={n.id} value={n.id}>
              note: {n.reference || n.comment.slice(0, 40) || n.kind}
            </option>
          ))}
        </select>
      )}
      {t && typeof t === 'object' && 'wave_cleared' in t && (
        <select value={t.wave_cleared.wave} onChange={(e) => onChange({ wave_cleared: { wave: e.target.value } })}>
          {script.waves
            .filter((w) => w.id !== wave.id)
            .map((w, i) => (
              <option key={w.id} value={w.id}>
                {w.name || `wave ${i + 1}`}
              </option>
            ))}
        </select>
      )}
    </div>
  )
}
