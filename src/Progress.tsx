import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Api } from './api'
import { HttpContent, type Json, type JsonObject, type Summary } from './editor/content'
import type { Player } from './types'

/** `send` resolves once the command has run (App.tsx), so steps can go in order. */
type Send = (cmd: string) => unknown

/** The chosen player's saved character (GET /v1/characters/{id}); saved every 10 s and after
 * the achievement and story test commands. Reloaded every 5 s and after `reload()`. */
function useCharacter(api: Api, online: Player | undefined) {
  const [character, setCharacter] = useState<CharacterProgress | null>(null)
  const [error, setError] = useState('')
  const id = online?.character_id
  const load = useCallback(() => {
    if (id == null) return
    api
      .character(id)
      .then((c) => (setCharacter(c), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [api, id])
  useEffect(() => {
    setCharacter(null)
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 5_000)
    return () => clearInterval(t)
  }, [load])
  // the server saves right after the command; give it a moment
  const reload = useCallback(() => setTimeout(load, 800), [load])
  return { character, error, reload }
}

export interface CharacterProgress {
  id: number
  name: string
  achievements: { id: number; achieved_at: number }[]
  /** stat -> minifigure template (0 = the player) -> value */
  counters: Record<string, Record<string, number>>
  story?: Record<string, number>
}

/** Every record of a kind (the editor API), loaded once. */
function useRecords(api: Api, kind: string) {
  const content = useMemo(() => new HttpContent(api.base, api.token), [api])
  const [records, setRecords] = useState<Summary[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    content
      .list({ kind, limit: 10_000 })
      .then((r) => setRecords(r.records))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [content, kind])
  return { content, records, error }
}

const str = (v: Json | undefined) => (typeof v === 'string' ? v : '')
const num = (v: Json | undefined) => (typeof v === 'number' ? v : null)

// ------------------------------------------------------------------ achievements

interface Achievement {
  id: string
  lore: number
  title: string
  text: string
  kind: string
  parent: string
  children: string[]
  counter: [number, number] | null
}

type Status = 'all' | 'done' | 'open'

/** Every achievement, done or not (with progress where the saved counters show it): complete
 * one (`!grant`) or reset it (`!unach`); area quests reset (`!quests reset`). */
export function Achievements({ api, online, send, canSend, children }: { api: Api; online: Player | undefined; send: Send; canSend: boolean; children?: React.ReactNode }) {
  const { records, error } = useRecords(api, 'achievement')
  const { character, error: charError, reload } = useCharacter(api, online)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [limit, setLimit] = useState(200)
  const all: Achievement[] = useMemo(
    () =>
      (records ?? [])
        .map((r) => {
          const f = r.fields
          const counter = Array.isArray(f.counter) && f.counter.length === 2 ? (f.counter as [number, number]) : null
          return {
            id: r.id,
            lore: num(f.lore) ?? 0,
            title: str(f.title) || r.name || r.id,
            text: str(f.text),
            kind: str(f.kind),
            parent: str(f.parent),
            children: Array.isArray(f.children) ? (f.children as string[]) : [],
            counter,
          }
        })
        .filter((a) => a.lore > 0)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [records],
  )
  const byId = useMemo(() => new Map(all.map((a) => [a.id, a])), [all])
  const earned = useMemo(() => new Set(character?.achievements.map((a) => a.id) ?? []), [character])
  const isDone = (a: Achievement) => earned.has(a.lore)
  const progress = (a: Achievement): [number, number] | null => {
    if (a.counter) {
      const values = Object.values(character?.counters[String(a.counter[0])] ?? {})
      return [Math.min(Math.max(0, ...values), a.counter[1]), a.counter[1]]
    }
    if (a.children.length && (a.kind === 'all' || a.kind === 'any')) {
      const done = a.children.filter((c) => byId.get(c) && isDone(byId.get(c)!)).length
      return [Math.min(done, a.kind === 'any' ? 1 : a.children.length), a.kind === 'any' ? 1 : a.children.length]
    }
    return null
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = all.filter(
    (a) =>
      (status === 'all' || (status === 'done') === isDone(a)) &&
      words.every((w) => `${a.title} ${a.text} ${a.kind} ${a.lore} ${byId.get(a.parent)?.title ?? ''}`.toLowerCase().includes(w)),
  )
  const run = async (cmd: string) => {
    await send(cmd)
    reload()
  }
  const doneCount = all.filter(isDone).length
  if (!online) return <p className="muted small">Choose a player online to see their achievements.</p>
  return (
    <>
      <h3>
        Achievements{' '}
        <span className="muted small">
          {character ? `${doneCount} of ${all.length} done by ${character.name}` : 'loading…'}
        </span>
      </h3>
      {(error || charError) && <p className="error small">{error || charError}</p>}
      <div className="inline wrap">
        <input value={q} onChange={(e) => (setQ(e.target.value), setLimit(200))} placeholder="Filter achievements (title, text, kind, id, group)…" aria-label="Filter achievements" />
        <select value={status} onChange={(e) => (setStatus(e.target.value as Status), setLimit(200))} aria-label="Status">
          <option value="all">all</option>
          <option value="open">not done</option>
          <option value="done">done</option>
        </select>
        <button disabled={!canSend} onClick={() => run('!quests reset')} title="!quests reset: every area quest starts again (change playfield or relog so the client forgets them)">
          Reset all area quests
        </button>
        <button disabled={!canSend} onClick={() => run('!unach all')} title="!unach all: every achievement, the journal and the counters (story and tutorial progress stay)">
          Reset all achievements
        </button>
      </div>
      <ul className="plain picklist">
        {shown.slice(0, limit).map((a) => {
          const done = isDone(a)
          const p = progress(a)
          return (
            <li key={a.id}>
              <div className="pick-main">
                <span className="title">{a.title}</span> <span className={`badge${done ? '' : ' dim'}`}>{done ? 'done' : 'not done'}</span>{' '}
                <span className="muted small">
                  {a.kind} · [{a.lore}]{byId.get(a.parent) ? ` · in ${byId.get(a.parent)!.title}` : ''}
                </span>
                {p && (
                  <span className="muted small">
                    {' '}
                    · <progress value={p[0]} max={p[1]} style={{ width: '6em', verticalAlign: 'middle' }} /> {p[0]}/{p[1]}
                  </span>
                )}
                {a.text && <div className="desc">{a.text}</div>}
              </div>
              {done ? (
                <button disabled={!canSend} onClick={() => run(`!unach ${a.lore}`)} title={`!unach ${a.lore}: take it (and the "all of" ones above it) away`}>
                  Reset
                </button>
              ) : (
                <button disabled={!canSend} onClick={() => run(`!grant ${a.lore}`)} title={`!grant ${a.lore}: earn it now, rewards too`}>
                  Complete
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {shown.length > limit && (
        <p>
          <button onClick={() => setLimit(limit + 300)}>View more</button> <button onClick={() => setLimit(Infinity)}>View all {shown.length}</button>
        </p>
      )}
      {children}
    </>
  )
}

// ------------------------------------------------------------------ story

/** The story lines in the game's order (by main quest id): Pirate, Medieval, Space, Mythology, Dino. */
const LINE_ORDER = [45, 84, 108, 17, 122]

interface Line {
  main: number
  name: string
  steps: { quest: number; text: string }[]
}

/** The whole story, line after line, step after step: where the character is, and set it
 * anywhere (everything before done, everything after not, `!story quest` per line). */
export function Story({ api, online, send, canSend }: { api: Api; online: Player | undefined; send: Send; canSend: boolean }) {
  const { content, records, error } = useRecords(api, 'quest')
  const { character, error: charError, reload } = useCharacter(api, online)
  const [lines, setLines] = useState<Line[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!records) return
    const story = records.filter((r) => r.fields.kind === 'story')
    Promise.all(story.map((r) => content.get({ id: r.id, feature: r.feature })))
      .then((views) =>
        setLines(
          views
            .map((v) => {
              const rec = v.resolved as JsonObject
              const steps = (Array.isArray(rec.steps) ? rec.steps : []) as JsonObject[]
              return {
                main: num(rec.main) ?? 0,
                name: str(rec.name) || v.id,
                steps: steps.map((s) => {
                  const goals = (Array.isArray(s.goals) ? s.goals : []) as JsonObject[]
                  return { quest: num(s.quest) ?? 0, text: goals.map((g) => str(g.text)).filter(Boolean).join(' · ') || `quest ${num(s.quest)}` }
                }),
              }
            })
            .filter((l) => l.steps.length)
            .sort((a, b) => order(a.main) - order(b.main)),
        ),
      )
      .catch(() => setLines([]))
  }, [records, content])
  const story = character?.story ?? {}
  /** a line's step the character is on: 0 not started, steps.length + 1 done */
  const at = (l: Line) => {
    if (!(`main/${l.main}` in story)) return 0
    const i = l.steps.findIndex((s) => !(`done/${s.quest}` in story))
    return i < 0 ? l.steps.length + 1 : i + 1
  }
  /** Everything before (line `li`, step `step`) done, everything after not started. */
  const setPosition = async (li: number, step: number) => {
    if (!lines) return
    setBusy(true)
    try {
      for (const [i, l] of lines.entries()) {
        const want = i < li ? l.steps.length + 1 : i === li ? step : 0
        if (at(l) !== want) await send(`!story quest ${l.main} ${want}`)
      }
    } finally {
      setBusy(false)
      reload()
    }
  }
  if (!online) return <p className="muted small">Choose a player online to see their story.</p>
  const can = canSend && !busy
  return (
    <>
      <h3>
        Story <span className="muted small">{character ? character.name : 'loading…'}</span>
      </h3>
      <p className="muted small">
        Set here: every step before it done, it the step the player is on, everything after it not started (<code>!story quest</code> per line). The lines in the game's order: Pirate, Medieval, Space, Mythology, Dino.
      </p>
      {(error || charError) && <p className="error small">{error || charError}</p>}
      <p className="inline wrap">
        <button disabled={!can || !lines} onClick={() => setPosition(0, 0)}>
          Before everything
        </button>
        <button disabled={!can || !lines} onClick={() => lines && setPosition(lines.length - 1, lines[lines.length - 1].steps.length + 1)}>
          All done
        </button>
        <button disabled={!canSend} onClick={async () => (await send('!story'), reload())} title="!story: the story state in chat">
          Show in chat
        </button>
      </p>
      {!lines && <p className="muted small">Loading the story lines…</p>}
      {lines?.map((l, li) => {
        const on = at(l)
        return (
          <section key={l.main}>
            <h4>
              {l.name} <span className="muted small">({on === 0 ? 'not started' : on > l.steps.length ? 'done' : `step ${on} of ${l.steps.length}`})</span>
            </h4>
            <ol className="plain picklist">
              {l.steps.map((s, i) => {
                const state = on > i + 1 ? 'done' : on === i + 1 ? 'current' : 'later'
                return (
                  <li key={s.quest} style={state === 'current' ? { outline: '2px solid var(--accent)', borderRadius: 6 } : undefined}>
                    <div className="pick-main">
                      <span className="muted small">{i + 1}.</span> <span className={state === 'later' ? 'muted' : 'title'}>{s.text}</span>{' '}
                      <span className={`badge${state === 'done' ? '' : ' dim'}`}>{state === 'current' ? 'here' : state}</span>
                    </div>
                    <button disabled={!can || state === 'current'} onClick={() => setPosition(li, i + 1)}>
                      Set here
                    </button>
                  </li>
                )
              })}
              <li>
                <div className="pick-main muted small">{l.name} done</div>
                <button disabled={!can || on > l.steps.length} onClick={() => setPosition(li, l.steps.length + 1)}>
                  Set here
                </button>
              </li>
            </ol>
          </section>
        )
      })}
    </>
  )
}

const order = (main: number) => {
  const i = LINE_ORDER.indexOf(main)
  return i < 0 ? LINE_ORDER.length + main : i
}
