// Undo and redo of what the world editor changed (placing, editing, confirming, deleting and
// resetting objects), for this page's session. Notes and scripts aren't in it.

import { useCallback, useState } from 'react'
import type { SurveyBackend } from './backend'
import type { ObjectChanges, SurveyObject } from './types'

export type Entry =
  /** fields of `id` changed from `before` to `after` */
  | { kind: 'edit'; id: string; name: string; before: ObjectChanges; after: ObjectChanges; at: number }
  /** guess `guess` was confirmed or edited: placement `id` (as `after`) replaces it */
  | { kind: 'replace'; guess: string; id: string; name: string; after: SurveyObject }
  /** `id` was placed (as `snapshot`) */
  | { kind: 'place'; id: string; name: string; snapshot: SurveyObject }
  /** `id` was deleted; `record` keeps it deleted (a guess's is a new placement) */
  | { kind: 'delete'; id: string; name: string; record: string; snapshot: SurveyObject; guess: boolean }
  /** placement `id` (`snapshot`) was reset: the guess it replaced is back */
  | { kind: 'reset'; id: string; name: string; snapshot: SurveyObject }

/** Edits of one object closer together than this are one step. */
const COALESCE_MS = 2000
const LIMIT = 200

export function describe(e: Entry): string {
  switch (e.kind) {
    case 'edit':
      return `change ${e.name} (${Object.keys(e.after).join(', ')})`
    case 'replace':
      return `make ${e.name} surveyed`
    case 'place':
      return `place ${e.name}`
    case 'delete':
      return `delete ${e.name}`
    case 'reset':
      return `reset ${e.name} to its guess`
  }
}

/** An object's current values of the fields `keys` (what an edit is undone to). */
export function valuesOf(o: SurveyObject, keys: (keyof ObjectChanges)[]): ObjectChanges {
  const out: ObjectChanges = {}
  for (const k of keys) {
    if (k === 'kind' || k === 'monster_data' || k === 'template') Object.assign(out, { kind: o.kind, monster_data: o.monster_data ?? null, template: o.template ?? null })
    else if (k === 'pos') out.pos = [...o.pos]
    else if (k === 'heading') out.heading = o.heading
    else if (k === 'level') out.level = o.level ?? null
    else if (k === 'name') out.name = o.name
    else if (k === 'comment') out.comment = o.comment ?? ''
    else if (k === 'wave') out.wave = o.wave ?? null
    else if (k === 'patrol') out.patrol = (o.patrol ?? []).map((p) => [...p] as typeof p)
    else if (k === 'size' && o.size) out.size = [...o.size]
    else if (k === 'color' && o.color) out.color = o.color
    else if (k === 'action' && o.action) out.action = structuredClone(o.action)
    else if (k === 'once') out.once = !!o.once
    else if (k === 'tags') out.tags = [...(o.tags ?? [])]
  }
  return out
}

export interface History {
  undoStack: Entry[]
  redoStack: Entry[]
  record: (e: Entry) => void
  /** Undoes the last step; the object it leaves selected, if any. */
  undo: () => Promise<string | null>
  redo: () => Promise<string | null>
}

export function useHistory(backend: SurveyBackend): History {
  const [undoStack, setUndo] = useState<Entry[]>([])
  const [redoStack, setRedo] = useState<Entry[]>([])

  const record = useCallback((e: Entry) => {
    setRedo([])
    setUndo((stack) => {
      const last = stack[stack.length - 1]
      if (e.kind === 'edit' && last?.kind === 'edit' && last.id === e.id && e.at - last.at < COALESCE_MS) {
        // one step: the earliest values before, the latest after
        const merged: Entry = { ...last, before: { ...e.before, ...last.before }, after: { ...last.after, ...e.after }, at: e.at }
        return [...stack.slice(0, -1), merged]
      }
      return [...stack, e].slice(-LIMIT)
    })
  }, [])

  /** Runs one step backward (or forward); the entry as it is to be stored afterwards. */
  const step = useCallback(
    async (e: Entry, back: boolean): Promise<[Entry, string | null]> => {
      switch (e.kind) {
        case 'edit':
          await backend.edit(e.id, back ? e.before : e.after)
          return [e, e.id]
        case 'replace':
          if (back) return [e, (await backend.forget(e.id))?.id ?? e.guess]
          await backend.put(e.id, e.after)
          return [e, e.id]
        case 'place':
          if (back) return [e, (await backend.forget(e.id), null)]
          await backend.put(e.id, e.snapshot)
          return [e, e.id]
        case 'delete':
          if (back) {
            if (e.guess) return [e, (await backend.forget(e.record))?.id ?? e.id]
            await backend.put(e.id, e.snapshot)
            return [e, e.id]
          }
          return [{ ...e, record: (await backend.remove(e.id)).id }, null]
        case 'reset':
          if (back) {
            await backend.put(e.id, e.snapshot)
            return [e, e.id]
          }
          return [e, (await backend.forget(e.id))?.id ?? null]
      }
    },
    [backend],
  )

  const undo = useCallback(async () => {
    const e = undoStack[undoStack.length - 1]
    if (!e) return null
    const [stored, selected] = await step(e, true)
    setUndo((s) => s.slice(0, -1))
    setRedo((s) => [...s, stored])
    return selected
  }, [undoStack, step])

  const redo = useCallback(async () => {
    const e = redoStack[redoStack.length - 1]
    if (!e) return null
    const [stored, selected] = await step(e, false)
    setRedo((s) => s.slice(0, -1))
    setUndo((s) => [...s, stored])
    return selected
  }, [redoStack, step])

  return { undoStack, redoStack, record, undo, redo }
}
