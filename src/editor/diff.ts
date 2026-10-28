import type { Json } from './content'

/** One field that differs: its path (`stats/health`; lists are one value) and both values. */
export interface FieldDiff {
  path: string
  before: Json | undefined
  after: Json | undefined
}

const isObj = (v: Json | undefined): v is { [k: string]: Json } => !!v && typeof v === 'object' && !Array.isArray(v)

/** The fields that differ between two records, objects compared field by field. */
export function diff(before: Json | undefined, after: Json | undefined, path = '', out: FieldDiff[] = []): FieldDiff[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return out
  if (isObj(before) && isObj(after)) {
    for (const k of [...new Set([...Object.keys(before), ...Object.keys(after)])]) diff(before[k], after[k], path ? `${path}/${k}` : k, out)
    return out
  }
  out.push({ path: path || '(all)', before, after })
  return out
}

/** Sets the value at a JSON pointer (`/a/b/0`), making objects on the way; undefined removes it. */
export function setAt(root: Json, pointer: string, value: Json | undefined): Json {
  const parts = pointer.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (!parts.length) return value ?? null
  const copy = structuredClone(root) as { [k: string]: Json } | Json[]
  let cur = copy as { [k: string]: Json } | Json[]
  for (const p of parts.slice(0, -1)) {
    const next = (cur as { [k: string]: Json })[p]
    if (!next || typeof next !== 'object') (cur as { [k: string]: Json })[p] = {}
    cur = (cur as { [k: string]: Json })[p] as { [k: string]: Json }
  }
  const last = parts[parts.length - 1]
  if (value === undefined) {
    if (Array.isArray(cur)) cur.splice(Number(last), 1)
    else delete cur[last]
  } else (cur as { [k: string]: Json })[last] = value
  return copy as Json
}

/** A value shortened for a line. */
export function brief(v: Json | undefined): string {
  if (v === undefined) return '—'
  const t = typeof v === 'string' ? v : JSON.stringify(v)
  return t.length > 120 ? `${t.slice(0, 117)}…` : t
}
