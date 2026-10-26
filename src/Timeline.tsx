import { useState } from 'react'
import { TYPE_LABELS, partEnd, timelineSpan, typeColor } from './catalog'
import type { Timeline } from './types'

function seconds(s: number) {
  return `${+s.toFixed(2)} s`
}

/** How long a part lasts, in words. */
function length(t: Timeline) {
  if (t.until_stopped) return 'runs until the package stops'
  if (t.duration === null) return 'as long as its content (no duration of its own)'
  return t.duration === 0 ? 'at once' : `lasts ${seconds(t.duration)}`
}

/** The list's small chart: one thin bar per timeline part, start to end. */
export function MiniTimeline({ timelines, width = 120, height = 30 }: { timelines: Timeline[]; width?: number; height?: number }) {
  if (!timelines.length) return <svg className="mini-timeline" width={width} height={height} aria-hidden />
  const span = timelineSpan(timelines)
  const n = timelines.length
  const lane = height / n
  const bar = Math.max(1, Math.min(4, lane - (lane > 3 ? 1 : 0)))
  const x = (t: number) => (Math.min(t, span) / span) * width
  return (
    <svg className="mini-timeline" width={width} height={height} aria-hidden>
      {timelines.map((t, i) => {
        const x0 = x(t.start)
        const end = partEnd(t)
        const x1 = end === null ? width : x(end)
        return (
          <rect
            key={i}
            x={x0}
            y={i * lane + (lane - bar) / 2}
            width={Math.max(2, x1 - x0)}
            height={bar}
            rx={Math.min(1, bar / 2)}
            fill={typeColor(t.type)}
            opacity={t.duration === null ? 0.55 : 1}
          />
        )
      })}
    </svg>
  )
}

const LANE = 18
const LABEL_W = 170
const AXIS_H = 20

function ticks(span: number): number[] {
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const step = steps.find((s) => span / s <= 6) ?? 600
  const out = []
  for (let t = 0; t <= span + 1e-9; t += step) out.push(+t.toFixed(3))
  return out
}

/** The detail chart: one labelled lane per part, a seconds axis on top (long charts scroll), and a hover readout. */
export function TimelineChart({ timelines }: { timelines: Timeline[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!timelines.length) return <p className="muted">No timeline.</p>
  const span = timelineSpan(timelines)
  const width = 400
  const plotW = width - LABEL_W - 8
  const height = timelines.length * LANE + AXIS_H
  const x = (t: number) => LABEL_W + (Math.min(t, span) / span) * plotW
  const h = hover === null ? null : timelines[hover]
  return (
    <div className="timeline-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Timeline: when each part starts and how long it lasts" onMouseLeave={() => setHover(null)}>
        {ticks(span).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={AXIS_H} y2={height} className="grid" />
            <text x={x(t)} y={AXIS_H - 7} className="axis" textAnchor="middle">
              {t}s
            </text>
          </g>
        ))}
        {timelines.map((t, i) => {
          const end = partEnd(t)
          const endless = end === null
          const x0 = x(t.start)
          const x1 = endless ? LABEL_W + plotW : x(end)
          const y = AXIS_H + i * LANE
          return (
            <g key={i} className={hover === i ? 'lane hover' : 'lane'} onMouseEnter={() => setHover(i)}>
              <rect x={0} y={y} width={width} height={LANE} className="lane-hit" />
              <text x={LABEL_W - 6} y={y + LANE / 2 + 4} textAnchor="end" className="lane-label">
                {t.hook && <tspan className="lane-hook">{t.hook} · </tspan>}
                {t.name.length > (t.hook ? 14 : 24) ? t.name.slice(0, t.hook ? 13 : 23) + '…' : t.name}
              </text>
              <rect
                x={x0}
                y={y + 5}
                width={Math.max(3, x1 - x0)}
                height={LANE - 10}
                rx={2}
                fill={typeColor(t.type)}
                opacity={t.duration === null && !endless ? 0.5 : 1}
              />
              {endless && (
                <path d={`M${x1 - 1} ${y + 3} l5 ${LANE / 2 - 3} l-5 ${LANE / 2 - 3}`} className="endless" fill={typeColor(t.type)} />
              )}
            </g>
          )
        })}
      </svg>
      <div className="timeline-readout" aria-live="polite">
        {h ? (
          <>
            <span className="swatch" style={{ background: typeColor(h.type) }} />
            <b>{h.name}</b> ({TYPE_LABELS[h.type] ?? h.type}, on {h.target}): starts {seconds(h.start)} after {h.hook ? <>the <code>{h.hook}</code> hook</> : 'the package starts'},{' '}
            {length(h)}
          </>
        ) : (
          <span className="muted">Point at a bar for its start, length and target.</span>
        )}
      </div>
    </div>
  )
}

export function TimelineLegend() {
  return (
    <div className="legend">
      {['particle', 'sound', 'emotionfxattribute', 'lua'].map((t) => (
        <span key={t}>
          <span className="swatch" style={{ background: typeColor(t) }} />
          {TYPE_LABELS[t]}
        </span>
      ))}
      <span>
        <span className="swatch" style={{ background: typeColor('other') }} />
        other
      </span>
    </div>
  )
}
