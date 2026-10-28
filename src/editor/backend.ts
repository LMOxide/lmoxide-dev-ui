import { ApiError } from '../api'
import type {
  FeaturesView,
  Mark,
  Note,
  ObjectChanges,
  Placeable,
  PlayerState,
  PlayfieldInfo,
  SmashAchievement,
  SmashRule,
  RuleBody,
  EnemyName,
  PlayfieldNotes,
  Script,
  SurveyObject,
  Surveyor,
  TagUse,
  Vec3,
  TriggerTargets,
  PublishRequest,
  Unpublished,
  WallLook,
  WallSettings,
  WaveRef,
} from './types'

/** The tags everyone is offered (lmoxide_survey::SUGGESTED_TAGS). */
export const SUGGESTED_TAGS = ['approximate', 'todo', 'review', 'guess', 'placeholder', 'needs-footage', 'verified']

/** What the survey page needs from the server: lmoxide-api's /v1/survey routes, or the mock. */
export interface SurveyBackend {
  readonly label: string
  surveyors(): Promise<Surveyor[]>
  state(account: number): Promise<PlayerState>
  catalog(): Promise<Placeable[]>
  objects(playfield: number): Promise<{ revision: number; objects: SurveyObject[] }>
  notes(playfield: number): Promise<PlayfieldNotes>
  saveNote(playfield: number, note: Note): Promise<Note>
  deleteNote(playfield: number, id: string): Promise<void>
  saveScript(playfield: number, script: Script): Promise<Script>
  deleteScript(playfield: number, id: string): Promise<void>
  /** Wear a look (null: back to your own). */
  wear(account: number, what: Placeable | null): Promise<PlayerState>
  /** Place it where the surveyor stands, facing their way, in a feature, with tags; it becomes the selection. */
  place(account: number, what: Placeable, wave: WaveRef | null, feature: string, tags: string[]): Promise<SurveyObject>
  /** A trigger wall where the surveyor stands, across their way; it becomes the selection. */
  placeTrigger(account: number, wall: WallSettings, feature: string, tags: string[]): Promise<SurveyObject>
  /** Every tag in use (most used first) and the suggested ones. */
  tags(): Promise<TagUse[]>
  /** What records can belong to (categories and nested features). */
  features(): Promise<FeaturesView>
  /** A feature nested under `parent` (a category or a feature). */
  createFeature(parent: string, title: string, comment: string): Promise<FeaturesView>
  /** A copy of feature `from` with all its records, nested under `parent`. */
  copyFeature(from: string, parent: string, title: string): Promise<{ id: string; records: number; features: FeaturesView }>
  /** The looks marks can have. */
  markLooks(): Promise<string[]>
  /** The editor's marks on groups of objects (replacing theirs). */
  setMarks(account: number, marks: Mark[]): Promise<PlayerState>
  /** The looks a trigger wall can have. */
  wallLooks(): Promise<WallLook[]>
  /** The locations, achievements and dialogues a trigger wall can discover or open. */
  triggerTargets(): Promise<TriggerTargets>
  select(account: number, id: string | null): Promise<PlayerState>
  selectNearest(account: number): Promise<PlayerState>
  hide(account: number, ids: string[], hidden: boolean): Promise<PlayerState>
  unhideAll(account: number): Promise<PlayerState>
  /** Which wave of a script is shown (a wave id or "all"). */
  showWave(account: number, script: string, wave: string): Promise<PlayerState>
  /** Spawn one wave's placements for a while, to see them. */
  previewWave(account: number, wave: WaveRef): Promise<void>
  teleport(account: number, pos: Vec3): Promise<PlayerState>
  edit(id: string, changes: ObjectChanges): Promise<SurveyObject>
  confirm(id: string): Promise<SurveyObject>
  /** Deletes it; the answer is the record that keeps it deleted (forget it to undo). */
  remove(id: string): Promise<{ id: string }>
  /** Drops a placement's record entirely; a guess it replaced comes back (its view). */
  forget(id: string): Promise<SurveyObject | null>
  /** Makes it exactly as the snapshot has it (undo and redo). */
  put(id: string, snapshot: SurveyObject): Promise<SurveyObject>
  /** Changes not published yet (saved on the server, not seen by play servers), the caller's first. */
  unpublished(): Promise<Unpublished[]>
  /** Publishes changes (by default all of the caller's): they wait in the publish queue for an admin to approve. */
  publish(req: PublishRequest): Promise<{ records: number; unpublished: Unpublished[] }>
  /** Every named playfield, with how much is in it. */
  playfields(): Promise<PlayfieldInfo[]>
  /** A copy of a snapshot as a new record in any playfield (paste); nobody's selection changes. */
  create(playfield: number, snapshot: SurveyObject): Promise<SurveyObject>
  smashAchievements(): Promise<SmashAchievement[]>
  /** Every rule: smash achievements' enemies, discover locations' tags. */
  achievementRules(): Promise<SmashRule[]>
  saveRule(key: string, rule: RuleBody): Promise<SmashAchievement | null>
  /** Every enemy and smashable name a defeat can carry (catalog, base content, champions, bosses). */
  enemyNames(): Promise<EnemyName[]>
  deleteRule(key: string): Promise<void>
}

export class HttpBackend implements SurveyBackend {
  readonly label: string
  private readonly base: string
  private readonly token: string | null

  constructor(base: string, token: string | null) {
    this.base = base.replace(/\/+$/, '')
    this.token = token
    this.label = this.base
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetch(this.base + '/v1/survey' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (e) {
      throw new ApiError(0, 'network', `can't reach ${this.base} (${e instanceof Error ? e.message : e})`)
    }
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // not JSON (a proxy error page, ...)
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? (text.slice(0, 200) || res.statusText))
    }
    return json as T
  }

  surveyors() {
    return this.call<Surveyor[]>('GET', '/surveyors')
  }
  state(account: number) {
    return this.call<PlayerState>('GET', `/players/${account}/state`)
  }
  catalog() {
    return this.call<Placeable[]>('GET', '/catalog')
  }
  objects(playfield: number) {
    return this.call<{ revision: number; objects: SurveyObject[] }>('GET', `/playfields/${playfield}/objects`)
  }
  notes(playfield: number) {
    return this.call<PlayfieldNotes>('GET', `/playfields/${playfield}/notes`)
  }
  saveNote(playfield: number, note: Note) {
    return this.call<Note>('PUT', `/playfields/${playfield}/notes/${encodeURIComponent(note.id)}`, note)
  }
  async deleteNote(playfield: number, id: string) {
    await this.call('DELETE', `/playfields/${playfield}/notes/${encodeURIComponent(id)}`)
  }
  saveScript(playfield: number, script: Script) {
    return this.call<Script>('PUT', `/playfields/${playfield}/scripts/${encodeURIComponent(script.id)}`, script)
  }
  async deleteScript(playfield: number, id: string) {
    await this.call('DELETE', `/playfields/${playfield}/scripts/${encodeURIComponent(id)}`)
  }
  wear(account: number, what: Placeable | null) {
    return this.call<PlayerState>('POST', `/players/${account}/wear`, { what })
  }
  place(account: number, what: Placeable, wave: WaveRef | null, feature: string, tags: string[]) {
    return this.call<SurveyObject>('POST', `/players/${account}/place`, { what, wave, feature, tags })
  }
  placeTrigger(account: number, wall: WallSettings, feature: string, tags: string[]) {
    return this.call<SurveyObject>('POST', `/players/${account}/place-trigger`, { ...wall, feature, tags })
  }
  async tags() {
    // (servers before tags: none in use, the usual ones offered)
    try {
      return await this.call<TagUse[]>('GET', '/tags')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return SUGGESTED_TAGS.map((tag) => ({ tag, count: 0, suggested: true }))
      throw e
    }
  }
  features() {
    return this.call<FeaturesView>('GET', '/features')
  }
  createFeature(parent: string, title: string, comment: string) {
    return this.call<FeaturesView>('POST', '/features', { parent, title, comment })
  }
  copyFeature(from: string, parent: string, title: string) {
    return this.call<{ id: string; records: number; features: FeaturesView }>('POST', '/features/copy', { from, parent, title })
  }
  async markLooks() {
    return (await this.call<{ look: string }[]>('GET', '/mark-looks')).map((l) => l.look)
  }
  setMarks(account: number, marks: Mark[]) {
    return this.call<PlayerState>('PUT', `/players/${account}/marks`, marks)
  }
  async wallLooks() {
    // (servers before trigger radii send no shape: walls)
    return (await this.call<{ color: string; shape?: WallLook['shape'] }[]>('GET', '/wall-looks')).map((l) => ({ color: l.color, shape: l.shape ?? 'wall' }))
  }
  triggerTargets() {
    return this.call<TriggerTargets>('GET', '/trigger-targets')
  }
  select(account: number, id: string | null) {
    return this.call<PlayerState>('POST', `/players/${account}/select`, { id })
  }
  selectNearest(account: number) {
    return this.call<PlayerState>('POST', `/players/${account}/select`, { nearest: true })
  }
  hide(account: number, ids: string[], hidden: boolean) {
    return this.call<PlayerState>('POST', `/players/${account}/hide`, { ids, hidden })
  }
  unhideAll(account: number) {
    return this.call<PlayerState>('POST', `/players/${account}/unhide-all`)
  }
  showWave(account: number, script: string, wave: string) {
    return this.call<PlayerState>('POST', `/players/${account}/shown-wave`, { script, wave })
  }
  async previewWave(account: number, wave: WaveRef) {
    await this.call('POST', `/players/${account}/preview-wave`, { wave })
  }
  teleport(account: number, pos: Vec3) {
    return this.call<PlayerState>('POST', `/players/${account}/teleport`, { pos })
  }
  edit(id: string, changes: ObjectChanges) {
    return this.call<SurveyObject>('PATCH', `/objects/${encodeURIComponent(id)}`, changes)
  }
  confirm(id: string) {
    return this.call<SurveyObject>('POST', `/objects/${encodeURIComponent(id)}/confirm`)
  }
  remove(id: string) {
    return this.call<{ id: string }>('DELETE', `/objects/${encodeURIComponent(id)}`)
  }
  forget(id: string) {
    return this.call<SurveyObject | null>('POST', `/objects/${encodeURIComponent(id)}/forget`)
  }
  put(id: string, snapshot: SurveyObject) {
    return this.call<SurveyObject>('PUT', `/objects/${encodeURIComponent(id)}`, snapshot)
  }
  unpublished() {
    return this.call<Unpublished[]>('GET', '/unpublished')
  }
  publish(req: PublishRequest) {
    return this.call<{ records: number; unpublished: Unpublished[] }>('POST', '/publish', req)
  }
  playfields() {
    return this.call<PlayfieldInfo[]>('GET', '/playfields')
  }
  create(playfield: number, snapshot: SurveyObject) {
    return this.call<SurveyObject>('POST', `/playfields/${playfield}/objects`, snapshot)
  }
  smashAchievements() {
    return this.call<SmashAchievement[]>('GET', '/smash-achievements')
  }
  achievementRules() {
    return this.call<SmashRule[]>('GET', '/achievement-rules')
  }
  enemyNames() {
    return this.call<EnemyName[]>('GET', '/enemy-names')
  }
  saveRule(key: string, rule: RuleBody) {
    return this.call<SmashAchievement | null>('PUT', `/smash-achievements/${encodeURIComponent(key)}`, rule)
  }
  async deleteRule(key: string) {
    await this.call('DELETE', `/smash-achievements/${encodeURIComponent(key)}`)
  }
}
