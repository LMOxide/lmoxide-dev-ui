// The survey API (lmoxide docs/SURVEY.md "API"): shapes follow the lmoxide-survey crate.

export type Vec3 = [number, number, number]

export type Kind = 'enemy' | 'npc' | 'smashable' | 'buildie' | 'interactable' | 'bouncer'

/** What crossing a trigger wall does. */
export type WallAction =
  | { script: { script: string | null; wave: string | null } }
  | { discover: { name: string | null; achievement?: string | null } }
  | { dialog: { dialog: string | null } }
  | { portal: { window: number | null; to: number | null } }
  | { message: { text: string } }
  /** gives one of a collectible (a collect achievement's key, or `drop:<name>`) */
  | { collect: { drop: string | null } }
  | 'other'

/** What trigger walls can discover or open (GET /v1/survey/trigger-targets). */
export interface TriggerTargets {
  /** name: the area's internal name (what a wall stores); title: what players call it ("Volcano Summit") */
  locations: { name: string; title?: string | null; playfield: number; playfield_name: string | null; pos: Vec3 | null; achievements: number[] }[]
  /**
   * exploration achievements, with every location each needs. name/category: the client's
   * internal ones ("Lava Pier", "Dino Exploration"); title, text, group: as the game shows them
   * ("Fiery Explorer", "Find the Volcano Summit in Dinosaur Rise.", "Paleontologist")
   */
  achievements: {
    id: number
    name: string
    category: string
    title?: string | null
    text?: string | null
    group?: string | null
    locations: { name: string; playfield: number; title?: string | null }[]
  }[]
  /** id: the dialogue's first text (what a wall stores) */
  dialogs: { id: string; npc: string; playfield: number; playfield_name: string | null; line: string }[]
  /** the teleport windows portals open; plain: asks Yes/No instead (its window would be empty) */
  portals?: { window: number; to: number; to_name: string | null; plain: boolean; playfields: number[] }[]
}

/** A look trigger walls (`wall`) or radii (`radius`) can have (GET /v1/survey/wall-looks). */
export interface WallLook {
  color: string
  shape: 'wall' | 'radius'
}

/** A trigger wall's settings (place-trigger, and the editor). */
export interface WallSettings {
  name: string
  /** width, height, depth (m); a trigger radius uses the height only */
  size: Vec3
  /** a trigger radius (m) instead of a wall: walking into the circle sets it off */
  radius: number | null
  color: string
  action: WallAction
  once: boolean
}

/** live/demo/client: hide only. guessed: confirm, edit, delete. surveyed: edit, delete. */
export type Category = 'live' | 'demo' | 'client' | 'guessed' | 'surveyed'

export const CATEGORIES: Category[] = ['guessed', 'surveyed', 'live', 'demo', 'client']

export function editable(c: Category) {
  return c === 'guessed' || c === 'surveyed'
}

export interface WaveRef {
  script: string
  wave: string
}

/** Something the server spawns in a playfield, whatever its category. */
export interface SurveyObject {
  id: string
  /** "trigger": a trigger wall (size, color, action, once) */
  kind: Kind | 'trigger'
  name: string
  monster_data?: number | null
  template?: number | null
  level?: number | null
  pos: Vec3
  /** radians */
  heading: number
  category: Category
  wave?: WaveRef | null
  /** enemies and NPCs: the looping route it walks (2+ points; none: it stays put) */
  patrol?: Vec3[]
  size?: Vec3
  /** trigger radii: the radius (m) */
  radius?: number | null
  /** bouncers: where it throws you (null: not set) */
  target?: Vec3 | null
  /** bouncers: further landing points of a chain */
  chain?: Vec3[]
  color?: string
  action?: WallAction
  once?: boolean
  playfield?: number
  /** the guess it replaces (Reset brings it back) */
  replaces?: { id: string; kind: Kind; monster_data?: number | null; template?: number | null; pos: Vec3 } | null
  comment?: string
  /** what it is for: live (mimic live), feature/..., other/... (lmoxide docs/WORLD-CONTENT.md) */
  feature?: string
  /** labels for sorting work out: approximate, todo, review, ... (lower case, no #) */
  tags?: string[]
  author?: string
  /** unix seconds */
  updated?: number
}

/** A feature records belong to (GET /v1/survey/features). */
export interface Feature {
  id: string
  title: string
  /** "New content > Christmas Event > 2026" */
  path: string
  category: string
  comment: string
  copied_from: string | null
  author: string
  updated: number
}

export interface FeaturesView {
  /** live (Mimic live), feature (New content), other */
  categories: Feature[]
  features: Feature[]
}

/** A tag in use (GET /v1/survey/tags): how many records carry it; suggested: offered to everyone. */
export interface TagUse {
  tag: string
  count: number
  suggested: boolean
}

/** An editor's own marker on a group of objects in game (never saved). */
export interface Mark {
  by: 'author' | 'feature' | 'tag'
  value: string
  /** one of GET /v1/survey/mark-looks */
  look: string
}

/** Something that can be placed (GET /v1/survey/catalog). */
export interface Placeable {
  kind: Kind
  name: string
  monster_data?: number | null
  template?: number | null
  level?: number | null
  /** where the base content uses it, e.g. "Pirate World ×12" */
  used?: string
}

/** What a surveyor (a player online on the survey server) sees and has chosen. */
export interface PlayerState {
  account_id: number
  character_name: string
  playfield: number
  playfield_name?: string
  pos: Vec3
  heading: number
  selected: string | null
  /** what they hid (never saved) */
  hidden: string[]
  /** script id → the wave shown, or "all"; a script that isn't here shows its first wave */
  shown_waves: Record<string, string>
  wearing: Placeable | null
  /** their markers on groups of objects */
  marks?: Mark[]
  /** goes up when any object of their playfield changes */
  revision: number
}

export interface Surveyor {
  account_id: number
  username: string
  character_name: string
  playfield?: number | null
}

export type Area = { point: Vec3 } | { circle: { center: Vec3; radius: number } } | { polygon: { points: Vec3[] } }

export type NoteKind = 'mission_area' | 'achievement' | 'dialog' | 'script' | 'comment'
export const NOTE_KINDS: NoteKind[] = ['mission_area', 'achievement', 'dialog', 'script', 'comment']

export type Review = 'unreviewed' | 'accepted' | 'rejected'

export interface Note {
  id: string
  kind: NoteKind
  area: Area
  reference: string | null
  comment: string
  status: Review
  feature?: string
  tags?: string[]
  author?: string
  updated?: number
}

export type Trigger =
  | { after: { seconds: number } }
  | { health_below: { placement: string | null; percent: number } }
  | { enter_area: { note: string | null } }
  | { wave_cleared: { wave: string } }
  | 'other'

export interface Wave {
  id: string
  name: string
  trigger: Trigger | null
  comment: string
  tags?: string[]
}

export interface Script {
  id: string
  name: string
  area: Area | null
  reference: string | null
  comment: string
  waves: Wave[]
  status: Review
  feature?: string
  tags?: string[]
  author?: string
  updated?: number
}

export interface PlayfieldNotes {
  notes: Note[]
  scripts: Script[]
}

/** One editor's changes to one feature in one playfield (0: definitions) that aren't published
 * yet (`GET /v1/survey/unpublished`): the content working copy's records changed since its last
 * commit and not in the publish queue. */
export interface Unpublished {
  playfield: number
  playfield_name: string
  feature: string
  feature_path: string
  author: string
  /** the caller's own */
  mine: boolean
  /** "2 added, 1 changed" */
  summary: string
  /** record: a definition (NPC, skill, loot ...) or anything else of the content tree */
  items: { kind: 'placement' | 'trigger' | 'note' | 'script' | 'smash_rule' | 'record'; id: string; name: string; op: 'added' | 'changed' | 'removed'; details?: string[]; updated: number; tags?: string[] }[]
}

/** `POST /v1/survey/publish`: only the given playfield, feature, author (default: the caller;
 * `*`: everyone) and records. */
export interface PublishRequest {
  playfield?: number
  feature?: string
  author?: string
  ids?: string[]
}

/** Changes to an object; editing a guess makes it surveyed (it may get a new id). */
export interface ObjectChanges {
  /** with monster_data and template: change it into another spawn */
  kind?: Kind
  monster_data?: number | null
  template?: number | null
  patrol?: Vec3[]
  /** trigger walls */
  size?: Vec3
  /** bouncers: where it throws you */
  target?: Vec3 | null
  /** a radius makes it a trigger radius; null a wall */
  radius?: number | null
  color?: string
  action?: WallAction
  once?: boolean
  pos?: Vec3
  heading?: number
  level?: number | null
  name?: string
  comment?: string
  wave?: WaveRef | null
  /** moves it to another feature */
  feature?: string
  /** replaces its tags */
  tags?: string[]
}

/** A playfield (world) the editor can show (`GET /v1/survey/playfields`): every named one, with
 * how much is in it. */
export interface PlayfieldInfo {
  id: number
  name: string
  /** base content (live, demo, client, guessed) */
  base: number
  /** the set's placements, trigger walls, scripts and notes in it */
  placements: number
  triggers: number
  scripts: number
  notes: number
}

/**
 * What an editor said about an achievement (lmoxide_survey::SmashRule): which enemies count
 * toward a smash achievement, or, for a discover location (`find:<playfield>:<name>`), only tags
 * and a comment.
 */
export interface SmashRule {
  id: string
  enemies: string[]
  comment: string
  /** drops: each enemy drops it only once (per player) */
  once?: boolean
  /** drops: the item's template, if known */
  item?: number | null
  tags?: string[]
  feature?: string
  author?: string
  updated?: number
}

/** What a rule body can say (PUT /v1/survey/smash-achievements/{key}). */
export interface RuleBody {
  enemies: string[]
  comment?: string
  tags?: string[]
  feature?: string
  once?: boolean
  item?: number | null
}

/** An enemy name a defeat can carry (`GET /v1/survey/enemy-names`). */
export interface EnemyName {
  name: string
  kind: 'enemy' | 'smashable' | 'boss' | 'champion'
  playfields: number[]
  source: 'live' | 'demo' | 'client' | 'achievement'
}

/** Rule keys of enemy categories and drops (free names). */
export const categoryKey = (name: string) => `category:${name}`
export const dropKey = (name: string) => `drop:${name}`

/** An achievement for smashing enemies (`GET /v1/survey/smash-achievements`). The copies of one
 * for every minifigure ("Smash 50 Witches as Judge", ...) are one. */
export interface SmashAchievement {
  /** the achievement's id, or `minifigure:<what>:<match>:<n>` for the minifigure copies */
  key: string
  ids: number[]
  title: string
  text: string
  group: string | null
  /** counter: smash n of them; defeat: once */
  /** collect: a collectible counter (its rule: what drops it) */
  kind: 'counter' | 'defeat' | 'find' | 'collect' | 'category' | 'drop'
  what: 'kills' | 'smashes' | 'kills_or_smashes' | null
  /** what the game data counts without a rule (a part of the name, or the boss) */
  match: string | null
  n: number
  /** how many minifigures have a copy (0: not a minifigure's) */
  minifigures: number
  rule: SmashRule | null
}

/** The rule key of a discover location. */
export const findKey = (playfield: number, name: string) => `find:${playfield}:${name}`
