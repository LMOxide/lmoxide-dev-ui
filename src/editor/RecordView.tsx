import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CopyIcon, ExternalLinkIcon, HistoryIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { MultiCombobox } from '@/components/combobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Commit, Conflict, ContentBackend, Json, JsonObject, Kinds, RecordKey, RecordView as View } from './content'
import { EditRefused, kindOf, recordLabel } from './content'
import { brief, diff, setAt } from './diff'
import { merge3 } from './contentMock'
import { ObjectForm, TextInput, ValueEditor, type FormEnv } from './form/Form'
import { deref, enumOptions, obj, type S } from './form/schema'
import { Combobox } from '@/components/combobox'
import { SpecialView } from './Special'

/** Fields the header shows (every kind has them), not the form. */
const HEADER = ['id', 'extends', 'name', 'feature', 'source', 'tags', 'comment', 'rev', 'author', 'updated']
/** How long after the last change a record is saved. */
const SAVE_MS = 700

const when = (t: number) => (t ? new Date(t * 1000).toLocaleString() : '')

/**
 * One content record: its form (saved as it is edited), problems, where it's used, what isn't
 * published yet, its history, copy and delete.
 */
export function RecordView({
  content,
  kinds,
  at,
  env,
  open,
  onSaved,
  onGone,
}: {
  content: ContentBackend
  kinds: Kinds
  at: RecordKey
  /** the form's environment, without its schema root (set here per kind) */
  env: Omit<FormEnv, 'root' | 'world'>
  open: (key: RecordKey) => void
  /** after a save, create or delete (lists refresh) */
  onSaved: () => void
  onGone: () => void
}) {
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<JsonObject | null>(null)
  /** the version the edit started from (what the server last gave) */
  const base = useRef<JsonObject | null>(null)
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<{ list: Conflict[]; theirs: JsonObject } | null>(null)
  /** versions saved here, for undo */
  const [undo, setUndo] = useState<JsonObject[]>([])
  /** the next save is an undo (it isn't kept for undo itself) */
  const undoing = useRef(false)
  const [history, setHistory] = useState<Commit[] | null>(null)
  const [deleting, setDeleting] = useState<{ usedBy: View['used_by']; replace: string | null } | null>(null)

  const load = useCallback(async () => {
    const v = await content.get(at)
    setView(v)
    setDraft(v.record)
    base.current = v.record
    setStatus('saved')
    setError('')
    setProblems([])
    setConflicts(null)
    return v
  }, [content, at])

  useEffect(() => {
    setView(null)
    setUndo([])
    setHistory(null)
    setDeleting(null)
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const save = useCallback(
    async (record: JsonObject, from: JsonObject | null) => {
      setStatus('saving')
      try {
        const saved = await content.save(at, record, from)
        const before = base.current
        if (!undoing.current && before && JSON.stringify(before) !== JSON.stringify(saved)) setUndo((u) => [...u, before])
        undoing.current = false
        base.current = saved
        setDraft((d) => (d === record ? saved : d))
        setStatus('saved')
        setProblems([])
        setConflicts(null)
        setError('')
        // problems, used by, unpublished: as the server sees it now
        content.get(at).then(setView).catch(() => {})
        onSaved()
      } catch (e) {
        setStatus('error')
        if (e instanceof EditRefused && e.code === 'conflict') {
          const fresh = await content.get(at)
          setConflicts({ list: e.conflicts, theirs: fresh.record })
        } else if (e instanceof EditRefused && e.code === 'invalid') setProblems(e.problems.length ? e.problems : [e.message])
        else setError(e instanceof Error ? e.message : String(e))
      }
    },
    [content, at, onSaved],
  )

  // saved a moment after the last change
  useEffect(() => {
    if (!draft || !base.current || conflicts || JSON.stringify(draft) === JSON.stringify(base.current)) return
    setStatus('unsaved')
    const t = setTimeout(() => save(draft, base.current), SAVE_MS)
    return () => clearTimeout(t)
  }, [draft, save, conflicts])

  const kind = kindOf(at.id)
  const info = kinds.index.kinds.find((k) => k.kind === kind)
  const root = obj(kinds.schemas[kind]) as S
  const formEnv: FormEnv = useMemo(() => ({ ...env, root, world: view?.world ?? null }), [env, root, view?.world])

  if (error && !view) return <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{error}</p>
  if (!view || !draft) return <p className="text-sm text-muted-foreground">Loading {at.id}…</p>

  const set = (k: string, v: Json | undefined) => {
    const next = { ...draft }
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[k]
    else next[k] = v
    setDraft(next)
  }
  const props = (root.properties ?? {}) as Record<string, S>
  const sources = enumOptions(root, deref(root, props.source)) ?? enumOptions(root, obj((obj(props.source).anyOf as S[] | undefined)?.[0])) ?? []
  // what this record doesn't set but has (from extends or a feature)
  const inherited = {
    value: Object.fromEntries(Object.entries(view.resolved).filter(([k]) => !(k in draft) && view.origin[k] && view.origin[k] !== at.id)),
    origin: (f: string) => view.origin[f] ?? null,
  }

  const resolve = (pick: Record<string, 'ours' | 'theirs'>) => {
    if (!conflicts || !base.current) return
    const list: Conflict[] = []
    let merged = merge3(base.current, draft, conflicts.theirs, '', list) as Json
    for (const c of conflicts.list) if (pick[c.path] === 'theirs') merged = setAt(merged, c.path, c.theirs === null ? undefined : c.theirs)
    const record = { ...(merged as JsonObject), rev: conflicts.theirs.rev ?? 0 }
    base.current = conflicts.theirs
    setConflicts(null)
    setDraft(record)
  }

  const copy = async () => {
    try {
      const made = await content.create({ kind, copy_of: at })
      onSaved()
      open(made)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (replace: string | null) => {
    try {
      await content.remove(at, replace ?? undefined)
      onSaved()
      onGone()
    } catch (e) {
      if (e instanceof EditRefused && e.code === 'referenced') setDeleting({ usedBy: e.usedBy, replace })
      else setError(e instanceof Error ? e.message : String(e))
    }
  }

  const changes = view.changed ? diff(view.committed ?? undefined, view.record).filter((d) => !['rev', 'author', 'updated'].includes(d.path)) : []

  return (
    <div className="space-y-4" data-record={at.id}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{recordLabel(draft)}</h2>
          <Badge variant="secondary">{info?.title ?? kind}</Badge>
          {at.feature !== 'live' && <Badge variant="outline">{at.feature}</Badge>}
          {view.changed && <Badge className="bg-warn-bg text-warn">{view.committed ? 'unpublished changes' : 'new, unpublished'}</Badge>}
          <span className={cn('ml-auto text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')} data-status={status}>
            {{ saved: 'saved', saving: 'saving…', unsaved: 'editing…', error: 'not saved' }[status]}
          </span>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {at.id} · {view.file}
          {view.versions.length > 1 && ` · also in ${view.versions.filter((f) => f !== at.feature).join(', ')}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {draft.rev ? `rev ${draft.rev}` : 'never edited here'}
          {draft.author ? ` · by ${draft.author}` : ''}
          {draft.updated ? ` · ${when(draft.updated as number)}` : ''}
        </p>
      </div>

      {error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{error}</p>}
      {problems.length > 0 && (
        <div className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          <p className="font-medium">Not saved:</p>
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {conflicts && <Conflicts conflicts={conflicts.list} onResolve={resolve} />}
      {view.problems.length > 0 && (
        <ul className="space-y-1 text-sm" data-problems>
          {view.problems.map((p, i) => (
            <li key={i} className={cn('rounded-md px-3 py-1.5', p.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-warn-bg text-warn')}>
              {p.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">name</span>
          <TextInput value={(draft.name as string) ?? ''} onChange={(v) => set('name', v)} />
        </label>
        <div className="space-y-1 text-sm">
          <span className="font-medium">extends</span>
          <ValueEditor schema={props.extends ?? true} value={(draft.extends as string) ?? null} onChange={(v) => set('extends', v ?? undefined)} env={formEnv} />
        </div>
        <div className="space-y-1 text-sm">
          <span className="font-medium">source</span>
          <Combobox className="w-full" options={sources.map((s) => ({ value: s.value, label: s.value, keywords: s.description }))} value={(draft.source as string) ?? null} onChange={(v) => set('source', v ?? undefined)} clearable placeholder="not said" />
        </div>
        <div className="space-y-1 text-sm">
          <span className="font-medium">tags</span>
          <MultiCombobox
            className="w-full"
            options={['approximate', 'todo', 'review', 'guess', 'placeholder', 'needs-footage', 'verified'].map((t) => ({ value: t, label: `#${t}` }))}
            value={(draft.tags as string[]) ?? []}
            onChange={(v) => set('tags', v)}
            create="Add tag"
            chip={(o) => `#${o.value}`}
          />
        </div>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">comment</span>
          <TextInput multiline value={(draft.comment as string) ?? ''} onChange={(v) => set('comment', v)} />
        </label>
      </div>

      <SpecialView kind={kind} record={view.record} content={content} open={(id) => open({ id, feature: 'live' })} />

      <ObjectForm schema={root} value={draft} onChange={setDraft} env={formEnv} skip={[...HEADER, ...(kind === 'spawn' && view.template ? ['overrides'] : [])]} inherited={inherited} />

      {kind === 'spawn' && view.template && (
        <Overrides
          kinds={kinds}
          template={draft.template as string}
          resolved={view.template}
          value={(draft.overrides as JsonObject) ?? {}}
          onChange={(o) => set('overrides', Object.keys(o).length ? o : undefined)}
          env={formEnv}
          open={(id) => open({ id, feature: 'live' })}
        />
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" variant="outline" disabled={!undo.length || status === 'saving'} onClick={() => {
            undoing.current = true
            setDraft({ ...undo[undo.length - 1], rev: base.current?.rev ?? 0 })
            setUndo((u) => u.slice(0, -1))
          }} title="Back to the version before your last save">
          <Undo2Icon /> Undo
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          <CopyIcon /> Copy
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(null)}>
          <Trash2Icon /> Delete
        </Button>
        <Button size="sm" variant="outline" onClick={() => content.history(at).then(setHistory).catch((e) => setError(String(e)))}>
          <HistoryIcon /> History
        </Button>
      </div>

      {deleting && (
        <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm" data-delete>
          <p>
            {deleting.usedBy.length} {deleting.usedBy.length === 1 ? 'record names' : 'records name'} it. Put another {info?.title.toLowerCase() ?? kind} in its place, then delete it:
          </p>
          <UsedByList list={deleting.usedBy} open={open} />
          <ValueEditor schema={{ type: 'string', 'x-lmoxide-ref': [kind] }} value={deleting.replace} onChange={(v) => setDeleting({ ...deleting, replace: (v as string) || null })} env={formEnv} />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={!deleting.replace || deleting.replace === at.id} onClick={() => remove(deleting.replace)}>
              Replace and delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Used by ({view.used_by.length})</h3>
        {view.used_by.length ? <UsedByList list={view.used_by} open={open} /> : <p className="text-xs text-muted-foreground">Nothing names it.</p>}
      </section>

      {changes.length > 0 && (
        <section className="space-y-1" data-unpublished>
          <h3 className="text-sm font-medium">Not published yet</h3>
          <DiffTable rows={changes} />
        </section>
      )}

      {history && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">History</h3>
          {!history.length && <p className="text-xs text-muted-foreground">No commits changed it.</p>}
          {history.map((c) => (
            <div key={c.hash} className="space-y-1 rounded-md border p-2">
              <p className="text-xs">
                <b>{c.subject}</b> · {c.author}
                {c.approved_by && ` · approved by ${c.approved_by}`} · {when(c.date)} · <span className="font-mono">{c.hash.slice(0, 8)}</span>
              </p>
              <DiffTable rows={diff(c.before ?? undefined, c.after ?? undefined)} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function UsedByList({ list, open }: { list: View['used_by']; open: (k: RecordKey) => void }) {
  return (
    <ul className="max-h-48 space-y-0.5 overflow-auto text-xs">
      {list.map((u) => (
        <li key={`${u.id}@${u.feature}${u.path}`}>
          <button type="button" data-slot="plain" className="font-mono text-primary hover:underline" onClick={() => open(u)}>
            {u.id}
          </button>
          {u.feature !== 'live' && <span className="text-muted-foreground"> ({u.feature})</span>}
          <span className="text-muted-foreground"> · {u.path.slice(1).replace(/\//g, ' › ')}</span>
        </li>
      ))}
    </ul>
  )
}

function DiffTable({ rows }: { rows: ReturnType<typeof diff> }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r.path} className="border-t align-top">
            <td className="py-1 pr-2 font-medium">{r.path.replace(/\//g, ' › ')}</td>
            <td className="py-1 pr-2 font-mono text-destructive line-through">{brief(r.before)}</td>
            <td className="py-1 font-mono text-emerald-700 dark:text-emerald-400">{brief(r.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Fields both you and someone else changed: pick a value for each. */
function Conflicts({ conflicts, onResolve }: { conflicts: Conflict[]; onResolve: (pick: Record<string, 'ours' | 'theirs'>) => void }) {
  const [pick, setPick] = useState<Record<string, 'ours' | 'theirs'>>(() => Object.fromEntries(conflicts.map((c) => [c.path, 'ours'])))
  return (
    <div className="space-y-2 rounded-md border border-warn bg-warn-bg p-3 text-sm" data-conflicts>
      <p className="font-medium text-warn">Someone saved this record while you edited it. These fields changed on both sides: choose what stays.</p>
      {conflicts.map((c) => (
        <div key={c.path} className="space-y-1">
          <p className="font-medium">{c.path.slice(1).replace(/\//g, ' › ')}</p>
          {(['ours', 'theirs'] as const).map((side) => (
            <label key={side} className="flex items-center gap-2">
              <input data-slot="plain" type="radio" name={c.path} checked={pick[c.path] === side} onChange={() => setPick({ ...pick, [c.path]: side })} />
              <span className="w-16 text-xs text-muted-foreground">{side === 'ours' ? 'yours' : 'theirs'}</span>
              <span className="font-mono text-xs">{brief(c[side])}</span>
            </label>
          ))}
        </div>
      ))}
      <Button size="sm" onClick={() => onResolve(pick)}>
        Save with these
      </Button>
    </div>
  )
}

/** A spawn's changes to its template: the template's fields, its own values greyed, overridable. */
function Overrides({ kinds, template, resolved, value, onChange, env, open }: { kinds: Kinds; template: string; resolved: JsonObject; value: JsonObject; onChange: (v: JsonObject) => void; env: FormEnv; open: (id: string) => void }) {
  const tkind = kindOf(template)
  const root = obj(kinds.schemas[tkind]) as S
  const tenv = useMemo(() => ({ ...env, root }), [env, root])
  const own = Object.fromEntries(Object.entries(resolved).filter(([k]) => !(k in value) && !HEADER.includes(k)))
  return (
    <section className="space-y-2 rounded-md border p-3">
      <h3 className="flex items-center gap-1 text-sm font-medium">
        Its {tkind === 'npc' ? 'NPC' : tkind}:{' '}
        <button type="button" data-slot="plain" className="inline-flex items-center gap-1 font-mono text-primary hover:underline" onClick={() => open(template)}>
          {template} <ExternalLinkIcon className="size-3" />
        </button>
      </h3>
      <p className="text-xs text-muted-foreground">Greyed values are the template's; override one to change it for this spawn only.</p>
      <ObjectForm schema={root} value={value} onChange={onChange} env={tenv} skip={HEADER} inherited={{ value: own, origin: () => template }} />
    </section>
  )
}
