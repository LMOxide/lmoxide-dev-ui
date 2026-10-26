import { useId, useMemo, useState } from 'react'
import type { Suggestion } from './suggest'

/**
 * A text input with a suggestion list under it: ↓/↑ pick, Tab or Enter take the picked one
 * (Enter on a complete suggestion also submits), Escape closes the list, then leaves the input.
 */
export function AutoInput({
  value,
  onChange,
  suggest,
  onSubmit,
  onKeyDown,
  inputRef,
  className,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  suggest: (v: string) => Suggestion[]
  onSubmit?: (v: string) => void
  /** keys the list didn't use (e.g. history on ↑ while it's closed) */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  inputRef?: React.Ref<HTMLInputElement>
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSubmit' | 'onKeyDown'>) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const [closed, setClosed] = useState(false)
  const [at, setAt] = useState(-1)
  const items = useMemo(() => (focused && !closed ? suggest(value) : []), [focused, closed, value, suggest])
  const open = items.length > 0

  function take(s: Suggestion, submit: boolean) {
    onChange(s.value)
    setAt(-1)
    if (submit && s.complete && onSubmit) {
      onSubmit(s.value)
      setClosed(true)
    }
  }

  return (
    <div className={`autoinput ${className ?? ''}`}>
      <input
        {...rest}
        ref={inputRef}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={open && at >= 0 ? `${id}-${at}` : undefined}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          onChange(e.target.value)
          setClosed(false)
          setAt(-1)
        }}
        onKeyDown={(e) => {
          if (open && e.key === 'ArrowDown') {
            e.preventDefault()
            setAt((i) => Math.min(items.length - 1, i + 1))
          } else if (open && e.key === 'ArrowUp' && at >= 0) {
            e.preventDefault()
            setAt((i) => i - 1)
          } else if (open && e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            take(items[Math.max(0, at)], false)
          } else if (e.key === 'Enter' && open && at >= 0) {
            e.preventDefault()
            take(items[at], true)
          } else if (e.key === 'Enter' && onSubmit) {
            e.preventDefault()
            onSubmit(value)
            setClosed(true)
          } else if (e.key === 'Escape' && open) {
            e.preventDefault()
            setClosed(true)
          } else onKeyDown?.(e)
        }}
      />
      {open && (
        <ul className="suggestions" role="listbox" id={id}>
          {items.map((s, i) => (
            <li
              key={s.key}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === at}
              className={i === at ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault() // keep the focus in the input
                take(s, true)
              }}
              onMouseEnter={() => setAt(i)}
            >
              <span className="s-label">{s.label}</span>
              {s.kind && <span className="badge dim">{s.kind}</span>}
              {s.detail && <span className="s-detail">{s.detail}</span>}
            </li>
          ))}
          <li className="s-help" aria-hidden>
            <kbd>↓</kbd><kbd>↑</kbd> pick · <kbd>Tab</kbd> complete · <kbd>Enter</kbd> {onSubmit ? 'run' : 'take'}
          </li>
        </ul>
      )}
    </div>
  )
}
