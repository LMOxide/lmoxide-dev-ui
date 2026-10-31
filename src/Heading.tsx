import { compassPoint, screenAngle, UP_HEADING } from './compass'

/** Which way something faces: an arrow as the game's camera shows it (up is north-east, heading
 * 45°; north, +z, up-left), the angle (0° along +z, 90° along +x) and the game's compass point. */
export function Heading({
  degrees,
  compact = false,
  angle = true,
  className,
}: {
  degrees: number
  /** the arrow, angle and compass point only */
  compact?: boolean
  /** show the angle (off beside an input that already shows it) */
  angle?: boolean
  className?: string
}) {
  const d = ((Math.round(degrees) % 360) + 360) % 360
  const toward = ['+z', '+x+z', '+x', '+x−z', '−z', '−x−z', '−x', '−x+z'][Math.round(d / 45) % 8]
  return (
    <span
      className={className ? `heading ${className}` : 'heading'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25em', verticalAlign: 'middle' }}
      title={`facing ${d}° (0° along +z, 90° along +x): toward ${toward}, ${compassPoint(d)} in game (the arrow as the game's camera shows it: up is north-east, heading ${UP_HEADING}°)`}
    >
      <svg viewBox="-10 -10 20 20" width="18" height="18" aria-hidden="true" style={{ flex: 'none' }}>
        <circle r="9" fill="none" stroke="currentColor" strokeOpacity="0.35" />
        <path d="M0 -9 L0 -7" stroke="currentColor" strokeOpacity="0.6" />
        <path d="M0 -7 L4 4 L0 1.5 L-4 4 Z" fill="currentColor" transform={`rotate(${screenAngle(d)})`} />
      </svg>
      {angle && <span className="mono font-mono">{d}°</span>}
      {compact && <span className="muted small text-xs text-muted-foreground">{compassPoint(d)}</span>}
      {!compact && (
        <span className="muted small text-xs text-muted-foreground">
          {angle ? `toward ${toward} (${compassPoint(d)})` : `${compassPoint(d)} · toward ${toward}`}
        </span>
      )}
    </span>
  )
}
