import { ApiError } from '../api'
import type {
  Bundle,
  MergeOptions,
  MergeReport,
  Note,
  ObjectChanges,
  Placeable,
  PlayerState,
  PlayfieldNotes,
  Script,
  SetInfo,
  SurveyObject,
  Surveyor,
  Vec3,
  TriggerTargets,
  WallSettings,
  WaveRef,
} from './types'

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
  /** Place it where the surveyor stands, facing their way; it becomes the selection. */
  place(account: number, what: Placeable, wave: WaveRef | null): Promise<SurveyObject>
  /** A trigger wall where the surveyor stands, across their way; it becomes the selection. */
  placeTrigger(account: number, wall: WallSettings): Promise<SurveyObject>
  /** The looks a trigger wall can have. */
  wallLooks(): Promise<string[]>
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
  remove(id: string): Promise<void>
  setInfo(): Promise<SetInfo>
  saveSetInfo(info: SetInfo): Promise<SetInfo>
  exportSet(playfield: number | null): Promise<Bundle>
  /** dryRun: only the report (the preview). */
  importSet(bundle: Bundle, options: MergeOptions, dryRun: boolean): Promise<MergeReport>
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
  place(account: number, what: Placeable, wave: WaveRef | null) {
    return this.call<SurveyObject>('POST', `/players/${account}/place`, { what, wave })
  }
  placeTrigger(account: number, wall: WallSettings) {
    return this.call<SurveyObject>('POST', `/players/${account}/place-trigger`, wall)
  }
  async wallLooks() {
    return (await this.call<{ color: string }[]>('GET', '/wall-looks')).map((l) => l.color)
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
  async remove(id: string) {
    await this.call('DELETE', `/objects/${encodeURIComponent(id)}`)
  }
  setInfo() {
    return this.call<SetInfo>('GET', '/set')
  }
  saveSetInfo(info: SetInfo) {
    return this.call<SetInfo>('PUT', '/set', info)
  }
  exportSet(playfield: number | null) {
    return this.call<Bundle>('GET', playfield === null ? '/export' : `/export?playfield=${playfield}`)
  }
  importSet(bundle: Bundle, options: MergeOptions, dryRun: boolean) {
    return this.call<MergeReport>('POST', '/import', { bundle, options, dry_run: dryRun })
  }
}
