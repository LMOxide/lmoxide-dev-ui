import { ApiError } from '../api'

// The content tree the world editor edits (lmoxide docs/WORLD-EDITOR-CONTENT.md, docs/SURVEY.md
// "Content editing API"): the API's /v1/editor routes, or the mock.

/** A JSON value as records hold them. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
export type JsonObject = { [k: string]: Json }
/** A JSON Schema (as lmoxide-content writes them, with its x-lmoxide-* annotations). */
export type Schema = { [k: string]: unknown } | boolean

export interface KindInfo {
  kind: string
  prefix: string
  path: string
  title: string
  plural: string
  description?: string
  per_world: boolean
  list: string[]
  schema: string
}

export interface Kinds {
  index: { format: number; kinds: KindInfo[]; files: { name: string; path: string; description: string }[] }
  schemas: Record<string, Schema>
}

export interface RecordKey {
  id: string
  feature: string
}

export interface Summary extends RecordKey {
  kind: string
  name: string
  world?: string
  file: string
  source?: string
  tags?: string[]
  author?: string
  rev: number
  fields: Record<string, Json>
  problems: number
  changed: boolean
}

export interface ListQuery {
  kind?: string
  world?: string
  feature?: string
  tag?: string
  source?: string
  author?: string
  q?: string
  changed?: boolean
  problems?: boolean
  limit?: number
  offset?: number
}

export interface Problem {
  severity: 'error' | 'warning'
  id?: string | null
  file?: string | null
  message: string
}

export interface UsedBy extends RecordKey {
  /** a JSON pointer in that record */
  path: string
}

export interface RecordView extends RecordKey {
  file: string
  world: string | null
  record: JsonObject
  resolved: JsonObject
  /** field -> the record (and feature) it comes from */
  origin: Record<string, string>
  /** a spawn's template, its overrides applied */
  template: JsonObject | null
  problems: Problem[]
  used_by: UsedBy[]
  /** the features it has a version in */
  versions: string[]
  /** at the last commit (null: new) */
  committed: JsonObject | null
  changed: boolean
}

export interface Conflict {
  path: string
  base: Json
  ours: Json
  theirs: Json
}

export interface Commit {
  hash: string
  date: number
  author: string
  approved_by: string | null
  subject: string
  before: JsonObject | null
  after: JsonObject | null
}

export interface Change extends RecordKey {
  change: 'added' | 'changed' | 'removed'
  file: string
  author: string
  before: JsonObject | null
  after: JsonObject | null
}

export interface CatalogEntry {
  id: number
  name: string
  detail?: string
  /** the content record it belongs to */
  record?: string
}

/** A loot table rolled many times (lmoxide_content::roll::simulate). */
export interface LootSimulation {
  rolls: number
  rates: { what: string; chance: number; per_roll: number }[]
  nothing: number
  warnings: string[]
}

export interface NewRecord {
  kind: string
  name?: string
  world?: number
  feature?: string
  fields?: JsonObject
  copy_of?: RecordKey
}

/** A save the server refused: fields changed meanwhile, problems, or references in the way. */
export class EditRefused extends ApiError {
  readonly conflicts: Conflict[]
  readonly problems: string[]
  readonly usedBy: UsedBy[]
  constructor(status: number, code: string, message: string, conflicts: Conflict[] = [], problems: string[] = [], usedBy: UsedBy[] = []) {
    super(status, code, message)
    this.conflicts = conflicts
    this.problems = problems
    this.usedBy = usedBy
  }
}

export interface ContentBackend {
  readonly label: string
  kinds(): Promise<Kinds>
  list(q: ListQuery): Promise<{ total: number; records: Summary[] }>
  get(key: RecordKey, withFeatures?: string[]): Promise<RecordView>
  /** `base`: the version the edit started from (merged with what was saved since) */
  save(key: RecordKey, record: JsonObject, base: JsonObject | null): Promise<JsonObject>
  create(n: NewRecord): Promise<RecordKey & { record: JsonObject }>
  remove(key: RecordKey, replaceWith?: string): Promise<{ replaced: RecordKey[] }>
  history(key: RecordKey): Promise<Commit[]>
  problems(): Promise<{ errors: number; warnings: number; problems: Problem[] }>
  changes(author?: string): Promise<Change[]>
  catalog(name: string, q?: { q?: string; ids?: number[]; limit?: number }): Promise<{ total: number; entries: CatalogEntry[] }>
  /** Rolls a loot table as saved: how often each thing drops (in a playfield's world). */
  simulateLoot(id: string, rolls: number, playfield?: number): Promise<LootSimulation>
}

const qs = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

export class HttpContent implements ContentBackend {
  readonly label: string
  private readonly base: string
  private readonly token: string | null

  constructor(base: string, token: string | null) {
    this.base = base.replace(/\/+$/, '')
    this.token = token
    this.label = this.base
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetch(`${this.base}/v1/editor${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      throw new ApiError(0, 'network', `can't reach ${this.base} (${e instanceof Error ? e.message : e})`)
    }
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // not JSON
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; conflicts?: Conflict[]; problems?: string[]; used_by?: UsedBy[] } } | null)?.error
      throw new EditRefused(res.status, err?.code ?? `http_${res.status}`, err?.message ?? (text.slice(0, 200) || res.statusText), err?.conflicts, err?.problems, err?.used_by)
    }
    return json as T
  }

  private key(k: RecordKey) {
    return qs({ id: k.id, feature: k.feature === 'live' ? '' : k.feature })
  }

  kinds() {
    return this.call<Kinds>('GET', '/kinds')
  }
  list(q: ListQuery) {
    return this.call<{ total: number; records: Summary[] }>('GET', `/records?${qs({ ...q })}`)
  }
  get(key: RecordKey, withFeatures: string[] = []) {
    return this.call<RecordView>('GET', `/record?${this.key(key)}&${qs({ with: withFeatures.join(',') })}`)
  }
  async save(key: RecordKey, record: JsonObject, base: JsonObject | null) {
    return (await this.call<{ record: JsonObject }>('PUT', `/record?${this.key(key)}`, { record, base })).record
  }
  create(n: NewRecord) {
    return this.call<RecordKey & { record: JsonObject }>('POST', '/records', n)
  }
  remove(key: RecordKey, replaceWith?: string) {
    return this.call<{ replaced: RecordKey[] }>('DELETE', `/record?${this.key(key)}&${qs({ replace_with: replaceWith })}`)
  }
  history(key: RecordKey) {
    return this.call<Commit[]>('GET', `/history?${this.key(key)}`)
  }
  problems() {
    return this.call<{ errors: number; warnings: number; problems: Problem[] }>('GET', '/problems')
  }
  changes(author?: string) {
    return this.call<Change[]>('GET', `/changes?${qs({ author })}`)
  }
  catalog(name: string, q: { q?: string; ids?: number[]; limit?: number } = {}) {
    return this.call<{ total: number; entries: CatalogEntry[] }>('GET', `/catalog/${encodeURIComponent(name)}?${qs({ q: q.q, ids: q.ids?.join(','), limit: q.limit })}`)
  }
  simulateLoot(id: string, rolls: number, playfield?: number) {
    return this.call<LootSimulation>('POST', `/loot/simulate?${qs({ id, rolls, playfield })}`)
  }
}

/** The kind of an id (`npc/pirate` -> `npc`). */
export const kindOf = (id: string) => id.split('/')[0]

/** How a record is called in lists: its name, title, or id. */
export function recordLabel(r: { id: string; name?: string; fields?: Record<string, Json> } | JsonObject): string {
  const o = r as JsonObject
  const name = (o.name as string) || ((o.fields as JsonObject | undefined)?.title as string) || (o.title as string)
  return name || String(o.id)
}
