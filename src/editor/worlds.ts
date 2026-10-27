// What the tree shows from every world, not only the one the surveyor stands in: the playfield
// list (with how much each holds), each loaded world's objects, scripts and notes, and the
// achievements' rules.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SurveyBackend } from './backend'
import type { EnemyName, PlayfieldInfo, PlayfieldNotes, RuleBody, SmashAchievement, SmashRule, SurveyObject } from './types'

export interface WorldData {
  objects: SurveyObject[]
  notes: PlayfieldNotes
}

export interface Worlds {
  /** every named playfield (empty until loaded; [] from servers without the list) */
  playfields: PlayfieldInfo[]
  /** the loaded worlds, by playfield */
  data: Record<number, WorldData>
  /** loads a world if it isn't yet */
  ensure: (pf: number) => void
  /** loads a world again (after changing it) */
  reload: (pf: number) => Promise<void>
  /** a world's content as the page already knows it (the surveyor's own is polled) */
  set: (pf: number, d: WorldData) => void
  /** puts a changed object in its world (and drops the guess it replaced) */
  upsert: (o: SurveyObject, pf: number, replaced?: string) => void
  smash: SmashAchievement[]
  /** every rule by key (smash achievements' and discover locations') */
  rules: Record<string, SmashRule>
  saveRule: (key: string, r: RuleBody) => Promise<void>
  deleteRule: (key: string) => Promise<void>
  /** every enemy name a defeat can carry (empty from older servers) */
  enemyNames: EnemyName[]
}

/** How often the playfield list is read (a world whose counts changed is loaded again). */
const LIST_MS = 5000

const records = (p: PlayfieldInfo) => p.placements + p.triggers + p.scripts + p.notes
const signature = (p: PlayfieldInfo) => `${p.placements}/${p.triggers}/${p.scripts}/${p.notes}`

export function useWorlds(backend: SurveyBackend, failed: (e: unknown) => void): Worlds {
  const [playfields, setPlayfields] = useState<PlayfieldInfo[]>([])
  const [data, setData] = useState<Record<number, WorldData>>({})
  const [smash, setSmash] = useState<SmashAchievement[]>([])
  const [rules, setRules] = useState<Record<string, SmashRule>>({})
  const loading = useRef(new Set<number>())
  const seen = useRef(new Map<number, string>())
  const loaded = useRef(new Set<number>())

  const set = useCallback((pf: number, d: WorldData) => {
    loaded.current.add(pf)
    setData((all) => ({ ...all, [pf]: d }))
  }, [])

  const reload = useCallback(
    async (pf: number) => {
      loading.current.add(pf)
      try {
        const [o, n] = await Promise.all([backend.objects(pf), backend.notes(pf)])
        set(pf, { objects: o.objects, notes: n })
      } catch (e) {
        failed(e)
      } finally {
        loading.current.delete(pf)
      }
    },
    [backend, set, failed],
  )

  const ensure = useCallback(
    (pf: number) => {
      if (!loaded.current.has(pf) && !loading.current.has(pf)) reload(pf)
    },
    [reload],
  )

  // the list; worlds holding records are loaded (scripts and walls show in every tab), and
  // loaded again when what they hold changes
  useEffect(() => {
    let stop = false
    const tick = async () => {
      let list: PlayfieldInfo[]
      try {
        list = await backend.playfields()
      } catch {
        return // (an older server: only the surveyor's own world)
      }
      if (stop) return
      setPlayfields(list)
      for (const p of list) {
        const sig = signature(p)
        const was = seen.current.get(p.id)
        seen.current.set(p.id, sig)
        if ((records(p) > 0 && !loaded.current.has(p.id)) || (was !== undefined && was !== sig && loaded.current.has(p.id))) reload(p.id)
      }
    }
    tick()
    const t = setInterval(() => document.visibilityState === 'visible' && tick(), LIST_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [backend, reload])

  const loadRules = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([backend.smashAchievements(), backend.achievementRules()])
      setSmash(s)
      setRules(Object.fromEntries(r.map((x) => [x.id, x])))
    } catch {
      // (an older server)
    }
  }, [backend])
  useEffect(() => {
    loadRules()
  }, [loadRules])

  const saveRule = useCallback(
    async (key: string, r: RuleBody) => {
      try {
        // nothing left to say: no rule (a category or a drop stays until deleted: its name is the rule)
        if (!r.enemies.length && !r.comment && !r.tags?.length && !key.startsWith('category:') && !key.startsWith('drop:')) await backend.deleteRule(key)
        else await backend.saveRule(key, r)
        await loadRules()
      } catch (e) {
        failed(e)
      }
    },
    [backend, loadRules, failed],
  )

  const deleteRule = useCallback(
    async (key: string) => {
      try {
        await backend.deleteRule(key)
        await loadRules()
      } catch (e) {
        failed(e)
      }
    },
    [backend, loadRules, failed],
  )

  const [enemyNames, setEnemyNames] = useState<EnemyName[]>([])
  useEffect(() => {
    backend
      .enemyNames()
      .then(setEnemyNames)
      .catch(() => {}) // (an older server: the catalog's)
  }, [backend])

  const upsert = useCallback((o: SurveyObject, pf: number, replaced?: string) => {
    setData((all) => {
      const w = all[pf]
      if (!w) return all
      return { ...all, [pf]: { ...w, objects: [...w.objects.filter((x) => x.id !== o.id && x.id !== replaced), o] } }
    })
  }, [])

  return { playfields, data, ensure, reload, set, upsert, smash, rules, saveRule, deleteRule, enemyNames }
}
