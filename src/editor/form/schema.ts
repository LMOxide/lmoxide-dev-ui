import type { Json, JsonObject, Schema } from '../content'

// Reading the content JSON Schemas (lmoxide-content `schemas`, schemars 1 output) for forms:
// $refs, optional values (`type: [T, "null"]`, `anyOf: [T, null]`), enums, externally tagged
// enums, and the x-lmoxide-* annotations (docs/CONTENT.md "What the schemas say for editors").

export type S = { [k: string]: unknown }

export const obj = (s: Schema | undefined): S => (s && typeof s === 'object' ? (s as S) : {})

/** The definition a `$ref` points at (`#/$defs/Shape`), all the way. */
export function deref(root: S, s: Schema | undefined): S {
  let cur = obj(s)
  for (let i = 0; i < 20 && typeof cur.$ref === 'string'; i++) {
    const path = (cur.$ref as string).replace(/^#\//, '').split('/')
    let t: unknown = root
    for (const p of path) t = (t as S | undefined)?.[p]
    // a $ref with siblings (description, default): theirs on top
    const { $ref: _, ...rest } = cur
    cur = { ...obj(t as Schema), ...rest }
  }
  return cur
}

const isNull = (s: S) => s.type === 'null' || (Array.isArray(s.type) && s.type.length === 1 && s.type[0] === 'null')

/**
 * An optional value's schema without its "or null" (and whether it was optional that way).
 * Annotations on the outer schema stay.
 */
export function unNull(root: S, s: Schema | undefined): { s: S; nullable: boolean } {
  const d = deref(root, s)
  if (Array.isArray(d.type) && d.type.includes('null')) {
    const rest = (d.type as string[]).filter((t) => t !== 'null')
    return { s: { ...d, type: rest.length === 1 ? rest[0] : rest }, nullable: true }
  }
  const any = (d.anyOf ?? d.oneOf) as Schema[] | undefined
  if (any && any.length === 2 && any.some((b) => isNull(obj(b)))) {
    const inner = any.find((b) => !isNull(obj(b)))
    const { anyOf: _a, oneOf: _o, ...outer } = d
    const inn = deref(root, inner)
    return { s: { ...inn, ...outer, description: outer.description ?? inn.description }, nullable: true }
  }
  return { s: d, nullable: false }
}

export interface EnumOption {
  value: string
  description?: string
}

/** A plain enum's values (strings), with their descriptions; null when it isn't one. */
export function enumOptions(root: S, s: S): EnumOption[] | null {
  const d = deref(root, s)
  if (Array.isArray(d.enum)) return (d.enum as Json[]).filter((v) => typeof v === 'string').map((v) => ({ value: v as string }))
  if (typeof d.const === 'string') return [{ value: d.const, description: d.description as string | undefined }]
  const branches = d.oneOf as Schema[] | undefined
  if (!branches) return null
  const out: EnumOption[] = []
  for (const b of branches) {
    const o = enumOptions(root, obj(b))
    if (!o) return null
    out.push(...o)
  }
  return out
}

export interface Variant {
  name: string
  description?: string
  /** none: a unit variant (written as the string) */
  schema: S | null
}

/**
 * An externally tagged enum's variants (`{ "apply_buff": { ... } }` or `"other"`); null when
 * it isn't one.
 */
export function variants(root: S, s: S): Variant[] | null {
  const d = deref(root, s)
  const branches = d.oneOf as Schema[] | undefined
  if (!branches || branches.length < 2) return null
  const out: Variant[] = []
  let tagged = false
  for (const raw of branches) {
    const b = deref(root, raw)
    const props = b.properties as Record<string, Schema> | undefined
    const req = b.required as string[] | undefined
    if (b.type === 'object' && props && req?.length === 1 && Object.keys(props).length === 1) {
      tagged = true
      out.push({ name: req[0], description: b.description as string | undefined, schema: deref(root, props[req[0]]) })
      continue
    }
    const units = enumOptions(root, b)
    if (!units) return null
    out.push(...units.map((u) => ({ name: u.value, description: u.description ?? (b.description as string | undefined), schema: null })))
  }
  return tagged ? out : null
}

/** Which variant a value is (its single key, or the string). */
export function variantOf(v: Json): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.keys(v)[0] ?? null
  return null
}

export const refKinds = (s: S) => (Array.isArray(s['x-lmoxide-ref']) ? (s['x-lmoxide-ref'] as string[]) : null)
export const refKeyKinds = (s: S) => (Array.isArray(s['x-lmoxide-ref-key']) ? (s['x-lmoxide-ref-key'] as string[]) : null)
export const clientCatalog = (s: S) => (typeof s['x-lmoxide-client'] === 'string' ? (s['x-lmoxide-client'] as string) : null)
export const unitOf = (s: S) => (typeof s['x-lmoxide-unit'] === 'string' ? (s['x-lmoxide-unit'] as 'duration' | 'ratio' | 'range') : null)
export const isPosition = (s: S) => s['x-lmoxide-position'] === true
export const isRotation = (s: S) => s['x-lmoxide-rotation'] === true

/** The JSON types a schema allows (none: anything). */
export function types(s: S): string[] {
  if (typeof s.type === 'string') return [s.type]
  if (Array.isArray(s.type)) return s.type as string[]
  return []
}

/** A fixed-size list of numbers (`[f32; 3]`): its size. */
export function tupleSize(s: S): number | null {
  if (!types(s).includes('array')) return null
  const items = obj(s.items as Schema)
  const n = s.minItems
  return typeof n === 'number' && n === s.maxItems && (items.type === 'number' || items.type === 'integer') ? n : null
}

/** An empty value of a schema (what "add" puts in). */
export function emptyOf(root: S, s: Schema | undefined): Json {
  const { s: d, nullable } = unNull(root, s)
  if (d.default !== undefined) return d.default as Json
  if (nullable) return null
  if (isPosition(d)) return [0, 0, 0]
  const v = variants(root, d)
  if (v) return v[0].schema ? { [v[0].name]: emptyOf(root, v[0].schema) } : v[0].name
  const e = enumOptions(root, d)
  if (e) return e[0]?.value ?? ''
  const unit = unitOf(d)
  if (unit === 'duration') return '1s'
  if (unit === 'ratio') return '10%'
  if (unit === 'range') return 1
  const n = tupleSize(d)
  if (n) return Array(n).fill(0)
  const t = types(d)[0]
  switch (t) {
    case 'object': {
      const out: JsonObject = {}
      const props = (d.properties ?? {}) as Record<string, Schema>
      for (const k of (d.required as string[] | undefined) ?? []) out[k] = emptyOf(root, props[k])
      return out
    }
    case 'array':
      return []
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    default:
      return null
  }
}

/** A field's name for people: `respawn_points` -> "respawn points". */
export const fieldLabel = (k: string) => k.replace(/_/g, ' ')

/** What a hand-written unit value means (null: it doesn't parse). */
export function parseUnit(unit: 'duration' | 'ratio' | 'range', v: Json): string | null {
  if (unit === 'range') {
    if (typeof v === 'number') return `${v}`
    if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')) return `${v[0]} to ${v[1]}`
    return null
  }
  if (typeof v === 'number') return unit === 'duration' ? `${v} s` : `${+(v * 100).toFixed(4)}%`
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (unit === 'ratio') {
    const m = /^(-?[0-9.]+)\s*%$/.exec(t)
    return m && !isNaN(+m[1]) ? `${+(+m[1] / 100).toFixed(6)} of it` : null
  }
  const m = /^(-?[0-9.]+)\s*(ms|s|m|h)?$/.exec(t)
  if (!m || isNaN(+m[1])) return null
  const secs = +m[1] * ({ ms: 0.001, s: 1, m: 60, h: 3600 } as Record<string, number>)[m[2] ?? 's']
  return `${+secs.toFixed(3)} s`
}
