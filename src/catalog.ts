import type { Effect, EffectPackage, Timeline } from './types'

/** Timeline durations at or above this are "until stopped" (the catalog uses 86400). */
export const ENDLESS = 3600

export function isPackage(e: Effect): e is EffectPackage {
  return e.kind === 'effectpackage'
}

/** `sfx\swishes\swish_blade_throw_1.wav` → `swish_blade_throw_1` */
export function soundName(path: string): string {
  return path.split(/[\\/]/).pop()!.replace(/\.wav$/i, '')
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)]
}

/** Item/spell names using the effect, without repeats. */
export function usedByNames(e: Effect): string[] {
  return unique((e.used_by ?? []).map((u) => u.name).filter(Boolean))
}

/** Packages have no names: a line made of what uses them, their sounds and particles. */
export function describe(e: Effect): string {
  if (!isPackage(e)) return [...e.emitters, ...e.scripts].join(', ') || 'particle system'
  const parts = [
    ...usedByNames(e).slice(0, 3),
    ...unique(e.sounds.map(soundName)).slice(0, 2).map((s) => `♪ ${s}`),
    ...unique(e.particles).slice(0, 3).map((p) => `✦ ${p}`),
  ]
  if (parts.length) return parts.join(' · ')
  return unique(e.timelines.map((t) => t.name)).slice(0, 4).join(' · ') || '(empty package)'
}

export interface Facts {
  sound: boolean
  particle: boolean
  anim: boolean
  lua: boolean
  looping: boolean
  used: boolean
  types: Set<string>
  /** lower-case text the free-text search looks in */
  haystack: string
}

export function facts(e: Effect): Facts {
  const used = (e.used_by?.length ?? 0) > 0
  if (!isPackage(e)) {
    return {
      sound: false,
      particle: true,
      anim: false,
      lua: false,
      looping: false,
      used,
      types: new Set(),
      haystack: [e.id, e.kind, ...e.emitters, ...e.scripts, ...(e.used_by ?? []).map((u) => `${u.name} ${u.id}`)]
        .join('\n')
        .toLowerCase(),
    }
  }
  const types = new Set(e.timelines.map((t) => t.type))
  return {
    sound: e.sounds.length > 0 || types.has('sound'),
    particle: e.particles.length > 0 || types.has('particle'),
    anim: e.animation_attributes.length > 0 || types.has('emotionfxattribute'),
    lua: e.lua.length > 0 || types.has('lua'),
    looping: e.looping,
    used,
    types,
    haystack: [
      e.id,
      ...(e.used_by ?? []).map((u) => `${u.name} ${u.id}`),
      ...e.sounds,
      ...e.particles,
      ...e.lua,
      ...e.animation_attributes,
      ...e.code_hooks,
      ...e.timelines.map((t) => t.name),
    ]
      .join('\n')
      .toLowerCase(),
  }
}

/** any / must have / must not have */
export type Tri = 'any' | 'yes' | 'no'

export interface Filters {
  text: string
  kind: 'any' | 'effectpackage' | 'particlesystem'
  sound: Tri
  particle: Tri
  anim: Tri
  lua: Tri
  looping: Tri
  used: Tri
  /** a timeline type that must be present ('' for any) */
  timelineType: string
  /** '' any, '*' with a note, '-' without, else a tag */
  note: string
  desc: boolean
}

export const NO_FILTERS: Filters = {
  text: '',
  kind: 'any',
  sound: 'any',
  particle: 'any',
  anim: 'any',
  lua: 'any',
  looping: 'any',
  used: 'any',
  timelineType: '',
  note: '',
  desc: false,
}

function tri(t: Tri, v: boolean) {
  return t === 'any' || (t === 'yes') === v
}

/**
 * Free text: every word must occur somewhere (`"quoted words"` together, `-word` must not);
 * a number also matches the id exactly.
 */
export function textMatcher(text: string): (e: Effect, f: Facts) => boolean {
  const words = [...text.toLowerCase().matchAll(/(-?)"([^"]+)"|(-?)(\S+)/g)].map((m) => ({
    not: (m[1] || m[3]) === '-',
    w: m[2] ?? m[4],
  }))
  if (!words.length) return () => true
  return (e, f) =>
    words.every(({ not, w }) => {
      const hit = (/^\d+$/.test(w) && String(e.id) === w) || f.haystack.includes(w)
      return hit !== not
    })
}

export function matches(f: Filters, e: Effect, x: Facts): boolean {
  return (
    (f.kind === 'any' || e.kind === f.kind) &&
    tri(f.sound, x.sound) &&
    tri(f.particle, x.particle) &&
    tri(f.anim, x.anim) &&
    tri(f.lua, x.lua) &&
    tri(f.looping, x.looping) &&
    tri(f.used, x.used) &&
    (!f.timelineType || x.types.has(f.timelineType))
  )
}

/** The seconds a timeline chart spans: every part that ends, and a bit past endless ones' starts. */
export function timelineSpan(ts: Timeline[]): number {
  let span = 0
  for (const t of ts) span = Math.max(span, t.duration >= ENDLESS ? t.start + 1 : t.start + t.duration)
  return Math.max(span, 0.5)
}

/** Fixed colour per timeline type (categorical slots in a fixed order); others share a gray. */
export const TYPE_COLORS: Record<string, string> = {
  particle: 'var(--series-1)',
  sound: 'var(--series-2)',
  emotionfxattribute: 'var(--series-3)',
  lua: 'var(--series-4)',
}

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? 'var(--series-other)'
}

export const TYPE_LABELS: Record<string, string> = {
  particle: 'particle',
  sound: 'sound',
  emotionfxattribute: 'animation attribute',
  lua: 'Lua',
}
