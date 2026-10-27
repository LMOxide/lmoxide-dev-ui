import { scriptDistance, shownWave } from './geometry'
import type { Ctx } from './WorldEditor'
import type { Script } from './types'

/** ◀ wave 2 of 4 ▶ for one script: which of its waves this surveyor sees. */
export function WaveStepper({ ctx, script }: { ctx: Ctx; script: Script }) {
  const { backend, account, state } = ctx
  const shown = shownWave(script, state.shown_waves)
  const waves = script.waves
  const i = waves.findIndex((w) => w.id === shown)
  const show = (wave: string) => ctx.run(() => backend.showWave(account, script.id, wave))
  if (waves.length < 2) return <span className="muted small">one wave</span>
  return (
    <span className="sv-row tight sv-nudge">
      <button disabled={i <= 0} onClick={() => show(waves[i - 1].id)} title="Show the previous wave">
        ◀
      </button>
      <span className="small sv-wave-label">{shown === 'all' ? 'all waves' : `wave ${i + 1}/${waves.length}${waves[i].name && waves[i].name !== `wave ${i + 1}` ? `: ${waves[i].name}` : ''}`}</span>
      <button disabled={i === waves.length - 1} onClick={() => show(shown === 'all' ? waves[0].id : waves[i + 1].id)} title="Show the next wave">
        ▶
      </button>
      <button className={shown === 'all' ? 'on' : ''} onClick={() => show(shown === 'all' ? waves[0].id : 'all')} title="Show every wave at once">
        all
      </button>
    </span>
  )
}

/** The scripts with several waves, nearest first (by their placements: scripts rarely have an area). */
export function WavesNearby({ ctx }: { ctx: Ctx }) {
  const { state, objects, notes } = ctx
  const scripts = notes.scripts
    .filter((s) => s.waves.length > 1)
    .map((s) => ({ s, d: scriptDistance(s, objects, state.pos) }))
    .sort((a, b) => a.d - b.d)
  if (!scripts.length) return null
  return (
    <div className="sv-panel">
      <div className="small muted">Waves shown (one per script; place into a wave to see it)</div>
      {scripts.map(({ s, d }) => (
        <div key={s.id} className="sv-row">
          <span className="sv-name small" title={s.comment}>
            {s.name || 'script'}
          </span>
          <WaveStepper ctx={ctx} script={s} />
          <span className="sv-dist">{d === Infinity ? '–' : `${d.toFixed(0)} m`}</span>
        </div>
      ))}
    </div>
  )
}
