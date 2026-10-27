// Copy and paste in the tree: spawns and trigger walls, a wave with its spawns, a whole script,
// a smash achievement's enemies. Pasting makes new records (copies keep their spot; move them
// with "Move to me"), so the original stays where it was.

import type { SurveyBackend } from './backend'
import type { History } from './history'
import { newId } from './NotesPanel'
import type { Script, SurveyObject, Trigger, Wave, WallAction } from './types'

export type Clip =
  /** spawns and trigger walls, from world `from` */
  | { t: 'objects'; from: number; items: SurveyObject[] }
  /** a wave and what it spawns */
  | { t: 'wave'; from: number; script: Script; wave: Wave; items: SurveyObject[] }
  /** a script, its waves and what they spawn */
  | { t: 'script'; from: number; script: Script; items: SurveyObject[] }
  | { t: 'enemies'; names: string[] }

/** Where something can be pasted. */
export type Target =
  /** a world: spawns at start, trigger walls, scripts */
  | { t: 'world'; pf: number }
  /** a wave: spawns go into it (a copied wave's spawns too) */
  | { t: 'wave'; pf: number; script: Script; wave: string }
  /** a script (or its waves folder): a copied wave is added to it */
  | { t: 'script'; pf: number; script: Script }
  /** a script's triggers: copied walls start it */
  | { t: 'script-triggers'; pf: number; script: Script }
  /** a discover location: copied walls discover it */
  | { t: 'location'; pf: number; name: string; achievement: string | null }
  /** a smash achievement: copied enemies count toward it */
  | { t: 'smash'; key: string; enemies: string[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const walls = (items: SurveyObject[]) => items.filter((o) => o.kind === 'trigger')
const spawns = (items: SurveyObject[]) => items.filter((o) => o.kind !== 'trigger')

export function clipLabel(c: Clip): string {
  switch (c.t) {
    case 'objects': {
      const w = walls(c.items).length
      const s = c.items.length - w
      if (c.items.length === 1) return c.items[0].name || (w ? 'trigger wall' : 'spawn')
      return [s && plural(s, 'spawn'), w && plural(w, 'trigger wall')].filter(Boolean).join(', ')
    }
    case 'wave':
      return `${c.wave.name || 'wave'} (${plural(c.items.length, 'spawn')})`
    case 'script':
      return `${c.script.name || 'script'} (${plural(c.script.waves.length, 'wave')}, ${plural(c.items.length, 'spawn')})`
    case 'enemies':
      return c.names.length === 1 ? c.names[0] : plural(c.names.length, 'enemy', 'enemies')
  }
}

/** What pasting here would do ("Paste 3 spawns"), or null when it can't go here. */
export function pasteLabel(c: Clip | null, to: Target): string | null {
  if (!c) return null
  const what = clipLabel(c)
  switch (to.t) {
    case 'world':
      if (c.t === 'objects') return `Paste ${what} here (at start)`
      if (c.t === 'script') return `Paste script ${what}`
      if (c.t === 'wave') return `Paste ${what}'s spawns here (at start)`
      return null
    case 'wave':
      if (c.t === 'objects' && spawns(c.items).length) return `Paste ${plural(spawns(c.items).length, 'spawn')} into this wave`
      if (c.t === 'wave') return `Paste ${what}'s spawns into this wave`
      return null
    case 'script':
      return c.t === 'wave' ? `Paste ${what} as a new wave` : null
    case 'script-triggers':
    case 'location':
      return c.t === 'objects' && walls(c.items).length ? `Paste ${plural(walls(c.items).length, 'trigger wall')} here` : null
    case 'smash':
      return c.t === 'enemies' ? `Paste ${what}` : null
  }
}

/** A copy of an object for `create`: no id, not replacing a guess. */
function snapshot(o: SurveyObject, changes: Partial<SurveyObject>): SurveyObject {
  const s = structuredClone(o)
  return { ...s, replaces: null, category: 'surveyed', ...changes }
}

/** A script action that names a script of another world names none. */
function actionIn(o: SurveyObject, from: number, pf: number): WallAction | undefined {
  const a = o.action
  if (a && typeof a === 'object' && 'script' in a && from !== pf) return { script: { script: null, wave: null } }
  return a
}

interface Deps {
  backend: SurveyBackend
  history: History
  /** the names of a world's scripts */
  scriptNames: (pf: number) => string[]
}

/** Creates the copies, each as one undo step; the worlds it changed. */
async function createAll(d: Deps, pf: number, list: SurveyObject[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const s of list) {
    const o = await d.backend.create(pf, s)
    ids.set(s.id, o.id)
    d.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
  }
  return ids
}

/** A copy of a script with new ids (its waves' triggers follow the new wave ids). */
function copyScript(s: Script): { script: Script; waveIds: Map<string, string> } {
  const waveIds = new Map(s.waves.map((w) => [w.id, newId('w')]))
  const trigger = (t: Trigger | null): Trigger | null => (t && typeof t === 'object' && 'wave_cleared' in t ? { wave_cleared: { wave: waveIds.get(t.wave_cleared.wave) ?? t.wave_cleared.wave } } : t)
  return {
    script: { ...structuredClone(s), id: newId('s'), name: s.name, waves: s.waves.map((w) => ({ ...structuredClone(w), id: waveIds.get(w.id)!, trigger: trigger(w.trigger) })) },
    waveIds,
  }
}

/** Placements a trigger names follow to their copies. */
function remapPlacements(s: Script, ids: Map<string, string>): Script {
  return {
    ...s,
    waves: s.waves.map((w) => {
      const t = w.trigger
      if (t && typeof t === 'object' && 'health_below' in t && t.health_below.placement) return { ...w, trigger: { health_below: { ...t.health_below, placement: ids.get(t.health_below.placement) ?? null } } }
      return w
    }),
  }
}

/** `name`, or "name copy" when `taken` has it already. */
const fresh = (name: string, taken: string[]) => (taken.includes(name) ? `${name} copy` : name)

/** Pastes `c` at `to`; the worlds that changed (to load again). */
export async function paste(c: Clip, to: Target, d: Deps): Promise<number[]> {
  const { backend } = d
  if (to.t === 'smash') return [] // (the caller saves the rule: enemies aren't records)
  if (c.t === 'enemies') return []
  const pf = to.pf
  switch (to.t) {
    case 'world': {
      if (c.t === 'objects') await createAll(d, pf, c.items.map((o) => snapshot(o, { wave: null, action: actionIn(o, c.from, pf) })))
      else if (c.t === 'wave') await createAll(d, pf, spawns(c.items).map((o) => snapshot(o, { wave: null })))
      else {
        const { script, waveIds } = copyScript(c.script)
        script.name = fresh(script.name, d.scriptNames(pf))
        await backend.saveScript(pf, { ...script, waves: script.waves.map((w) => ({ ...w, trigger: w.trigger && typeof w.trigger === 'object' && 'health_below' in w.trigger ? { health_below: { ...w.trigger.health_below, placement: null } } : w.trigger })) })
        const ids = await createAll(d, pf, spawns(c.items).map((o) => snapshot(o, { wave: o.wave ? { script: script.id, wave: waveIds.get(o.wave.wave) ?? script.waves[0].id } : null })))
        await backend.saveScript(pf, remapPlacements(script, ids))
      }
      return [pf]
    }
    case 'wave': {
      const items = c.t === 'objects' ? spawns(c.items) : c.t === 'wave' ? spawns(c.items) : []
      await createAll(d, pf, items.map((o) => snapshot(o, { wave: { script: to.script.id, wave: to.wave } })))
      return [pf]
    }
    case 'script': {
      if (c.t !== 'wave') return []
      const wave: Wave = { ...structuredClone(c.wave), id: newId('w'), name: fresh(c.wave.name, to.script.waves.map((w) => w.name)), trigger: c.wave.trigger && typeof c.wave.trigger === 'object' && ('wave_cleared' in c.wave.trigger || 'health_below' in c.wave.trigger) ? null : c.wave.trigger }
      await backend.saveScript(pf, { ...to.script, waves: [...to.script.waves, wave] })
      await createAll(d, pf, spawns(c.items).map((o) => snapshot(o, { wave: { script: to.script.id, wave: wave.id } })))
      return [pf]
    }
    case 'script-triggers':
      if (c.t !== 'objects') return []
      await createAll(d, pf, walls(c.items).map((o) => snapshot(o, { action: { script: { script: to.script.id, wave: null } } })))
      return [pf]
    case 'location':
      if (c.t !== 'objects') return []
      await createAll(d, pf, walls(c.items).map((o) => snapshot(o, { action: { discover: { name: to.name, achievement: to.achievement } } })))
      return [pf]
  }
}
