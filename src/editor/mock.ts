// An in-memory survey server (survey.html?mock): the page works without lmoxide, to try it and
// to build it before the server routes exist. The merge is a simplified version of the crate's.

import { SUGGESTED_TAGS, type SurveyBackend } from './backend'
import type {
  Bundle,
  Feature,
  FeaturesView,
  Mark,
  MergeOptions,
  MergeReport,
  Note,
  ObjectChanges,
  Placeable,
  PlayerState,
  PlayfieldInfo,
  PlayfieldNotes,
  SmashAchievement,
  SmashRule,
  Script,
  SetInfo,
  SurveyObject,
  TagUse,
  Vec3,
  TriggerTargets,
  PublishRequest,
  Unpublished,
  WallSettings,
  WaveRef,
} from './types'
import { distance, headingDifference } from './geometry'

const PLAYFIELD = 1200

const CATALOG: Placeable[] = [
  { kind: 'enemy', name: 'Skeleton Warrior', monster_data: 82410, level: 1, used: 'Pirate World ×14' },
  { kind: 'enemy', name: 'Skeleton Pirate', monster_data: 207001, level: 1, used: 'Pirate World ×9' },
  { kind: 'enemy', name: 'Pirate Scout', monster_data: 201478, level: 2, used: 'Pirate World ×6' },
  { kind: 'enemy', name: 'Captain Dreadleg', monster_data: 232290, level: 3, used: 'Tutorial' },
  { kind: 'npc', name: 'Villager', monster_data: 464159, used: 'Medieval World ×20' },
  { kind: 'npc', name: 'Tavern Pirate', monster_data: 239402, used: 'Pirate World ×4' },
  { kind: 'smashable', name: 'Crate', monster_data: 152417, template: 153171, used: 'everywhere' },
  { kind: 'smashable', name: 'Barrel', monster_data: 152420, template: 153174, used: 'everywhere' },
  { kind: 'buildie', name: 'XX_boss kraken buildie', template: 194851 },
  { kind: 'interactable', name: 'Lever', template: 200110, used: 'Space Colony ×5' },
]

let counter = 0
const newId = (prefix: string) => `${prefix}-mock-${(++counter).toString(16).padStart(4, '0')}${Math.random().toString(16).slice(2, 8)}`
const now = () => Math.floor(Date.now() / 1000)

function base(id: string, p: Placeable, pos: Vec3, category: SurveyObject['category'], heading = 0): SurveyObject {
  return { id, kind: p.kind, name: p.name, monster_data: p.monster_data, template: p.template, level: p.level ?? null, pos, heading, category }
}

export class MockBackend implements SurveyBackend {
  readonly label = 'mock server (nothing is saved)'
  private objectsById = new Map<string, SurveyObject>()
  /** guesses replaced by placements (by guess id), and deleted guesses' records */
  private guesses = new Map<string, SurveyObject>()
  private removals = new Map<string, SurveyObject>()
  private revision = 1
  private notesData: PlayfieldNotes = { notes: [], scripts: [] }
  private info: SetInfo = { name: 'Mock set', authors: ['mock'], comment: '' }
  private player: PlayerState = {
    account_id: 1,
    character_name: 'hosttemple',
    playfield: PLAYFIELD,
    playfield_name: 'Pirate World',
    pos: [320, 48.75, 110],
    heading: 0,
    selected: null,
    hidden: [],
    shown_waves: {},
    wearing: null,
    revision: 1,
  }

  constructor() {
    const [warrior, pirate, scout, , villager, tavern, crate, barrel, buildie] = CATALOG
    const objs = [
      { ...base('g-0a10', scout, [328, 48.75, 140], 'live', 0.4), patrol: [[328, 48.75, 140], [340, 48.75, 140], [340, 48.75, 150]] as Vec3[] },
      base('g-0a11', warrior, [334, 48.75, 124], 'guessed', 1.2),
      base('g-0a12', pirate, [306, 48.75, 124], 'guessed'),
      base('g-0a13', scout, [334, 48.75, 96], 'guessed', 3.1),
      base('g-0a14', crate, [317, 48.75, 105], 'guessed'),
      base('g-0a15', barrel, [319, 48.75, 106], 'guessed'),
      base('g-0b01', villager, [335.46, 48.37, 62.82], 'live', -0.777),
      base('g-0b02', tavern, [325.84, 48.25, 53.94], 'live'),
      base('g-0c01', crate, [300, 48.75, 140], 'demo'),
      base('g-0d01', buildie, [446, 112, 383], 'client'),
    ]
    for (const o of objs) this.objectsById.set(o.id, o)
  }

  /** The mock's stand-in for walking: move and turn the surveyor. */
  move(forward: number, turn: number) {
    const p = this.player
    p.heading = (p.heading + turn) % (Math.PI * 2)
    p.pos = [p.pos[0] + Math.sin(p.heading) * forward, p.pos[1], p.pos[2] + Math.cos(p.heading) * forward]
  }

  private bump(touched?: SurveyObject, op: 'added' | 'changed' | 'removed' = 'changed') {
    this.revision++
    this.player.revision = this.revision
    if (touched) {
      const kind = touched.kind === 'trigger' ? 'trigger' : 'placement'
      const old = this.unpublishedItems.get(touched.id)
      this.unpublishedItems.set(touched.id, { kind, id: touched.id, name: touched.name, op: old?.op === 'added' && op !== 'removed' ? 'added' : op, updated: now(), feature: touched.feature ?? 'live' })
    }
  }
  /** what the mock's editor changed since publishing */
  private unpublishedItems = new Map<string, Unpublished['items'][number] & { feature: string }>()

  private get(id: string) {
    const o = this.objectsById.get(id)
    if (!o) throw new Error(`no object ${id}`)
    return o
  }

  /** A guess being changed becomes a surveyed placement replacing it. */
  private surveyed(o: SurveyObject): SurveyObject {
    if (o.category === 'surveyed') return o
    if (o.category !== 'guessed') throw new Error(`${o.category} objects can only be hidden`)
    const s: SurveyObject = { ...o, id: newId('p'), category: 'surveyed', author: 'mock', updated: now(), replaces: { id: o.id, kind: o.kind as never, pos: o.pos } }
    this.guesses.set(o.id, structuredClone(o))
    this.objectsById.delete(o.id)
    this.objectsById.set(s.id, s)
    if (this.player.selected === o.id) this.player.selected = s.id
    return s
  }

  private snapshot(): PlayerState {
    return structuredClone(this.player)
  }

  async surveyors() {
    return [{ account_id: 1, username: 'hosttemple', character_name: 'hosttemple', playfield: PLAYFIELD }]
  }
  async state() {
    return this.snapshot()
  }
  async catalog() {
    return CATALOG
  }
  async objects(pf: number) {
    // everything is in the one playfield
    return { revision: this.revision, objects: pf === PLAYFIELD ? structuredClone([...this.objectsById.values()]) : [] }
  }
  async notes(pf: number) {
    return pf === PLAYFIELD ? structuredClone(this.notesData) : { notes: [], scripts: [] }
  }
  async saveNote(_pf: number, note: Note) {
    const n = { ...note, author: 'mock', updated: now() }
    const i = this.notesData.notes.findIndex((x) => x.id === n.id)
    if (i < 0) this.notesData.notes.push(n)
    else this.notesData.notes[i] = n
    return n
  }
  async deleteNote(_pf: number, id: string) {
    this.notesData.notes = this.notesData.notes.filter((n) => n.id !== id)
  }
  async saveScript(_pf: number, script: Script) {
    const s = { ...script, author: 'mock', updated: now() }
    const i = this.notesData.scripts.findIndex((x) => x.id === s.id)
    if (i < 0) this.notesData.scripts.push(s)
    else this.notesData.scripts[i] = s
    return s
  }
  async deleteScript(_pf: number, id: string) {
    this.notesData.scripts = this.notesData.scripts.filter((s) => s.id !== id)
    for (const o of this.objectsById.values()) if (o.wave?.script === id) o.wave = null
    this.bump()
  }
  async wear(_a: number, what: Placeable | null) {
    this.player.wearing = what
    return this.snapshot()
  }
  async place(_a: number, what: Placeable, wave: WaveRef | null, feature: string, tags: string[]) {
    const o: SurveyObject = {
      ...base(newId('p'), what, [...this.player.pos], 'surveyed', this.player.heading),
      wave,
      feature,
      tags,
      author: 'mock',
      updated: now(),
    }
    this.objectsById.set(o.id, o)
    this.player.selected = o.id
    if (wave) this.player.shown_waves[wave.script] = wave.wave
    this.bump(o, 'added')
    return structuredClone(o)
  }
  private featureList: Feature[] = []
  private featuresView(): FeaturesView {
    const cat = (id: string, title: string): Feature => ({ id, title, path: title, category: id, comment: '', copied_from: null, author: '', updated: 0 })
    const titleOf = (id: string) => [cat('live', 'Mimic live'), cat('feature', 'New content'), cat('other', 'Other'), ...this.featureList].find((f) => f.id === id)?.title ?? id
    const path = (id: string) => id.split('/').map((_, i, parts) => titleOf(parts.slice(0, i + 1).join('/'))).join(' > ')
    return {
      categories: [cat('live', 'Mimic live'), cat('feature', 'New content'), cat('other', 'Other')],
      features: this.featureList.map((f) => ({ ...f, path: path(f.id) })),
    }
  }
  async features() {
    return this.featuresView()
  }
  async createFeature(parent: string, title: string, comment: string) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    this.featureList.push({ id: `${parent}/${slug}`, title, path: '', category: parent.split('/')[0], comment, copied_from: null, author: 'mock', updated: now() })
    return this.featuresView()
  }
  async copyFeature(from: string, parent: string, title: string) {
    const v = await this.createFeature(parent, title, '')
    const id = v.features[v.features.length - 1].id
    this.featureList[this.featureList.length - 1].copied_from = from
    let records = 0
    for (const o of [...this.objectsById.values()].filter((o) => o.feature === from)) {
      const c = { ...structuredClone(o), id: newId('p'), feature: id, author: 'mock', updated: now() }
      this.objectsById.set(c.id, c)
      records++
    }
    this.bump()
    return { id, records, features: this.featuresView() }
  }
  async markLooks() {
    return ['achievement aura 1', 'achievement aura 2', 'nature icon', 'magic icon']
  }
  async setMarks(_a: number, marks: Mark[]) {
    this.player.marks = marks
    return this.snapshot()
  }
  async tags(): Promise<TagUse[]> {
    const counts = new Map<string, number>(SUGGESTED_TAGS.map((t) => [t, 0]))
    for (const o of this.objectsById.values()) for (const t of o.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts].map(([tag, count]) => ({ tag, count, suggested: SUGGESTED_TAGS.includes(tag) })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }
  async placeTrigger(_a: number, wall: WallSettings, feature: string, tags: string[]) {
    const o: SurveyObject = {
      id: newId('t'),
      kind: 'trigger',
      name: wall.name || 'Trigger wall',
      pos: [...this.player.pos],
      heading: this.player.heading,
      category: 'surveyed',
      size: wall.size,
      radius: wall.radius,
      color: wall.color,
      action: wall.action,
      once: wall.once,
      feature,
      tags,
      author: 'mock',
      updated: now(),
    }
    this.objectsById.set(o.id, o)
    this.player.selected = o.id
    this.bump(o, 'added')
    return structuredClone(o)
  }
  async triggerTargets(): Promise<TriggerTargets> {
    const names: Record<number, string> = { 1200: 'Pirate World', 4200: 'Isle of Yarr', 6200: 'Dinosaur Rise' }
    const loc = (name: string, title: string | null, playfield: number, achievements: number[]) => ({ name, title, playfield, playfield_name: names[playfield], pos: null, achievements })
    return {
      locations: [
        loc('Achievement_PirateTown', 'Hidden Pirate Town', 4200, [724]),
        loc('Achievement_Mermaid', 'The Sirens', 4200, [264, 900]),
        loc('Achievement_Ship', "Blackbeard's Ship", 4200, [748, 900]),
        loc('BA_Explore_Docks', null, 1200, []),
        loc('Achievement_Volcano', 'Volcano Summit', 6200, [1613]),
      ],
      achievements: [
        { id: 724, name: 'Find the Hidden Pirate Town', category: 'Pirate Exploration', title: 'Ahoy, Landlubber!', text: 'Find the Hidden Pirate Town in the Pirate World.', group: 'Treasure Chaser', locations: [{ name: 'Achievement_PirateTown', playfield: 4200, title: 'Hidden Pirate Town' }] },
        { id: 264, name: 'The Sirens', category: 'Pirate Exploration', title: 'Song of the Siren', text: 'Become mesmerized by the alluring song of the Sirens.', group: 'Treasure Chaser', locations: [{ name: 'Achievement_Mermaid', playfield: 4200, title: 'The Sirens' }] },
        { id: 748, name: "Find Blackbird's Ship", category: 'Pirate Exploration', title: 'The Black Nest', text: "Find Blackbeard's Ship in the Pirate World.", group: 'Treasure Chaser', locations: [{ name: 'Achievement_Ship', playfield: 4200, title: "Blackbeard's Ship" }] },
        { id: 900, name: 'Explore the Isle', category: 'Pirate Exploration', title: 'Treasure Chaser', text: 'Explore every part of the Pirate World.', locations: [{ name: 'Achievement_Mermaid', playfield: 4200, title: 'The Sirens' }, { name: 'Achievement_Ship', playfield: 4200, title: "Blackbeard's Ship" }] },
        { id: 1613, name: 'Lava Pier', category: 'Dino Exploration', title: 'Fiery Explorer', text: 'Find the Volcano Summit in Dinosaur Rise.', group: 'Paleontologist', locations: [{ name: 'Achievement_Volcano', playfield: 6200, title: 'Volcano Summit' }] },
      ],
      dialogs: [
        { id: '741', npc: 'Video Game Guy', playfield: 1300, playfield_name: 'Tutorial', line: 'Hey! Over here!' },
        { id: '79', npc: 'Tavern Pirate', playfield: 1200, playfield_name: 'Pirate World', line: 'Arr, welcome to the tavern.' },
      ],
      portals: [
        { window: 74, to: 4600, to_name: 'Pirate World', plain: true, playfields: [1200] },
        { window: 31, to: 4200, to_name: 'Isle of Yarr', plain: false, playfields: [1200, 4600] },
      ],
    }
  }
  async wallLooks() {
    return [
      // (a trigger radius is a ring of the same pieces)
      ...['green', 'shield', 'low shield', 'forcefield'].map((color) => ({ color, shape: 'wall' as const })),
      ...['green', 'shield', 'low shield', 'forcefield'].map((color) => ({ color, shape: 'radius' as const })),
    ]
  }
  async select(_a: number, id: string | null) {
    this.player.selected = id
    return this.snapshot()
  }
  async selectNearest() {
    let best: [string, number] | null = null
    for (const o of this.objectsById.values()) {
      const d = distance(o.pos, this.player.pos)
      if (!best || d < best[1]) best = [o.id, d]
    }
    this.player.selected = best?.[0] ?? null
    return this.snapshot()
  }
  async hide(_a: number, ids: string[], hidden: boolean) {
    const set = new Set(this.player.hidden)
    for (const id of ids) {
      if (hidden) set.add(id)
      else set.delete(id)
    }
    this.player.hidden = [...set]
    return this.snapshot()
  }
  async unhideAll() {
    this.player.hidden = []
    return this.snapshot()
  }
  async showWave(_a: number, script: string, wave: string) {
    this.player.shown_waves[script] = wave
    return this.snapshot()
  }
  async previewWave() {}
  async teleport(_a: number, pos: Vec3) {
    this.player.pos = [...pos]
    return this.snapshot()
  }
  async edit(id: string, changes: ObjectChanges) {
    const o = this.surveyed(this.get(id))
    Object.assign(o, changes, { updated: now() })
    if (o.kind !== 'enemy' && o.kind !== 'npc') delete o.patrol
    this.bump(o)
    return structuredClone(o)
  }
  async confirm(id: string) {
    const o = this.surveyed(this.get(id))
    this.bump(o)
    return structuredClone(o)
  }
  async remove(id: string) {
    const o = this.get(id)
    if (o.category !== 'guessed' && o.category !== 'surveyed') throw new Error(`${o.category} objects can only be hidden`)
    this.objectsById.delete(id)
    if (this.player.selected === id) this.player.selected = null
    this.bump(o, 'removed')
    if (o.category !== 'guessed') return { id }
    const record = newId('p')
    this.removals.set(record, o)
    return { id: record }
  }
  async forget(id: string) {
    const removed = this.removals.get(id)
    const o = this.objectsById.get(id)
    const guess = removed ?? (o?.replaces ? this.guesses.get(o.replaces.id) : undefined)
    this.removals.delete(id)
    this.objectsById.delete(id)
    if (this.player.selected === id) this.player.selected = null
    if (guess) this.objectsById.set(guess.id, structuredClone(guess))
    this.bump()
    return guess ? structuredClone(guess) : null
  }
  async put(id: string, snapshot: SurveyObject) {
    const o: SurveyObject = { ...structuredClone(snapshot), id, category: 'surveyed', updated: now() }
    if (o.replaces) this.objectsById.delete(o.replaces.id)
    this.objectsById.set(id, o)
    this.bump()
    return structuredClone(o)
  }
  async unpublished(): Promise<Unpublished[]> {
    const groups = new Map<string, Unpublished>()
    for (const { feature, ...item } of this.unpublishedItems.values()) {
      const g = groups.get(feature) ?? { playfield: 4600, playfield_name: 'Pirate World', feature, feature_path: feature, author: 'mock', mine: true, summary: '', items: [] }
      g.items.push(item)
      groups.set(feature, g)
    }
    return [...groups.values()].map((g) => ({ ...g, summary: (['added', 'changed', 'removed'] as const).map((op) => [g.items.filter((i) => i.op === op).length, op] as const).filter(([n]) => n).map(([n, op]) => `${n} ${op}`).join(', ') }))
  }
  async publish(req: PublishRequest) {
    let records = 0
    for (const [id, item] of this.unpublishedItems) {
      if ((req.feature === undefined || item.feature === req.feature) && (!req.ids || req.ids.includes(id))) {
        this.unpublishedItems.delete(id)
        records++
      }
    }
    return { records, unpublished: await this.unpublished() }
  }
  async setInfo() {
    return structuredClone(this.info)
  }
  async saveSetInfo(info: SetInfo) {
    this.info = structuredClone(info)
    return info
  }
  async exportSet(): Promise<Bundle> {
    const placements = [...this.objectsById.values()].filter((o) => o.category === 'surveyed')
    return { format: 1, info: this.info, playfields: { [PLAYFIELD]: { placements, ...structuredClone(this.notesData) } } }
  }
  async importSet(bundle: Bundle, options: MergeOptions, dryRun: boolean): Promise<MergeReport> {
    const report: MergeReport = { added: [], duplicates: [], near: [], conflicts: [] }
    const mine = [...this.objectsById.values()]
    const adding: SurveyObject[] = []
    for (const [pf, content] of Object.entries(bundle.playfields)) {
      for (const raw of content.placements as SurveyObject[]) {
        const t: SurveyObject = { ...raw, category: 'surveyed' }
        const same = this.objectsById.get(t.id)
        if (same) {
          if (JSON.stringify({ ...same, updated: 0, author: '' }) === JSON.stringify({ ...t, updated: 0, author: '' })) report.duplicates.push(t.id)
          else report.conflicts.push({ playfield: Number(pf), theirs: t.id, ours: t.id, kept: 'ours' })
          continue
        }
        const near = options.take.includes(t.id)
          ? undefined
          : mine.find(
              (o) =>
                o.kind === t.kind &&
                o.monster_data === t.monster_data &&
                o.template === t.template &&
                distance(o.pos, t.pos) <= options.distance &&
                headingDifference(o.heading, t.heading) <= options.heading,
            )
        if (near) report.near.push({ playfield: Number(pf), theirs: t.id, ours: near.id, distance: distance(near.pos, t.pos) })
        else {
          report.added.push(t.id)
          adding.push(t)
        }
      }
      if (!dryRun) {
        for (const n of content.notes) if (!this.notesData.notes.some((x) => x.id === n.id)) this.notesData.notes.push(n)
        for (const s of content.scripts) if (!this.notesData.scripts.some((x) => x.id === s.id)) this.notesData.scripts.push(s)
      }
    }
    if (!dryRun) {
      for (const t of adding) this.objectsById.set(t.id, t)
      this.bump()
    }
    return report
  }

  async playfields(): Promise<PlayfieldInfo[]> {
    const objs = [...this.objectsById.values()]
    const here: PlayfieldInfo = {
      id: PLAYFIELD,
      name: 'Pirate World',
      base: objs.filter((o) => o.category !== 'surveyed').length,
      placements: objs.filter((o) => o.category === 'surveyed' && o.kind !== 'trigger').length,
      triggers: objs.filter((o) => o.kind === 'trigger').length,
      scripts: this.notesData.scripts.length,
      notes: this.notesData.notes.length,
    }
    const empty = (id: number, name: string): PlayfieldInfo => ({ id, name, base: 0, placements: 0, triggers: 0, scripts: 0, notes: 0 })
    return [here, empty(1300, 'Tutorial'), empty(4200, 'Isle of Yarr'), empty(4600, 'Pirate World - Sea'), empty(6200, 'Dinosaur Rise')]
  }
  async create(pf: number, snapshot: SurveyObject) {
    if (pf !== PLAYFIELD) throw new Error('the mock has one playfield')
    const o: SurveyObject = { ...structuredClone(snapshot), id: newId(snapshot.kind === 'trigger' ? 't' : 'p'), category: 'surveyed', replaces: null, playfield: pf, author: 'mock', updated: now() }
    this.objectsById.set(o.id, o)
    this.bump()
    return structuredClone(o)
  }
  private rules = new Map<string, SmashRule>()
  async smashAchievements(): Promise<SmashAchievement[]> {
    const a = (key: string, title: string, text: string, group: string | null, kind: SmashAchievement['kind'], what: SmashAchievement['what'], match: string | null, n: number, minifigures = 0): SmashAchievement => ({
      key,
      ids: key.startsWith('minifigure:') ? [2576, 2661] : [Number(key)],
      title,
      text,
      group,
      kind,
      what,
      match,
      n,
      minifigures,
      rule: structuredClone(this.rules.get(key) ?? null),
    })
    return [
      a('2163', 'Novice Monster Smasher', 'Smash 1000 Monsters.', 'Global', 'counter', 'kills', null, 1000),
      a('723', 'Ghostbuster', 'Vanquish the menace of the Pirate World.', 'Pirate World', 'defeat', 'kills', 'Captain Dreadleg', 1),
      a('minifigure:kills_or_smashes:witch:50', 'Witch Hunter', 'Smash 50 Witches.', 'Minifigures', 'counter', 'kills_or_smashes', 'Witch', 50, 17),
      a('minifigure:kills_or_smashes:skeleton:50', 'Bone Breaker', 'Smash 50 Skeletons.', 'Minifigures', 'counter', 'kills_or_smashes', 'Skeleton', 50, 17),
    ]
  }
  async achievementRules() {
    return structuredClone([...this.rules.values()])
  }
  async saveRule(key: string, r: { enemies: string[]; comment?: string; tags?: string[]; feature?: string }) {
    this.rules.set(key, { id: key, enemies: r.enemies, comment: r.comment ?? '', tags: r.tags ?? [], feature: r.feature ?? 'live', author: 'mock', updated: now() })
    return (await this.smashAchievements()).find((x) => x.key === key) ?? null
  }
  async deleteRule(key: string) {
    this.rules.delete(key)
  }
}
