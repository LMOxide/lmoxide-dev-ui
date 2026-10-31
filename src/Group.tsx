import { useEffect, useState, type ReactNode } from 'react'

/** A collapsible group of a long list: its rows are drawn only while it is open. `open` (and
 * changes to it, e.g. a filter typed) opens or closes it; the reader can toggle it too. */
export function Group({ title, count, open: initial = false, children }: { title: ReactNode; count?: ReactNode; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial)
  useEffect(() => setOpen(initial), [initial])
  return (
    <details className="group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {title} {count !== undefined && <span className="muted small">{count}</span>}
      </summary>
      {open && <div className="group-body">{children}</div>}
    </details>
  )
}
