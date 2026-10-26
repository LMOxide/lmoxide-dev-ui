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
}

export interface Player {
  account_id: number
  username: string
  character_id: number
  character_name: string
  gm_level: number
  logged_in_at: number
  playfield?: number | null
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
  /** seconds */
  start: number
  /** seconds; looping parts use 86400 */
  duration: number
  /** self, target, client, ground, other, mount */
  target: string
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
  particles: string[]
  sounds: string[]
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
  commands: { usage: string; about: string }[]
  kinds: { kind: string; about: string; targets: { n: number; label: string; playfield: number; pos: [number, number, number] }[] }[]
  scenarios: { n: number; label: string; about: string; team: string[]; spawn: { name: string; count: number }[] }[]
  dialogues: { n: number; npc: string; playfield: number }[]
  loot_kinds: string[]
  spawnable: { name: string; kind: string; level: number; playfields: number[] }[]
  looks: { monster_data: number; names: string[]; kind: string }[]
}
