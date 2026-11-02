// The page's query string mirrors what you're looking at (tab, search, filters, selection), so
// a link opens the same view. Values read from the link win over remembered ones on load; every
// change rewrites the address in place (history.replaceState, batched), so Back isn't flooded.

const pending = new Map<string, string | null>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  const url = new URL(window.location.href)
  for (const [k, v] of pending) {
    if (v === null || v === '') url.searchParams.delete(k)
    else url.searchParams.set(k, v)
  }
  pending.clear()
  // (a bare flag like ?mock stays bare: empty values are never written, only kept)
  const query = url.searchParams.toString().replace(/=(?=&|$)/g, '')
  const next = url.pathname + (query ? `?${query}` : '') + url.hash
  if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', next)
}

/** A query parameter's value in the address ('' or null: none). */
export function getParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key)
}

/** Sets (or, with null or '', removes) query parameters; written together shortly after. */
export function setParams(values: Record<string, string | null | undefined>) {
  for (const [k, v] of Object.entries(values)) pending.set(k, v ?? null)
  if (!timer) timer = setTimeout(flush, 150)
}

/** Several values under one prefix that differ from `defaults` (`fx.sound=yes`), for a filters object. */
export function objectParams<T extends object>(prefix: string, value: T, defaults: T): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const k of Object.keys(defaults) as (keyof T & string)[]) {
    const v = value[k]
    const same = JSON.stringify(v) === JSON.stringify(defaults[k])
    out[`${prefix}.${k}`] = same || v === null || v === undefined ? null : Array.isArray(v) ? v.join(',') : String(v)
  }
  return out
}

/** The object `objectParams` wrote, over `base`; null when the address has none of its keys. */
export function readObjectParams<T extends object>(prefix: string, defaults: T): T | null {
  const params = new URLSearchParams(window.location.search)
  let any = false
  const out = { ...defaults } as Record<string, unknown>
  for (const k of Object.keys(defaults)) {
    const raw = params.get(`${prefix}.${k}`)
    if (raw === null) continue
    any = true
    const d = (defaults as Record<string, unknown>)[k]
    out[k] = Array.isArray(d) ? (raw ? raw.split(',') : []) : typeof d === 'boolean' ? raw === '1' || raw === 'true' : typeof d === 'number' || d === null ? (raw === '' ? null : Number(raw)) : raw
  }
  return any ? (out as T) : null
}
