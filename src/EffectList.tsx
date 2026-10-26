import { useEffect, useRef, useState } from 'react'
import { describe, isPackage, type Facts } from './catalog'
import type { Note } from './notes'
import { MiniTimeline } from './Timeline'
import type { Effect } from './types'

const ROW = 58

/** The filtered catalog; only the rows in view are rendered (there are ~2500). */
export function EffectList({
  items,
  facts,
  notes,
  selected,
  playing,
  onSelect,
  onPlay,
}: {
  items: Effect[]
  facts: Map<number, Facts>
  notes: Record<string, Note>
  selected: number | null
  playing: number | null
  onSelect: (id: number) => void
  onPlay: (id: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // keep the selection in view when it moves by keyboard
  useEffect(() => {
    const el = ref.current
    const i = items.findIndex((e) => e.id === selected)
    if (!el || i < 0) return
    const top = i * ROW
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight
  }, [selected, items])

  const first = Math.max(0, Math.floor(scroll / ROW) - 5)
  const last = Math.min(items.length, Math.ceil((scroll + height) / ROW) + 5)

  if (!items.length) return <div className="list empty muted">Nothing matches.</div>

  return (
    <div className="list" ref={ref} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} role="listbox" aria-label="Effects" tabIndex={-1}>
      <div style={{ height: items.length * ROW, position: 'relative' }}>
        {items.slice(first, last).map((e, k) => {
          const i = first + k
          const f = facts.get(e.id)!
          const note = notes[e.id]
          return (
            <div
              key={e.id}
              role="option"
              aria-selected={e.id === selected}
              className={`row${e.id === selected ? ' selected' : ''}${e.id === playing ? ' playing' : ''}`}
              style={{ top: i * ROW, height: ROW }}
              onClick={() => onSelect(e.id)}
              onDoubleClick={() => onPlay(e.id)}
            >
              <div className="row-main">
                <div className="row-head">
                  <span className="id">{e.id}</span>
                  {!isPackage(e) && <span className="badge">particle system</span>}
                  {f.looping && <span className="badge">looping</span>}
                  {!f.used && <span className="badge dim">unused</span>}
                  {note?.tags.map((t) => (
                    <span key={t} className="badge tag">
                      {t}
                    </span>
                  ))}
                  {note?.text.trim() && <span className="badge tag" title={note.text}>✎</span>}
                  {e.id === playing && <span className="badge play">▶ playing</span>}
                </div>
                <div className="desc">{describe(e)}</div>
              </div>
              {isPackage(e) && <MiniTimeline timelines={e.timelines} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
