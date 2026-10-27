import { useMemo, useState } from 'react'
import { featureLabel, FeatureSelect } from './Features'
import { distance, inHiddenWave } from './geometry'
import { Marks } from './Marks'
import { TagBadges } from './Tags'
import { MultiSelect } from '../MultiSelect'
import type { Ctx } from './WorldEditor'
import { CATEGORIES, type Category, type WaveRef } from './types'
import { WavesNearby } from './Waves'
import { waveLabel } from './WaveSelect'

const LIMIT = 300

/** Everything this playfield spawns, nearest first. */
export function Objects({ ctx, waveFilter, setWaveFilter, onSelect }: { ctx: Ctx; waveFilter: WaveRef | 'static' | null; setWaveFilter: (w: WaveRef | 'static' | null) => void; onSelect: () => void }) {
  const { backend, account, state, objects, notes } = ctx
  const [cats, setCats] = useState<Set<Category>>(() => new Set(CATEGORIES))
  const [query, setQuery] = useState('')
  const [radius, setRadius] = useState<number | null>(null)
  const [hiddenOnly, setHiddenOnly] = useState(false)
  /** only one author's (or one feature's) changes: '' all */
  const [author, setAuthor] = useState('')
  const [feature, setFeature] = useState('')
  /** only what carries any of these tags ('-' : untagged) */
  const [tags, setTags] = useState<string[]>([])
  const authors = useMemo(() => [...new Set(objects.map((o) => o.author).filter((a): a is string => !!a))].sort(), [objects])
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    // "#todo" in the search: that tag
    const qTag = q.startsWith('#') ? q.slice(1) : null
    return objects
      .map((o) => {
        const w = inHiddenWave(o, state.shown_waves, notes.scripts)
        return { o, d: distance(o.pos, state.pos), w, h: w || hidden.has(o.id) }
      })
      .filter(
        ({ o, d, h }) =>
          cats.has(o.category) &&
          (!q || (qTag !== null ? (o.tags ?? []).some((t) => t.startsWith(qTag)) : o.name.toLowerCase().includes(q) || o.id.includes(q) || (o.comment ?? '').toLowerCase().includes(q) || (o.tags ?? []).includes(q))) &&
          (!tags.length || (o.tags?.length ? o.tags.some((t) => tags.includes(t)) : tags.includes('-'))) &&
          (radius === null || d <= radius) &&
          (!hiddenOnly || h) &&
          (!author || o.author === author) &&
          (!feature || (o.feature ?? 'live') === feature || (o.feature ?? 'live').startsWith(`${feature}/`)) &&
          (waveFilter === null || (waveFilter === 'static' ? !o.wave : o.wave?.script === waveFilter.script && o.wave.wave === waveFilter.wave)),
      )
      .sort((a, b) => a.d - b.d)
  }, [objects, state.pos, state.shown_waves, notes.scripts, hidden, cats, query, radius, hiddenOnly, waveFilter, author, feature, tags])

  const counts = useMemo(() => {
    const c = new Map<Category, number>()
    for (const o of objects) c.set(o.category, (c.get(o.category) ?? 0) + 1)
    return c
  }, [objects])


  const hiddenCount = state.hidden.length
  const shownIds = rows.filter((r) => !r.h).map((r) => r.o.id)

  return (
    <>
      <h2>In this playfield</h2>
      <WavesNearby ctx={ctx} />
      <div className="sv-row tight">
        <MultiSelect
          label="Show"
          all="every category"
          none="nothing"
          options={CATEGORIES.map((c) => ({ value: c, detail: counts.get(c) ?? 0 }))}
          value={CATEGORIES.filter((c) => cats.has(c))}
          onChange={(v) => setCats(new Set(v as Category[]))}
          title="Which categories the list shows"
        />
      </div>
      <div className="sv-row">
        <input className="sv-grow" placeholder="Search (name, comment, #tag)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={radius ?? ''} onChange={(e) => setRadius(e.target.value ? Number(e.target.value) : null)} title="Only this close to you">
          <option value="">any distance</option>
          {[10, 25, 50, 100].map((r) => (
            <option key={r} value={r}>
              within {r} m
            </option>
          ))}
        </select>
      </div>
      <div className="sv-row">
        <select
          value={waveFilter === null ? '' : waveFilter === 'static' ? 'static' : `${waveFilter.script}\n${waveFilter.wave}`}
          onChange={(e) => {
            const v = e.target.value
            const [script, wave] = v.split('\n')
            setWaveFilter(v === '' ? null : v === 'static' ? 'static' : { script, wave })
          }}
          title="Placements spawned at start, or by a script's wave"
        >
          <option value="">all spawns</option>
          <option value="static">at start only</option>
          {notes.scripts.map((s) => (
            <optgroup key={s.id} label={s.name || 'script'}>
              {s.waves.map((w, i) => (
                <option key={w.id} value={`${s.id}\n${w.id}`}>
                  {w.name || `wave ${i + 1}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label className="check small">
          <input type="checkbox" checked={hiddenOnly} onChange={(e) => setHiddenOnly(e.target.checked)} /> hidden only
        </label>
      </div>
      <div className="sv-row">
        <select value={author} onChange={(e) => setAuthor(e.target.value)} title="Only what this editor changed last">
          <option value="">every author</option>
          {authors.map((a) => (
            <option key={a} value={a}>
              by {a}
            </option>
          ))}
        </select>
        <FeatureSelect features={ctx.features} value={feature} onChange={setFeature} any="every feature" title="Only this feature (and what is nested under it)" />
      </div>
      <div className="sv-row">
        <TagFilter ctx={ctx} value={tags} onChange={setTags} />
      </div>
      {(author || feature || tags.length > 0) && (
        <div className="sv-row">
          <button
            onClick={() => {
              const shown = new Set(rows.map((r) => r.o.id))
              const others = objects.filter((o) => !shown.has(o.id) && !hidden.has(o.id)).map((o) => o.id)
              ctx.run(() => backend.hide(account, others, true))
            }}
            title="Preview: hide everything else in game (only for you; Unhide all brings it back)"
          >
            Show only these in game
          </button>
        </div>
      )}
      <div className="sv-row">
        <button onClick={() => ctx.run(() => backend.selectNearest(account)).then(onSelect)}>Select nearest</button>
        <button disabled={!shownIds.length} onClick={() => ctx.run(() => backend.hide(account, shownIds, true))} title="Hide everything this list shows">
          Hide listed
        </button>
        <button disabled={!hiddenCount} onClick={() => ctx.run(() => backend.unhideAll(account))}>
          Unhide all{hiddenCount ? ` (${hiddenCount})` : ''}
        </button>
      </div>
      <Marks ctx={ctx} authors={authors} />
      <ul className="sv-list">
        {rows.slice(0, LIMIT).map(({ o, d, w, h }) => (
          <li
            key={o.id}
            className={`${state.selected === o.id ? 'on' : ''} ${h ? 'hidden-obj' : ''}`}
            onClick={() => ctx.run(() => backend.select(account, o.id)).then(onSelect)}
          >
            <button
              className="ghost eye"
              title={w ? 'In a wave that isn’t shown: show that wave' : h ? 'Show it' : 'Hide it (only for you, until you show it again)'}
              onClick={(e) => {
                e.stopPropagation()
                if (w && o.wave) ctx.run(() => backend.showWave(account, o.wave!.script, o.wave!.wave))
                else ctx.run(() => backend.hide(account, [o.id], !hidden.has(o.id)))
              }}
            >
              {h ? '◌' : '◉'}
            </button>
            <span className="sv-name" title={o.id}>
              {o.name}
            </span>
            {o.wave && <span className="badge wave">{waveLabel(notes.scripts, o.wave)}</span>}
            {o.kind === 'trigger' && <span className="badge trigger">trigger</span>}
            {o.kind === 'buildie' && <span className="badge trigger">buildie</span>}
            {o.feature && o.feature !== 'live' && (
              <span className="badge feature" title={featureLabel(ctx.features, o.feature)}>
                {o.feature.split('/').pop()}
              </span>
            )}
            <TagBadges tags={o.tags} />
            {o.author && (
              <span className="muted small sv-author" title={`changed last by ${o.author}`}>
                {o.author}
              </span>
            )}
            <span className={`badge ${o.category}`}>{o.category}</span>
            <span className="sv-dist">{d < 1000 ? `${d.toFixed(0)} m` : 'far'}</span>
          </li>
        ))}
        {rows.length > LIMIT && <li className="muted">{rows.length - LIMIT} more: narrow the search.</li>}
        {!rows.length && <li className="muted">Nothing here matches.</li>}
      </ul>
    </>
  )
}

/** Only what carries any of the picked tags (or nothing: "untagged"). */
function TagFilter({ ctx, value, onChange }: { ctx: Ctx; value: string[]; onChange: (v: string[]) => void }) {
  const inUse = new Map<string, number>()
  for (const o of ctx.objects) for (const t of o.tags ?? []) inUse.set(t, (inUse.get(t) ?? 0) + 1)
  const untagged = ctx.objects.filter((o) => !o.tags?.length).length
  return (
    <MultiSelect
      label="Tags"
      none="any"
      options={[
        ...[...inUse].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => ({ value: t, label: `#${t}`, detail: n })),
        ...ctx.tags.filter((t) => !inUse.has(t.tag)).map((t) => ({ value: t.tag, label: `#${t.tag}`, detail: 0, title: `${t.count} elsewhere` })),
        { value: '-', label: 'untagged', detail: untagged },
      ]}
      value={value}
      onChange={onChange}
      title="Only what carries any of these tags (counts: in this playfield)"
    />
  )
}
