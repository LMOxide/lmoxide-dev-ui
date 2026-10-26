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

export function Detail({
  effect,
  note,
  tags,
  canSend,
  onCommand,
  onNote,
}: {
  effect: Effect
  note: Note | undefined
  tags: string[]
  canSend: boolean
  onCommand: (cmd: string) => void
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
        <button className="primary" disabled={disabled} onClick={() => onCommand(`!fx ${effect.id}`)} title="!fx <id>  (Enter)">
          ▶ Play
        </button>
        <button disabled={!canSend} onClick={() => onCommand('!fx stop')} title="!fx stop  (s)">
          ■ Stop
        </button>
        {pkg?.code_hooks.map((h) => (
          <button key={h} disabled={disabled} onClick={() => onCommand(`!fx ${effect.id} ${h}`)} title={`!fx ${effect.id} ${h}`}>
            ▶ {h}
          </button>
        ))}
        {pkg && (
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault()
              if (hook.trim()) onCommand(`!fx ${effect.id} ${hook.trim()}`)
            }}
          >
            <input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="code hook"
              list="hook-suggestions"
              aria-label="Play from code hook"
              spellCheck={false}
              size={11}
            />
            <datalist id="hook-suggestions">
              {[...new Set([...pkg.code_hooks, ...pkg.animation_attributes, 'limbostart'])].map((h) => (
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
          <List title="Sounds" items={pkg.sounds.map((s) => `${soundName(s)}  —  ${s}`)} mono />
          <List title="Particles" items={pkg.particles} mono />
          <List title="Animation attributes" items={pkg.animation_attributes} mono />
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
