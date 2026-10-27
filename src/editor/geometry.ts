import type { Area, Script, SurveyObject, Vec3 } from './types'

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

/** The wave of a script a surveyor sees: chosen, else the first; "all" for one-wave scripts. */
export function shownWave(script: Script, shown: Record<string, string>): string {
  if (script.waves.length < 2) return 'all'
  const w = shown[script.id]
  return w === 'all' || script.waves.some((x) => x.id === w) ? w : script.waves[0].id
}

/** In another wave of its script than the one shown. */
export function inHiddenWave(o: SurveyObject, shown: Record<string, string>, scripts: Script[]) {
  if (!o.wave) return false
  const s = scripts.find((x) => x.id === o.wave!.script)
  if (!s) return false
  const w = shownWave(s, shown)
  return w !== 'all' && w !== o.wave.wave
}

/** Hidden for this surveyor: by hand, or in a wave that isn't shown. */
export function isHidden(o: SurveyObject, hidden: Set<string>, shown: Record<string, string>, scripts: Script[]) {
  return hidden.has(o.id) || inHiddenWave(o, shown, scripts)
}

/** How near a script is: its nearest placement (scripts rarely have an area), else its area. */
export function scriptDistance(script: Script, objects: SurveyObject[], pos: Vec3) {
  let best = Infinity
  for (const o of objects) if (o.wave?.script === script.id) best = Math.min(best, distance(o.pos, pos))
  if (best === Infinity && script.area) best = distance(areaCenter(script.area), pos)
  return best
}
