// The tree's contents for each tab, built from every loaded world:
//
//   Spawns/        {world}/ scripts/ (links) · triggers/ · notes/ · what spawns at start
//   Scripts/       {script}/ triggers/ · waves/ {wave}/ what it spawns
//   Achievements/  Smash/ {achievement}/ {enemy} · Discover/ {location}/ triggers/
//
// Every smash achievement and discover location is listed; those that still need work (no
// enemies, no trigger) are marked.

import {
  BookOpenIcon,
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
import { editable, findKey, type Kind, type Script, type SurveyObject, type TriggerTargets } from './types'

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
}

const KIND_ICON: Record<Kind | 'trigger', LucideIcon> = {
  enemy: SkullIcon,
  npc: UserIcon,
  smashable: BoxIcon,
  buildie: HammerIcon,
  interactable: HandIcon,
  trigger: RectangleVerticalIcon,
}

const KIND_FOLDERS: [Kind, string][] = [
  ['enemy', 'Enemies'],
  ['npc', 'NPCs'],
  ['smashable', 'Smashables'],
  ['buildie', 'Buildies'],
  ['interactable', 'Interactables'],
]

/** More spawns at start than this: they go in folders by kind. */
const KIND_FOLDERS_FROM = 25

export const worldName = (w: Worlds, pf: number, fallback?: string | null) => w.playfields.find((p) => p.id === pf)?.name ?? fallback ?? `Playfield ${pf}`

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "3/12" done of all, for a folder of things that can need work. */
function progress(kids: TNode[]) {
  const counted = kids.filter((k) => k.status)
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
    menu: menu(env, [], target),
    children: () => (w ? worldKids(env, pf, w, key) : [{ key: `${key}/loading`, label: 'loading…', icon: FileTextIcon, dim: true }]),
  }
}

/** Walls whose action is a script's or a location's show there, the rest in their world. */
function wallHome(o: SurveyObject): 'script' | 'discover' | 'world' {
  const a = o.action
  if (a && typeof a === 'object' && 'script' in a && a.script.script) return 'script'
  if (a && typeof a === 'object' && 'discover' in a && a.discover.name) return 'discover'
  return 'world'
}

function worldKids(env: Env, pf: number, w: WorldData, key: string): TNode[] {
  const { ctx } = env
  const here = ctx.state.playfield === pf
  const target: Target = { t: 'world', pf }
  const out: TNode[] = []
  if (w.notes.scripts.length)
    out.push({
      key: `${key}/scripts`,
      label: 'scripts',
      icon: FolderIcon,
      sel: { t: 'folder', kind: 'world-scripts', pf },
      count: w.notes.scripts.length,
      target,
      menu: menu(env, [], target),
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
  if (ownWalls.length)
    out.push({
      key: `${key}/triggers`,
      label: 'triggers',
      icon: FolderIcon,
      sel: { t: 'folder', kind: 'world-triggers', pf },
      count: ownWalls.length,
      target,
      menu: menu(env, [], target),
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
  if (atStart.length > KIND_FOLDERS_FROM) {
    for (const [kind, label] of KIND_FOLDERS) {
      const list = atStart.filter((o) => o.kind === kind)
      if (!list.length) continue
      const k = `${key}/${kind}`
      out.push({
        key: k,
        label,
        icon: FolderIcon,
        sel: { t: 'folder', kind: 'world-kind', pf, id: kind },
        count: list.length,
        aside: list.some((o) => o.category === 'guessed') ? `${list.filter((o) => o.category === 'guessed').length} guesses` : undefined,
        target,
        menu: menu(env, [], target),
        children: () => list.map((o) => objectNode(env, `${k}/${o.id}`, o, pf, w, target)),
      })
    }
  } else out.push(...atStart.map((o) => objectNode(env, `${key}/${o.id}`, o, pf, w, target)))
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
      menu: menu(env, [{ label: 'Copy wave', run: () => env.copy(copy()), shortcut: 'Ctrl+C' }], target),
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
    menu: menu(env, [{ label: 'Copy script', run: () => env.copy(copy()), shortcut: 'Ctrl+C' }], scriptTarget),
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
        menu: menu(env, [], trigTarget),
        children: starts.filter((o) => env.keep(o, pf)).map((o) => objectNode(env, `${key}/triggers/${o.id}`, o, pf, w!, trigTarget)),
      },
      {
        key: `${key}/waves`,
        label: 'waves',
        icon: FolderIcon,
        sel: { t: 'folder', kind: 'waves', pf, id: s.id },
        aside: progress(waves),
        target: scriptTarget,
        menu: menu(env, [], scriptTarget),
        children: waves,
      },
    ],
  }
}

/** Achievements/: Smash/ and Discover/, every one of them, marked when it needs work. */
function achievementsTab(env: Env): TNode[] {
  const smash = smashKids(env)
  const discover = discoverKids(env)
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
      key: 'a/discover',
      label: 'Discover',
      icon: FlagIcon,
      sel: { t: 'folder', kind: 'discover' },
      aside: progress(discover),
      title: 'Exploration achievements: a trigger wall at each location discovers it',
      children: discover,
    },
  ]
}

function smashKids(env: Env): TNode[] {
  const { worlds } = env
  const groups = new Map<string, typeof worlds.smash>()
  for (const a of worlds.smash) groups.set(a.group ?? 'Other', [...(groups.get(a.group ?? 'Other') ?? []), a])
  const leaf = (a: (typeof worlds.smash)[number]): TNode => {
    const rule = a.rule ?? worlds.rules[a.key] ?? null
    const enemies = rule?.enemies ?? []
    const key = `a/smash/${a.key}`
    const target: Target = { t: 'smash', key: a.key, enemies }
    const copy = (): Clip => ({ t: 'enemies', names: enemies })
    return {
      key,
      label: a.title,
      detail: a.kind === 'defeat' ? 'once' : `×${a.n}`,
      icon: TrophyIcon,
      sel: { t: 'smash', key: a.key },
      status: enemies.length ? 'done' : 'todo',
      title: `${a.text}${a.minifigures ? ` (each of ${a.minifigures} minifigures)` : ''}${enemies.length ? '' : ' · no enemies chosen yet'}`,
      tags: rule?.tags,
      count: enemies.length,
      copy: enemies.length ? copy : undefined,
      target,
      menu: menu(env, [enemies.length > 0 && { label: 'Copy enemies', run: () => env.copy(copy()), shortcut: 'Ctrl+C' }], target),
      children: enemies.map((name) => ({
        key: `${key}/${name}`,
        label: name,
        icon: SkullIcon,
        sel: { t: 'enemy', key: a.key, name },
        copy: () => ({ t: 'enemies', names: [name] }),
        target,
        menu: menu(
          env,
          [
            { label: 'Copy', run: () => env.copy({ t: 'enemies', names: [name] }), shortcut: 'Ctrl+C' },
            { label: 'Remove from this achievement', danger: true, separator: true, run: () => worlds.saveRule(a.key, { ...(rule ?? {}), enemies: enemies.filter((e) => e !== name) }) },
          ],
          target,
        ),
      })),
    }
  }
  // one level per achievement group (world or minifigure category), when there are several
  if (groups.size < 2) return worlds.smash.map(leaf)
  return [...groups].map(([g, list]) => {
    const kids = list.map(leaf)
    return { key: `a/smash/g:${g}`, label: g, icon: FolderIcon, aside: progress(kids), children: kids }
  })
}

function discoverKids(env: Env): TNode[] {
  const { worlds, targets } = env
  if (!targets) return []
  const byId = new Map(targets.achievements.map((a) => [a.id, a]))
  const walls: { o: SurveyObject; pf: number }[] = []
  for (const [pf, w] of Object.entries(worlds.data)) for (const o of w.objects) if (o.kind === 'trigger' && wallHome(o) === 'discover') walls.push({ o, pf: Number(pf) })
  const byWorld = new Map<number, TNode[]>()
  for (const l of targets.locations) {
    const key = `a/discover/${l.playfield}:${l.name}`
    const found = walls.filter(({ o, pf }) => pf === l.playfield && typeof o.action === 'object' && 'discover' in o.action && o.action.discover.name === l.name)
    const achs = l.achievements.map((id) => byId.get(id)).filter((a) => !!a)
    const rule = worlds.rules[findKey(l.playfield, l.name)]
    const target: Target = { t: 'location', pf: l.playfield, name: l.name, achievement: l.achievements.length === 1 ? String(l.achievements[0]) : null }
    const node: TNode = {
      key,
      label: l.title || l.name.replace(/^(Achievement_|BA_Explore_|Explore_)/, '').replace(/_/g, ' '),
      detail: achs.map((a) => a!.title || a!.name).join(', ') || undefined,
      icon: MapPinIcon,
      sel: { t: 'location', pf: l.playfield, name: l.name },
      status: found.length ? 'done' : 'todo',
      title: `${l.name}${found.length ? '' : ' · no trigger discovers it yet'}`,
      tags: rule?.tags,
      count: found.length,
      target,
      menu: menu(env, [], target),
      children: [
        {
          key: `${key}/triggers`,
          label: 'triggers',
          icon: FolderIcon,
          sel: { t: 'folder', kind: 'location-triggers', pf: l.playfield, name: l.name },
          count: found.length,
          target,
          menu: menu(env, [], target),
          children: found.filter(({ o, pf }) => env.keep(o, pf)).map(({ o, pf }) => objectNode(env, `${key}/triggers/${o.id}`, o, pf, worlds.data[pf], target)),
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
