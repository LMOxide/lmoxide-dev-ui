import type { Area, SurveyObject, Vec3, WaveRef } from './types'

export function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Degrees between two headings in radians, 0..180. */
export function headingDifference(a: number, b: number) {
  const tau = Math.PI * 2
  const d = (((a - b) % tau) + tau) % tau
  return (Math.min(d, tau - d) * 180) / Math.PI
}

/** Radians → whole degrees 0..359, as the editor shows headings. */
export function toDegrees(rad: number) {
  return Math.round(((((rad * 180) / Math.PI) % 360) + 360) % 360)
}

export function toRadians(deg: number) {
  return (deg * Math.PI) / 180
}

export function areaCenter(a: Area): Vec3 {
  if ('point' in a) return a.point
  if ('circle' in a) return a.circle.center
  const ps = a.polygon.points
  if (!ps.length) return [0, 0, 0]
  const s = ps.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]] as Vec3, [0, 0, 0] as Vec3)
  return [s[0] / ps.length, s[1] / ps.length, s[2] / ps.length]
}

export function fmtPos(p: Vec3) {
  return p.map((v) => v.toFixed(1)).join(', ')
}

/** Hidden for this surveyor: by hand, or because another wave of the focused script is shown. */
export function isHidden(o: SurveyObject, hidden: Set<string>, focus: WaveRef | null) {
  if (hidden.has(o.id)) return true
  return !!(focus && o.wave && o.wave.script === focus.script && o.wave.wave !== focus.wave)
}
