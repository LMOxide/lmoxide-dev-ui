import type { Script, WaveRef } from './types'

export function waveLabel(scripts: Script[], ref: WaveRef) {
  const s = scripts.find((x) => x.id === ref.script)
  const w = s?.waves.find((x) => x.id === ref.wave)
  if (!s || !w) return 'missing wave'
  const n = s.waves.indexOf(w) + 1
  return `${s.name || 'script'} › ${w.name || `wave ${n}`}`
}

const key = (r: WaveRef) => `${r.script}\n${r.wave}`

/** None (spawned when the playfield starts), or a script's wave. */
export function WaveSelect({ scripts, value, onChange, none = 'At start (no script)' }: { scripts: Script[]; value: WaveRef | null; onChange: (w: WaveRef | null) => void; none?: string }) {
  return (
    <select
      value={value ? key(value) : ''}
      onChange={(e) => {
        const [script, wave] = e.target.value.split('\n')
        onChange(e.target.value ? { script, wave } : null)
      }}
    >
      <option value="">{none}</option>
      {scripts.map((s) => (
        <optgroup key={s.id} label={s.name || 'script'}>
          {s.waves.map((w, i) => (
            <option key={w.id} value={key({ script: s.id, wave: w.id })}>
              {w.name || `wave ${i + 1}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
