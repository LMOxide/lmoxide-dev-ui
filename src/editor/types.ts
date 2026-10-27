// The survey API (lmoxide docs/SURVEY.md "API"): shapes follow the lmoxide-survey crate.

export type Vec3 = [number, number, number]

export type Kind = 'enemy' | 'npc' | 'smashable' | 'buildie' | 'interactable'

/** What crossing a trigger wall does. */
export type WallAction =
  | { script: { script: string | null; wave: string | null } }
  | { discover: { name: string | null; achievement?: string | null } }
  | { dialog: { dialog: string | null } }
  | { message: { text: string } }
  | 'other'

/** What trigger walls can discover or open (GET /v1/survey/trigger-targets). */
export interface TriggerTargets {
  locations: { name: string; playfield: number; playfield_name: string | null; pos: Vec3 | null; achievements: number[] }[]
  /** exploration achievements, with every location each needs */
  achievements: { id: number; name: string; category: string; locations: { name: string; playfield: number }[] }[]
  /** id: the dialogue's first text (what a wall stores) */
  dialogs: { id: string; npc: string; playfield: number; playfield_name: string | null; line: string }[]
}

/** A trigger wall's settings (place-trigger, and the editor). */
export interface WallSettings {
  name: string
  /** width, height, depth (m) */
  size: Vec3
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
  color?: string
  action?: WallAction
  once?: boolean
  comment?: string
  author?: string
  /** unix seconds */
  updated?: number
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
}

export interface Script {
  id: string
  name: string
  area: Area | null
  reference: string | null
  comment: string
  waves: Wave[]
  status: Review
  author?: string
  updated?: number
}

export interface PlayfieldNotes {
  notes: Note[]
  scripts: Script[]
}

export interface SetInfo {
  name: string
  authors: string[]
  comment: string
}

/** A whole set (or part of one) as one file: what Export downloads and Import reads. */
export interface Bundle {
  format: 1
  info: SetInfo
  playfields: Record<string, { placements: unknown[]; notes: Note[]; scripts: Script[] }>
}

export type Prefer = 'newer' | 'ours' | 'theirs'

export interface MergeOptions {
  /** metres */
  distance: number
  /** degrees */
  heading: number
  prefer: Prefer
  /** their ids to take although they look like near-duplicates */
  take: string[]
}

export interface MergeReport {
  added: string[]
  duplicates: string[]
  near: { playfield: number; theirs: string; ours: string; distance: number }[]
  conflicts: { playfield: number; theirs: string; ours: string; kept: 'ours' | 'theirs' }[]
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
  color?: string
  action?: WallAction
  once?: boolean
  pos?: Vec3
  heading?: number
  level?: number | null
  name?: string
  comment?: string
  wave?: WaveRef | null
}
