import { useMemo, useState } from 'react'
import type { Placeable } from './types'

/** Search the catalog and pick one (changing a spawn into another). */
export function SpawnPicker({ catalog, onPick, onCancel }: { catalog: Placeable[]; onPick: (p: Placeable) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((p) => !q || p.name.toLowerCase().includes(q) || p.kind.includes(q) || String(p.monster_data ?? '').includes(q) || String(p.template ?? '').includes(q)).slice(0, 60)
  }, [catalog, query])
  return (
    <div className="sv-panel">
      <div className="sv-row">
        <input className="sv-grow" autoFocus placeholder="Change into… (name, kind, look, template)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ul className="sv-list">
        {shown.map((p) => (
          <li key={`${p.kind}:${p.name}:${p.monster_data}:${p.template}`} onClick={() => onPick(p)}>
            <span className="sv-name">{p.name}</span>
            <span className="badge">{p.kind}</span>
          </li>
        ))}
        {!shown.length && <li className="muted">Nothing matches.</li>}
      </ul>
    </div>
  )
}
