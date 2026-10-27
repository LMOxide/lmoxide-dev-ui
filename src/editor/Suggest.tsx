import { useMemo, useState } from 'react'

export interface Suggestion {
  /** what is stored when it is picked */
  value: string
  label: string
  /** shown beside it, and searched too */
  detail?: string
  /** searched, not shown (other names it goes by) */
  keywords?: string
  /** listed first (e.g. in this playfield) */
  near?: boolean
}

const LIMIT = 12

/**
 * A text box that suggests values as you type. Free text is kept as it is (naming the thing is
 * optional); picking a suggestion stores its value and shows its label.
 */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string | null
  onChange: (v: string | null) => void
  suggestions: Suggestion[]
  placeholder?: string
}) {
  const picked = suggestions.find((s) => s.value === value)
  const [text, setText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const shown = text ?? picked?.label ?? value ?? ''

  const matches = useMemo(() => {
    // every word typed, anywhere in it ("fiery paleo", "volcano dino", "1613")
    const words = (text ?? '').toLowerCase().split(/[\s>[\]#]+/).filter(Boolean)
    const hits = suggestions.filter((s) => {
      const hay = `${s.label} ${s.detail ?? ''} ${s.keywords ?? ''} ${s.value}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    return [...hits.filter((s) => s.near), ...hits.filter((s) => !s.near)].slice(0, LIMIT)
  }, [suggestions, text])

  function pick(s: Suggestion) {
    onChange(s.value)
    setText(null)
    setOpen(false)
  }

  return (
    <div className="suggest">
      <input
        value={shown}
        placeholder={placeholder}
        onFocus={() => (setOpen(true), setActive(0))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(0)
          onChange(e.target.value || null)
        }}
        onKeyDown={(e) => {
          if (!open || !matches.length) return
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((active + 1) % matches.length))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((active + matches.length - 1) % matches.length))
          else if (e.key === 'Enter') (e.preventDefault(), pick(matches[active]))
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && matches.length > 0 && (
        <ul className="suggest-list">
          {matches.map((s, i) => (
            <li key={s.value} className={i === active ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), pick(s))}>
              <span className="sv-name">{s.label}</span>
              {s.detail && <span className="muted small">{s.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
