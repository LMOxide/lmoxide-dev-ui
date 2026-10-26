import { describe, isPackage, soundName, usedByNames } from './catalog'
import type { Effect } from './types'

export interface Note {
  tags: string[]
  text: string
  /** unix ms */
  updated: number
}

export type Notes = Record<string, Note>

/** Quick tags offered on every entry (keys 1-9 toggle them); more are added as they're used. */
export const DEFAULT_TAGS = ['smash effect', 'not it', 'maybe', 'interesting']

export function isEmpty(n: Note | undefined): boolean {
  return !n || (n.tags.length === 0 && n.text.trim() === '')
}

function byId(notes: Notes): [number, Note][] {
  return Object.entries(notes)
    .filter(([, n]) => !isEmpty(n))
    .map(([id, n]) => [Number(id), n] as [number, Note])
    .sort((a, b) => a[0] - b[0])
}

/** What the LMOxide developer gets: the notes with enough of each entry to recognise it. */
export function exportJson(notes: Notes, catalog: Map<number, Effect>, apiBase: string): string {
  return JSON.stringify(
    {
      kind: 'lmoxide-effect-notes',
      exported_at: new Date().toISOString(),
      api: apiBase,
      notes: byId(notes).map(([id, n]) => {
        const e = catalog.get(id)
        return {
          id,
          tags: n.tags,
          text: n.text.trim(),
          updated: new Date(n.updated).toISOString(),
          ...(e && {
            kind: e.kind,
            description: describe(e),
            used_by: e.used_by ?? [],
            ...(isPackage(e) && {
              sounds: e.sounds,
              particles: e.particles,
              animation_attributes: e.animation_attributes,
              looping: e.looping,
            }),
          }),
        }
      }),
    },
    null,
    2,
  )
}

function md(s: string): string {
  return s.replace(/([\\`*_[\]|<>])/g, '\\$1')
}

export function exportMarkdown(notes: Notes, catalog: Map<number, Effect>): string {
  const entries = byId(notes)
  const out = [`# Effect notes`, '', `${entries.length} entries, exported ${new Date().toISOString()}.`, '']
  const tags = [...new Set(entries.flatMap(([, n]) => n.tags))].sort()
  if (tags.length) {
    out.push('## By tag', '')
    for (const t of tags) out.push(`- **${md(t)}**: ${entries.filter(([, n]) => n.tags.includes(t)).map(([id]) => `\`${id}\``).join(', ')}`)
    out.push('')
  }
  out.push('## Entries', '')
  for (const [id, n] of entries) {
    const e = catalog.get(id)
    out.push(`### \`${id}\`${n.tags.length ? ' — ' + n.tags.map(md).join(', ') : ''}`, '')
    if (n.text.trim()) out.push(n.text.trim().split('\n').map((l) => `> ${l}`).join('\n'), '')
    if (e) {
      out.push(`- kind: ${e.kind}${isPackage(e) && e.looping ? ' (looping)' : ''}`)
      const users = usedByNames(e)
      if (users.length) out.push(`- used by: ${users.slice(0, 12).map(md).join('; ')}${users.length > 12 ? ` (+${users.length - 12})` : ''}`)
      if (isPackage(e)) {
        if (e.sounds.length) out.push(`- sounds: ${[...new Set(e.sounds.map(soundName))].map((s) => `\`${s}\``).join(', ')}`)
        if (e.particles.length) out.push(`- particles: ${[...new Set(e.particles)].map((s) => `\`${s}\``).join(', ')}`)
        if (e.animation_attributes.length) out.push(`- animation attributes: ${e.animation_attributes.map((s) => `\`${s}\``).join(', ')}`)
      }
      out.push('')
    }
  }
  return out.join('\n')
}

/** Reads an export (ours) back; entries merge over the current notes, newest wins. */
export function importJson(text: string, current: Notes): Notes {
  const data = JSON.parse(text) as { notes?: { id: number; tags?: string[]; text?: string; updated?: string }[] }
  if (!Array.isArray(data.notes)) throw new Error('not an effect notes export (no "notes" list)')
  const next = { ...current }
  for (const n of data.notes) {
    if (typeof n.id !== 'number') continue
    const updated = n.updated ? Date.parse(n.updated) || Date.now() : Date.now()
    const have = next[n.id]
    if (have && have.updated > updated) continue
    next[n.id] = { tags: Array.isArray(n.tags) ? n.tags.map(String) : [], text: String(n.text ?? ''), updated }
  }
  return next
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
