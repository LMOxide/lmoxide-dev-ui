import { useState } from 'react'
import { AreaEditor, useDraft } from './AreaEditor'
import { areaCenter, scriptDistance, shownWave } from './geometry'
import { newId, StatusSelect } from './NotesPanel'
import { TagBadges, TagSelect } from './Tags'
import type { Ctx } from './WorldEditor'
import type { Script, Trigger, Wave, WaveRef } from './types'
import { WaveStepper } from './Waves'

type TriggerType = 'none' | 'after' | 'health_below' | 'enter_area' | 'wave_cleared' | 'other'

const TRIGGERS: [TriggerType, string][] = [
  ['none', "don't know"],
  ['after', 'some time passes'],
  ['health_below', 'an enemy loses health'],
  ['enter_area', 'a player walks in'],
  ['wave_cleared', 'a wave is defeated'],
  ['other', 'something else (comment)'],
]

const typeOf = (t: Trigger | null): TriggerType => (t === null ? 'none' : t === 'other' ? 'other' : (Object.keys(t)[0] as TriggerType))

const newWave = (n: number): Wave => ({ id: newId('w'), name: `wave ${n}`, trigger: null, comment: '' })

/**
 * Scripted events and their waves. Placements name the script and wave that spawns them; a
 * script with one wave is the simple case.
 */
export function ScriptsPanel({ ctx, showWave }: { ctx: Ctx; showWave: (w: WaveRef) => void }) {
  const { backend, state, notes, objects } = ctx
  const [open, setOpen] = useState<string | null>(null)
  const nearest = notes.scripts.map((s) => ({ s, d: scriptDistance(s, objects, state.pos) })).sort((a, b) => a.d - b.d)

  async function add() {
    const s: Script = { id: newId('s'), name: 'New script', area: null, reference: null, comment: '', waves: [newWave(1)], status: 'unreviewed', tags: ctx.newTags }
    const saved = await ctx.run(() => backend.saveScript(state.playfield, s), 'all')
    if (saved) setOpen(saved.id)
  }

  return (
    <>
      <div className="sv-row">
        <button className="primary" onClick={add}>
          New script
        </button>
        <span className="muted small">Give each wave a name, place its enemies with it chosen, and say what starts it.</span>
      </div>
      {nearest.map(({ s, d }) =>
        open === s.id ? (
          <ScriptEditor key={s.id} ctx={ctx} script={s} onClose={() => setOpen(null)} showWave={showWave} />
        ) : (
          <div key={s.id} className="sv-panel" onClick={() => setOpen(s.id)} style={{ cursor: 'pointer' }}>
            <div className="sv-row">
              <span className="sv-name">
                <b>{s.name || 'script'}</b> <span className="muted small">{s.waves.length === 1 ? '1 wave' : `${s.waves.length} waves`}</span>
              </span>
              <span onClick={(e) => e.stopPropagation()}>
                <WaveStepper ctx={ctx} script={s} />
              </span>
              <TagBadges tags={s.tags} />
              <span className="badge">{s.status}</span>
              <span className="sv-dist">{d === Infinity ? '–' : `${d.toFixed(0)} m`}</span>
            </div>
          </div>
        ),
      )}
      {!notes.scripts.length && <p className="muted">No scripts in this playfield yet.</p>}
    </>
  )
}

function ScriptEditor({ ctx, script, onClose, showWave }: { ctx: Ctx; script: Script; onClose: () => void; showWave: (w: WaveRef) => void }) {
  const { backend, account, state, objects } = ctx
  const [draft, update] = useDraft(script, (s) => ctx.run(() => backend.saveScript(state.playfield, s), 'all'))
  const [reallyDelete, setReallyDelete] = useState(false)
  const placed = (wave: string) => objects.filter((o) => o.wave?.script === script.id && o.wave.wave === wave).length
  const total = objects.filter((o) => o.wave?.script === script.id).length
  const setWave = (id: string, f: (w: Wave) => Wave) => update((d) => ({ ...d, waves: d.waves.map((w) => (w.id === id ? f(w) : w)) }))

  return (
    <div className="sv-panel focus">
      <label className="sv-field">
        <span>name</span>
        <input value={draft.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
      </label>
      <label className="sv-field">
        <span>which</span>
        <input placeholder="optional: the script's name or id, if you found it" value={draft.reference ?? ''} onChange={(e) => update((d) => ({ ...d, reference: e.target.value || null }))} />
      </label>
      <label className="sv-field">
        <span>comment</span>
        <textarea rows={2} value={draft.comment} onChange={(e) => update((d) => ({ ...d, comment: e.target.value }))} />
      </label>
      <div className="sv-field">
        <span>where</span>
        <AreaEditor allowNone value={draft.area} pos={state.pos} onChange={(a) => update((d) => ({ ...d, area: a }))} />
      </div>
      <div className="sv-field">
        <span>review</span>
        <StatusSelect value={draft.status} onChange={(s) => update((d) => ({ ...d, status: s }))} />
      </div>
      <div className="sv-field">
        <span>tags</span>
        <TagSelect ctx={ctx} value={draft.tags ?? []} onChange={(tags) => update((d) => ({ ...d, tags }))} />
      </div>

      {draft.waves.map((w, i) => {
        const ref = { script: script.id, wave: w.id }
        const shown = shownWave(script, state.shown_waves)
        const visible = shown === 'all' || shown === w.id
        const n = placed(w.id)
        return (
          <div key={w.id} className="sv-wave">
            <div className="sv-row">
              <input className="sv-grow" value={w.name} placeholder={`wave ${i + 1}`} onChange={(e) => setWave(w.id, (x) => ({ ...x, name: e.target.value }))} />
              <button className="link" onClick={() => showWave(ref)} title="List its placements">
                {n} placed
              </button>
            </div>
            <TriggerEditor ctx={ctx} script={draft} wave={w} onChange={(t) => setWave(w.id, (x) => ({ ...x, trigger: t }))} />
            <textarea rows={2} placeholder="how it starts, in your words" value={w.comment} onChange={(e) => setWave(w.id, (x) => ({ ...x, comment: e.target.value }))} />
            <div className="sv-row">
              <button
                disabled={shown === w.id || draft.waves.length < 2}
                onClick={() => ctx.run(() => backend.showWave(account, script.id, w.id))}
                title="Show this wave's placements, and hide the script's other waves"
              >
                {visible ? 'Shown' : 'Show this wave'}
              </button>
              <button disabled={!n} onClick={() => ctx.run(() => backend.previewWave(account, ref))} title="Spawn this wave for a while, as its trigger would">
                Preview
              </button>
              <button
                className="ghost sv-danger"
                disabled={n > 0 || draft.waves.length === 1}
                title={n ? 'Delete or move its placements first' : draft.waves.length === 1 ? 'A script has at least one wave' : 'Delete this wave'}
                onClick={() => update((d) => ({ ...d, waves: d.waves.filter((x) => x.id !== w.id) }))}
              >
                Delete wave
              </button>
            </div>
          </div>
        )
      })}
      <div className="sv-row sv-wave">
        <button onClick={() => update((d) => ({ ...d, waves: [...d.waves, newWave(d.waves.length + 1)] }))}>Add a wave</button>
      </div>
      <div className="sv-row">
        <button onClick={onClose}>Done</button>
        {draft.area && <button onClick={() => ctx.run(() => backend.teleport(account, areaCenter(draft.area!)))}>Go to it</button>}
        {reallyDelete ? (
          <button className="sv-danger" onClick={() => ctx.run(() => backend.deleteScript(state.playfield, script.id), 'all').then(onClose)}>
            Really delete
          </button>
        ) : (
          <button className="sv-danger" disabled={total > 0} title={total ? 'Delete or move its placements first' : ''} onClick={() => setReallyDelete(true)}>
            Delete script
          </button>
        )}
      </div>
    </div>
  )
}

function TriggerEditor({ ctx, script, wave, onChange }: { ctx: Ctx; script: Script; wave: Wave; onChange: (t: Trigger | null) => void }) {
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
