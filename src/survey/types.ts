// The survey API (lmoxide docs/SURVEY.md "API"): shapes follow the lmoxide-survey crate.

export type Vec3 = [number, number, number]

export type Kind = 'enemy' | 'npc' | 'smashable' | 'buildie' | 'interactable'

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
  kind: Kind
  name: string
  monster_data?: number | null
  template?: number | null
  level?: number | null
  pos: Vec3
  /** radians */
  heading: number
  category: Category
  wave?: WaveRef | null
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
  /** "only this wave": every other wave of that script is hidden */
  focus: WaveRef | null
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
  pos?: Vec3
  heading?: number
  level?: number | null
  name?: string
  comment?: string
  wave?: WaveRef | null
}
