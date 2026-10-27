import { useEffect, useRef, useState } from 'react'
import { fmtPos } from './geometry'
import type { Area, Vec3 } from './types'

const SAVE_MS = 400

/** A local copy of a record that saves itself shortly after each change, and when closed. */
export function useDraft<T>(value: T, save: (v: T) => void): [T, (f: (old: T) => T) => void] {
  const [draft, setDraft] = useState(value)
  const latest = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!timer.current) {
      setDraft(value)
      latest.current = value
    }
  }, [value])

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        saveRef.current(latest.current)
      }
    },
    [],
  )

  function update(f: (old: T) => T) {
    const next = f(latest.current)
    latest.current = next
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      saveRef.current(latest.current)
    }, SAVE_MS)
  }
  return [draft, update]
}

type Shape = 'none' | 'point' | 'circle' | 'polygon'

const shapeOf = (a: Area | null): Shape => (!a ? 'none' : 'point' in a ? 'point' : 'circle' in a ? 'circle' : 'polygon')

/** An area from the surveyor's positions: where they stand, a circle around it, or corners walked out. */
export function AreaEditor({ value, onChange, pos, allowNone = false }: { value: Area | null; onChange: (a: Area | null) => void; pos: Vec3; allowNone?: boolean }) {
  const shape = shapeOf(value)
  const here: Vec3 = [...pos]

  function setShape(s: Shape) {
    if (s === shape) return
    if (s === 'none') onChange(null)
    if (s === 'point') onChange({ point: here })
    if (s === 'circle') onChange({ circle: { center: here, radius: 10 } })
    if (s === 'polygon') onChange({ polygon: { points: [] } })
  }

  const shapes: Shape[] = allowNone ? ['none', 'point', 'circle', 'polygon'] : ['point', 'circle', 'polygon']
  return (
    <div>
      <div className="segmented">
        {shapes.map((s) => (
          <button key={s} className={shape === s ? 'on' : ''} onClick={() => setShape(s)}>
            {s === 'none' ? 'No area' : s === 'point' ? 'Spot' : s === 'circle' ? 'Circle' : 'Walked out'}
          </button>
        ))}
      </div>
      {value && 'point' in value && (
        <div className="sv-row small">
          <span className="mono">{fmtPos(value.point)}</span>
          <button onClick={() => onChange({ point: here })}>Here</button>
        </div>
      )}
      {value && 'circle' in value && (
        <div className="sv-row small">
          <span className="mono">{fmtPos(value.circle.center)}</span>
          <button onClick={() => onChange({ circle: { ...value.circle, center: here } })}>Centre here</button>
          <label>
            radius{' '}
            <input className="sv-num" type="number" min={1} value={value.circle.radius} onChange={(e) => onChange({ circle: { ...value.circle, radius: Number(e.target.value) || 1 } })} /> m
          </label>
        </div>
      )}
      {value && 'polygon' in value && (
        <div className="sv-row small">
          <span>{value.polygon.points.length} corners</span>
          <button className="primary" onClick={() => onChange({ polygon: { points: [...value.polygon.points, here] } })} title="Walk to each corner in turn and add it">
            Add a corner here
          </button>
          <button disabled={!value.polygon.points.length} onClick={() => onChange({ polygon: { points: value.polygon.points.slice(0, -1) } })}>
            Undo
          </button>
          {value.polygon.points.length > 0 && value.polygon.points.length < 3 && <span className="muted">(3 or more make an area)</span>}
        </div>
      )}
    </div>
  )
}
