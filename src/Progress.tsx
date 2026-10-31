import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Api } from './api'
import { HttpContent, type Json, type JsonObject, type Summary } from './editor/content'
import { Group } from './Group'
import type { Minifigure, Player } from './types'

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
  /** minifigure template -> unix time obtained; null: every one owned */
  collection?: Record<string, number> | null
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
  const all: Achievement[] = useMemo(
    () =>
      (records ?? [])
        .map((r) => {
          const f = r.fields
          const counter = Array.isArray(f.counter) && f.counter.length === 2 ? (f.counter as [number, number]) : null
          return {
            id: r.id,
            lore: num(f.lore) ?? 0,
            title: str(f.title) || r.name,
            text: str(f.text),
            kind: str(f.kind),
            parent: str(f.parent),
            children: Array.isArray(f.children) ? (f.children as string[]) : [],
            counter,
          }
        })
        .map((a, _, list) => (a.title ? a : { ...a, title: untitled(a.id, list.find((p) => p.id === a.parent)?.title ?? '') }))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })),
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
  const kids = useMemo(() => {
    const m = new Map<string, Achievement[]>()
    for (const a of all) if (byId.has(a.parent)) (m.get(a.parent) ?? m.set(a.parent, []).get(a.parent)!).push(a)
    return m
  }, [all, byId])
  const roots = all.filter((a) => !byId.has(a.parent))
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const filtering = words.length > 0 || status !== 'all'
  const matches = (a: Achievement) =>
    (status === 'all' || (status === 'done') === isDone(a)) &&
    words.every((w) => `${a.title} ${a.text} ${a.kind} ${a.lore} ${byId.get(a.parent)?.title ?? ''}`.toLowerCase().includes(w))
  // while filtering: the matches and the groups above them, open
  const kept = useMemo(() => {
    if (!filtering) return null
    const keep = new Set<string>()
    for (const a of all) {
      if (!matches(a)) continue
      for (let x: Achievement | undefined = a; x && !keep.has(x.id); x = byId.get(x.parent)) keep.add(x.id)
    }
    return keep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, byId, q, status, earned, filtering])
  /** done of all below `a` (and it) */
  const tally = (a: Achievement): [number, number] => {
    let [d, n] = a.lore > 0 ? [Number(isDone(a)), 1] : [0, 0]
    for (const k of kids.get(a.id) ?? []) {
      const [kd, kn] = tally(k)
      d += kd
      n += kn
    }
    return [d, n]
  }
  const run = async (cmd: string) => {
    await send(cmd)
    reload()
  }
  const doneCount = all.filter((a) => a.lore > 0 && isDone(a)).length
  const total = all.filter((a) => a.lore > 0).length
  const line = (a: Achievement) => {
    const done = isDone(a)
    const p = progress(a)
    return (
      <>
        <span className="title">{a.title}</span> {a.lore > 0 && <span className={`badge${done ? '' : ' dim'}`}>{done ? 'done' : 'not done'}</span>}{' '}
        <div className="muted mono" style={{ fontSize: '0.75em' }}>{a.id}</div>
        <span className="muted small">
          {a.kind}
          {a.lore > 0 && ` · [${a.lore}]`}
        </span>
        {p && (
          <span className="muted small">
            {' '}
            · <progress value={p[0]} max={p[1]} style={{ width: '6em', verticalAlign: 'middle' }} /> {p[0]}/{p[1]}
          </span>
        )}
        {a.text && <div className="desc">{a.text}</div>}
      </>
    )
  }
  const button = (a: Achievement) =>
    a.lore > 0 &&
    (isDone(a) ? (
      <button disabled={!canSend} onClick={(e) => (e.preventDefault(), run(`!unach ${a.lore}`))} title={`!unach ${a.lore}: take it (and the "all of" ones above it) away`}>
        Reset
      </button>
    ) : (
      <button disabled={!canSend} onClick={(e) => (e.preventDefault(), run(`!grant ${a.lore}`))} title={`!grant ${a.lore}: earn it now, rewards too`}>
        Complete
      </button>
    ))
  const node = (a: Achievement): React.ReactNode => {
    if (kept && !kept.has(a.id)) return null
    const below = (kids.get(a.id) ?? []).filter((k) => !kept || kept.has(k.id))
    if (!below.length)
      return (
        <ul key={a.id} className="plain picklist">
          <li>
            <div className="pick-main">{line(a)}</div>
            {button(a)}
          </li>
        </ul>
      )
    const [d, n] = tally(a)
    return (
      <Group
        key={a.id}
        open={!!kept}
        title={
          <>
            <code className={`tally ${d === n ? 'all' : d > 0 ? 'some' : 'none'}`} title={`${d} of ${n} done`}>
              {d}/{n}
            </code>{' '}
            {a.title}
            {/* on the right, as the single achievements' (a flex summary would lose its marker) */}
            <span style={{ float: 'right', fontWeight: 'normal' }}>{button(a)}</span>
            <div className="muted mono" style={{ fontSize: '0.75em', fontWeight: 'normal', marginLeft: '1.1em' }}>
              {a.id}
            </div>
          </>
        }
      >
        {(a.text || progress(a)) && <div className="muted small">{line(a)}</div>}
        {below.map(node)}
      </Group>
    )
  }
  if (!online) return <p className="muted small">Choose a player online to see their achievements.</p>
  return (
    <>
      <h3>
        Achievements <span className="muted small">{character ? `${doneCount} of ${total} done by ${character.name}` : 'loading…'}</span>
      </h3>
      {(error || charError) && <p className="error small">{error || charError}</p>}
      <div className="inline wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter achievements (title, text, kind, id, group)…" aria-label="Filter achievements" />
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
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
      {!records && !error && <p className="muted small">Loading the achievements…</p>}
      {roots.map(node)}
      {children}
    </>
  )
}

/** A name for an achievement without a title (the worlds' groups): its id's words after its
 * parent's, e.g. achievement/medieval-collectibles under Medieval World -> "Collectibles". */
function untitled(id: string, parent: string): string {
  const skip = new Set(parent.toLowerCase().split(/\s+/))
  const words = id.replace(/^[^/]*\//, '').split('-')
  while (words.length > 1 && skip.has(words[0])) words.shift()
  const name = words.join(' ')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ------------------------------------------------------------------ minifigures

/** Every minifigure by series, owned or not: own one (`!own`) or a whole series. */
export function Minifigures({ api, online, minifigures, send, canSend }: { api: Api; online: Player | undefined; minifigures: Minifigure[]; send: Send; canSend: boolean }) {
  const { character, error, reload } = useCharacter(api, online)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'owned' | 'missing'>('all')
  const [busy, setBusy] = useState(false)
  // (an older server's character has no collection: nothing known)
  const known = character !== null && character.collection !== undefined
  const owns = (f: Minifigure) => known && (character!.collection === null || String(f.id) in character!.collection!)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = minifigures.filter(
    (f) =>
      (status === 'all' || (status === 'owned') === owns(f)) &&
      words.every((w) => `${f.name} ${f.normal_attack ?? ''} ${f.special_attack ?? ''} ${f.id}`.toLowerCase().includes(w)),
  )
  const series = [...new Set(minifigures.map((f) => f.series))].sort((a, b) => a - b)
  const own = async (fs: Minifigure[]) => {
    setBusy(true)
    try {
      for (const f of fs) await send(`!own ${f.name}`)
    } finally {
      setBusy(false)
      reload()
    }
  }
  const filtering = words.length > 0 || status !== 'all'
  const ownButton = (fs: Minifigure[], label: string) => (
    <button disabled={!canSend || busy || !known || fs.every(owns)} onClick={(e) => (e.preventDefault(), own(fs.filter((f) => !owns(f))))} title={fs.length === 1 ? `!own ${fs[0].name}` : `!own each one not owned (${fs.filter((f) => !owns(f)).length})`}>
      {label}
    </button>
  )
  if (!online) return <p className="muted small">Choose a player online to see their minifigures.</p>
  const ownedCount = minifigures.filter(owns).length
  return (
    <>
      <h3>
        Minifigures{' '}
        <span className="muted small">
          {!character ? 'loading…' : !known ? 'the server is too old to say which are owned' : character.collection === null ? `every one owned by ${character.name}` : `${ownedCount} of ${minifigures.length} owned by ${character.name}`}
        </span>
      </h3>
      {error && <p className="error small">{error}</p>}
      <div className="inline wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter minifigures (name, attacks, id)…" aria-label="Filter minifigures" />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Owned">
          <option value="all">all</option>
          <option value="owned">owned</option>
          <option value="missing">not owned</option>
        </select>
      </div>
      {series.map((n) => {
        const all = minifigures.filter((f) => f.series === n)
        const rows = shown.filter((f) => f.series === n)
        if (filtering && !rows.length) return null
        const d = all.filter(owns).length
        return (
          <Group
            key={n}
            open={filtering}
            title={
              <>
                <code className={`tally ${d === all.length ? 'all' : d > 0 ? 'some' : 'none'}`} title={`${d} of ${all.length} owned`}>
                  {d}/{all.length}
                </code>{' '}
                Series {n}
                <span style={{ float: 'right', fontWeight: 'normal' }}>{ownButton(all, 'Own all')}</span>
              </>
            }
          >
            <ul className="plain picklist">
              {rows.map((f) => (
                <li key={f.id}>
                  <div className="pick-main">
                    <span className="title">{f.name}</span> {known && <span className={`badge${owns(f) ? '' : ' dim'}`}>{owns(f) ? 'owned' : 'not owned'}</span>}
                    <div className="desc">{[f.normal_attack, f.special_attack].filter(Boolean).join(' · ')}</div>
                  </div>
                  {ownButton([f], 'Own')}
                </li>
              ))}
            </ul>
          </Group>
        )
      })}
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
  const [q, setQ] = useState('')
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
      // the whole story at once, with the lore flags its conversations give up to there
      await send(`!story at ${lines[li].main} ${step}`)
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
        Story quests <span className="muted small">{character ? character.name : 'loading…'}</span>
      </h3>
      <p className="muted small">
        Set here: every step before it done, it the step the player is on, everything after it not started, and the lore flags the story's conversations give up to there, so NPCs say what they would at that point (<code>!story at</code>). The worlds in the game's order: Pirate, Medieval, Space, Mythology, Dino.
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter story steps…" aria-label="Filter story steps" style={{ width: '100%', marginBottom: 6 }} />
      {!lines && <p className="muted small">Loading the story lines…</p>}
      {lines?.map((l, li) => {
        const on = at(l)
        const words = q.toLowerCase().split(/\s+/).filter(Boolean)
        const matches = (text: string) => words.every((w) => `${l.name} ${text}`.toLowerCase().includes(w))
        const steps = l.steps.map((s, i) => ({ s, i })).filter(({ s }) => matches(s.text))
        if (words.length && !steps.length) return null
        const done = Math.min(Math.max(on - 1, 0), l.steps.length)
        // where a step stands from the player's place: before it (done), it, after it
        const mark = (i: number) => (on > i + 1 ? 'before' : on === i + 1 ? 'here' : 'after')
        return (
          <Group
            key={l.main}
            open={words.length > 0 || (on > 0 && on <= l.steps.length)}
            title={
              <>
                <code className={`tally ${done === l.steps.length ? 'all' : done > 0 ? 'some' : 'none'}`} title={`${done} of ${l.steps.length} steps done`}>
                  {done}/{l.steps.length}
                </code>{' '}
                {l.name}
              </>
            }
          >
            <ul className="plain picklist">
              {steps.map(({ s, i }) => {
                const m = mark(i)
                return (
                  <li key={s.quest} style={m === 'here' ? { outline: '2px solid var(--accent)', borderRadius: 6 } : undefined}>
                    <div className="pick-main">
                      <span className={`story-mark ${m}`} title={m === 'before' ? 'before where you are: done' : m === 'here' ? 'where you are' : 'after where you are: not done'} aria-label={m}>
                        {m === 'before' ? '↑' : m === 'here' ? '●' : '↓'}
                      </span>{' '}
                      <span className="muted small">{i + 1}.</span> <span className={m === 'after' ? 'muted' : 'title'}>{s.text}</span>
                    </div>
                    <button disabled={!can || m === 'here'} onClick={() => setPosition(li, i + 1)}>
                      Set here
                    </button>
                  </li>
                )
              })}
              {!words.length && (
                <li>
                  <div className="pick-main">
                    <span className={`story-mark ${on > l.steps.length ? 'here' : 'after'}`}>{on > l.steps.length ? '●' : '↓'}</span> <span className="muted small">{l.name} done</span>
                  </div>
                  <button disabled={!can || on > l.steps.length} onClick={() => setPosition(li, l.steps.length + 1)}>
                    Set here
                  </button>
                </li>
              )}
            </ul>
          </Group>
        )
      })}
    </>
  )
}

const order = (main: number) => {
  const i = LINE_ORDER.indexOf(main)
  return i < 0 ? LINE_ORDER.length + main : i
}
