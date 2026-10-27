import { AutoInput } from './AutoInput'
import { NO_FILTERS, type Filters } from './catalog'
import { MultiSelect } from './MultiSelect'
import type { Suggestion } from './suggest'

type TriKey = 'sound' | 'particle' | 'anim' | 'lua' | 'looping' | 'used'

const TRI: { key: TriKey; label: string; title?: string }[] = [
  { key: 'sound', label: 'sound' },
  { key: 'particle', label: 'particle' },
  { key: 'anim', label: 'anim attr', title: 'animation attribute (EMotionFX)' },
  { key: 'lua', label: 'Lua' },
  { key: 'looping', label: 'looping' },
  { key: 'used', label: 'used', title: 'used by an item or spell' },
]

/** "Has" / "has not" pickers over the yes/no/any filters: picking a key in one drops it from the other. */
function TriPicker({ filters, set, which }: { filters: Filters; set: (f: Partial<Filters>) => void; which: 'yes' | 'no' }) {
  return (
    <MultiSelect
      label={which === 'yes' ? 'Has' : 'Has not'}
      none="any"
      options={TRI.map((t) => ({ value: t.key, label: t.label, title: t.title }))}
      value={TRI.filter((t) => filters[t.key] === which).map((t) => t.key)}
      onChange={(v) => {
        const next: Partial<Filters> = {}
        for (const t of TRI) {
          if (v.includes(t.key)) next[t.key] = which
          else if (filters[t.key] === which) next[t.key] = 'any'
        }
        set(next)
      }}
    />
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
      <div className="selects">
        <TriPicker filters={filters} set={set} which="yes" />
        <TriPicker filters={filters} set={set} which="no" />
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
