import { useState } from 'react'
import { describe, isPackage, soundName } from './catalog'
import type { Note } from './notes'
import { TimelineChart, TimelineLegend } from './Timeline'
import type { Effect } from './types'

function List({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (!items.length) return null
  return (
    <section>
      <h3>
        {title} <span className="muted">{items.length}</span>
      </h3>
      <ul className={mono ? 'plain mono' : 'plain'}>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </section>
  )
}

export type FxAt = '' | '@near' | '@ground'

export function Detail({
  effect,
  note,
  tags,
  canSend,
  onCommand,
  play,
  fxAt,
  setFxAt,
  listen,
  onNote,
}: {
  effect: Effect
  note: Note | undefined
  tags: string[]
  canSend: boolean
  onCommand: (cmd: string) => void
  /** `!fx <id> [hook]` where `fxAt` says */
  play: (hook?: string) => void
  fxAt: FxAt
  setFxAt: (at: FxAt) => void
  /** plays a package's sound (RDB 1020002 id) in the browser */
  listen: (id: number) => void
  onNote: (n: Note) => void
}) {
  const [hook, setHook] = useState('')
  const [newTag, setNewTag] = useState('')
  const n: Note = note ?? { tags: [], text: '', updated: 0 }
  const toggle = (t: string) => onNote({ ...n, tags: n.tags.includes(t) ? n.tags.filter((x) => x !== t) : [...n.tags, t], updated: Date.now() })
  const pkg = isPackage(effect) ? effect : null
  const disabled = !canSend || !pkg

  return (
    <article className="detail">
      <header>
        <h2>
          <span className="id">{effect.id}</span> <span className="muted small">{effect.kind}</span>
          {pkg?.looping && <span className="badge">looping</span>}
        </h2>
        <p className="desc">{describe(effect)}</p>
      </header>

      <section className="preview">
        <button className="primary" disabled={disabled} onClick={() => play()} title="!fx <id>  (Enter)">
          ▶ Play
        </button>
        <button disabled={!canSend} onClick={() => onCommand('!fx stop')} title="!fx stop  (s)">
          ■ Stop
        </button>
        <select value={fxAt} onChange={(e) => setFxAt(e.target.value as FxAt)} aria-label="Play where" title="Where !fx plays it (also when stepping)">
          <option value="">on me</option>
          <option value="@near">on the nearest enemy (@near)</option>
          <option value="@ground">at my feet (@ground)</option>
        </select>
        {pkg?.code_hooks.map((h) => (
          <button key={h} disabled={disabled} onClick={() => play(h)} title={`!fx ${effect.id} ${h}: the timelines that start at this code hook`}>
            ▶ {h}
          </button>
        ))}
        {pkg && (
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault()
              if (hook.trim()) play(hook.trim())
            }}
          >
            <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="other code hook" list="hook-suggestions" aria-label="Play from code hook" spellCheck={false} size={13} />
            <datalist id="hook-suggestions">
              {['onhit', 'charge', 'execute', 'on_projectile_fired', 'on_projectile_destroyed', 'collision_hit', 'on_chain_jump', 'ontick'].map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
            <button disabled={disabled || !hook.trim()}>▶ hook</button>
          </form>
        )}
        {!pkg && <p className="muted small">Particle systems can't be played with <code>!fx</code> (it takes effect package ids).</p>}
      </section>

      <section className="note-editor">
        <h3>Note</h3>
        <div className="chips">
          {tags.map((t, i) => (
            <button key={t} type="button" className={`chip${n.tags.includes(t) ? ' on' : ''}`} onClick={() => toggle(t)} title={i < 9 ? `key ${i + 1}` : undefined}>
              {i < 9 && <kbd>{i + 1}</kbd>} {t}
            </button>
          ))}
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault()
              const t = newTag.trim()
              if (t && !n.tags.includes(t)) toggle(t)
              setNewTag('')
            }}
          >
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="+ tag" aria-label="New tag" size={8} />
          </form>
        </div>
        <textarea
          value={n.text}
          onChange={(e) => onNote({ ...n, text: e.target.value, updated: Date.now() })}
          placeholder="What is it? e.g. “plays when a minifigure is smashed, the white puff”"
          rows={2}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      </section>

      {pkg && (
        <section>
          <h3>
            Timeline <span className="muted">{pkg.timelines.length}</span>
          </h3>
          <TimelineLegend />
          <TimelineChart timelines={pkg.timelines} />
        </section>
      )}

      {(effect.used_by?.length ?? 0) > 0 && (
        <section>
          <h3>
            Used by <span className="muted">{effect.used_by!.length} (may include a few false matches)</span>
          </h3>
          <ul className="plain">
            {effect.used_by!.map((u, i) => (
              <li key={i}>
                <span className="badge dim">{u.rdb}</span> {u.name} <span className="muted mono">{u.id}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pkg && (
        <>
          {pkg.sounds.length > 0 && (
            <section>
              <h3>
                Sounds <span className="muted">{pkg.sounds.length}</span>
              </h3>
              <ul className="plain mono">
                {pkg.sounds.map((s) => (
                  <li key={s.path}>
                    <button className="ghost small-btn" disabled={s.id === null} onClick={() => s.id !== null && listen(s.id)} title={s.id === null ? 'not in the client' : `listen (RDB 1020002/${s.id})`}>
                      ♪
                    </button>{' '}
                    {soundName(s)} <span className="muted">— {s.path}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <List title="Particles" items={pkg.particles.map((p) => (p.name ? `${p.name}${p.id !== null ? `  (${p.id})` : ''}` : `#${p.id} (no name in the client)`))} mono />
          {pkg.animation_attributes.length > 0 && (
            <section>
              <h3>
                Animation attributes <span className="muted">{pkg.animation_attributes.length}</span>
              </h3>
              <div className="chips">
                {pkg.animation_attributes.map((a) => (
                  <button key={a} className="chip mono" disabled={!canSend} onClick={() => onCommand(`!anim ${a}`)} title={`!anim ${a}: the package that plays this attribute alone`}>
                    ▶ {a}
                  </button>
                ))}
              </div>
            </section>
          )}
          <List title="Code hooks" items={pkg.code_hooks} mono />
          {pkg.lua.length > 0 && (
            <section>
              <h3>
                Lua <span className="muted">{pkg.lua.length}</span>
              </h3>
              {pkg.lua.map((l, i) => (
                <pre key={i}>{l}</pre>
              ))}
            </section>
          )}
        </>
      )}
      {effect.kind === 'particlesystem' && (
        <>
          <List title="Emitters" items={effect.emitters} mono />
          <List title="Scripts" items={effect.scripts} mono />
        </>
      )}
    </article>
  )
}
