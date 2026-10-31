// Shapes of the lmoxide-api answers this app uses. The catalog has no schema in
// docs/openapi.json yet (`type: object`), so these follow data/effect_catalog.json.

export type Scope = 'read' | 'moderate' | 'admin'

export interface Session {
  token: string
  /** unix seconds; absent for API keys */
  expires_at?: number
  /** null: an ordinary player (only /v1/me) */
  scope: Scope | null
  /** who is logged in, for the header */
  label: string
  /** kept across browser restarts (localStorage), renewed while used */
  remember?: boolean
  /** unix seconds, for renewing remembered sessions */
  issued_at?: number
}

export interface Player {
  account_id: number
  username: string
  character_id: number
  character_name: string
  gm_level: number
  logged_in_at: number
  playfield?: number | null
  /** where the character is now (x, y up, z); lmoxide 2026-10-27 or later */
  position?: [number, number, number] | null
  /** which running copy of the playfield (`GET /v1/instances`); null until in play */
  copy?: number | null
  /** the character's game mode */
  mode?: GameMode | null
  /** the way it faces, degrees: 0 along +z, 90 along +x (lmoxide 2026-10-29 or later) */
  heading?: number | null
}

export type GameMode = 'progression' | 'maxed' | 'world-editor' | (string & {})

/** `GET /v1/instances` (moderate): a running copy of a world. */
export interface Instance {
  playfield: number
  /** 0, 1, 2: the progression, maxed and world editor main copies; 3 and up: extra copies */
  copy: number
  /** the key clients know it by */
  key: number
  mode: GameMode
  kind: 'main' | 'extra' | 'preview' | (string & {})
  /** a preview's owner (character id) */
  preview_owner?: number | null
  /** players and the NPCs that joined the world (pets, escorts) */
  characters: number
  players: number
  /** NPCs and smashables */
  npcs: number
}

export interface Instances {
  instances: Instance[]
  /** the last AI tick (every copy with players), ms, and the longest in the last minute */
  ai_tick_ms: number
  ai_tick_max_ms: number
  /** players an open world's copy takes before arrivals get another */
  open_world_cap: number
}

export type TimelineType =
  | 'particle'
  | 'sound'
  | 'emotionfxattribute'
  | 'lua'
  | 'environmenteffect'
  | 'movement'
  | 'weapontrails'
  | 'postprocess'
  | 'camerapath'
  | 'movingmesh'
  | 'dialogueline'
  | 'tracer'
  | 'text2d'
  | 'animation'
  | (string & {})

export interface Timeline {
  type: TimelineType
  name: string
  /** seconds after the package (or its code hook) starts */
  start: number
  /** seconds; null: none of its own (as long as its content) or until stopped; 0: an instant */
  duration: number | null
  /** lasts until the package is stopped */
  until_stopped: boolean
  /** self, target, client, ground, other, mount */
  target: string
  /** the code hook that starts this part's timeline (null: when the package starts) */
  hook: string | null
}

/** RDB 1010207 particle: packages name some by id, some by name. */
export interface ParticleRef {
  id: number | null
  name: string | null
}

/** A sound a package plays; `id` (RDB 1020002) is what GET /v1/catalog/sounds/{id} serves. */
export interface SoundRef {
  path: string
  id: number | null
}

export interface UsedBy {
  rdb: 'item' | 'spell' | (string & {})
  id: number
  name: string
}

export interface EffectPackage {
  id: number
  kind: 'effectpackage'
  timelines: Timeline[]
  particles: ParticleRef[]
  sounds: SoundRef[]
  animation_attributes: string[]
  code_hooks: string[]
  lua: string[]
  looping: boolean
  used_by?: UsedBy[]
}

export interface ParticleSystem {
  id: number
  kind: 'particlesystem'
  emitters: string[]
  scripts: string[]
  used_by?: UsedBy[]
}

export type Effect = EffectPackage | ParticleSystem

export interface EffectCatalog {
  _comment?: string
  effects: Effect[]
}

/** `GET /v1/playfields`: the `!tp` destinations. */
export interface Playfield {
  id: number
  name: string
  /** a `!tp` destination (absent before lmoxide's full playfield list: all were) */
  teleport?: boolean
}

/** `GET /v1/minifigures` (the fields this app uses): `!own <name>`, test scenario teams. */
export interface Minifigure {
  id: number
  name: string
  series: number
  normal_attack?: string | null
  special_attack?: string | null
}

export interface CommandResult {
  affected: number
  /** the chat answers; absent from lmoxide-api builds before the test command catalog */
  replies?: string[]
}

/** `GET /v1/catalog/test-commands`: what the test commands accept. */
export interface TestCatalog {
  /** `gm_level`: what the command needs (lmoxide 2026-10-29 or later) */
  commands: { usage: string; about: string; gm_level?: number }[]
  kinds: { kind: string; about: string; targets: { n: number; label: string; playfield: number; pos: [number, number, number] }[] }[]
  scenarios: { n: number; label: string; about: string; team: string[]; spawn: { name: string; count: number }[] }[]
  dialogues: { n: number; npc: string; playfield: number }[]
  loot_kinds: string[]
  /** `monster_data`: its look (0 none; servers before 2026-10-30 leave it out); no playfields: a template no world places */
  spawnable: { name: string; kind: string; level: number; playfields: number[]; monster_data?: number }[]
  looks: { monster_data: number; names: string[]; kind: string }[]
}

/** `GET /v1/catalog/monsters`: every monster data (look) for `!skin`. */
export interface MonsterData {
  id: number
  name: string
  motion_set: number | null
  anim_graph: number | null
  actor: number | null
  mesh: number | null
  death_effect_package: number | null
  used_by: { name: string; kind: string }[]
  minifigures: number[]
}

/** `GET /v1/catalog/animations` */
export interface AnimationCatalog {
  attributes: { name: string; graphs: number[]; packages: number[]; package: number | null }[]
  motion_sets: { id: number; name: string; motions: { id: string; file: string }[] }[]
  anim_graphs: { id: number; name: string; attributes: string[]; motions: string[] }[]
}

/** `GET /v1/catalog/bcc-states`: character states (`!state <value>`) and substates. */
export interface BccStates {
  states: { value: number; name: string; groups: string[]; about?: string }[]
  substates: { value: number; name: string; groups: string[]; priority?: number }[]
}
