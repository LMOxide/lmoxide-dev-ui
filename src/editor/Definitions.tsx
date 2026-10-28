import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangleIcon, FolderIcon, PlusIcon, XIcon } from 'lucide-react'
import { Combobox } from '@/components/combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ContentBackend, Json, JsonObject, Kinds, ListQuery, RecordKey, Summary } from './content'
import { recordLabel } from './content'
import { memo, type FormEnv } from './form/Form'
import { emptyOf, obj, type S } from './form/schema'
import { RecordView } from './RecordView'
import type { Ctx } from './WorldEditor'

/** How many rows a list shows (type to narrow it). */
const LIMIT = 300

const show = (v: Json) => (typeof v === 'string' ? v : Array.isArray(v) ? `${v.length} items` : JSON.stringify(v))

/** "Problems" and "Unpublished" are lists across every kind. */
type Folder = { kind: string } | { problems: true } | { changed: true }

/**
 * Every content record by kind (NPCs, objects, skills, buffs, loot, items, minifigures,
 * dialogues, achievements, regions, factions, and the world records too): lists with search and
 * filters, and the chosen record's page.
 */
export function Definitions({ ctx, content, kinds, tabs, at, setAt }: { ctx: Ctx; content: ContentBackend; kinds: Kinds; tabs: ReactNode; at: RecordKey | null; setAt: (k: RecordKey | null) => void }) {
  const [folder, setFolder] = useState<Folder>({ kind: at ? at.id.split('/')[0] : 'npc' })
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Pick<ListQuery, 'feature' | 'source' | 'tag' | 'author'>>({})
  const [list, setList] = useState<{ total: number; records: Summary[] } | null>(null)
  const [error, setError] = useState('')
  /** raised by every save: lists and pickers load again */
  const [version, setVersion] = useState(0)
  const [making, setMaking] = useState(false)
  const [pane, setPane] = useState<'list' | 'record'>(at ? 'record' : 'list')

  // a record opened from elsewhere shows its kind's list
  useEffect(() => {
    if (at) {
      setFolder((f) => ('kind' in f && f.kind === at.id.split('/')[0] ? f : { kind: at.id.split('/')[0] }))
      setPane('record')
    }
  }, [at])

  useEffect(() => {
    let gone = false
    const query: ListQuery = { ...filters, q: q.trim() || undefined, limit: LIMIT, ...('kind' in folder ? { kind: folder.kind } : 'problems' in folder ? { problems: true } : { changed: true }) }
    const t = setTimeout(
      () =>
        content
          .list(query)
          .then((l) => !gone && (setList(l), setError('')))
          .catch((e) => !gone && setError(e instanceof Error ? e.message : String(e))),
      q ? 250 : 0,
    )
    return () => {
      gone = true
      clearTimeout(t)
    }
  }, [content, folder, q, filters, version])

  // pickers: records by kind and catalogs, loaded once (again after saves)
  const env: Omit<FormEnv, 'root' | 'world'> = useMemo(() => {
    const byKind = memo((kind) => content.list({ kind, limit: 20000 }).then((l) => l.records))
    const catalogs = memo((name) => content.catalog(name, { limit: 100000 }).then((c) => c.entries))
    return {
      records: async (ks) => (await Promise.all(ks.map(byKind))).flat(),
      catalog: catalogs,
      open: (id) => setAt({ id, feature: 'live' }),
      here: ctx.state.playfield >= 0 ? { pos: ctx.state.pos, heading: ctx.state.heading } : null,
      goTo: ctx.account >= 0 ? (pos) => void ctx.run(() => ctx.backend.teleport(ctx.account, pos)) : null,
    }
  }, [content, version, ctx.state.playfield >= 0 ? ctx.state.pos.join() : '', ctx.account]) // eslint-disable-line react-hooks/exhaustive-deps

  const saved = useCallback(() => setVersion((v) => v + 1), [])
  const info = 'kind' in folder ? kinds.index.kinds.find((k) => k.kind === folder.kind) : null
  // definitions first, then what's kept per world
  const folders = [...kinds.index.kinds.filter((k) => !k.per_world), ...kinds.index.kinds.filter((k) => k.per_world)]
  const filtering = Object.values(filters).some(Boolean)

  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col">
      <section className={cn('flex min-h-0 w-[min(30rem,42vw)] shrink-0 flex-col border-r bg-card max-md:w-full max-md:flex-1', pane !== 'list' && 'max-md:hidden')}>
        <div className="space-y-2 border-b p-2">
          {tabs}
          <div className="flex flex-wrap gap-1" role="list" aria-label="Kinds">
            {folders.map((k) => (
              <Button key={k.kind} size="xs" variant={'kind' in folder && folder.kind === k.kind ? 'default' : 'outline'} onClick={() => setFolder({ kind: k.kind })} title={k.description}>
                <FolderIcon /> {k.plural}
              </Button>
            ))}
            <Button size="xs" variant={'problems' in folder ? 'default' : 'outline'} onClick={() => setFolder({ problems: true })} title="Records the content check finds problems in">
              <AlertTriangleIcon /> Problems
            </Button>
            <Button size="xs" variant={'changed' in folder ? 'default' : 'outline'} onClick={() => setFolder({ changed: true })} title="Changed since the last commit (not published yet)">
              Unpublished
            </Button>
          </div>
          <div className="relative">
            <Input className="h-8 pr-7" placeholder={`Search ${info?.plural ?? 'records'} (name, id)`} value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button type="button" data-slot="plain" className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ('')} aria-label="Clear the search">
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Combobox className="h-7 w-36" options={['live', ...ctx.features.features.map((f) => f.id)].map((f) => ({ value: f, label: f }))} value={filters.feature ?? null} onChange={(v) => setFilters({ ...filters, feature: v ?? undefined })} placeholder="any feature" clearable />
            <Combobox className="h-7 w-32" options={['client', 'live', 'demo', 'footage', 'server', 'proposed', 'surveyed', 'guess'].map((s) => ({ value: s, label: s }))} value={filters.source ?? null} onChange={(v) => setFilters({ ...filters, source: v ?? undefined })} placeholder="any source" clearable />
            <Combobox className="h-7 w-32" options={ctx.tags.map((t) => ({ value: t.tag, label: `#${t.tag}` }))} value={filters.tag ?? null} onChange={(v) => setFilters({ ...filters, tag: v ?? undefined })} placeholder="any tag" clearable free={(t) => `#${t}`} />
            {filtering && (
              <Button size="xs" variant="ghost" onClick={() => setFilters({})}>
                Reset
              </Button>
            )}
            {info && (
              <Button size="xs" variant="outline" className="ml-auto" onClick={() => setMaking(true)}>
                <PlusIcon /> New {info.title.toLowerCase()}
              </Button>
            )}
          </div>
          {making && info && (
            <NewRecordForm
              kind={info.kind}
              title={info.title}
              perWorld={info.per_world}
              schema={obj(kinds.schemas[info.kind]) as S}
              ctx={ctx}
              content={content}
              onDone={(k) => {
                setMaking(false)
                if (k) (saved(), setAt(k))
              }}
            />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto" role="list" aria-label="Records">
          {error && <p className="m-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{error}</p>}
          {!list && !error && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {list?.records.map((r) => (
            <button
              key={`${r.id}@${r.feature}`}
              type="button"
              data-slot="plain"
              role="listitem"
              data-id={r.id}
              className={cn('flex w-full items-baseline gap-2 border-b px-3 py-1.5 text-left text-sm hover:bg-accent', at?.id === r.id && at.feature === r.feature && 'bg-accent')}
              onClick={() => (setAt({ id: r.id, feature: r.feature }), setPane('record'))}
            >
              <span className="min-w-0 truncate">{recordLabel(r)}</span>
              {r.world && !('kind' in folder && folder.kind === 'world') && <span className="shrink-0 text-xs text-muted-foreground">{r.world}</span>}
              {r.feature !== 'live' && <span className="text-xs text-muted-foreground">{r.feature}</span>}
              <span className="ml-auto flex shrink-0 items-baseline gap-2 text-xs text-muted-foreground">
                {Object.entries(r.fields)
                  .filter(([k]) => k !== 'title')
                  .slice(0, 2)
                  .map(([k, v]) => (
                    <span key={k} className="max-w-32 truncate" title={k}>
                      {show(v)}
                    </span>
                  ))}
                {r.changed && <span className="text-warn" title="Not published yet">●</span>}
                {r.problems > 0 && (
                  <span className="text-destructive" title={`${r.problems} problems`}>
                    ⚠ {r.problems}
                  </span>
                )}
              </span>
            </button>
          ))}
          {list && list.total > list.records.length && <p className="p-3 text-xs text-muted-foreground">{list.total - list.records.length} more: search to narrow it.</p>}
          {list && !list.total && <p className="p-3 text-sm text-muted-foreground">Nothing here{q || filtering ? ' that matches' : ''}.</p>}
        </div>
      </section>
      <section className={cn('min-h-0 min-w-0 flex-1 overflow-auto p-4', pane !== 'record' && 'max-md:hidden')}>
        <Button size="sm" variant="ghost" className="mb-2 md:hidden" onClick={() => setPane('list')}>
          ← List
        </Button>
        <div className="mx-auto max-w-3xl">
          {at ? (
            <RecordView key={`${at.id}@${at.feature}`} content={content} kinds={kinds} at={at} env={env} open={setAt} onSaved={saved} onGone={() => setAt(null)} />
          ) : (
            <p className="text-sm text-muted-foreground">Choose a record. {info?.description}</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** Name (and world for world records) of a new record; it's made in the feature you work on. */
function NewRecordForm({ kind, title, perWorld, schema, ctx, content, onDone }: { kind: string; title: string; perWorld: boolean; schema: S; ctx: Ctx; content: ContentBackend; onDone: (k: RecordKey | null) => void }) {
  const [name, setName] = useState('')
  const [world, setWorld] = useState<string | null>(ctx.state.playfield >= 0 ? String(ctx.state.playfield) : null)
  const [error, setError] = useState('')
  const [worlds, setWorlds] = useState<{ value: string; label: string; detail: string }[]>([])
  useEffect(() => {
    if (perWorld) content.catalog('playfield', { limit: 1000 }).then((c) => setWorlds(c.entries.map((e) => ({ value: String(e.id), label: e.name, detail: String(e.id) }))))
  }, [content, perWorld])
  const make = async () => {
    try {
      // its required fields, empty (a spawn's kind and position ...)
      const fields = emptyOf(schema, schema) as JsonObject
      delete fields.id
      if (kind === 'world' && world) fields.playfield = Number(world)
      if (kind === 'spawn' && ctx.state.playfield === Number(world)) fields.pos = ctx.state.pos.map((x) => Math.round(x * 100) / 100)
      const made = await content.create({ kind, name, world: perWorld && kind !== 'world' && world ? Number(world) : undefined, feature: ctx.feature, fields })
      onDone(made)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="space-y-2 rounded-md border p-2 text-sm" data-new>
      <div className="flex flex-wrap items-center gap-1">
        <Input autoFocus className="h-8 w-56" placeholder={`The new ${title.toLowerCase()}'s name`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && make()} />
        {perWorld && <Combobox className="w-56" options={worlds} value={world} onChange={setWorld} placeholder="its world…" search="Search worlds…" />}
        <Button size="sm" disabled={!name.trim() || (perWorld && !world)} onClick={make}>
          Make it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">In {ctx.feature}. Its fields start empty; fill them in on its page.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
