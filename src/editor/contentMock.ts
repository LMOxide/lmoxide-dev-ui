// The content routes in memory (/editor/?mock), over a copy of part of the real content tree
// (fixture/content.json, tools/content-fixture.mjs): saves merge field by field, deletes are
// refused while referenced, catalogs come from the records, "committed" is the fixture.

import type { CatalogEntry, Change, LootSimulation, Commit, Conflict, ContentBackend, Json, JsonObject, Kinds, ListQuery, NewRecord, Problem, RecordKey, RecordView, Summary, UsedBy } from './content'
import { EditRefused, kindOf } from './content'

interface Fixture {
  index: Kinds['index']
  schemas: Kinds['schemas']
  records: { record: JsonObject; file: string }[]
  texts: { texts: Record<string, string>; names: Record<string, string> }
}

interface Entry {
  record: JsonObject
  file: string
}

const keyOf = (r: JsonObject): RecordKey => ({ id: r.id as string, feature: (r.feature as string) || 'live' })
const k = (key: RecordKey) => `${key.id}@${key.feature}`
const clone = <T,>(v: T): T => structuredClone(v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const now = () => Math.floor(Date.now() / 1000)
const BOOKKEEPING = ['rev', 'author', 'updated']

/** Three-way merge, field by field (lmoxide_content::merge::merge3). */
export function merge3(base: Json | undefined, ours: Json | undefined, theirs: Json | undefined, path = '', conflicts: Conflict[] = []): Json | undefined {
  if (same(ours, theirs)) return ours
  if (same(ours, base)) return theirs
  if (same(theirs, base)) return ours
  const isObj = (v: Json | undefined): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v)
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {}
    const out: JsonObject = {}
    for (const key of [...new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(b)])]) {
      if (!path && BOOKKEEPING.includes(key)) {
        if ((ours[key] ?? theirs[key]) !== undefined) out[key] = ours[key] ?? theirs[key]
        continue
      }
      const v = merge3(b[key], ours[key], theirs[key], `${path}/${key}`, conflicts)
      if (v !== undefined) out[key] = v
    }
    return out
  }
  conflicts.push({ path, base: base ?? null, ours: ours ?? null, theirs: theirs ?? null })
  return ours
}

/** Strings in a record that name records (and map keys that do), with where. */
function refsIn(v: Json, path: string, out: { id: string; path: string }[]) {
  if (typeof v === 'string') {
    if (/^[a-z]+\/[^ ]+$/.test(v) && !path.endsWith('/id')) out.push({ id: v, path })
  } else if (Array.isArray(v)) v.forEach((x, i) => refsIn(x, `${path}/${i}`, out))
  else if (v && typeof v === 'object')
    for (const [key, x] of Object.entries(v)) {
      if (['id', 'name', 'comment', 'text', 'title'].includes(key)) continue
      if (/^[a-z]+\/[^ ]+$/.test(key)) out.push({ id: key, path: `${path}/${key}` })
      refsIn(x, `${path}/${key}`, out)
    }
}

const slug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'new'

export class MockContent implements ContentBackend {
  readonly label = 'mock content (part of the real tree; nothing is saved)'
  private fixture: Promise<Fixture>
  private records = new Map<string, Entry>()
  private committed = new Map<string, JsonObject>()

  constructor() {
    this.fixture = import('./fixture/content.json').then((m) => {
      const f = m.default as unknown as Fixture
      for (const r of f.records) {
        this.records.set(k(keyOf(r.record)), { record: clone(r.record), file: r.file })
        this.committed.set(k(keyOf(r.record)), r.record)
      }
      return f
    })
  }

  private async entry(key: RecordKey): Promise<Entry> {
    await this.fixture
    const e = this.records.get(k(key))
    if (!e) throw new EditRefused(404, 'not_found', `${key.id} (${key.feature}) doesn't exist`)
    return e
  }

  private exists(id: string) {
    for (const key of this.records.keys()) if (key.startsWith(`${id}@`)) return true
    return false
  }

  private usedBy(id: string): UsedBy[] {
    const out: UsedBy[] = []
    for (const e of this.records.values()) {
      if (e.record.id === id) continue
      const refs: { id: string; path: string }[] = []
      refsIn(e.record, '', refs)
      for (const r of refs) if (r.id === id) out.push({ ...keyOf(e.record), path: r.path })
    }
    return out
  }

  private check(r: JsonObject): string[] {
    const refs: { id: string; path: string }[] = []
    refsIn(r, '', refs)
    return refs.filter((x) => x.id !== r.id && !this.exists(x.id) && !/^(drop|find|category):/.test(x.id)).map((x) => `${x.path.slice(1)}: ${x.id} doesn't exist`)
  }

  private worldOf(file: string) {
    return /worlds\/([^/]+)\//.exec(file)?.[1] ?? undefined
  }

  async kinds(): Promise<Kinds> {
    const f = await this.fixture
    return { index: f.index, schemas: f.schemas }
  }

  async list(q: ListQuery) {
    await this.fixture
    const words = (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const f = await this.fixture
    const kinds = f.index.kinds
    const out: Summary[] = []
    for (const [key, e] of this.records) {
      const r = e.record
      const kind = kindOf(r.id as string)
      const world = this.worldOf(e.file)
      const changed = !same(this.committed.get(key), r)
      const problems = this.check(r).length
      const keep =
        (!q.kind || q.kind === kind) &&
        (!q.feature || q.feature === keyOf(r).feature) &&
        (!q.world || world === q.world || world?.split('-')[0] === q.world) &&
        (!q.tag || ((r.tags as string[] | undefined) ?? []).includes(q.tag)) &&
        (!q.source || r.source === q.source) &&
        (!q.author || r.author === q.author) &&
        (!q.changed || changed) &&
        (!q.problems || problems > 0) &&
        words.every((w) => `${r.id} ${r.name ?? ''} ${r.title ?? ''}`.toLowerCase().includes(w))
      if (!keep) continue
      const list = kinds.find((x) => x.kind === kind)?.list ?? []
      out.push({
        ...keyOf(r),
        kind,
        name: (r.name as string) ?? '',
        world,
        file: e.file,
        source: r.source as string | undefined,
        tags: r.tags as string[] | undefined,
        author: r.author as string | undefined,
        rev: (r.rev as number) ?? 0,
        fields: Object.fromEntries(list.filter((x) => r[x] !== undefined).map((x) => [x, r[x]])),
        problems,
        changed,
      })
    }
    out.sort((a, b) => a.id.localeCompare(b.id))
    return { total: out.length, records: out.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 1000)) }
  }

  /** As the server resolves: the feature versions over the live one, then `extends`. */
  private resolve(id: string, features: string[], seen: string[] = []): { value: JsonObject; origin: Record<string, string> } | null {
    if (seen.includes(id)) return null
    const versions = [...this.records.values()].filter((e) => e.record.id === id && (keyOf(e.record).feature === 'live' || features.some((f) => keyOf(e.record).feature === f || keyOf(e.record).feature.startsWith(`${f}/`))))
    if (!versions.length) return null
    let value: JsonObject = {}
    const origin: Record<string, string> = {}
    for (const e of versions) {
      const f = keyOf(e.record).feature
      for (const key of Object.keys(e.record)) origin[key] = f === 'live' ? id : `${id} (${f})`
      value = { ...value, ...clone(e.record) }
    }
    const parent = value.extends as string | undefined
    if (parent) {
      const base = this.resolve(parent, features, [...seen, id])
      if (base) {
        for (const x of ['id', 'extends', 'feature', 'rev', 'author', 'updated', 'source', 'tags', 'comment']) {
          delete base.value[x]
          delete base.origin[x]
        }
        return { value: { ...base.value, ...value }, origin: { ...base.origin, ...origin } }
      }
    }
    return { value, origin }
  }

  async get(key: RecordKey, withFeatures: string[] = []): Promise<RecordView> {
    const e = await this.entry(key)
    const features = key.feature === 'live' ? withFeatures : [...withFeatures, key.feature]
    const res = this.resolve(key.id, features) ?? { value: e.record, origin: {} }
    let template: JsonObject | null = null
    if (kindOf(key.id) === 'spawn' && typeof res.value.template === 'string') {
      const t = this.resolve(res.value.template, features)
      if (t) template = { ...t.value, ...((res.value.overrides as JsonObject | undefined) ?? {}) }
    }
    const committed = this.committed.get(k(key)) ?? null
    return {
      ...key,
      file: e.file,
      world: this.worldOf(e.file) ?? null,
      record: clone(e.record),
      resolved: res.value,
      origin: res.origin,
      template,
      problems: this.check(e.record).map((message): Problem => ({ severity: 'error', id: key.id, message })),
      used_by: this.usedBy(key.id),
      versions: [...this.records.values()].filter((x) => x.record.id === key.id).map((x) => keyOf(x.record).feature),
      committed,
      changed: !same(committed, e.record),
    }
  }

  async save(key: RecordKey, record: JsonObject, base: JsonObject | null) {
    const e = await this.entry(key)
    if (record.id !== key.id || keyOf(record).feature !== key.feature) throw new EditRefused(422, 'invalid', "the id and feature can't change", [], ["the id and feature can't change (copy it instead)"])
    let merged = record
    if ((record.rev ?? 0) !== (e.record.rev ?? 0)) {
      if (!base) throw new EditRefused(422, 'invalid', `${key.id} was saved since`, [], [`${key.id} was saved since: send the version you edited as base`])
      const conflicts: Conflict[] = []
      merged = merge3(base, record, e.record, '', conflicts) as JsonObject
      if (conflicts.length) throw new EditRefused(409, 'conflict', `${conflicts.length} fields changed meanwhile`, conflicts)
    }
    const strip = (r: JsonObject) => Object.fromEntries(Object.entries(r).filter(([x]) => !BOOKKEEPING.includes(x)))
    if (same(strip(merged), strip(e.record))) return clone(e.record)
    merged = { ...merged, rev: ((e.record.rev as number) ?? 0) + 1, author: 'mock', updated: now() }
    const problems = this.check(merged)
    if (problems.length) throw new EditRefused(422, 'invalid', problems.join('; '), [], problems)
    e.record = clone(merged)
    return clone(merged)
  }

  async create(n: NewRecord) {
    const f = await this.fixture
    const info = f.index.kinds.find((x) => x.kind === n.kind)
    if (!info) throw new EditRefused(422, 'invalid', `no kind ${n.kind}`, [], [`no kind ${n.kind}`])
    let value: JsonObject = {}
    let file = ''
    let pf = n.world
    if (n.copy_of) {
      const from = await this.entry(n.copy_of)
      value = clone(from.record)
      for (const x of ['id', ...BOOKKEEPING]) delete value[x]
      file = from.file
      pf ??= info.per_world ? Number(n.copy_of.id.split('/')[1]) : undefined
    }
    value = { ...value, ...(n.fields ?? {}) }
    const name = n.name?.trim() || (n.copy_of ? `${(value.name as string) ?? ''} copy`.trim() : '')
    const prefix = info.per_world && n.kind !== 'world' ? `${n.kind}/${pf}/` : `${n.kind}/`
    let id = `${prefix}${slug(name)}`
    for (let i = 2; this.exists(id); i++) id = `${prefix}${slug(name)}-${i}`
    const feature = n.feature || 'live'
    value = { id, ...(name ? { name } : {}), ...value, ...(feature !== 'live' ? { feature } : {}), rev: 1, author: 'mock', updated: now() }
    if (feature === 'live') delete value.feature
    const problems = this.check(value)
    if (problems.length) throw new EditRefused(422, 'invalid', problems.join('; '), [], problems)
    if (!file || !info.per_world) file = info.per_world ? info.path.replace('<world>', `${pf}`) : `${info.path}${id.split('/').pop()}.json`
    this.records.set(k({ id, feature }), { record: value, file })
    return { id, feature, record: clone(value) }
  }

  async remove(key: RecordKey, replaceWith?: string) {
    await this.entry(key)
    const users = this.usedBy(key.id)
    const replaced: RecordKey[] = []
    if (users.length) {
      if (!replaceWith) throw new EditRefused(409, 'referenced', `${users.length} records name it`, [], [], users)
      for (const u of users) {
        const e = this.records.get(k(u))!
        const text = JSON.stringify(e.record).replaceAll(JSON.stringify(key.id), JSON.stringify(replaceWith))
        e.record = { ...(JSON.parse(text) as JsonObject), rev: ((e.record.rev as number) ?? 0) + 1 }
        replaced.push({ id: u.id, feature: u.feature })
      }
    }
    this.records.delete(k(key))
    return { replaced }
  }

  async history(): Promise<Commit[]> {
    return []
  }

  async problems() {
    await this.fixture
    const problems: Problem[] = []
    for (const e of this.records.values()) for (const message of this.check(e.record)) problems.push({ severity: 'error', id: e.record.id as string, file: e.file, message })
    return { errors: problems.length, warnings: 0, problems }
  }

  async changes(author?: string): Promise<Change[]> {
    await this.fixture
    const out: Change[] = []
    for (const [key, e] of this.records) {
      const before = this.committed.get(key) ?? null
      if (same(before, e.record)) continue
      out.push({ ...keyOf(e.record), change: before ? 'changed' : 'added', file: e.file, author: (e.record.author as string) ?? '', before, after: e.record })
    }
    for (const [key, before] of this.committed) if (!this.records.has(key)) out.push({ ...keyOf(before), change: 'removed', file: '', author: '', before, after: null })
    return out.filter((c) => !author || c.author === author)
  }

  async catalog(name: string, q: { q?: string; ids?: number[]; limit?: number } = {}) {
    const f = await this.fixture
    const from = (prefix: string, get: (r: JsonObject) => Json | undefined) =>
      [...this.records.values()]
        .filter((e) => (e.record.id as string).startsWith(prefix))
        .flatMap((e) => {
          const id = get(e.record)
          return typeof id === 'number' ? [{ id, name: (e.record.name as string) || (e.record.title as string) || '', detail: kindOf(e.record.id as string), record: e.record.id as string }] : []
        })
    const r = (x: JsonObject, ...path: string[]) => path.reduce<Json | undefined>((v, p) => (v && typeof v === 'object' && !Array.isArray(v) ? v[p] : undefined), x)
    const lists: Record<string, () => CatalogEntry[]> = {
      monster_data: () => [...from('npc/', (x) => r(x, 'render', 'monster_data')), ...from('object/', (x) => r(x, 'render', 'monster_data'))],
      spell: () => from('skill/', (x) => r(x, 'client', 'spell')),
      nano: () => from('buff/', (x) => x.nano),
      item: () => [...from('item/', (x) => x.template), ...from('minifig/', (x) => x.template), ...from('object/', (x) => r(x, 'render', 'template'))],
      lore: () => from('achievement/', (x) => x.lore),
      playfield: () => from('world/', (x) => x.playfield),
      window: () => from('world/', (x) => x.window),
      npc_template: () => from('npc/', (x) => r(x, 'render', 'npc_template')),
      text: () => Object.entries({ ...f.texts.names, ...f.texts.texts }).map(([id, t]) => ({ id: Number(id), name: t.replace(/\{[^}]*\}|\[[^\]]*\]/g, '').trim().slice(0, 120) })),
      effect_package: () => [],
      stat: () => [],
    }
    const make = lists[name]
    if (!make) throw new EditRefused(400, 'bad_request', `no catalog ${name}`)
    const seen = new Set<number>()
    const words = (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const hits = make()
      .filter((e) => !seen.has(e.id) && (seen.add(e.id), true))
      .filter((e) => !q.ids || q.ids.includes(e.id))
      .filter((e) => words.every((w) => e.name.toLowerCase().includes(w) || String(e.id) === w))
    return { total: hits.length, entries: hits.slice(0, q.limit ?? 200) }
  }

  /** As lmoxide_content::roll (fewer details: no world limits). */
  async simulateLoot(id: string, rolls: number): Promise<LootSimulation> {
    await this.fixture
    const table = (t: string) => [...this.records.values()].find((e) => e.record.id === t)?.record
    if (!table(id)) throw new EditRefused(404, 'not_found', `${id} isn't a loot table`)
    const range = (r: Json | undefined) => (typeof r === 'number' ? r : Array.isArray(r) ? (r[0] as number) + Math.floor(Math.random() * ((r[1] as number) - (r[0] as number) + 1)) : 0)
    const warnings = new Set<string>()
    const roll = (t: string, depth: number, out: string[]) => {
      const tb = table(t)
      if (!tb || depth > 8) return void warnings.add(tb ? `loot tables nest too deep at ${t}` : `no loot table ${t}`)
      const entries = (tb.entries as JsonObject[]) ?? []
      const give = (d: JsonObject) => {
        for (const [k, what] of [['stars', 'stars'], ['hearts', 'health orbs'], ['potions', 'potions']] as const) for (let i = range(d[k]); i > 0; i--) out.push(what)
        for (const [k, what] of [['minifig_parts', 'minifigure part'], ['minifig_bags', 'minifigure bag']] as const) {
          const m = d[k] as JsonObject | undefined
          if (m) for (let i = range(m.count ?? 1); i > 0; i--) out.push(`${what} (${typeof m.from === 'string' ? "the world's" : (m.from as string[]).join(' | ')})`)
        }
        if ((d.chest as string[] | undefined)?.length) out.push(`chest: ${(d.chest as string[]).join(' | ')}`)
        for (const i of (d.items as string[]) ?? []) out.push(i)
        if (d.table) roll(d.table as string, depth + 1, out)
      }
      const weighted = entries.filter((e) => e.weight !== undefined && !(e.when as JsonObject | undefined)?.worlds)
      const total = weighted.reduce((n, e) => n + (e.weight as number), 0)
      let done = false
      for (const e of entries) {
        if ((e.when as JsonObject | undefined)?.worlds) continue
        if (e.weight !== undefined) {
          if (done) continue
          done = true
          for (let r = 0; r < ((tb.rolls as number) ?? 1) && total > 0; r++) {
            let x = Math.random() * total
            const hit = weighted.find((w) => (x -= w.weight as number) < 0)
            if (hit) give(hit.drop as JsonObject)
          }
          continue
        }
        const c = e.chance === undefined ? 1 : typeof e.chance === 'number' ? e.chance : parseFloat(e.chance as string) / 100
        if (Math.random() < c) give(e.drop as JsonObject)
      }
    }
    const counts = new Map<string, [number, number]>()
    let nothing = 0
    for (let i = 0; i < rolls; i++) {
      const out: string[] = []
      roll(id, 0, out)
      if (!out.length) nothing++
      const per = new Map<string, number>()
      for (const w of out) per.set(w, (per.get(w) ?? 0) + 1)
      for (const [w, n] of per) {
        const c = counts.get(w) ?? [0, 0]
        counts.set(w, [c[0] + n, c[1] + 1])
      }
    }
    const rates = [...counts].map(([what, [n, r]]) => ({ what, chance: r / rolls, per_roll: n / rolls })).sort((a, b) => b.chance - a.chance)
    return { rolls, rates, nothing: nothing / rolls, warnings: [...warnings] }
  }
}
