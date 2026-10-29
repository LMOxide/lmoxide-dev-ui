import { describe, isPackage, soundName } from './catalog'
import type { AnimationCatalog, BccStates, Effect, Minifigure, MonsterData, Player, Playfield, TestCatalog } from './types'

/** One completion: what the input becomes when it is taken. */
export interface Suggestion {
  key: string
  /** what is shown */
  label: string
  /** a grey note beside it (where, what) */
  detail?: string
  /** a short category tag (sound, spell, playfield, ...) */
  kind?: string
  /** the input's whole new value */
  value: string
  /** taking it with Enter also submits (a complete command) */
  complete?: boolean
}

/** Everything the pickers and completions draw from; any part may still be loading. */
export interface GameData {
  effects: Effect[]
  playfields: Playfield[]
  minifigures: Minifigure[]
  tests: TestCatalog | null
  monsters: MonsterData[]
  animations: AnimationCatalog | null
  bccStates: BccStates | null
}

export function playfieldName(data: GameData, id: number | null | undefined): string {
  if (id === null || id === undefined) return '?'
  return data.playfields.find((p) => p.id === id)?.name ?? `playfield ${id}`
}

/** A few playfield names, then how many more. */
export function places(data: GameData, ids: number[], max = 3): string {
  const names = ids.slice(0, max).map((id) => playfieldName(data, id))
  return ids.length > max ? `${names.join(', ')} +${ids.length - max} more` : names.join(', ')
}

/** Matches by every word of `query`; earlier, word-start matches rank higher. 0 = no match. */
export function score(query: string, ...fields: string[]): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const text = fields.join(' \u0001 ').toLowerCase()
  let total = 0
  for (const w of words) {
    const at = text.indexOf(w)
    if (at < 0) return 0
    const wordStart = at === 0 || /[\s\u0001_\-\\/(.,]/.test(text[at - 1])
    total += (wordStart ? 3 : 1) + (at === 0 ? 2 : 0) + 1 / (1 + at / 50)
  }
  return total
}

export function best<T>(items: T[], query: string, fields: (t: T) => string[], limit = 12): T[] {
  return items
    .map((t) => [t, score(query, ...fields(t))] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t)
}

// ---- effect search: complete the word being typed from the catalog's vocabulary ----

interface Term {
  text: string
  kind: string
  count: number
}

/** The words worth completing in the effect search, with how many entries contain each. */
export function vocabulary(effects: Effect[], tags: string[]): Term[] {
  const terms = new Map<string, Term>()
  const add = (text: string, kind: string) => {
    const t = text.trim()
    if (t.length < 2) return
    const key = t.toLowerCase()
    const have = terms.get(key)
    if (have) have.count++
    else terms.set(key, { text: t, kind, count: 1 })
  }
  for (const e of effects) {
    const seen = new Set<string>()
    const once = (text: string | null | undefined, kind: string) => {
      if (!text) return // (some items and spells have no name)
      const k = text.toLowerCase()
      if (seen.has(k)) return
      seen.add(k)
      add(text, kind)
    }
    for (const u of e.used_by ?? []) once(u.name, u.rdb)
    if (isPackage(e)) {
      for (const s of e.sounds) once(soundName(s), 'sound')
      for (const p of e.particles) once(p.name, 'particle')
      for (const a of e.animation_attributes) once(a, 'anim attr')
      for (const h of e.code_hooks) once(h, 'hook')
      for (const t of e.timelines) once(t.name, t.type)
      // Lua calls: effect.self:camerashake{...} → camerashake
      for (const l of e.lua) for (const m of l.matchAll(/[:.]([a-z_][a-z0-9_]{3,})\s*[{(]/gi)) once(m[1], 'lua')
    } else {
      for (const x of [...e.emitters, ...e.scripts]) once(x, 'particle system')
    }
  }
  for (const t of tags) terms.set(`tag:${t}`, { text: t, kind: 'tag', count: 0 })
  return [...terms.values()]
}

/** The word under completion: after the last space, or the open quote. */
function currentWord(value: string): { start: number; word: string } {
  const quotes = (value.match(/"/g) ?? []).length
  if (quotes % 2 === 1) {
    const start = value.lastIndexOf('"')
    return { start, word: value.slice(start + 1) }
  }
  const start = value.search(/\S*$/)
  return { start, word: value.slice(start).replace(/^-/, '') }
}

export function searchSuggestions(value: string, terms: Term[], effects: Effect[]): Suggestion[] {
  const { start, word } = currentWord(value)
  if (word.length < 2) return []
  const before = value.slice(0, start) + (value[start] === '-' ? '-' : '')
  const quote = (t: string) => (/\s/.test(t) ? `"${t}"` : t)
  if (/^\d+$/.test(word)) {
    return effects
      .filter((e) => String(e.id).startsWith(word))
      .slice(0, 8)
      .map((e) => ({ key: `id${e.id}`, label: String(e.id), detail: describe(e), kind: 'id', value: `${before}${e.id} ` }))
  }
  const w = word.toLowerCase()
  return terms
    .map((t) => {
      const at = t.text.toLowerCase().indexOf(w)
      return [t, at] as const
    })
    .filter(([t, at]) => at >= 0 && t.text.toLowerCase() !== w)
    .sort((a, b) => (a[1] === 0 ? 0 : 1) - (b[1] === 0 ? 0 : 1) || b[0].count - a[0].count || a[0].text.length - b[0].text.length)
    .slice(0, 10)
    .map(([t]) => ({
      key: `${t.kind}:${t.text}`,
      label: t.text,
      kind: t.kind,
      detail: t.count ? `${t.count} ${t.count === 1 ? 'entry' : 'entries'}` : undefined,
      value: `${before.replace(/"$/, '')}${quote(t.text)} `,
    }))
}

// ---- test commands: complete the command, then its arguments ----

const AURAS = ['none', 'Disciple', 'Master', 'Grandmaster', 'Superachiever']
const STATES: [number, string][] = [
  [1, 'normal'],
  [29, 'Limbo (smashed)'],
  [104, 'building'],
]

/** Boss names for `!defeat`, from the boss targets' labels ("Minotaur (level 20, ...)"). */
export function bossNames(tests: TestCatalog | null): string[] {
  const bosses = tests?.kinds.find((k) => k.kind === 'boss')?.targets ?? []
  return [...new Set(bosses.map((t) => t.label.replace(/\s*\(.*$/, '')))]
}

export function commandSuggestions(value: string, data: GameData): Suggestion[] {
  const m = /^([!/])(\S*)(\s+(.*))?$/s.exec(value.trimStart() || '!')
  if (!m) return []
  const cmd = m[2].toLowerCase()
  const hasArgs = m[3] !== undefined
  const rest = m[4] ?? ''
  const tests = data.tests

  if (!hasArgs) {
    const usages = tests?.commands.map((c) => c) ?? []
    return usages
      .filter((c) => c.usage.slice(1).toLowerCase().startsWith(cmd))
      .slice(0, 14)
      .map((c) => {
        const word = c.usage.split(/\s/)[0]
        const takesArgs = /\s/.test(c.usage)
        return {
          key: c.usage,
          label: c.usage,
          detail: c.about,
          value: takesArgs ? `${word} ` : word,
          // optional arguments only (`!xp [n]`): complete as it is
          complete: !takesArgs || (/\s\[/.test(c.usage) && !/\s</.test(c.usage)),
        }
      })
  }

  const fixed = (options: [string, string?][]) =>
    options
      .filter(([o]) => o.toLowerCase().startsWith(rest.toLowerCase()))
      .map(([o, detail]) => ({ key: o, label: o, detail, value: `!${cmd} ${o}`, complete: true }))
  const pf = (id: number) => playfieldName(data, id)

  switch (cmd) {
    case 'tp':
      return best(data.playfields, rest, (p) => [p.name, String(p.id)]).map((p) => ({
        key: `pf${p.id}`,
        label: p.name,
        detail: String(p.id),
        kind: 'playfield',
        value: `!tp ${p.id}`,
        complete: true,
      }))
    case 'list':
      return (tests?.kinds ?? [])
        .filter((k) => k.kind.startsWith(rest.trim()))
        .map((k) => ({ key: k.kind, label: k.kind, detail: `${k.about} · ${k.targets.length}`, value: `!list ${k.kind}`, complete: true }))
    case 'goto': {
      const space = rest.indexOf(' ')
      if (space < 0) {
        return (tests?.kinds ?? [])
          .filter((k) => k.kind.startsWith(rest) && k.targets.length)
          .map((k) => ({ key: k.kind, label: k.kind, detail: `${k.about} · ${k.targets.length}`, value: `!goto ${k.kind} ` }))
      }
      const k = tests?.kinds.find((x) => x.kind === rest.slice(0, space))
      const q = rest.slice(space + 1).trim()
      const targets = /^\d+$/.test(q) ? (k?.targets ?? []).filter((t) => String(t.n).startsWith(q)).slice(0, 14) : best(k?.targets ?? [], q, (t) => [t.label, pf(t.playfield)], 14)
      return targets.map((t) => ({ key: `${k!.kind}${t.n}`, label: t.label, detail: `${pf(t.playfield)} · ${k!.kind} ${t.n}`, value: `!goto ${k!.kind} ${t.n}`, complete: true }))
    }
    case 'test':
      return best(tests?.scenarios ?? [], rest, (s) => [s.label, s.about, String(s.n)]).map((s) => ({
        key: `test${s.n}`,
        label: s.label,
        detail: s.about,
        kind: `test ${s.n}`,
        value: `!test ${s.n}`,
        complete: true,
      }))
    case 'spawn': {
      const cm = /^(\d+\s+)?(.*)$/.exec(rest)!
      const count = cm[1] ?? ''
      return best(tests?.spawnable ?? [], cm[2], (s) => [s.name]).map((s) => ({
        key: s.name,
        label: s.name,
        detail: `${s.kind}, level ${s.level} · ${places(data, s.playfields)}`,
        value: `!spawn ${count}${s.name}`,
        complete: true,
      }))
    }
    case 'loot':
      return fixed((tests?.loot_kinds ?? ['potion', 'part', 'bag', 'chest', 'memberchest', 'boss', 'enemy', 'smashable']).map((k) => [k]))
    case 'own':
      return best(data.minifigures, rest, (f) => [f.name]).map((f) => ({
        key: `fig${f.id}`,
        label: f.name,
        detail: `series ${f.series}`,
        value: `!own ${f.name}`,
        complete: true,
      }))
    case 'skin':
      return [
        ...fixed([['reset', 'your minifigure again']]),
        ...(data.monsters.length
          ? best(data.monsters, rest, (m) => [...m.used_by.map((u) => u.name), m.name, String(m.id)]).map((m) => ({
              key: `md${m.id}`,
              label: [...new Set(m.used_by.map((u) => u.name))].join(', ') || m.name,
              detail: `${m.name} · ${m.id}`,
              value: `!skin ${m.id}`,
              complete: true,
            }))
          : best(tests?.looks ?? [], rest, (l) => [...l.names, String(l.monster_data)]).map((l) => ({
              key: `md${l.monster_data}`,
              label: l.names.join(', '),
              detail: `${l.kind} · ${l.monster_data}`,
              value: `!skin ${l.monster_data}`,
              complete: true,
            }))),
      ]
    case 'dialog':
    case 'dialogue':
      return best(tests?.dialogues ?? [], rest, (d) => [d.npc, pf(d.playfield), String(d.n)]).map((d) => ({
        key: `dlg${d.n}`,
        label: `${d.n} ${d.npc}`,
        detail: pf(d.playfield),
        value: `!dialog ${d.n}`,
        complete: true,
      }))
    case 'fx': {
      // after the id: a code hook of that package, and where (@near, @ground)
      const after = /^(\d+)\s+(.*)$/.exec(rest)
      if (after) {
        const e = data.effects.find((x) => x.id === Number(after[1]))
        const words = after[2].split(/\s+/)
        const last = words.pop() ?? ''
        const before = `!fx ${after[1]} ${words.map((w) => w + ' ').join('')}`
        const options: [string, string][] = [
          ...(e && isPackage(e) ? e.code_hooks.filter((h) => !words.includes(h)).map((h) => [h, 'code hook'] as [string, string]) : []),
          ['@near', 'on the nearest enemy or smashable'],
          ['@ground', 'at your feet'],
        ]
        return options
          .filter(([o]) => o.startsWith(last) && !words.includes(o))
          .map(([o, detail]) => ({ key: o, label: o, detail, value: `${before}${o}`, complete: true }))
      }
      const special = fixed([['stop'], ['next'], ['prev']])
      const q = rest.trim()
      if (!q) return special
      const pkgs = data.effects.filter(isPackage)
      const hits = /^\d+$/.test(q) ? pkgs.filter((e) => String(e.id).startsWith(q)).slice(0, 10) : best(pkgs, q, (e) => [describe(e)], 10)
      return [...special, ...hits.map((e) => ({ key: `fx${e.id}`, label: String(e.id), detail: describe(e), value: `!fx ${e.id}`, complete: true }))]
    }
    case 'anim':
      return best(data.animations?.attributes.filter((a) => a.package !== null) ?? [], rest, (a) => [a.name]).map((a) => ({
        key: a.name,
        label: a.name,
        detail: `${a.packages.length} packages set it`,
        value: `!anim ${a.name}`,
        complete: true,
      }))
    case 'despawn': {
      return fixed([['all', "every test spawn on this playfield (without: within 30 m)"]])
    }
    case 'state':
      return data.bccStates
        ? best(data.bccStates.states, rest, (st) => [String(st.value), st.name]).map((st) => ({
            key: `st${st.value}`,
            label: `${st.value} ${st.name}`,
            detail: st.about,
            value: `!state ${st.value}`,
            complete: true,
          }))
        : fixed(STATES.map(([n, s]) => [String(n), s]))
    case 'aura':
      return fixed(AURAS.map((a, i) => [String(i), a]))
    case 'count': {
      const [what] = rest.split(/\s+/)
      if (rest.includes(' ')) return []
      return ['kills', 'smashes', 'builds'].filter((k) => k.startsWith(what)).map((k) => ({ key: k, label: k, value: `!count ${k} ` }))
    }
    case 'defeat':
      return best(bossNames(tests), rest, (b) => [b]).map((b) => ({ key: b, label: b, kind: 'boss', value: `!defeat ${b}`, complete: true }))
    case 'mirrors':
    case 'plates':
      return fixed([['solve'], ['reset']])
    case 'collection':
      return fixed([['limit', 'only the team and the members’ minifigures'], ['all', 'every minifigure']])
    default:
      return []
  }
}

/** "progression", "maxed", "world editor" */
export const modeName = (mode: string) => mode.replace(/-/g, ' ')

/** "Isle of Yarr (4200) · copy 3 · maxed": where a player is, which copy, which game mode. */
export function whereLabel(data: GameData, p: Player): string {
  const parts = p.playfield != null ? [`${playfieldName(data, p.playfield)} (${p.playfield})`] : []
  if (p.copy != null) parts.push(`copy ${p.copy}`)
  if (p.mode) parts.push(modeName(p.mode))
  return parts.join(' · ')
}
