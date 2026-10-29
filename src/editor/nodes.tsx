// The tree's contents for each tab, built from every loaded world:
//
//   Spawns/        {world}/ scripts/ (links) · triggers/ · notes/ · what spawns at start
//   Scripts/       {script}/ triggers/ · waves/ {wave}/ what it spawns
//   Achievements/  Smash/ {achievement}/ {enemy} · Collect/ {collectible or drop}/ {enemy},
//                  triggers/ · Discover/ {location}/ triggers/ · Categories/ {category}/ {enemy}
//
// Every smash achievement, collectible and discover location is listed; those that still need
// work (no enemies, no trigger, nothing in the game data either) are marked.

import {
  ArrowBigUpDashIcon,
  BookOpenIcon,
  GemIcon,
  ListIcon,
  MapIcon,
  BoxIcon,
  FileTextIcon,
  FlagIcon,
  FolderIcon,
  GlobeIcon,
  HammerIcon,
  HandIcon,
  LinkIcon,
  MapPinIcon,
  RectangleVerticalIcon,
  ScrollTextIcon,
  SkullIcon,
  SwordsIcon,
  TrophyIcon,
  UserIcon,
  WavesIcon,
  type LucideIcon,
} from 'lucide-react'
import type { Clip, Target } from './clipboard'
import { pasteLabel } from './clipboard'
import { distance, inHiddenWave } from './geometry'
import type { MenuItem, Sel, TNode } from './Tree'
import { kidsOf } from './Tree'
import type { Ctx } from './WorldEditor'
import type { WorldData, Worlds } from './worlds'
import { categoryKey, editable, findKey, type EnemyName, type Kind, type Placeable, type Script, type SmashAchievement, type SurveyObject, type TriggerTargets } from './types'

export type Tab = 'spawns' | 'scripts' | 'achievements'

/** What the builders need: the editor, every world, the clipboard and the row actions. */
export interface Env {
  ctx: Ctx
  worlds: Worlds
  targets: TriggerTargets | null
  clip: Clip | null
  copy: (c: Clip) => void
  paste: (c: Clip, to: Target) => void
  /** worlds added to Spawns by hand (they show although nothing is in them) */
  pinned: number[]
  /** the object filters (categories, author, feature, distance) */
  keep: (o: SurveyObject, pf: number) => boolean
  /** jumps to a row (a link to a script) */
  reveal: (key: string, tab: Tab) => void
  remove: (o: SurveyObject) => void
  /** selects a row and starts adding to it (opens its picker, or asks for a name) */
  add: (key: string, sel: Sel, intent: Intent) => void
}

/** What "New …" on a row starts: placing (a spawn of a kind, a trigger), picking an enemy, naming. */
export type Intent = { add: 'spawn'; kind?: Kind } | { add: 'trigger' } | { add: 'enemy' } | { add: 'name' }

const KIND_ICON: Record<Kind | 'trigger', LucideIcon> = {
  enemy: SkullIcon,
  npc: UserIcon,
  smashable: BoxIcon,
  buildie: HammerIcon,
  interactable: HandIcon,
  bouncer: ArrowBigUpDashIcon,
  trigger: RectangleVerticalIcon,
}

/** A world's folders by kind (interactables only when there are some). */
const KIND_FOLDERS: [Kind, string, string][] = [
  ['enemy', 'Enemies', 'enemy'],
  ['npc', 'NPCs', 'NPC'],
  ['smashable', 'Smashables', 'smashable'],
  ['buildie', 'Buildables', 'buildable'],
  ['bouncer', 'Bouncers', 'bouncer'],
  ['interactable', 'Interactables', 'interactable'],
]

export const worldName = (w: Worlds, pf: number, fallback?: string | null) => w.playfields.find((p) => p.id === pf)?.name ?? fallback ?? `Playfield ${pf}`

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "3/12" done of all, for a folder of things that can need work. */
function progress(kids: TNode[]) {
  // (through group folders, whose children are built already)
  const counted = kids.flatMap((k) => (k.status ? [k] : Array.isArray(k.children) ? k.children : [])).filter((k) => k.status)
  return counted.length ? `${counted.filter((k) => k.status === 'done').length}/${counted.length}` : undefined
}

function Badge({ children, className = '', title }: { children: string; className?: string; title?: string }) {
  return (
    <span title={title} className={`shrink-0 rounded-sm px-1 text-[11px] leading-4 ${className}`}>
      {children}
    </span>
  )
}

const CATEGORY_CLASS: Record<string, string> = {
  guessed: 'bg-warn-bg text-warn',
  surveyed: 'bg-emerald-500/15 text-ok',
  live: 'bg-secondary text-muted-foreground',
  demo: 'bg-secondary text-muted-foreground',
  client: 'bg-secondary text-muted-foreground',
}

function menu(env: Env, items: (MenuItem | false | null | undefined)[], target?: Target): () => MenuItem[] {
  return () => {
    const list = items.filter((m): m is MenuItem => !!m)
    if (target) {
      const label = pasteLabel(env.clip, target)
      list.unshift({ label: label ?? 'Paste', run: () => env.clip && env.paste(env.clip, target), disabled: !label, shortcut: 'Ctrl+V' })
    }
    return list
  }
}

/** A spawn or trigger wall. `parent`: where a paste on it goes (its folder). */
function objectNode(env: Env, key: string, o: SurveyObject, pf: number, w: WorldData, parent?: Target): TNode {
  const { ctx } = env
  const here = ctx.state.playfield === pf
  const hidden = here && (ctx.state.hidden.includes(o.id) || inHiddenWave(o, ctx.state.shown_waves, w.notes.scripts))
  const d = here ? distance(o.pos, ctx.state.pos) : null
  const copy = (): Clip => ({ t: 'objects', from: pf, items: [o] })
  return {
    key,
    label: o.name || (o.kind === 'trigger' ? 'trigger wall' : o.kind),
    icon: KIND_ICON[o.kind],
    sel: { t: 'object', pf, id: o.id },
    status: o.category === 'guessed' ? 'todo' : undefined,
    title: o.category === 'guessed' ? 'A guess: confirm, fix or delete it' : `${o.category} ${o.kind} · ${o.id}`,
    tags: o.tags,
    badges: (
      <>
        {o.category !== 'surveyed' && <Badge className={CATEGORY_CLASS[o.category]}>{o.category}</Badge>}
        {o.feature && o.feature !== 'live' && (
          <Badge className="bg-primary/10 text-primary" title={o.feature}>
            {o.feature.split('/').pop()!}
          </Badge>
        )}
      </>
    ),
    aside: d === null ? undefined : d < 1000 ? `${d.toFixed(0)} m` : 'far',
    dim: hidden,
    shown: here ? !hidden : undefined,
    toggleShown: here
      ? () => {
          if (inHiddenWave(o, ctx.state.shown_waves, w.notes.scripts) && o.wave) ctx.run(() => ctx.backend.showWave(ctx.account, o.wave!.script, o.wave!.wave))
          else ctx.run(() => ctx.backend.hide(ctx.account, [o.id], !hidden))
        }
      : undefined,
    copy,
    target: parent,
    menu: menu(
      env,
      [
        { label: 'Copy', run: () => env.copy(copy()), shortcut: 'Ctrl+C' },
        here && { label: 'Go to it', run: () => ctx.run(() => ctx.backend.teleport(ctx.account, o.pos)), separator: true },
        here && { label: hidden ? 'Show in game' : 'Hide in game', run: () => ctx.run(() => ctx.backend.hide(ctx.account, [o.id], !hidden)) },
        editable(o.category) && o.kind !== 'buildie' && { label: o.category === 'guessed' ? 'Delete (the guess is wrong)' : 'Delete', danger: true, run: () => env.remove(o), separator: true },
      ],
      parent,
    ),
  }
}

/** Spawns/: a folder per world that has anything in it (or was added by hand). */
function spawnsTab(env: Env): TNode[] {
  const { worlds, ctx } = env
  const here = ctx.state.playfield
  const ids = new Set<number>([...(here >= 0 ? [here] : []), ...env.pinned])
  for (const p of worlds.playfields) if (p.base + p.placements + p.triggers + p.scripts + p.notes > 0) ids.add(p.id)
  for (const pf of Object.keys(worlds.data)) ids.add(Number(pf))
  return [...ids]
    .sort((a, b) => Number(b === here) - Number(a === here) || worldName(worlds, a).localeCompare(worldName(worlds, b)))
    .map((pf) => worldNode(env, pf))
}

function worldNode(env: Env, pf: number): TNode {
  const { worlds, ctx } = env
  const info = worlds.playfields.find((p) => p.id === pf)
  const w = worlds.data[pf]
  const key = `w:${pf}`
  const target: Target = { t: 'world', pf }
  const here = ctx.state.playfield === pf
  return {
    key,
    label: worldName(worlds, pf, here ? ctx.state.playfield_name : null),
    detail: here ? 'you are here' : undefined,
    icon: GlobeIcon,
    sel: { t: 'world', pf },
    count: w ? w.objects.length : info ? info.base + info.placements + info.triggers : undefined,
    onOpen: () => worlds.ensure(pf),
    target,
    menu: menu(
      env,
      [
        { label: 'New spawn…', run: () => env.add(key, { t: 'world', pf }, { add: 'spawn' }), separator: true },
        { label: 'New trigger…', run: () => env.add(key, { t: 'world', pf }, { add: 'trigger' }) },
        { label: 'New script', run: () => env.add(key, { t: 'folder', kind: 'world-scripts', pf }, { add: 'name' }) },
      ],
      target,
    ),
    children: () => (w ? worldKids(env, pf, w, key) : [{ key: `${key}/loading`, label: 'loading…', icon: FileTextIcon, dim: true }]),
  }
}

/** Walls whose action is a script's or a location's show there, the rest in their world. */
function wallHome(o: SurveyObject): 'script' | 'discover' | 'collect' | 'world' {
  const a = o.action
  if (a && typeof a === 'object' && 'script' in a && a.script.script) return 'script'
  if (a && typeof a === 'object' && 'discover' in a && a.discover.name) return 'discover'
  if (a && typeof a === 'object' && 'collect' in a && a.collect.drop) return 'collect'
  return 'world'
}

function worldKids(env: Env, pf: number, w: WorldData, key: string): TNode[] {
  const { ctx } = env
  const here = ctx.state.playfield === pf
  const target: Target = { t: 'world', pf }
  const out: TNode[] = []
  out.push({
      key: `${key}/scripts`,
      label: 'scripts',
      icon: FolderIcon,
      sel: { t: 'folder', kind: 'world-scripts', pf },
      count: w.notes.scripts.length,
      dim: !w.notes.scripts.length,
      target,
      menu: menu(env, [{ label: 'New script', run: () => env.add(`${key}/scripts`, { t: 'folder', kind: 'world-scripts', pf }, { add: 'name' }) }], target),
      children: w.notes.scripts.map((s) => ({
        key: `${key}/scripts/${s.id}`,
        label: s.name || 'script',
        detail: plural(s.waves.length, 'wave'),
        icon: LinkIcon,
        title: 'Open it in Scripts',
        tags: s.tags,
        sel: { t: 'script', pf, id: s.id },
        menu: menu(env, [{ label: 'Open in Scripts', run: () => env.reveal(`s:${pf}:${s.id}`, 'scripts') }]),
      })),
    })
  const ownWalls = w.objects.filter((o) => o.kind === 'trigger' && wallHome(o) === 'world' && env.keep(o, pf))
  out.push({
      key: `${key}/triggers`,
      label: 'triggers',
      icon: FolderIcon,
      sel: { t: 'folder', kind: 'world-triggers', pf },
      count: ownWalls.length,
      dim: !ownWalls.length,
      target,
      menu: menu(env, [{ label: 'New trigger…', run: () => env.add(`${key}/triggers`, { t: 'folder', kind: 'world-triggers', pf }, { add: 'trigger' }) }], target),
      children: ownWalls.map((o) => objectNode(env, `${key}/triggers/${o.id}`, o, pf, w, target)),
    })
  if (w.notes.notes.length)
    out.push({
      key: `${key}/notes`,
      label: 'notes',
      icon: FolderIcon,
      sel: { t: 'folder', kind: 'world-notes', pf },
      count: w.notes.notes.length,
      children: w.notes.notes.map((n) => ({
        key: `${key}/notes/${n.id}`,
        label: n.reference || n.comment.split('\n')[0].slice(0, 60) || n.kind.replace('_', ' '),
        detail: n.kind.replace('_', ' '),
        icon: BookOpenIcon,
        tags: n.tags,
        status: n.status === 'unreviewed' ? undefined : n.status === 'accepted' ? 'done' : undefined,
        sel: { t: 'note', pf, id: n.id },
      })),
    })
  const atStart = w.objects
    .filter((o) => o.kind !== 'trigger' && !o.wave && env.keep(o, pf))
    .map((o) => ({ o, d: here ? distance(o.pos, ctx.state.pos) : 0 }))
    .sort((a, b) => a.d - b.d || a.o.name.localeCompare(b.o.name))
    .map((x) => x.o)
  for (const [kind, label, one] of KIND_FOLDERS) {
    const list = atStart.filter((o) => o.kind === kind)
    if (!list.length && kind === 'interactable') continue
    const k = `${key}/${kind}`
    const sel: Sel = { t: 'folder', kind: 'world-kind', pf, id: kind }
    const guesses = list.filter((o) => o.category === 'guessed').length
    out.push({
      key: k,
      label,
      icon: FolderIcon,
      sel,
      count: list.length,
      dim: !list.length,
      aside: guesses ? `${guesses} to check` : undefined,
      target,
      menu: menu(env, [{ label: `New ${one}…`, run: () => env.add(k, sel, { add: 'spawn', kind }) }], target),
      children: () => list.map((o) => objectNode(env, `${k}/${o.id}`, o, pf, w, target)),
    })
  }
  return out
}

/** Scripts/: every script of every loaded world (the surveyor's world first). */
function scriptsTab(env: Env): TNode[] {
  const { worlds, ctx } = env
  const out: { pf: number; s: Script }[] = []
  for (const [pf, w] of Object.entries(worlds.data)) for (const s of w.notes.scripts) out.push({ pf: Number(pf), s })
  const here = ctx.state.playfield
  return out
    .sort((a, b) => Number(b.pf === here) - Number(a.pf === here) || worldName(worlds, a.pf).localeCompare(worldName(worlds, b.pf)) || a.s.name.localeCompare(b.s.name))
    .map(({ pf, s }) => scriptNode(env, pf, s))
}

export function scriptNode(env: Env, pf: number, s: Script): TNode {
  const { worlds, ctx } = env
  const w = worlds.data[pf]
  const key = `s:${pf}:${s.id}`
  const objects = w?.objects ?? []
  const starts = objects.filter((o) => o.kind === 'trigger' && wallHome(o) === 'script' && typeof o.action === 'object' && 'script' in o.action && o.action.script.script === s.id)
  const waves = s.waves.map((wave, i) => {
    const wk = `${key}/waves/${wave.id}`
    const spawned = objects.filter((o) => o.wave?.script === s.id && o.wave.wave === wave.id)
    const shown = ctx.state.playfield === pf && (s.waves.length < 2 || (ctx.state.shown_waves[s.id] ?? s.waves[0].id) === wave.id || ctx.state.shown_waves[s.id] === 'all')
    const target: Target = { t: 'wave', pf, script: s, wave: wave.id }
    const copy = (): Clip => ({ t: 'wave', from: pf, script: s, wave, items: spawned })
    return {
      key: wk,
      label: wave.name || `wave ${i + 1}`,
      icon: WavesIcon,
      sel: { t: 'wave', pf, script: s.id, wave: wave.id } as Sel,
      status: spawned.length ? 'done' : 'todo',
      title: spawned.length ? undefined : 'Nothing spawns in this wave yet',
      tags: wave.tags,
      count: spawned.length,
      shown: ctx.state.playfield === pf ? shown : undefined,
      toggleShown: ctx.state.playfield === pf && s.waves.length > 1 ? () => ctx.run(() => ctx.backend.showWave(ctx.account, s.id, shown ? 'all' : wave.id)) : undefined,
      copy,
      target,
      menu: menu(
        env,
        [
          { label: 'Copy wave', run: () => env.copy(copy()), shortcut: 'Ctrl+C' },
          { label: 'New spawn in this wave…', run: () => env.add(wk, { t: 'wave', pf, script: s.id, wave: wave.id }, { add: 'spawn' }), separator: true },
        ],
        target,
      ),
      children: () => spawned.filter((o) => env.keep(o, pf)).map((o) => objectNode(env, `${wk}/${o.id}`, o, pf, w, target)),
    } satisfies TNode
  })
  const scriptTarget: Target = { t: 'script', pf, script: s }
  const trigTarget: Target = { t: 'script-triggers', pf, script: s }
  const copy = (): Clip => ({ t: 'script', from: pf, script: s, items: objects.filter((o) => o.wave?.script === s.id) })
  return {
    key,
    label: s.name || 'script',
    detail: worldName(worlds, pf),
    icon: ScrollTextIcon,
    sel: { t: 'script', pf, id: s.id },
    status: s.waves.length && waves.every((x) => x.status === 'done') ? 'done' : 'todo',
    title: waves.some((x) => x.status === 'todo') ? 'A wave spawns nothing yet' : undefined,
    tags: s.tags,
    copy,
    target: scriptTarget,
    menu: menu(
      env,
      [
        { label: 'Copy script', run: () => env.copy(copy()), shortcut: 'Ctrl+C' },
        { label: 'New wave', run: () => env.add(`${key}/waves`, { t: 'folder', kind: 'waves', pf, id: s.id }, { add: 'name' }), separator: true },
        { label: 'New trigger that starts it…', run: () => env.add(`${key}/triggers`, { t: 'folder', kind: 'script-triggers', pf, id: s.id }, { add: 'trigger' }) },
      ],
      scriptTarget,
    ),
    children: [
      {
        key: `${key}/triggers`,
        label: 'triggers',
        icon: FolderIcon,
        detail: starts.length ? undefined : 'optional',
        title: 'Trigger walls that start it (the server may start it otherwise)',
        sel: { t: 'folder', kind: 'script-triggers', pf, id: s.id },
        count: starts.length,
        target: trigTarget,
        menu: menu(env, [{ label: 'New trigger that starts it…', run: () => env.add(`${key}/triggers`, { t: 'folder', kind: 'script-triggers', pf, id: s.id }, { add: 'trigger' }) }], trigTarget),
        children: starts.filter((o) => env.keep(o, pf)).map((o) => objectNode(env, `${key}/triggers/${o.id}`, o, pf, w!, trigTarget)),
      },
      {
        key: `${key}/waves`,
        label: 'waves',
        icon: FolderIcon,
        sel: { t: 'folder', kind: 'waves', pf, id: s.id },
        aside: progress(waves),
        target: scriptTarget,
        menu: menu(env, [{ label: 'New wave', run: () => env.add(`${key}/waves`, { t: 'folder', kind: 'waves', pf, id: s.id }, { add: 'name' }) }], scriptTarget),
        children: waves,
      },
    ],
  }
}

/** Achievements/: Smash/, Collect/, Discover/ (every one of them, marked when it needs work), and the enemy Categories/ they can use. */
function achievementsTab(env: Env): TNode[] {
  const smash = ruleKids(env, env.worlds.smash.filter((a) => a.kind === 'counter' || a.kind === 'defeat'), 'a/smash')
  const collect = collectKids(env)
  const discover = discoverKids(env)
  const categories = categoryKids(env)
  return [
    {
      key: 'a/smash',
      label: 'Smash',
      icon: SwordsIcon,
      sel: { t: 'folder', kind: 'smash' },
      aside: progress(smash),
      title: 'Achievements for smashing enemies: which enemies count toward each',
      children: smash,
    },
    {
      key: 'a/collect',
      label: 'Collect',
      icon: GemIcon,
      sel: { t: 'folder', kind: 'collect' },
      aside: progress(collect),
      title: 'Collectibles and mission items: the enemies that drop them, the places that give them',
      menu: menu(env, [{ label: 'New drop…', run: () => env.add('a/collect', { t: 'folder', kind: 'collect' }, { add: 'name' }) }]),
      children: collect,
    },
    {
      key: 'a/discover',
      label: 'Discover',
      icon: FlagIcon,
      sel: { t: 'folder', kind: 'discover' },
      aside: progress(discover),
      title: 'Exploration achievements: an area of the client, or a trigger wall, at each location discovers it',
      children: discover,
    },
    {
      key: 'a/categories',
      label: 'Categories',
      icon: ListIcon,
      sel: { t: 'folder', kind: 'categories' },
      count: categories.length,
      title: 'Your own groups of enemies (from live), for achievements and drops: @name',
      menu: menu(env, [{ label: 'New category…', run: () => env.add('a/categories', { t: 'folder', kind: 'categories' }, { add: 'name' }) }]),
      children: categories,
    },
  ]
}

/**
 * The enemies the game data counts toward an achievement without a rule: a boss by name, every
 * enemy whose name has the counted part ("Witch": Swamp Witch, ...), or every one ("all").
 */
export function implied(a: SmashAchievement, names: EnemyName[], catalog: Placeable[]): string[] | 'all' {
  if (a.kind === 'defeat') return a.match ? [a.match] : []
  if (a.kind !== 'counter') return []
  if (!a.match) return 'all'
  const m = a.match.toLowerCase()
  const pool = names.length ? names.map((n) => n.name) : catalog.filter((p) => p.kind === 'enemy' || p.kind === 'smashable').map((p) => p.name)
  return [...new Set(pool.filter((n) => n.toLowerCase().includes(m)))].sort()
}

const ruleOf = (env: Env, a: SmashAchievement) => a.rule ?? env.worlds.rules[a.key] ?? null

/** An enemy (or `@category`) of a rule. */
function enemyNode(env: Env, ruleKey: string, key: string, name: string, enemies: string[], target: Target): TNode {
  const cat = name.startsWith('@')
  const rule = env.worlds.rules[ruleKey]
  return {
    key: `${key}/${name}`,
    label: cat ? name.slice(1) : name,
    icon: cat ? ListIcon : SkullIcon,
    detail: cat ? `category · ${env.worlds.rules[categoryKey(name.slice(1))]?.enemies.length ?? 0} enemies` : undefined,
    sel: { t: 'enemy', key: ruleKey, name },
    copy: () => ({ t: 'enemies', names: [name] }),
    target,
    menu: menu(
      env,
      [
        { label: 'Copy', run: () => env.copy({ t: 'enemies', names: [name] }), shortcut: 'Ctrl+C' },
        cat && { label: 'Open the category', run: () => env.reveal(`a/categories/${categoryKey(name.slice(1))}`, 'achievements') },
        { label: 'Remove', danger: true, separator: true, run: () => env.worlds.saveRule(ruleKey, { ...(rule ?? {}), enemies: enemies.filter((e) => e !== name) }) },
      ],
      target,
    ),
  }
}

/** Smash achievements (or collectibles): their enemies, the game data's when there's no rule. */
function ruleKids(env: Env, list: SmashAchievement[], base: string, extra?: (a: SmashAchievement, key: string) => { kids: TNode[]; done: boolean }): TNode[] {
  const { worlds, ctx } = env
  const leaf = (a: SmashAchievement): TNode => {
    const rule = ruleOf(env, a)
    const enemies = rule?.enemies ?? []
    const key = `${base}/${a.key}`
    const target: Target = { t: 'rule', key: a.key, enemies, collect: a.kind === 'collect' }
    const copy = (): Clip => ({ t: 'enemies', names: enemies })
    const fromData = enemies.length ? [] : implied(a, worlds.enemyNames, ctx.catalog)
    const more = extra?.(a, key)
    const done = enemies.length > 0 || fromData === 'all' || fromData.length > 0 || !!more?.done
    const dataKids: TNode[] =
      fromData === 'all'
        ? [{ key: `${key}/all`, label: a.what === 'smashes' ? 'every smashable' : 'every enemy', icon: SkullIcon, dim: true, sel: { t: 'smash', key: a.key }, badges: <Badge className={CATEGORY_CLASS.client}>game data</Badge> }]
        : fromData.map((n) => ({ key: `${key}/data/${n}`, label: n, icon: SkullIcon, dim: true, sel: { t: 'smash', key: a.key } as Sel, title: 'Counted by the game data (no rule yet): choose enemies to change it', badges: <Badge className={CATEGORY_CLASS.client}>game data</Badge> }))
    return {
      key,
      label: a.title,
      detail: a.kind === 'defeat' ? 'once' : a.n ? `×${a.n}` : undefined,
      icon: a.kind === 'collect' ? GemIcon : TrophyIcon,
      sel: { t: 'smash', key: a.key },
      status: done ? 'done' : 'todo',
      title: `${a.text}${a.minifigures ? ` (each of ${a.minifigures} minifigures)` : ''}${done ? '' : ' · nothing counts toward it yet'}`,
      tags: rule?.tags,
      count: (enemies.length || dataKids.length) + (more?.kids.length ?? 0),
      copy: enemies.length ? copy : undefined,
      target,
      menu: menu(
        env,
        [
          enemies.length > 0 && { label: 'Copy enemies', run: () => env.copy(copy()), shortcut: 'Ctrl+C' },
          { label: 'Add enemy…', run: () => env.add(key, { t: 'smash', key: a.key }, { add: 'enemy' }), separator: true },
          a.kind === 'collect' && { label: 'New trigger that gives it…', run: () => env.add(key, { t: 'smash', key: a.key }, { add: 'trigger' }) },
        ],
        target,
      ),
      children: [...(more?.kids ?? []), ...(enemies.length ? enemies.map((n) => enemyNode(env, a.key, key, n, enemies, target)) : dataKids)],
    }
  }
  const groups = new Map<string, SmashAchievement[]>()
  for (const a of list) groups.set(a.group ?? 'Other', [...(groups.get(a.group ?? 'Other') ?? []), a])
  // one level per achievement group (world or minifigure category), when there are several
  if (groups.size < 2) return list.map(leaf)
  return [...groups].map(([g, l]) => {
    const kids = l.map(leaf)
    return { key: `${base}/g:${g}`, label: g, icon: FolderIcon, aside: progress(kids), children: kids }
  })
}

/** The walls of every loaded world whose action is `home`'s. */
function wallsWhere(env: Env, test: (o: SurveyObject) => boolean) {
  const out: { o: SurveyObject; pf: number }[] = []
  for (const [pf, w] of Object.entries(env.worlds.data)) for (const o of w.objects) if (o.kind === 'trigger' && test(o)) out.push({ o, pf: Number(pf) })
  return out
}

/** Collect/: the collectible achievements and the drops editors named; enemies and walls give them. */
function collectKids(env: Env): TNode[] {
  const { worlds } = env
  const gives = (key: string) => (o: SurveyObject) => typeof o.action === 'object' && 'collect' in o.action && o.action.collect.drop === key
  const triggers = (ruleKey: string, key: string) => {
    const found = wallsWhere(env, gives(ruleKey))
    const target: Target = { t: 'rule', key: ruleKey, enemies: worlds.rules[ruleKey]?.enemies ?? [], collect: true }
    const node: TNode = {
      key: `${key}/triggers`,
      label: 'triggers',
      icon: FolderIcon,
      sel: { t: 'smash', key: ruleKey },
      count: found.length,
      dim: !found.length,
      title: 'Trigger walls that give it (a place to find it)',
      target,
      menu: menu(env, [{ label: 'New trigger that gives it…', run: () => env.add(key, { t: 'smash', key: ruleKey }, { add: 'trigger' }) }], target),
      children: found.filter(({ o, pf }) => env.keep(o, pf)).map(({ o, pf }) => objectNode(env, `${key}/triggers/${o.id}`, o, pf, worlds.data[pf], target)),
    }
    return { kids: [node], done: found.length > 0 }
  }
  const collectibles = ruleKids(env, worlds.smash.filter((a) => a.kind === 'collect'), 'a/collect', (a, key) => triggers(a.key, key))
  const drops: SmashAchievement[] = Object.values(worlds.rules)
    .filter((r) => r.id.startsWith('drop:'))
    .map((r) => ({ key: r.id, ids: [], title: r.id.slice(5), text: r.comment, group: 'Drops', kind: 'drop', what: null, match: null, n: 0, minifigures: 0, rule: r }))
  const dropKids = ruleKids(env, drops, 'a/collect', (a, key) => triggers(a.key, key)).map((n) => ({ ...n, icon: GemIcon, detail: n.sel?.t === 'smash' && worlds.rules[(n.sel as { key: string }).key]?.once ? 'one each' : n.detail }))
  return [...collectibles, ...dropKids]
}

/** Categories/: named groups of enemies (`@name` in a rule). */
function categoryKids(env: Env): TNode[] {
  return Object.values(env.worlds.rules)
    .filter((r) => r.id.startsWith('category:'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => {
      const key = `a/categories/${r.id}`
      const target: Target = { t: 'rule', key: r.id, enemies: r.enemies }
      const used = Object.values(env.worlds.rules).filter((x) => x.enemies.includes(`@${r.id.slice(9)}`)).length
      return {
        key,
        label: r.id.slice(9),
        detail: used ? `used by ${used}` : undefined,
        icon: ListIcon,
        sel: { t: 'smash', key: r.id } as Sel,
        status: r.enemies.length ? 'done' : 'todo',
        tags: r.tags,
        count: r.enemies.length,
        copy: () => ({ t: 'enemies', names: r.enemies }),
        target,
        menu: menu(
          env,
          [
            { label: 'Copy enemies', run: () => env.copy({ t: 'enemies', names: r.enemies }), shortcut: 'Ctrl+C', disabled: !r.enemies.length },
            { label: 'Copy as @category', run: () => env.copy({ t: 'enemies', names: [`@${r.id.slice(9)}`] }) },
            { label: 'Add enemy…', run: () => env.add(key, { t: 'smash', key: r.id }, { add: 'enemy' }), separator: true },
          ],
          target,
        ),
        children: r.enemies.map((n) => enemyNode(env, r.id, key, n, r.enemies, target)),
      } satisfies TNode
    })
}

function discoverKids(env: Env): TNode[] {
  const { worlds, targets } = env
  if (!targets) return []
  const byId = new Map(targets.achievements.map((a) => [a.id, a]))
  const walls = wallsWhere(env, (o) => wallHome(o) === 'discover')
  const byWorld = new Map<number, TNode[]>()
  for (const l of targets.locations) {
    const key = `a/discover/${l.playfield}:${l.name}`
    const found = walls.filter(({ o, pf }) => pf === l.playfield && typeof o.action === 'object' && 'discover' in o.action && o.action.discover.name === l.name)
    const achs = l.achievements.map((id) => byId.get(id)).filter((a) => !!a)
    const rule = worlds.rules[findKey(l.playfield, l.name)]
    const target: Target = { t: 'location', pf: l.playfield, name: l.name, achievement: l.achievements.length === 1 ? String(l.achievements[0]) : null }
    const sel: Sel = { t: 'location', pf: l.playfield, name: l.name }
    // the client's own exploration area (the game discovers it there)
    const area: TNode[] = l.pos
      ? [{ key: `${key}/triggers/client`, label: 'exploration area', icon: MapIcon, dim: true, sel, title: "The client's exploration area: walking in discovers it", badges: <Badge className={CATEGORY_CLASS.client}>client</Badge> }]
      : []
    const newTrigger = { label: 'New trigger that discovers it…', run: () => env.add(key, sel, { add: 'trigger' }) }
    const node: TNode = {
      key,
      label: l.title || l.name.replace(/^(Achievement_|BA_Explore_|Explore_)/, '').replace(/_/g, ' '),
      detail: achs.map((a) => a!.title || a!.name).join(', ') || undefined,
      icon: MapPinIcon,
      sel,
      status: found.length || l.pos ? 'done' : 'todo',
      title: `${l.name}${found.length || l.pos ? '' : ' · nothing discovers it yet (no client area, no trigger)'}`,
      tags: rule?.tags,
      count: found.length + area.length,
      target,
      menu: menu(env, [newTrigger], target),
      children: [
        {
          key: `${key}/triggers`,
          label: 'triggers',
          icon: FolderIcon,
          sel: { t: 'folder', kind: 'location-triggers', pf: l.playfield, name: l.name },
          count: found.length + area.length,
          target,
          menu: menu(env, [newTrigger], target),
          children: [...area, ...found.filter(({ o, pf }) => env.keep(o, pf)).map(({ o, pf }) => objectNode(env, `${key}/triggers/${o.id}`, o, pf, worlds.data[pf], target))],
        },
      ],
    }
    byWorld.set(l.playfield, [...(byWorld.get(l.playfield) ?? []), node])
  }
  return [...byWorld]
    .sort((a, b) => worldName(worlds, a[0]).localeCompare(worldName(worlds, b[0])))
    .map(([pf, kids]) => ({ key: `a/discover/w:${pf}`, label: worldName(worlds, pf, targets.locations.find((l) => l.playfield === pf)?.playfield_name), icon: GlobeIcon, aside: progress(kids), children: kids }))
}

export function buildTab(env: Env, tab: Tab): TNode[] {
  return tab === 'spawns' ? spawnsTab(env) : tab === 'scripts' ? scriptsTab(env) : achievementsTab(env)
}

/**
 * Only the rows `match` keeps, with the folders leading to them (opened, `forced`). A folder
 * whose own name matches keeps all it holds.
 */
export function filterTree(nodes: TNode[], match: (n: TNode) => boolean, forced: Set<string>): TNode[] {
  const out: TNode[] = []
  for (const n of nodes) {
    if (!n.children) {
      if (match(n)) out.push(n)
      continue
    }
    if (match(n) && !n.status) {
      out.push(n)
      continue
    }
    const kids = filterTree(kidsOf(n), match, forced)
    if (kids.length) {
      forced.add(n.key)
      out.push({ ...n, children: kids })
    } else if (match(n)) out.push(n)
  }
  return out
}

/** Every row of a tree, depth first (finding one by key or by what it is). */
export function* allRows(nodes: TNode[]): Generator<TNode> {
  for (const n of nodes) {
    yield n
    if (n.children) yield* allRows(kidsOf(n))
  }
}
