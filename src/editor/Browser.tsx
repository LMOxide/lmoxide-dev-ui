import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ClipboardIcon, FilterIcon, ListTodoIcon, PlusIcon, XIcon } from 'lucide-react'
import { Combobox, MultiCombobox } from '@/components/combobox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { loadJson, saveJson } from '../storage'
import { clipLabel, paste, type Clip, type Target } from './clipboard'
import { Details, NewScript } from './Details'
import { FeatureSelect } from './Features'
import { distance } from './geometry'
import { Marks } from './Marks'
import { buildTab, filterTree, worldName, type Env, type Tab } from './nodes'
import { Tree, type Sel, type TNode } from './Tree'
import type { Ctx } from './WorldEditor'
import type { Worlds } from './worlds'
import { CATEGORIES, type Category, type SurveyObject } from './types'

const TAB_KEY = 'lmofx.editor.tab'
const OPEN_KEY = 'lmofx.editor.open'
const PINNED_KEY = 'lmofx.editor.pinned-worlds'

const TABS: [Tab, string][] = [
  ['spawns', 'Spawns'],
  ['scripts', 'Scripts'],
  ['achievements', 'Achievements'],
]

const sameSel = (a: Sel | undefined, b: Sel | null) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b)

/** Every object filter: what the tree's spawns and walls show. */
interface Filters {
  cats: Category[]
  author: string
  feature: string
  radius: number | null
}
const NO_FILTERS: Filters = { cats: CATEGORIES, author: '', feature: '', radius: null }

/**
 * The world editor's body: tabs over a tree of everything (spawns by world, scripts and their
 * waves, achievements), the selected row's details beside it.
 */
export function Browser({ ctx, worlds }: { ctx: Ctx; worlds: Worlds }) {
  const { backend, account, state } = ctx
  const [tab, setTabState] = useState<Tab>(() => loadJson(TAB_KEY, 'spawns'))
  const setTab = (t: Tab) => (setTabState(t), saveJson(TAB_KEY, t))
  const [open, setOpenState] = useState<Set<string>>(() => new Set(loadJson<string[]>(OPEN_KEY, [])))
  const setOpen = useCallback((key: string, on: boolean) => {
    setOpenState((s) => {
      const n = new Set(s)
      if (on) n.add(key)
      else n.delete(key)
      saveJson(OPEN_KEY, [...n])
      return n
    })
  }, [])
  const [pinned, setPinned] = useState<number[]>(() => loadJson(PINNED_KEY, []))
  const [selKey, setSelKey] = useState<string | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [todo, setTodo] = useState(false)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [marks, setMarks] = useState(false)
  /** narrow screens: the tree or the details */
  const [pane, setPane] = useState<'tree' | 'details'>('tree')
  const [note, setNote] = useState('')

  const keep = useCallback(
    (o: SurveyObject, pf: number) =>
      filters.cats.includes(o.category) &&
      (!filters.author || o.author === filters.author) &&
      (!filters.feature || (o.feature ?? 'live') === filters.feature || (o.feature ?? 'live').startsWith(`${filters.feature}/`)) &&
      (filters.radius === null || (pf === state.playfield && distance(o.pos, state.pos) <= filters.radius)),
    [filters, state.playfield, state.pos],
  )
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  const copy = useCallback((c: Clip) => {
    setClip(c)
    setNote(`Copied ${clipLabel(c)}`)
  }, [])

  const doPaste = useCallback(
    async (c: Clip, to: Target) => {
      if (to.t === 'smash') {
        if (c.t !== 'enemies') return
        const rule = worlds.rules[to.key] ?? worlds.smash.find((a) => a.key === to.key)?.rule
        await worlds.saveRule(to.key, { enemies: [...new Set([...to.enemies, ...c.names])], comment: rule?.comment, tags: rule?.tags, feature: rule?.feature ?? ctx.feature })
        setNote(`Pasted ${clipLabel(c)}`)
        return
      }
      const changed = await ctx.run(() => paste(c, to, { backend, history: ctx.history, scriptNames: (pf) => worlds.data[pf]?.notes.scripts.map((x) => x.name) ?? [] }), 'all')
      for (const pf of changed ?? []) await worlds.reload(pf)
      if (changed) setNote(`Pasted ${clipLabel(c)}`)
    },
    [backend, ctx, worlds],
  )

  const remove = useCallback(
    async (o: SurveyObject) => {
      const r = await ctx.run(() => backend.remove(o.id), 'all')
      if (r) ctx.history.record({ kind: 'delete', id: o.id, name: o.name, record: r.id, snapshot: o, guess: o.category === 'guessed' })
      if (o.playfield !== undefined) await worlds.reload(o.playfield)
    },
    [backend, ctx, worlds],
  )

  const reveal = useCallback((key: string, t: Tab) => {
    setTab(t)
    setSelKey(key)
  }, [])

  const env: Env = { ctx, worlds, targets: ctx.targets, clip, copy, paste: doPaste, pinned, keep, reveal, remove }
  const full = buildTab(env, tab)

  // the search, the tags and "needs work" keep only what matches (and open the way to it)
  const forced = new Set<string>()
  const q = query.trim().toLowerCase()
  const qTag = q.startsWith('#') ? q.slice(1) : null
  const narrowed = !!q || tags.length > 0 || todo
  const nodes = narrowed
    ? filterTree(
        full,
        (n) =>
          (!q || (qTag !== null ? !!n.tags?.some((t) => t.startsWith(qTag)) : `${n.label} ${n.detail ?? ''} ${n.tags?.join(' ') ?? ''}`.toLowerCase().includes(q))) &&
          (!tags.length || (n.tags?.length ? n.tags.some((t) => tags.includes(t)) : tags.includes('-'))) &&
          (!todo || n.status === 'todo'),
        forced,
      )
    : full
  const shownOpen = narrowed ? new Set([...open, ...forced]) : open

  /** Selects a row: its details show, and an object in your world is selected in game too. */
  const select = useCallback(
    (n: TNode) => {
      setSelKey(n.key)
      setSel(n.sel ?? null)
      // (narrow screens: folders stay in the tree, where they open)
      if (!n.children) setPane('details')
      if (n.sel?.t === 'object' && n.sel.pf === state.playfield && state.selected !== n.sel.id) ctx.run(() => backend.select(account, (n.sel as { id: string }).id))
    },
    [account, backend, ctx, state.playfield, state.selected],
  )

  // the row keyed `selKey` (a link, a tab switch) gives its details; its folders open
  useEffect(() => {
    if (!selKey) return
    const path = pathTo(full, (n) => n.key === selKey)
    if (!path) return
    for (const p of path.slice(0, -1)) if (!open.has(p.key)) setOpen(p.key, true)
    const n = path[path.length - 1]
    if (!sameSel(n.sel, sel)) setSel(n.sel ?? null)
  }, [selKey, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // selected in game (by attacking it, Select nearest, placing): its row in the tree
  const lastGame = useRef<string | null>(null)
  useEffect(() => {
    const id = state.selected
    if (!id || id === lastGame.current) {
      lastGame.current = id
      return
    }
    lastGame.current = id
    const want: Sel = { t: 'object', pf: state.playfield, id }
    for (const t of [tab, ...TABS.map(([x]) => x).filter((x) => x !== tab)]) {
      const path = pathTo(buildTab(env, t), (n) => sameSel(n.sel, want))
      if (!path) continue
      if (t !== tab) setTab(t)
      for (const p of path.slice(0, -1)) setOpen(p.key, true)
      setSelKey(path[path.length - 1].key)
      setSel(want)
      setPane('details')
      return
    }
    setSel(want)
  }, [state.selected, worlds.data]) // eslint-disable-line react-hooks/exhaustive-deps

  function onKey(e: KeyboardEvent, n: TNode) {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'c' && n.copy) (e.preventDefault(), copy(n.copy()))
    else if (k === 'v' && n.target && clip) (e.preventDefault(), doPaste(clip, n.target))
  }

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 4000)
    return () => clearTimeout(t)
  }, [note])

  const authors = useMemo(() => {
    const a = new Set<string>()
    for (const w of Object.values(worlds.data)) for (const o of w.objects) if (o.author) a.add(o.author)
    return [...a].sort()
  }, [worlds.data])
  const tagOptions = [...ctx.tags.map((t) => ({ value: t.tag, label: `#${t.tag}`, detail: t.count ? String(t.count) : undefined })), { value: '-', label: 'untagged' }]

  // what the filters keep in your world, for hiding the rest in game
  const here = worlds.data[state.playfield]?.objects ?? ctx.objects
  const listed = here.filter((o) => keep(o, state.playfield))
  const hiddenCount = state.hidden.length

  return (
    <div className="flex min-h-0 flex-1 max-md:flex-col">
      <section className={cn('flex min-h-0 w-[min(30rem,42vw)] shrink-0 flex-col border-r bg-card max-md:w-full max-md:flex-1', pane !== 'tree' && 'max-md:hidden')}>
        <div className="space-y-2 border-b p-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              {TABS.map(([t, label]) => (
                <TabsTrigger key={t} value={t}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex gap-1">
            <div className="relative min-w-0 flex-1">
              <Input className="h-8 pr-7" placeholder="Search (name, #tag)" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button type="button" data-slot="clear" className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground" onClick={() => setQuery('')} aria-label="Clear the search">
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
            <Button size="sm" variant={todo ? 'default' : 'outline'} className="h-8" onClick={() => setTodo(!todo)} title="Only what needs work (amber): no enemies, no trigger, an empty wave, a guess">
              <ListTodoIcon />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={filtering ? 'default' : 'outline'} className="h-8" title="Which spawns and walls the tree shows">
                  <FilterIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-2" align="end">
                <MultiCombobox
                  className="w-full"
                  label="Show"
                  all="every category"
                  placeholder="nothing"
                  options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                  value={filters.cats}
                  onChange={(v) => setFilters({ ...filters, cats: v as Category[] })}
                />
                <Combobox className="w-full" options={authors.map((a) => ({ value: a, label: `by ${a}` }))} value={filters.author || null} onChange={(v) => setFilters({ ...filters, author: v ?? '' })} placeholder="every author" clearable />
                <FeatureSelect features={ctx.features} value={filters.feature} onChange={(feature) => setFilters({ ...filters, feature })} any="every feature" title="Only this feature (and what is nested under it)" />
                <select value={filters.radius ?? ''} onChange={(e) => setFilters({ ...filters, radius: e.target.value ? Number(e.target.value) : null })} title="Only this close to you">
                  <option value="">any distance</option>
                  {[10, 25, 50, 100].map((r) => (
                    <option key={r} value={r}>
                      within {r} m
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!filtering}
                    onClick={() => {
                      const shown = new Set(listed.map((o) => o.id))
                      ctx.run(() => backend.hide(account, here.filter((o) => !shown.has(o.id) && !state.hidden.includes(o.id)).map((o) => o.id), true))
                    }}
                    title="Preview: hide everything else in your world (only for you; Unhide all brings it back)"
                  >
                    Show only these in game
                  </Button>
                  <Button size="sm" variant="outline" disabled={!listed.length} onClick={() => ctx.run(() => backend.hide(account, listed.map((o) => o.id), true))}>
                    Hide these
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!filtering} onClick={() => setFilters(NO_FILTERS)}>
                    Reset
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <MultiCombobox className="w-full" label="Tags" placeholder="any" options={tagOptions} value={tags} onChange={setTags} search="Search tags…" title="Only what carries any of these tags" />
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="outline" className="h-7" onClick={() => ctx.run(() => backend.selectNearest(account))}>
              Select nearest
            </Button>
            <Button size="sm" variant="outline" className="h-7" disabled={!hiddenCount} onClick={() => ctx.run(() => backend.unhideAll(account))}>
              Unhide all{hiddenCount ? ` (${hiddenCount})` : ''}
            </Button>
            <Button size="sm" variant="outline" className="h-7" disabled={!ctx.markLooks.length} onClick={() => setMarks(true)}>
              Marks{state.marks?.length ? ` (${state.marks.length})` : ''}…
            </Button>
            {tab === 'spawns' && (
              <Combobox
                className="h-7"
                options={worlds.playfields.map((p) => ({ value: String(p.id), label: p.name, detail: String(p.id), near: p.base + p.placements > 0 }))}
                value={null}
                onChange={(v) => {
                  if (!v) return
                  const pf = Number(v)
                  const next = [...new Set([...pinned, pf])]
                  setPinned(next)
                  saveJson(PINNED_KEY, next)
                  worlds.ensure(pf)
                  setSelKey(`w:${pf}`)
                }}
                placeholder="Add world…"
                search="Search worlds…"
              />
            )}
          </div>
          {tab === 'scripts' && <NewScript ctx={ctx} worlds={worlds} />}
          {clip && (
            <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs" title="Right click where it goes (or select it and press Ctrl+V)">
              <ClipboardIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                Copied: <b>{clipLabel(clip)}</b>
                {clip.t !== 'enemies' && ` (${worldName(worlds, clip.from)})`}
              </span>
              <button type="button" data-slot="clear" className="ml-auto" onClick={() => setClip(null)} aria-label="Forget what was copied">
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <Tree nodes={nodes} open={shownOpen} setOpen={setOpen} selected={selKey} onSelect={select} onKey={onKey} />
        {note && <div className="border-t px-3 py-1 text-xs text-muted-foreground">{note}</div>}
      </section>
      <section className={cn('min-h-0 min-w-0 flex-1 overflow-auto p-4', pane !== 'details' && 'max-md:hidden')}>
        <Button size="sm" variant="ghost" className="mb-2 md:hidden" onClick={() => setPane('tree')}>
          ← Tree
        </Button>
        <div className="mx-auto max-w-2xl">
          <Details
            ctx={ctx}
            worlds={worlds}
            sel={sel}
            onSelect={(s) => {
              const path = pathTo(full, (n) => sameSel(n.sel, s))
              if (path) select(path[path.length - 1])
              else setSel(s)
            }}
          />
          {tab === 'spawns' && !sel && (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setSelKey(`w:${state.playfield}`)}>
              <PlusIcon /> Place something in your world
            </Button>
          )}
        </div>
      </section>
      <Dialog open={marks} onOpenChange={setMarks}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marks in game</DialogTitle>
          </DialogHeader>
          <Marks ctx={ctx} authors={authors} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The rows from the top down to the first row `want` matches (opening lazy folders on the way). */
function pathTo(nodes: TNode[], want: (n: TNode) => boolean): TNode[] | null {
  for (const n of nodes) {
    if (want(n)) return [n]
    if (!n.children) continue
    const kids = typeof n.children === 'function' ? n.children() : n.children
    const p = pathTo(kids, want)
    if (p) return [n, ...p]
  }
  return null
}

