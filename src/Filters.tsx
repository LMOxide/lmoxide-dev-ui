import { AutoInput } from './AutoInput'
import { NO_FILTERS, type Filters, type Tri } from './catalog'
import type { Suggestion } from './suggest'

function TriChip({ label, value, onChange, title }: { label: string; value: Tri; onChange: (t: Tri) => void; title?: string }) {
  const next: Record<Tri, Tri> = { any: 'yes', yes: 'no', no: 'any' }
  return (
    <button
      type="button"
      className={`chip tri-${value}`}
      title={(title ?? label) + ': click for has / has not / any'}
      aria-label={`${label}: ${value === 'any' ? 'any' : value === 'yes' ? 'has' : 'has not'}`}
      onClick={() => onChange(next[value])}
      onContextMenu={(e) => {
        e.preventDefault()
        onChange('any')
      }}
    >
      {value === 'no' ? 'no ' : value === 'yes' ? '✓ ' : ''}
      {label}
    </button>
  )
}

export function FilterPanel({
  filters,
  set,
  timelineTypes,
  tags,
  shown,
  total,
  searchRef,
  suggest,
}: {
  filters: Filters
  set: (f: Partial<Filters>) => void
  timelineTypes: string[]
  tags: string[]
  shown: number
  total: number
  searchRef: React.RefObject<HTMLInputElement | null>
  /** completions for the word being typed */
  suggest: (v: string) => Suggestion[]
}) {
  const changed = JSON.stringify({ ...filters, desc: false }) !== JSON.stringify({ ...NO_FILTERS, desc: false })
  return (
    <section className="filters" aria-label="Search and filters">
      <AutoInput
        inputRef={searchRef}
        type="search"
        className="search"
        placeholder="Search id, item/spell names, sounds, particles, Lua…  ( / )"
        value={filters.text}
        onChange={(text) => set({ text })}
        suggest={suggest}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') e.currentTarget.blur()
        }}
        aria-label="Search effects"
      />
      <div className="chips">
        <TriChip label="sound" value={filters.sound} onChange={(sound) => set({ sound })} />
        <TriChip label="particle" value={filters.particle} onChange={(particle) => set({ particle })} />
        <TriChip label="anim attr" value={filters.anim} onChange={(anim) => set({ anim })} title="animation attribute (EMotionFX)" />
        <TriChip label="Lua" value={filters.lua} onChange={(lua) => set({ lua })} />
        <TriChip label="looping" value={filters.looping} onChange={(looping) => set({ looping })} />
        <TriChip label="used" value={filters.used} onChange={(used) => set({ used })} title="used by an item or spell" />
      </div>
      <div className="selects">
        <select value={filters.kind} onChange={(e) => set({ kind: e.target.value as Filters['kind'] })} aria-label="Kind">
          <option value="any">all kinds</option>
          <option value="effectpackage">effect packages</option>
          <option value="particlesystem">particle systems</option>
        </select>
        <select value={filters.timelineType} onChange={(e) => set({ timelineType: e.target.value })} aria-label="Has timeline type">
          <option value="">any timeline type</option>
          {timelineTypes.map((t) => (
            <option key={t} value={t}>
              has {t}
            </option>
          ))}
        </select>
        <select value={filters.note} onChange={(e) => set({ note: e.target.value })} aria-label="Notes">
          <option value="">notes: any</option>
          <option value="*">with a note</option>
          <option value="-">without a note</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              tagged “{t}”
            </option>
          ))}
        </select>
        <button type="button" className="ghost" onClick={() => set({ desc: !filters.desc })} title="Sort by id">
          id {filters.desc ? '↓' : '↑'}
        </button>
      </div>
      <div className="count">
        <span>
          {shown.toLocaleString()} of {total.toLocaleString()}
        </span>
        {changed && (
          <button type="button" className="link" onClick={() => set({ ...NO_FILTERS, desc: filters.desc })}>
            clear filters
          </button>
        )}
      </div>
    </section>
  )
}
