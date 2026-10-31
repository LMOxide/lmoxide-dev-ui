// What the right side shows for the row selected in the tree.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MapPinIcon, PlusIcon } from 'lucide-react'
import { Combobox, MultiCombobox, type ComboOption } from '@/components/combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Editor } from './Editor'
import { fmtPos } from './geometry'
import { NoteEditor, newId, StatusSelect } from './NotesPanel'
import { newWave, TriggerEditor } from './WaveTrigger'
import { TagSelect } from './Tags'
import type { Sel } from './Tree'
import { NEW_WALL, WallFields } from './Walls'
import { WaveStepper } from './Waves'
import type { Ctx } from './WorldEditor'
import { implied, worldName, type Intent } from './nodes'
import type { Worlds } from './worlds'
import { categoryKey, dropKey, findKey, type EnemyName, type Kind, type Note, type RuleBody, type SurveyObject, type Placeable, type Script, type SmashAchievement, type WallAction, type WallSettings, type WaveRef } from './types'
import { useDraft } from './AreaEditor'

/** The editor as one world sees it: its objects and scripts; changes load it again. */
export function ctxFor(ctx: Ctx, worlds: Worlds, pf: number): Ctx {
  if (pf === ctx.state.playfield) return ctx
  const w = worlds.data[pf] ?? { objects: [], notes: { notes: [], scripts: [] } }
  return {
    ...ctx,
    objects: w.objects,
    notes: w.notes,
    run: async (f, what) => {
      const r = await ctx.run(f, what)
      await worlds.reload(pf)
      return r
    },
    upsert: (o, replaced) => worlds.upsert(o, pf, replaced),
  }
}

function Field({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2" title={title}>
      <span className="pt-1.5 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Head({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

/** Something has to be done in game first (standing in that world). */
function Elsewhere({ ctx, worlds, pf, what }: { ctx: Ctx; worlds: Worlds; pf: number; what: string }) {
  if (ctx.state.playfield < 0)
    return (
      <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
        Nobody in game: choose a character online in the world editor mode, and go to <b>{worldName(worlds, pf)}</b> to {what}.
      </p>
    )
  return (
    <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
      You're in {ctx.state.playfield_name ?? worldName(worlds, ctx.state.playfield)}: go to <b>{worldName(worlds, pf)}</b> in game to {what}.
    </p>
  )
}

const KIND_GROUP: Record<Kind, string> = { enemy: 'Enemies', npc: 'NPCs', smashable: 'Smashables', buildie: 'Buildables', bouncer: 'Bouncers', interactable: 'Interactables' }
const KIND_ONE: Record<Kind, string> = { enemy: 'enemy', npc: 'NPC', smashable: 'smashable', buildie: 'buildable', bouncer: 'bouncer', interactable: 'interactable' }
const an = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
const placeableKey = (p: Placeable) => `${p.kind}:${p.name}:${p.monster_data ?? ''}:${p.template ?? ''}`

/** The spawns that can be placed, for a combo box. */
export function spawnOptions(catalog: Placeable[]): ComboOption[] {
  return catalog.map((p) => ({
    value: placeableKey(p),
    label: p.name,
    detail: [p.used ?? (p.monster_data != null ? `look ${p.monster_data}` : p.template != null ? `template ${p.template}` : undefined), p.names?.length ? `also ${p.names.slice(0, 3).join(', ')}` : undefined]
      .filter(Boolean)
      .join(' · ') || undefined,
    keywords: `${p.kind} ${p.monster_data ?? ''} ${p.template ?? ''} ${p.names?.join(' ') ?? ''}`,
    group: KIND_GROUP[p.kind],
  }))
}

/** Buildies and interactables aren't looks a character can wear: the server shows a ghost. */
const wearable = (p: Placeable) => p.kind === 'enemy' || p.kind === 'npc' || p.kind === 'smashable'
const same = (a: Placeable | null, b: Placeable | null) => !!a && !!b && placeableKey(a) === placeableKey(b)

/** The picker's trigger entries (beside the spawns). */
const TRIGGER_OPTIONS: ComboOption[] = [
  { value: 'trigger:wall', label: 'Trigger wall', detail: 'crossing it does something', keywords: 'trigger wall', group: 'Triggers' },
  { value: 'trigger:radius', label: 'Trigger radius', detail: 'walking into the circle does something', keywords: 'trigger radius circle', group: 'Triggers' },
]

/**
 * Place a spawn (picked from the catalog) or a trigger, both from one picker, where you stand.
 * `wave`: spawns go into it; `wall`: what a new trigger does (starts this script, discovers
 * this location, gives this collectible); `only`: one kind (or only triggers); `autoOpen`: the
 * picker (or the trigger form) opens at once ("New …" in the tree).
 */
export function PlacePanel({
  ctx,
  wave,
  wall: wallAction,
  spawns = true,
  walls = true,
  only,
  autoOpen = false,
}: {
  ctx: Ctx
  wave?: WaveRef | null
  wall?: WallAction
  spawns?: boolean
  walls?: boolean
  only?: Kind | 'trigger'
  autoOpen?: boolean
}) {
  const { backend, account, state } = ctx
  const triggersOnly = only === 'trigger' || !spawns
  const newWall = (radius: boolean): WallSettings => ({ ...NEW_WALL, action: wallAction ?? NEW_WALL.action, radius: radius ? 3 : null, color: radius ? (ctx.looks.find((l) => l.shape === 'radius')?.color ?? 'green') : NEW_WALL.color })
  const [key, setKey] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [wall, setWall] = useState<WallSettings | null>(() => (autoOpen && triggersOnly ? newWall(false) : null))
  const chosen = ctx.catalog.find((p) => placeableKey(p) === key) ?? null
  const options = useMemo(
    () => [...(triggersOnly ? [] : spawnOptions(ctx.catalog.filter((p) => !only || p.kind === only))), ...(walls && (!only || only === 'trigger') ? TRIGGER_OPTIONS : [])],
    [ctx.catalog, only, triggersOnly, walls],
  )
  const what = chosen && { ...chosen, level: chosen.kind === 'enemy' ? level : chosen.level }
  const wearing = same(state.wearing, chosen)
  const noun = only && only !== 'trigger' ? KIND_ONE[only] : 'spawn'
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <Combobox
        className="w-full"
        defaultOpen={autoOpen && !triggersOnly}
        options={options}
        value={wall ? (wall.radius !== null ? 'trigger:radius' : 'trigger:wall') : key}
        onChange={(v) => {
          if (v?.startsWith('trigger:')) {
            setKey(null)
            setWall(newWall(v === 'trigger:radius'))
            return
          }
          setKey(v)
          setWall(null)
          const p = ctx.catalog.find((x) => placeableKey(x) === v)
          setLevel(p?.level ?? null)
        }}
        placeholder={triggersOnly ? 'Place a trigger…' : wave ? 'Add a spawn to this wave…' : walls ? `Place ${an(noun)} or a trigger…` : `Place ${an(noun)}…`}
        search="Search names, looks, templates, triggers…"
      />
      {chosen && what && (
        <div className="space-y-2">
          {chosen.kind === 'enemy' && (
            <Field label="level">
              <Input className="h-8 w-24" type="number" min={1} value={level ?? ''} onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : null)} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            {wearing ? (
              <Button size="sm" variant="outline" onClick={() => ctx.run(() => backend.wear(account, null))}>
                Take off
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => ctx.run(() => backend.wear(account, what))} title={wearable(chosen) ? 'Your character takes its look' : 'A ghost of it follows you'}>
                {wearable(chosen) ? 'Wear it' : 'Show ghost'}
              </Button>
            )}
            <Button
              size="sm"
              onClick={async () => {
                const o = await ctx.run(() => backend.place(account, what, wave ?? null, ctx.feature, ctx.newTags), 'all')
                if (o) ctx.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
              }}
              title="Where you stand, facing your way"
            >
              <MapPinIcon /> Place here
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Walk to where it stood and face its way, then place it. It is selected after placing, to fine-tune{chosen.kind === 'bouncer' ? ' and to set where it throws you' : ''}.
          </p>
        </div>
      )}
      {wall && (
        <div className="space-y-2">
          <label className="sv-field">
            <span>name</span>
            <input placeholder="optional" value={wall.name} onChange={(e) => setWall({ ...wall, name: e.target.value })} />
          </label>
          <WallFields value={wall} scripts={ctx.notes.scripts} looks={ctx.looks} targets={ctx.targets} playfield={state.playfield} collects={ctx.collects} onChange={(w) => setWall({ ...wall, ...w })} />
          <Button
            size="sm"
            onClick={async () => {
              const o = await ctx.run(() => backend.placeTrigger(account, wall, ctx.feature, ctx.newTags), 'all')
              if (o) ctx.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
            }}
            title="Standing in its middle, facing the way players walk through it"
          >
            <MapPinIcon /> Place here
          </Button>
        </div>
      )}
    </div>
  )
}

function WorldDetail({ ctx, worlds, pf, intent }: { ctx: Ctx; worlds: Worlds; pf: number; intent?: Intent | null }) {
  const info = worlds.playfields.find((p) => p.id === pf)
  const here = ctx.state.playfield === pf
  return (
    <div className="space-y-3">
      <Head title={worldName(worlds, pf, here ? ctx.state.playfield_name : null)} sub={`Playfield ${pf}${here ? ' · you are here' : ''}`} />
      {info && (
        <p className="text-sm text-muted-foreground">
          {info.base} from live, the demo or client data · {info.placements} placed · {info.triggers} trigger walls · {info.scripts} scripts · {info.notes} notes
        </p>
      )}
      {here ? <PlacePanel key={(intent as { n?: number } | null)?.n} ctx={ctx} only={intent?.add === 'trigger' ? 'trigger' : undefined} autoOpen={!!intent} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place things in it" />}
      {here && (
        <Button
          size="sm"
          variant="outline"
          title="Something someone has to check and implement here: a mission area, an achievement, a dialogue, a comment"
          onClick={async () => {
            const note: Note = { id: newId('n'), kind: 'comment', area: { point: [...ctx.state.pos] }, reference: null, comment: '', status: 'unreviewed', tags: ctx.newTags }
            await ctx.run(() => ctx.backend.saveNote(pf, note), 'all')
          }}
        >
          <PlusIcon /> New note here
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Copy spawns, trigger walls, waves or scripts anywhere in the tree and paste them here (right click, or Ctrl+C and Ctrl+V).</p>
    </div>
  )
}

function ScriptDetail({ ctx, worlds, pf, script, onSelect }: { ctx: Ctx; worlds: Worlds; pf: number; script: Script; onSelect: (s: Sel) => void }) {
  const { backend, account } = ctx
  const w = worlds.data[pf]
  const [draft, update] = useDraft(script, (s) => ctx.run(() => backend.saveScript(pf, s), 'all'))
  const [reallyDelete, setReallyDelete] = useState(false)
  const spawned = (wave: string) => (w?.objects ?? []).filter((o) => o.wave?.script === script.id && o.wave.wave === wave).length
  const total = (w?.objects ?? []).filter((o) => o.wave?.script === script.id).length
  return (
    <div className="space-y-3">
      <Head title={draft.name || 'script'} sub={worldName(worlds, pf)}>
        {ctx.state.playfield === pf && script.waves.length > 1 && <WaveStepper ctx={ctx} script={script} />}
      </Head>
      <Field label="name">
        <Input className="h-8" value={draft.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
      </Field>
      <Field label="which">
        <Input className="h-8" placeholder="optional: the script's name or id, if you found it" value={draft.reference ?? ''} onChange={(e) => update((d) => ({ ...d, reference: e.target.value || null }))} />
      </Field>
      <Field label="comment">
        <Textarea rows={2} value={draft.comment} onChange={(e) => update((d) => ({ ...d, comment: e.target.value }))} />
      </Field>
      <Field label="review">
        <StatusSelect value={draft.status} onChange={(s) => update((d) => ({ ...d, status: s }))} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={draft.tags ?? []} onChange={(tags) => update((d) => ({ ...d, tags }))} />
      </Field>
      <Field label="waves">
        <ul className="space-y-1 text-sm">
          {draft.waves.map((wave, i) => (
            <li key={wave.id} className="flex items-center gap-2">
              <button type="button" data-slot="link" className="truncate text-primary hover:underline" onClick={() => onSelect({ t: 'wave', pf, script: script.id, wave: wave.id })}>
                {wave.name || `wave ${i + 1}`}
              </button>
              <span className={spawned(wave.id) ? 'text-xs text-muted-foreground' : 'text-xs text-warn'}>{spawned(wave.id) || 'nothing'} spawned</span>
            </li>
          ))}
        </ul>
        <Button className="mt-1" size="sm" variant="outline" onClick={() => update((d) => ({ ...d, waves: [...d.waves, newWave(d.waves.length + 1)] }))}>
          <PlusIcon /> Add a wave
        </Button>
      </Field>
      <div className="flex flex-wrap gap-2">
        {draft.area && ctx.state.playfield === pf && (
          <Button size="sm" variant="outline" onClick={() => ctx.run(() => backend.teleport(account, 'point' in draft.area! ? draft.area.point : 'circle' in draft.area! ? draft.area.circle.center : draft.area!.polygon.points[0]))}>
            Go to it
          </Button>
        )}
        {reallyDelete ? (
          <Button size="sm" variant="destructive" onClick={() => ctx.run(() => backend.deleteScript(pf, script.id), 'all').then(() => worlds.reload(pf))}>
            Really delete
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="text-destructive" disabled={total > 0} title={total ? 'Delete or move its spawns first' : ''} onClick={() => setReallyDelete(true)}>
            Delete script
          </Button>
        )}
      </div>
    </div>
  )
}

function WaveDetail({ ctx, worlds, pf, script, waveId, autoOpen = false }: { ctx: Ctx; worlds: Worlds; pf: number; script: Script; waveId: string; autoOpen?: boolean }) {
  const { backend, account } = ctx
  const w = worlds.data[pf]
  const [draft, update] = useDraft(script, (s) => ctx.run(() => backend.saveScript(pf, s), 'all'))
  const i = draft.waves.findIndex((x) => x.id === waveId)
  const wave = draft.waves[i]
  if (!wave) return <p className="text-muted-foreground">This wave is gone.</p>
  const set = (f: (x: typeof wave) => typeof wave) => update((d) => ({ ...d, waves: d.waves.map((x) => (x.id === waveId ? f(x) : x)) }))
  const n = (w?.objects ?? []).filter((o) => o.wave?.script === script.id && o.wave.wave === waveId).length
  const here = ctx.state.playfield === pf
  const ref = { script: script.id, wave: waveId }
  return (
    <div className="space-y-3">
      <Head title={wave.name || `wave ${i + 1}`} sub={`${script.name || 'script'} · ${worldName(worlds, pf)} · ${n ? `${n} spawned` : 'nothing spawns yet'}`} />
      <Field label="name">
        <Input className="h-8" value={wave.name} placeholder={`wave ${i + 1}`} onChange={(e) => set((x) => ({ ...x, name: e.target.value }))} />
      </Field>
      <Field label="trigger">
        <TriggerEditor ctx={ctxFor(ctx, worlds, pf)} script={draft} wave={wave} onChange={(t) => set((x) => ({ ...x, trigger: t }))} />
      </Field>
      <Field label="comment">
        <Textarea rows={2} placeholder="how it starts, in your words" value={wave.comment} onChange={(e) => set((x) => ({ ...x, comment: e.target.value }))} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={wave.tags ?? []} onChange={(tags) => set((x) => ({ ...x, tags }))} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {here && (
          <>
            <Button size="sm" variant="outline" disabled={draft.waves.length < 2} onClick={() => ctx.run(() => backend.showWave(account, script.id, waveId))} title="Show this wave's spawns, and hide the script's other waves">
              Show this wave
            </Button>
            <Button size="sm" variant="outline" disabled={!n} onClick={() => ctx.run(() => backend.previewWave(account, ref))} title="Spawn this wave for a while, as its trigger would">
              Preview
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={n > 0 || draft.waves.length === 1}
          title={n ? 'Delete or move its spawns first' : draft.waves.length === 1 ? 'A script has at least one wave' : 'Delete this wave'}
          onClick={() => update((d) => ({ ...d, waves: d.waves.filter((x) => x.id !== waveId) }))}
        >
          Delete wave
        </Button>
      </div>
      {here ? <PlacePanel ctx={ctx} wave={ref} walls={false} autoOpen={autoOpen} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place spawns in this wave" />}
    </div>
  )
}

/** A rule's entry: a smash achievement or collectible, or a category or drop made from its rule. */
export function entryOf(worlds: Worlds, key: string): SmashAchievement | null {
  const a = worlds.smash.find((x) => x.key === key)
  if (a) return a
  const r = worlds.rules[key]
  if (!r) return null
  const drop = key.startsWith('drop:')
  return { key, ids: [], title: key.slice(drop ? 5 : 9), text: '', group: null, kind: drop ? 'drop' : 'category', what: null, match: null, n: 0, minifigures: 0, rule: r }
}

const NAME_GROUP: Record<EnemyName['kind'], string> = { champion: 'Champions and bosses', boss: 'Champions and bosses', enemy: 'Enemies', smashable: 'Smashables' }

/** Every enemy name a defeat can carry (and, but in a category, the categories as `@name`). */
function enemyOptions(ctx: Ctx, worlds: Worlds, categories: boolean): ComboOption[] {
  const out = new Map<string, ComboOption>()
  const where = (pfs: number[]) => pfs.slice(0, 3).map((pf) => worldName(worlds, pf)).join(', ') + (pfs.length > 3 ? ` +${pfs.length - 3}` : '')
  for (const n of worlds.enemyNames)
    out.set(n.name, { value: n.name, label: n.name, detail: [where(n.playfields), n.source === 'achievement' ? 'from achievements' : null].filter(Boolean).join(' · '), group: NAME_GROUP[n.kind], near: n.source !== 'achievement' })
  // (older servers: the catalog and the bosses achievements name)
  for (const p of ctx.catalog) if ((p.kind === 'enemy' || p.kind === 'smashable') && !out.has(p.name)) out.set(p.name, { value: p.name, label: p.name, detail: p.used, group: NAME_GROUP[p.kind], near: true })
  for (const a of worlds.smash) if (a.kind === 'defeat' && a.match && !out.has(a.match)) out.set(a.match, { value: a.match, label: a.match, detail: a.title, group: NAME_GROUP.boss })
  const cats: ComboOption[] = categories
    ? Object.values(worlds.rules)
        .filter((r) => r.id.startsWith('category:'))
        .map((r) => ({ value: `@${r.id.slice(9)}`, label: `@${r.id.slice(9)}`, detail: `${r.enemies.length} enemies`, group: 'Your categories', near: true }))
    : []
  return [...cats, ...out.values()]
}

/** A smash achievement, collectible, drop or category: the enemies that count (or drop it). */
function RuleDetail({ ctx, worlds, a, intent }: { ctx: Ctx; worlds: Worlds; a: SmashAchievement; intent: Intent | null }) {
  const rule = a.rule ?? worlds.rules[a.key] ?? null
  const category = a.kind === 'category'
  const drop = a.kind === 'drop'
  const options = useMemo(() => enemyOptions(ctx, worlds, !category), [ctx, worlds, category])
  const [comment, setComment] = useState(rule?.comment ?? '')
  useEffect(() => setComment(rule?.comment ?? ''), [rule?.comment])
  const save = (r: Partial<RuleBody>) => worlds.saveRule(a.key, { enemies: rule?.enemies ?? [], comment: rule?.comment ?? '', tags: rule?.tags ?? [], once: rule?.once, item: rule?.item, feature: rule?.feature ?? ctx.feature, ...r })
  const fromData = rule?.enemies.length ? [] : implied(a, worlds.enemyNames, ctx.catalog)
  const gives = (o: SurveyObject) => typeof o.action === 'object' && 'collect' in o.action && o.action.collect.drop === a.key
  const walls = Object.values(worlds.data).flatMap((w) => w.objects.filter((o) => o.kind === 'trigger' && gives(o)))
  const [reallyDelete, setReallyDelete] = useState(false)
  const sub =
    a.kind === 'category'
      ? 'Your category of enemies: use it as @' + a.title + ' in achievements and drops'
      : a.kind === 'drop'
        ? 'A drop (mission item)'
        : [a.group, a.kind === 'defeat' ? 'smash once' : a.kind === 'collect' ? `collect ${a.n}` : `smash ${a.n}`, a.minifigures ? `every minifigure has it (${a.minifigures})` : null].filter(Boolean).join(' · ')
  return (
    <div className="space-y-3">
      <Head title={a.title} sub={sub} />
      {a.text && <p className="text-sm">“{a.text}”</p>}
      {!rule?.enemies.length && fromData === 'all' && <p className="rounded-md bg-secondary px-3 py-2 text-sm">The game data counts every {a.what === 'smashes' ? 'smashable' : 'enemy'}; choose enemies only to narrow it.</p>}
      {!rule?.enemies.length && Array.isArray(fromData) && fromData.length > 0 && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm">
          The game data counts {fromData.join(', ')}
          {a.match && a.kind === 'counter' ? ` (anything named like “${a.match}”)` : ''}. Choose enemies to change it.
        </p>
      )}
      {!rule?.enemies.length && Array.isArray(fromData) && !fromData.length && !walls.length && !category && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">Nothing {a.kind === 'collect' || drop ? 'gives it' : 'counts toward it'} yet{a.match ? `: the game data names “${a.match}”, which no known enemy matches` : ''}.</p>
      )}
      <Field label={category ? 'enemies' : a.kind === 'collect' || drop ? 'dropped by' : 'counts'} title={category ? 'The enemies in this category' : 'Enemies, smashables, or @categories'}>
        <MultiCombobox
          key={intent?.add === 'enemy' ? 'open' : 'closed'}
          defaultOpen={intent?.add === 'enemy'}
          options={options}
          value={rule?.enemies ?? []}
          onChange={(enemies) => save({ enemies })}
          placeholder="choose enemies…"
          search="Search enemies, champions…"
          create="Use the name"
          className="w-full"
        />
      </Field>
      {(a.kind === 'collect' || drop) && (
        <Field label="each enemy">
          <label className="flex items-center gap-2 pt-1.5 text-sm">
            <input type="checkbox" checked={!!rule?.once} onChange={(e) => save({ once: e.target.checked })} /> drops only one (per player)
          </label>
        </Field>
      )}
      {drop && (
        <Field label="item" title="The item's template, if you know it (the game can only drop it with one)">
          <Input className="h-8 w-40" type="number" placeholder="template" value={rule?.item ?? ''} onChange={(e) => save({ item: e.target.value ? Number(e.target.value) : null })} />
        </Field>
      )}
      <Field label="comment">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (rule?.comment ?? '') && save({ comment })} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={rule?.tags ?? []} onChange={(tags) => save({ tags })} />
      </Field>
      {(a.kind === 'collect' || drop) && (
        <>
          <p className="text-sm text-muted-foreground">{walls.length ? `${walls.length} trigger ${walls.length === 1 ? 'wall gives' : 'walls give'} it.` : 'No trigger wall gives it.'} A place where it is found: stand there and place one.</p>
          {ctx.state.playfield >= 0 ? (
            <PlacePanel key={intent?.add === 'trigger' ? `t${(intent as { n?: number }).n}` : 'p'} ctx={ctx} spawns={false} autoOpen={intent?.add === 'trigger'} wall={{ collect: { drop: a.key } }} />
          ) : (
            <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">Nobody in game: choose a character online in the world editor mode to place a trigger.</p>
          )}
        </>
      )}
      {a.ids.length > 0 && <AchievementLinks ctx={ctx} ids={a.ids} />}
      {rule?.author && <p className="text-xs text-muted-foreground">Rule by {rule.author}</p>}
      {(category || drop) &&
        (reallyDelete ? (
          <Button size="sm" variant="destructive" onClick={() => worlds.deleteRule(a.key)}>
            Really delete
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setReallyDelete(true)}>
            Delete {category ? 'category' : 'drop'}
          </Button>
        ))}
    </div>
  )
}

function EnemyDetail({ ctx, worlds, a, name }: { ctx: Ctx; worlds: Worlds; a: SmashAchievement; name: string }) {
  const rule = a.rule ?? worlds.rules[a.key] ?? null
  const cat = name.startsWith('@') ? worlds.rules[categoryKey(name.slice(1))] : null
  const where: [number, number][] = []
  for (const [pf, w] of Object.entries(worlds.data)) {
    const n = w.objects.filter((o) => o.name === name).length
    if (n) where.push([Number(pf), n])
  }
  const known = worlds.enemyNames.find((n) => n.name === name)
  return (
    <div className="space-y-3">
      <Head title={name} sub={`${cat ? `your category of ${cat.enemies.length}` : (known?.kind ?? ctx.catalog.find((p) => p.name === name)?.kind ?? 'not in the game data')} · in ${a.title}`} />
      {cat && <p className="text-sm">{cat.enemies.join(', ') || 'No enemies in it yet.'}</p>}
      {!cat && (
        <p className="text-sm text-muted-foreground">
          {where.length ? `Spawns in ${where.map(([pf, n]) => `${worldName(worlds, pf)} ×${n}`).join(', ')}.` : known?.playfields.length ? `In ${known.playfields.map((pf) => worldName(worlds, pf)).join(', ')}.` : 'It spawns nowhere loaded yet.'}
        </p>
      )}
      <Button size="sm" variant="outline" className="text-destructive" onClick={() => rule && worlds.saveRule(a.key, { ...rule, enemies: rule.enemies.filter((e) => e !== name) })}>
        Remove from {a.title}
      </Button>
    </div>
  )
}

function LocationDetail({ ctx, worlds, pf, name, intent }: { ctx: Ctx; worlds: Worlds; pf: number; name: string; intent: Intent | null }) {
  const l = ctx.targets?.locations.find((x) => x.playfield === pf && x.name === name)
  const key = findKey(pf, name)
  const rule = worlds.rules[key]
  const [comment, setComment] = useState(rule?.comment ?? '')
  useEffect(() => setComment(rule?.comment ?? ''), [rule?.comment])
  if (!l) return <p className="text-muted-foreground">Unknown location.</p>
  const achs = l.achievements.map((id) => ctx.targets!.achievements.find((a) => a.id === id)).filter((a) => !!a)
  const walls = (worlds.data[pf]?.objects ?? []).filter((o) => o.kind === 'trigger' && typeof o.action === 'object' && 'discover' in o.action && o.action.discover.name === name)
  const save = (r: Partial<RuleBody>) => worlds.saveRule(key, { enemies: [], comment: rule?.comment ?? '', tags: rule?.tags ?? [], feature: rule?.feature ?? ctx.feature, ...r })
  const here = ctx.state.playfield === pf
  return (
    <div className="space-y-3">
      <Head title={l.title || name} sub={`${l.playfield_name ?? worldName(worlds, pf)} · ${name}`} />
      {achs.map((a) => (
        <p key={a!.id} className="text-sm">
          <b>
            {a!.group ? `${a!.group} › ` : ''}
            {a!.title || a!.name}
          </b>{' '}
          <span className="text-muted-foreground">[{a!.id}]</span>
          {a!.text && <span className="text-muted-foreground"> — “{a!.text}”</span>}
          {a!.locations.length > 1 && <span className="text-muted-foreground"> (needs all {a!.locations.length} locations)</span>}
        </p>
      ))}
      {l.pos ? (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm">
          The client has an exploration area for it (around {fmtPos(l.pos)}): walking in discovers it in the game. A trigger wall is only needed to change where.
        </p>
      ) : (
        !walls.length && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">Nothing discovers it yet: the client has no area for it, and no trigger wall does.</p>
      )}
      <Field label="comment">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (rule?.comment ?? '') && save({ comment })} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={rule?.tags ?? []} onChange={(tags) => save({ tags })} />
      </Field>
      {l.pos && here && (
        <Button size="sm" variant="outline" onClick={() => ctx.run(() => ctx.backend.teleport(ctx.account, l.pos!))} title={fmtPos(l.pos)}>
          Go to its area
        </Button>
      )}
      {here ? (
        <PlacePanel key={intent ? `t${(intent as { n?: number }).n}` : 'p'} ctx={ctx} spawns={false} autoOpen={intent?.add === 'trigger'} wall={{ discover: { name, achievement: l.achievements.length === 1 ? String(l.achievements[0]) : null } }} />
      ) : (
        <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place a trigger for it" />
      )}
    </div>
  )
}

/** A name for a new category or drop. */
function NewNamed({ worlds, ctx, kind, autoFocus }: { worlds: Worlds; ctx: Ctx; kind: 'category' | 'drop'; autoFocus: boolean }) {
  const [name, setName] = useState('')
  const box = useRef<HTMLInputElement>(null)
  // (after the tree's menu has closed)
  useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => box.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [autoFocus])
  const key = kind === 'category' ? categoryKey(name.trim()) : dropKey(name.trim())
  const taken = !!worlds.rules[key]
  const create = () => name.trim() && !taken && worlds.saveRule(key, { enemies: [], feature: ctx.feature, tags: ctx.newTags }).then(() => setName(''))
  return (
    <div className="flex gap-2">
      <Input ref={box} className="h-8" placeholder={kind === 'category' ? 'New category, e.g. Witches' : "New drop, e.g. Pirate's Hat"} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      <Button size="sm" disabled={!name.trim() || taken} title={taken ? 'There is one by that name' : undefined} onClick={create}>
        <PlusIcon /> Create
      </Button>
    </div>
  )
}

function FolderDetail({ ctx, worlds, sel, intent }: { ctx: Ctx; worlds: Worlds; sel: Extract<Sel, { t: 'folder' }>; intent: Intent | null }) {
  const pf = sel.pf ?? ctx.state.playfield
  const here = ctx.state.playfield === pf
  const w = worlds.data[pf]
  const script = sel.id ? w?.notes.scripts.find((s) => s.id === sel.id) : undefined
  const n = (intent as { n?: number } | null)?.n
  switch (sel.kind) {
    case 'smash': {
      const list = worlds.smash.filter((a) => a.kind === 'counter' || a.kind === 'defeat')
      const done = list.filter((a) => (a.rule ?? worlds.rules[a.key])?.enemies.length || (() => { const d = implied(a, worlds.enemyNames, ctx.catalog); return d === 'all' || d.length > 0 })()).length
      return (
        <div className="space-y-2">
          <Head title="Smash achievements" sub={`${done} of ${list.length} have enemies (chosen, or from the game data)`} />
          <p className="text-sm text-muted-foreground">Open one and choose the enemies (or smashables, or one of your @categories) that count toward it. Those marked amber have none.</p>
        </div>
      )
    }
    case 'collect':
      return (
        <div className="space-y-2">
          <Head title="Collect" sub="Collectibles and mission items: the enemies that drop them and the places (trigger walls) that give them" />
          <NewNamed key={n} worlds={worlds} ctx={ctx} kind="drop" autoFocus={intent?.add === 'name'} />
        </div>
      )
    case 'categories':
      return (
        <div className="space-y-2">
          <Head title="Enemy categories" sub="Your own groups of enemies from live, used as @name by achievements and drops" />
          <NewNamed key={n} worlds={worlds} ctx={ctx} kind="category" autoFocus={intent?.add === 'name'} />
        </div>
      )
    case 'discover': {
      const n = ctx.targets?.locations.length ?? 0
      return (
        <div className="space-y-2">
          <Head title="Discover locations" sub={`${n} locations`} />
          <p className="text-sm text-muted-foreground">Each location is discovered by the client's exploration area or a trigger wall. Those marked amber have neither.</p>
        </div>
      )
    }
    case 'waves':
      return script ? (
        <div className="space-y-2">
          <Head title={`${script.name || 'script'} › waves`} sub={worldName(worlds, pf)} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => ctx.run(() => ctx.backend.saveScript(pf, { ...script, waves: [...script.waves, newWave(script.waves.length + 1)] }), 'all').then(() => worlds.reload(pf))}
          >
            <PlusIcon /> Add a wave
          </Button>
        </div>
      ) : null
    case 'script-triggers':
      return script ? (
        <div className="space-y-3">
          <Head title={`${script.name || 'script'} › triggers`} sub="Optional: trigger walls that start it (the server may start it otherwise)" />
          {here ? <PlacePanel key={n} ctx={ctx} spawns={false} autoOpen={intent?.add === 'trigger'} wall={{ script: { script: script.id, wave: null } }} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place a trigger for it" />}
        </div>
      ) : null
    case 'location-triggers':
      return <LocationDetail ctx={ctx} worlds={worlds} pf={pf} name={sel.name!} intent={intent} />
    case 'world-scripts':
      return (
        <div className="space-y-2">
          <Head title="Scripts" sub={worldName(worlds, pf)} />
          <NewScript ctx={ctx} worlds={worlds} pf={pf} />
        </div>
      )
    case 'world-notes':
      return (
        <div className="space-y-2">
          <Head title="Notes" sub={worldName(worlds, pf)} />
          <p className="text-sm text-muted-foreground">Areas someone has to check and implement. Add one from the world's page with <i>New note here</i>.</p>
        </div>
      )
    case 'world-triggers':
      return (
        <div className="space-y-3">
          <Head title="Triggers" sub={`${worldName(worlds, pf)} · walls and radii that don't start a script, discover a location or give a collectible (those are listed there)`} />
          {here ? <PlacePanel key={n} ctx={ctx} only="trigger" autoOpen={intent?.add === 'trigger'} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place a trigger" />}
        </div>
      )
    case 'world-kind': {
      const kind = sel.id as Kind
      return (
        <div className="space-y-3">
          <Head title={KIND_GROUP[kind]} sub={worldName(worlds, pf)} />
          {here ? <PlacePanel key={n} ctx={ctx} only={kind} walls={false} autoOpen={intent?.add === 'spawn'} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what={`place a ${KIND_ONE[kind]}`} />}
        </div>
      )
    }
    default:
      return <WorldDetail ctx={ctx} worlds={worlds} pf={pf} intent={intent} />
  }
}

/** A new script in a world (chosen from every world; the surveyor's by default). */
export function NewScript({ ctx, worlds, pf: initial }: { ctx: Ctx; worlds: Worlds; pf?: number }) {
  const [pf, setPf] = useState(initial ?? ctx.state.playfield)
  const options = worlds.playfields.map((p) => ({ value: String(p.id), label: p.name, detail: String(p.id), near: p.scripts + p.placements + p.base > 0 }))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {initial === undefined && <Combobox className="min-w-48" options={options} value={pf >= 0 ? String(pf) : null} onChange={(v) => v && setPf(Number(v))} placeholder="Which world…" search="Search worlds…" />}
      <Button
        size="sm"
        disabled={pf < 0}
        onClick={async () => {
          const s: Script = { id: newId('s'), name: 'New script', area: null, reference: null, comment: '', waves: [newWave(1)], status: 'unreviewed', tags: ctx.newTags }
          await ctx.run(() => ctx.backend.saveScript(pf, s), 'all')
          await worlds.reload(pf)
        }}
      >
        <PlusIcon /> New script
      </Button>
    </div>
  )
}

export function Details({ ctx, worlds, sel, intent, onSelect }: { ctx: Ctx; worlds: Worlds; sel: Sel | null; intent: Intent | null; onSelect: (s: Sel) => void }) {
  if (!sel)
    return (
      <p className="text-muted-foreground">
        Pick something in the tree, use <i>Select nearest</i>, or attack it in game. Right click a folder to add to it.
      </p>
    )
  switch (sel.t) {
    case 'world':
      return <WorldDetail ctx={ctx} worlds={worlds} pf={sel.pf} intent={intent} />
    case 'object': {
      const o = worlds.data[sel.pf]?.objects.find((x) => x.id === sel.id)
      return o ? <Editor key={o.id} ctx={ctxFor(ctx, worlds, sel.pf)} object={o} /> : <p className="text-muted-foreground">It's gone (deleted, or replaced).</p>
    }
    case 'note': {
      const n = worlds.data[sel.pf]?.notes.notes.find((x) => x.id === sel.id)
      return n ? <NoteEditor key={n.id} ctx={ctxFor(ctx, worlds, sel.pf)} note={n} playfield={sel.pf} /> : null
    }
    case 'script': {
      const s = worlds.data[sel.pf]?.notes.scripts.find((x) => x.id === sel.id)
      return s ? <ScriptDetail key={s.id} ctx={ctx} worlds={worlds} pf={sel.pf} script={s} onSelect={onSelect} /> : null
    }
    case 'wave': {
      const s = worlds.data[sel.pf]?.notes.scripts.find((x) => x.id === sel.script)
      return s ? <WaveDetail key={`${s.id}/${sel.wave}/${(intent as { n?: number } | null)?.n ?? ''}`} ctx={ctx} worlds={worlds} pf={sel.pf} script={s} waveId={sel.wave} autoOpen={intent?.add === 'spawn'} /> : null
    }
    case 'smash': {
      const a = entryOf(worlds, sel.key)
      return a ? <RuleDetail key={`${a.key}/${(intent as { n?: number } | null)?.n ?? ''}`} ctx={ctx} worlds={worlds} a={a} intent={intent} /> : <p className="text-muted-foreground">It's gone.</p>
    }
    case 'enemy': {
      const a = entryOf(worlds, sel.key)
      return a ? <EnemyDetail ctx={ctx} worlds={worlds} a={a} name={sel.name} /> : null
    }
    case 'location':
      return <LocationDetail key={`${sel.pf}:${sel.name}/${(intent as { n?: number } | null)?.n ?? ''}`} ctx={ctx} worlds={worlds} pf={sel.pf} name={sel.name} intent={intent} />
    case 'folder':
      return <FolderDetail ctx={ctx} worlds={worlds} sel={sel} intent={intent} />
  }
}

/**
 * The client achievements an entry stands for (a minifigure achievement has a copy per
 * minifigure): each by name and lore id, a link to its content record.
 */
function AchievementLinks({ ctx, ids }: { ctx: Ctx; ids: number[] }) {
  const [entries, setEntries] = useState<{ id: number; name: string; record?: string }[] | null>(null)
  const key = ids.join()
  useEffect(() => {
    let gone = false
    ctx.content
      .catalog('lore', { ids })
      .then((c) => !gone && setEntries(c.entries))
      .catch(() => !gone && setEntries([]))
    return () => {
      gone = true
    }
  }, [ctx.content, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map((entries ?? []).map((e) => [e.id, e]))
  return (
    <div className="text-xs" data-achievements>
      <p className="text-muted-foreground">{ids.length === 1 ? 'The achievement:' : `The ${ids.length} achievements (one per minifigure):`}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {ids.map((id) => {
          const e = byId.get(id)
          return (
            <li key={id}>
              {e?.record ? (
                <button type="button" data-slot="plain" className="text-primary hover:underline" onClick={() => ctx.openRecord(e.record!)} title={`Open ${e.record}`}>
                  {e.name || e.record}
                </button>
              ) : (
                <span>{e?.name || (entries ? 'not in the content' : '…')}</span>
              )}{' '}
              <span className="text-muted-foreground">#{id}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
