import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface MultiOption {
  value: string
  label?: string
  /** shown beside it (how many, ...) */
  detail?: string | number
  title?: string
}

/**
 * A combo box that picks several values: a button showing what is picked, and a list with a
 * search box and a checkbox per option. `create` lets typing a value that isn't listed add it
 * (tags).
 */
export function MultiSelect({
  options,
  value,
  onChange,
  label,
  none = 'none',
  all,
  create,
  title,
}: {
  options: MultiOption[]
  value: string[]
  onChange: (v: string[]) => void
  /** before the picked values on the button ("Show", "Tags") */
  label?: string
  /** the button's text when nothing is picked */
  none?: string
  /** the button's text when everything is picked (default: the list) */
  all?: string
  /** a typed value not in the list can be added ("+ add tag") */
  create?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => options.filter((o) => !q || (o.label ?? o.value).toLowerCase().includes(q) || o.value.toLowerCase().includes(q)), [options, q])
  const picked = new Set(value)
  const name = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const text =
    value.length === 0 ? none : all && options.length > 0 && options.every((o) => picked.has(o.value)) ? all : value.length <= 2 ? value.map(name).join(', ') : `${value.slice(0, 2).map(name).join(', ')} +${value.length - 2}`
  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const canCreate = !!create && q !== '' && !options.some((o) => o.value.toLowerCase() === q)
  return (
    <div className="multi" ref={box}>
      <button
        type="button"
        className="multi-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        title={title}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {label && <span className="muted">{label}: </span>}
        {text} <span className="multi-caret">▾</span>
      </button>
      {open && (
        <div className="multi-pop" id={id} role="listbox" aria-multiselectable onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <input
            autoFocus
            className="multi-search"
            placeholder={create ? `Search or ${create.toLowerCase()}` : 'Search'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (canCreate) onChange([...value, query.trim()])
              else if (shown.length === 1) toggle(shown[0].value)
              setQuery('')
            }}
          />
          <div className="multi-actions">
            <button type="button" className="link small" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}>
              all{q && ' shown'}
            </button>
            <button type="button" className="link small" onClick={() => onChange(q ? value.filter((v) => !shown.some((o) => o.value === v)) : [])}>
              none
            </button>
          </div>
          <ul className="multi-list">
            {shown.map((o) => (
              <li key={o.value} role="option" aria-selected={picked.has(o.value)} title={o.title}>
                <label className="check">
                  <input type="checkbox" checked={picked.has(o.value)} onChange={() => toggle(o.value)} /> {o.label ?? o.value}
                  {o.detail !== undefined && <span className="muted small"> {o.detail}</span>}
                </label>
              </li>
            ))}
            {canCreate && (
              <li>
                <button type="button" className="link small" onClick={() => (onChange([...value, query.trim()]), setQuery(''))}>
                  {create}: “{query.trim()}”
                </button>
              </li>
            )}
            {!shown.length && !canCreate && <li className="muted small">Nothing matches.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
