import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Api, ApiError, normalizeCatalog } from './api'
import { NO_FILTERS, facts as factsOf, matches, textMatcher, type Filters } from './catalog'
import { Detail, type FxAt } from './Detail'
import { EffectList } from './EffectList'
import { FilterPanel } from './Filters'
import { DEFAULT_TAGS, isEmpty, type Note, type Notes } from './notes'
import { NotesPanel } from './NotesPanel'
import { KEYS, loadJson, saveJson } from './storage'
import { Console, type LogEntry } from './Console'
import { Debug, type Section } from './Debug'
import { Palette } from './Palette'
import { modeName, searchSuggestions, vocabulary, type GameData } from './suggest'
import { apiBase, expired, sessionFor, session as currentSession, setApiBase, signOut, toSignIn } from './tools'
import { ToolSwitch } from './ToolSwitch'
import { PositionDock, usePositionCopy } from './PositionCopy'
import type { AnimationCatalog, BccStates, Effect, EffectCatalog, Instances, Minifigure, MonsterData, Player, Playfield, Session, TestCatalog } from './types'

/** The player chosen to preview on, remembered across visits (they may be offline now). */
interface Chosen {
  account_id: number
  username: string
  character_name: string
}

type Tab = 'effect' | 'console' | 'notes'

/** The game modes `!mode` switches between (the API's name, the label). */
const MODES: [string, string][] = [
  ['progression', 'Progression'],
  ['maxed', 'Maxed'],
  ['world-editor', 'World editor'],
]

function useStored<T>(key: string, fallback: T, inSession = false): [T, (v: T | ((old: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => loadJson(key, fallback, inSession))
  const set = useCallback(
    (v: T | ((old: T) => T)) =>
      setValue((old) => {
        const next = typeof v === 'function' ? (v as (old: T) => T)(old) : v
        saveJson(key, next, inSession)
        return next
      }),
    [key, inSession],
  )
  return [value, set]
}

/** The debugger (/debugger/): the dev UI's session, else to the sign-in page. */
export default function App() {
  const base = apiBase()
  const s = currentSession()
  const api = useMemo(() => new Api(base, s?.token ?? null), [base, s?.token])
  if (!s) {
    toSignIn('debugger')
    return null
  }
  return <Browser api={api} session={s} logout={() => signOut('debugger')} expire={() => expired('debugger')} />
}

/** Another API address: keeps a session that address already has, else signs in again. */
function switchApi(base: string) {
  setApiBase(base)
  if (sessionFor(apiBase())) window.location.reload()
  else toSignIn('debugger')
}

function Browser({ api, session, logout, expire }: { api: Api; session: Session; logout: () => void; expire: () => void }) {
  const [catalog, setCatalog] = useState<Effect[] | null>(null)
  const [catalogSource, setCatalogSource] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [players, setPlayers] = useState<Player[] | null>(null)
  /** the running copies of worlds (null: not loaded, or not allowed) */
  const [instances, setInstances] = useState<Instances | null>(null)
  const [instancesError, setInstancesError] = useState('')
  const [playersError, setPlayersError] = useState('')
  const [chosen, setChosen] = useStored<Chosen | null>(KEYS.player, null)
  const [filters, setFilters] = useStored<Filters>(KEYS.filters, NO_FILTERS)
  const [notes, setNotes] = useStored<Notes>(KEYS.notes, {})
  const [customTags, setCustomTags] = useStored<string[]>(KEYS.tags, [])
  const [autoplay, setAutoplay] = useStored(KEYS.autoplay, true)
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [tab, setTab] = useState<Tab>('effect')
  const [section, setSection] = useStored<Section>(KEYS.debugSection, 'quick')
  const [consoleValue, setConsoleValue] = useState('')
  /** narrow screens: which pane shows */
  const [narrowPane, setNarrowPane] = useState<'main' | 'console'>('main')
  const [palette, setPalette] = useState(false)
  const [playfields, setPlayfields] = useState<Playfield[]>([])
  const [minifigures, setMinifigures] = useState<Minifigure[]>([])
  const [tests, setTests] = useState<TestCatalog | null>(null)
  const [monsters, setMonsters] = useState<MonsterData[]>([])
  const [animations, setAnimations] = useState<AnimationCatalog | null>(null)
  const [bccStates, setBccStates] = useState<BccStates | null>(null)
  const [fxAt, setFxAt] = useStored<FxAt>(KEYS.fxAt, '')
  const [testsError, setTestsError] = useState('')
  /** the signed-in account's GM level (null: an API key, or not known yet) */
  const [myLevel, setMyLevel] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const consoleRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const logId = useRef(0)

  /** 401 anywhere means the session is gone: back to the login. */
  const failed = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError && e.status === 401) expire()
      if (e instanceof ApiError) {
        if (e.code === 'game_server_unavailable') return 'the game server is down'
        if (e.code === 'no_control') return 'the API runs without a game server connection'
        if (e.code === 'forbidden') return 'not allowed here'
        return e.message
      }
      return String(e)
    },
    [expire],
  )

  const loadCatalog = useCallback(() => {
    setCatalogError('')
    api
      .effects()
      .then((c) => {
        setCatalog(c.effects)
        setCatalogSource(api.base)
      })
      .catch((e) => setCatalogError(failed(e)))
  }, [api, failed])

  useEffect(loadCatalog, [loadCatalog])

  // game data for the pickers and completions (public lists, and the test command catalog)
  const loadGameData = useCallback(() => {
    api.playfields().then(setPlayfields).catch(() => {})
    api.minifigures().then(setMinifigures).catch(() => {})
    // (absent from lmoxide-api builds before the catalogs: the pickers fall back to numbers)
    api.monsters().then((m) => setMonsters(m.monster_data)).catch(() => {})
    api.animations().then(setAnimations).catch(() => {})
    api.bccStates().then(setBccStates).catch(() => {})
    api
      .testCatalog()
      .then((t) => {
        setTests(t)
        setTestsError('')
      })
      .catch((e) => setTestsError(failed(e)))
  }, [api, failed])

  useEffect(loadGameData, [loadGameData])

  useEffect(() => {
    if (session.expires_at === undefined) return // an API key: no account
    api
      .me()
      .then((m) => setMyLevel(m.gm_level))
      .catch(() => {})
  }, [api, session.expires_at])

  // admins and moderators see everyone online; other accounts their own characters
  const seesEveryone = session.scope !== null
  const loadPlayers = useCallback(() => {
    ;(seesEveryone ? api.players() : api.myPlayers())
      .then((p) => {
        setPlayers(p)
        setPlayersError('')
      })
      .catch((e) => setPlayersError(failed(e)))
  }, [api, failed, seesEveryone])

  // every second: the position dock (bottom right) always shows the player's coordinates
  const tracking = !!chosen
  useEffect(() => {
    loadPlayers()
    const t = setInterval(() => document.visibilityState === 'visible' && loadPlayers(), tracking ? 1_000 : 5_000)
    return () => clearInterval(t)
  }, [loadPlayers, tracking])

  // the running copies of worlds, refreshed like the players while the Instances section shows
  const loadInstances = useCallback(() => {
    api
      .instances()
      .then((i) => {
        setInstances(i)
        setInstancesError('')
      })
      .catch((e) => setInstancesError(e instanceof ApiError && e.status === 403 ? 'needs a moderator (GM level 3 or more; the moderate scope)' : failed(e)))
  }, [api, failed])
  const showingInstances = section === 'instances'
  useEffect(() => {
    if (!showingInstances) return
    loadInstances()
    const t = setInterval(() => document.visibilityState === 'visible' && loadInstances(), 5_000)
    return () => clearInterval(t)
  }, [loadInstances, showingInstances])

  const gameData: GameData = useMemo(
    () => ({ effects: catalog ?? [], playfields, minifigures, tests, monsters, animations, bccStates }),
    [catalog, playfields, minifigures, tests, monsters, animations, bccStates],
  )

  /** `!fx <id> [hook]`, played where the Effects section says (on me, @near, @ground). */
  const fxCommand = useCallback((id: number, hook?: string) => ['!fx', id, hook, fxAt].filter(Boolean).join(' '), [fxAt])

  // one sound at a time, from the API (GET /v1/catalog/sounds/{id})
  const audio = useRef<HTMLAudioElement | null>(null)
  const listen = useCallback(
    async (id: number) => {
      try {
        const blob = await api.sound(id)
        audio.current?.pause()
        if (audio.current?.src) URL.revokeObjectURL(audio.current.src)
        audio.current = new Audio(URL.createObjectURL(blob))
        await audio.current.play()
      } catch (e) {
        setLog((l) => [{ id: ++logId.current, at: Date.now(), command: `♪ sound ${id}`, player: 'this browser', status: 'error' as const, message: failed(e) }, ...l])
      }
    },
    [api, failed],
  )

  const facts = useMemo(() => new Map((catalog ?? []).map((e) => [e.id, factsOf(e)])), [catalog])
  const byId = useMemo(() => new Map((catalog ?? []).map((e) => [e.id, e])), [catalog])
  const timelineTypes = useMemo(() => [...new Set([...facts.values()].flatMap((f) => [...f.types]))].sort(), [facts])
  const tags = useMemo(() => {
    const used = Object.values(notes).flatMap((n) => n.tags)
    return [...new Set([...DEFAULT_TAGS, ...customTags, ...used])]
  }, [notes, customTags])

  const terms = useMemo(() => vocabulary(catalog ?? [], tags), [catalog, tags])
  const suggestSearch = useCallback((v: string) => searchSuggestions(v, terms, catalog ?? []), [terms, catalog])

  const filtered = useMemo(() => {
    const text = textMatcher(filters.text)
    const noteOk = (id: number) => {
      const n = notes[id]
      if (!filters.note) return true
      if (filters.note === '*') return !isEmpty(n)
      if (filters.note === '-') return isEmpty(n)
      return !!n?.tags.includes(filters.note)
    }
    const out = (catalog ?? []).filter((e) => {
      const f = facts.get(e.id)!
      return matches(filters, e, f) && noteOk(e.id) && text(e, f)
    })
    out.sort((a, b) => (filters.desc ? b.id - a.id : a.id - b.id))
    return out
  }, [catalog, facts, filters, notes])

  // select the first entry once there is something to show
  useEffect(() => {
    if (selected === null && filtered.length) setSelected(filtered[0].id)
  }, [filtered, selected])

  // by account id, else by username (a remembered choice from an older server's accounts)
  const online =
    players?.find((p) => p.account_id === chosen?.account_id) ??
    players?.find((p) => !!chosen && p.username.toLowerCase() === chosen.username.toLowerCase())
  const positionCopy = usePositionCopy(online)
  const admin = session.scope === 'admin'
  // without admin, commands go to one's own character: choose it
  useEffect(() => {
    if (admin || !players?.length || online) return
    const p = players[0]
    setChosen({ account_id: p.account_id, username: p.username, character_name: p.character_name })
  }, [admin, players, online, setChosen])
  /** What the player commands go to may run: their GM level against each command's
   * (`GET /v1/catalog/test-commands`); without levels in the catalog, everything. */
  const level = online?.gm_level ?? myLevel
  const commandLevels = useMemo(() => new Map((tests?.commands ?? []).map((c) => [c.usage.split(/\s/)[0].toLowerCase(), c.gm_level ?? 0])), [tests])
  const may = useCallback(
    (command: string) => level === null || level >= (commandLevels.get(command.split(/\s/)[0].toLowerCase()) ?? 0),
    [level, commandLevels],
  )
  const canSend = !!chosen && (admin || (!!online && online.account_id === chosen.account_id))
  const canFx = canSend && may('!fx')
  /** the Effects section is open (and allowed: contributors): the right pane shows the entry, the console and notes */
  const effectsOpen = section === 'effects' && may('!fx')

  const send = useCallback(
    async (command: string) => {
      if (!chosen) return
      const id = ++logId.current
      if (!may(command)) {
        const needs = commandLevels.get(command.split(/\s/)[0].toLowerCase())
        setLog((l) => [{ id, at: Date.now(), command, player: chosen.character_name || chosen.username, status: 'error' as const, message: `needs GM level ${needs}` }, ...l].slice(0, 200))
        return
      }
      setLog((l) => [{ id, at: Date.now(), command, player: chosen.character_name || chosen.username, status: 'pending' as const }, ...l].slice(0, 200))
      const update = (patch: Partial<LogEntry>) => setLog((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
      try {
        const r = admin ? await api.command(online?.account_id ?? chosen.account_id, command) : await api.myCommand(command)
        if (r.affected > 0) {
          update({ status: 'ok', replies: r.replies })
          const fx = /^!fx\s+(\d+)/.exec(command)
          if (fx) setPlaying(Number(fx[1]))
          else if (/^!fx\s+stop/.test(command)) setPlaying(null)
        } else update({ status: 'warn', message: 'reached nobody: is the player still online?' })
      } catch (e) {
        update({ status: 'error', message: failed(e) })
      }
    },
    [api, chosen, online, failed, admin, may, commandLevels],
  )

  const setNote = useCallback(
    (id: number, n: Note) =>
      setNotes((all) => {
        const next = { ...all }
        if (isEmpty(n)) delete next[id]
        else next[id] = n
        return next
      }),
    [setNotes],
  )

  const step = useCallback(
    (by: number) => {
      if (!filtered.length) return
      const i = filtered.findIndex((e) => e.id === selected)
      const next = filtered[i < 0 ? 0 : Math.min(filtered.length - 1, Math.max(0, i + by))]
      setSelected(next.id)
      setTab((t) => (t === 'notes' ? 'effect' : t))
      if (autoplay && canFx && next.kind === 'effectpackage' && next.id !== selected) send(fxCommand(next.id))
    },
    [filtered, selected, autoplay, canFx, send, fxCommand],
  )

  // keyboard: j/k or arrows step through the filtered list, Enter plays, s stops, 1-9 tag
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === ':') {
        e.preventDefault()
        focusConsole()
        return
      }
      if (!effectsOpen) return
      const sel = selected === null ? undefined : byId.get(selected)
      if (e.key === 'j' || e.key === 'ArrowDown') step(1)
      else if (e.key === 'k' || e.key === 'ArrowUp') step(-1)
      else if (e.key === 'PageDown') step(10)
      else if (e.key === 'PageUp') step(-10)
      else if ((e.key === 'Enter' || e.key === 'p') && sel?.kind === 'effectpackage' && canFx && !el.closest('button')) send(fxCommand(sel.id))
      else if (e.key === 's' && canFx) send('!fx stop')
      else if (e.key === '/') searchRef.current?.focus()
      else if (/^[1-9]$/.test(e.key) && sel) {
        const t = tags[Number(e.key) - 1]
        if (!t) return
        const n = notes[sel.id] ?? { tags: [], text: '', updated: 0 }
        setNote(sel.id, { ...n, tags: n.tags.includes(t) ? n.tags.filter((x) => x !== t) : [...n.tags, t], updated: Date.now() })
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, selected, byId, canFx, send, tags, notes, setNote, effectsOpen, fxCommand])

  /** Shows an entry in the Effects section (clearing filters that hide it), and plays it if asked. */
  function showEffect(id: number, play = false) {
    setSection('effects')
    setNarrowPane('console')
    setFilters((f) => (filtered.some((e) => e.id === id) ? f : { ...NO_FILTERS, desc: f.desc }))
    setSelected(id)
    setTab('effect')
    if (play && canFx && byId.get(id)?.kind === 'effectpackage') send(fxCommand(id))
  }

  /** Shows the console (a tab beside the entry in the Effects section, else the right pane) and focuses it. */
  function focusConsole(value?: string) {
    if (value !== undefined) setConsoleValue(value)
    if (effectsOpen) setTab('console')
    setNarrowPane('console')
    setTimeout(() => consoleRef.current?.focus(), 0)
  }

  const current = selected === null ? undefined : byId.get(selected)
  const noteCount = Object.values(notes).filter((n) => !isEmpty(n)).length
  const last = log[0]

  return (
    <div className="app">
      <header className="top">
        <ToolSwitch current="debugger" />
        <nav className="views" aria-label="Views">
          <button className="search-all" onClick={() => setPalette(true)} title="Search everything (Ctrl+K)">
            <span>⌕ Search all: effects, places, targets, commands…</span> <kbd>Ctrl K</kbd>
          </button>
        </nav>
        <div className="who">
          <span className="muted small" title={api.base}>
            {session.label} · {session.scope ?? 'no scope'}
          </span>
          <button
            className="ghost"
            onClick={() => {
              const b = window.prompt('API base URL', api.base)
              if (b && b.trim() && b.trim() !== api.base) switchApi(b.trim())
            }}
            title={`API: ${api.base}`}
          >
            ⚙
          </button>
          <button className="ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {((!admin && level !== null && level < 1) || playersError || (chosen && players && !online) || (online && online.gm_level < 1)) && (
        <div className="banners">
          {!admin && level !== null && level < 1 && !online && (
            <p className="banner warn">This account has GM level {level}: you can browse, but test commands need an alpha tester (GM level 1) or more.</p>
          )}
          {playersError && <p className="banner warn">Players: {playersError}</p>}
          {chosen && players && !online && (
            <p className="banner warn">
              {chosen.character_name} ({chosen.username}) isn't online; log in with the game client, then ↻.
            </p>
          )}
          {online && online.gm_level < 1 && (
            <p className="banner warn">
              {online.username} has GM level {online.gm_level}: test commands need an alpha tester (GM level 1) or more (set it in the admin web UI and log in again).
            </p>
          )}
        </div>
      )}

      <main className="panes debug-panes">
        {/* narrow screens: one pane at a time */}
        <div className="segmented narrow-tabs">
          <button className={narrowPane === 'main' ? 'on' : ''} onClick={() => setNarrowPane('main')}>
            Debug
          </button>
          <button className={narrowPane === 'console' ? 'on' : ''} onClick={() => setNarrowPane('console')}>
            {effectsOpen ? 'Effect & console' : 'Console'}{log.length ? ` (${log.length})` : ''}
          </button>
        </div>
        <div className={`left${narrowPane === 'main' ? '' : ' narrow-hidden'}`}>
          <Debug
            data={gameData}
            testsError={testsError}
            online={online}
            players={players ?? []}
            instances={instances}
            instancesError={instancesError}
            loadInstances={loadInstances}
            canSend={canSend}
            may={may}
            moderator={session.scope === 'moderate' || admin}
            send={send}
            section={section}
            setSection={setSection}
            fillCommand={(c) => focusConsole(c)}
            showEffect={(id) => showEffect(id)}
            positionCopy={positionCopy}
            api={api}
            effects={
              !catalog ? (
                <div className="loading">
                  {catalogError ? (
                    <div className="card">
                      <p className="error">Couldn't load the effect catalog: {catalogError}</p>
                      <p>
                        <button onClick={loadCatalog}>Try again</button> or{' '}
                        <button onClick={() => fileRef.current?.click()}>open an effect_catalog.json…</button>
                      </p>
                      <p className="muted small">The file is <code>data/effect_catalog.json</code> in the LMOxide repo; commands still go through the API.</p>
                    </div>
                  ) : (
                    <p className="muted">Loading the effect catalog (about 2 MB)…</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="effects-tools">
                    <label className="check" title="Play each effect as you step with j/k or the arrow keys">
                      <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} /> play on step
                    </label>
                    <button className="ghost" disabled={!canFx} onClick={() => send('!fx stop')} title="!fx stop (s)">
                      ■ stop
                    </button>
                  </div>
                  <FilterPanel
                    filters={filters}
                    set={(f) => setFilters((old) => ({ ...old, ...f }))}
                    timelineTypes={timelineTypes}
                    tags={tags}
                    shown={filtered.length}
                    total={catalog.length}
                    searchRef={searchRef}
                    suggest={suggestSearch}
                  />
                  <EffectList
                    items={filtered}
                    facts={facts}
                    notes={notes}
                    selected={selected}
                    playing={playing}
                    onSelect={(id) => {
                      setSelected(id)
                      setTab((t) => (t === 'notes' ? 'effect' : t))
                    }}
                    onPlay={(id) => canFx && send(fxCommand(id))}
                  />
                </>
              )
            }
          />
        </div>
        <div className={`right${narrowPane === 'console' ? '' : ' narrow-hidden'}`}>
          {effectsOpen ? (
            <>
              <nav className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'effect'} className={tab === 'effect' ? 'on' : ''} onClick={() => setTab('effect')}>
                  Effect
                </button>
                <button role="tab" aria-selected={tab === 'console'} className={tab === 'console' ? 'on' : ''} onClick={() => setTab('console')}>
                  Console
                </button>
                <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>
                  Notes {noteCount > 0 && <span className="pill">{noteCount}</span>}
                </button>
              </nav>
              <div className="tab-body">
                {tab === 'effect' &&
                  (current ? (
                    <Detail
                      key={current.id}
                      effect={current}
                      note={notes[current.id]}
                      tags={tags}
                      canSend={canFx}
                      onCommand={send}
                      play={(hook) => send(fxCommand(current.id, hook))}
                      fxAt={fxAt}
                      setFxAt={setFxAt}
                      listen={listen}
                      onNote={(n) => {
                        for (const t of n.tags) if (!tags.includes(t)) setCustomTags((c) => [...c, t])
                        setNote(current.id, n)
                      }}
                    />
                  ) : (
                    <p className="muted">Pick an entry on the left.</p>
                  ))}
                {tab === 'console' && (
                  <Console log={log} data={gameData} canSend={canSend} onCommand={send} value={consoleValue} setValue={setConsoleValue} inputRef={consoleRef} />
                )}
                {tab === 'notes' && (
                  <NotesPanel
                    notes={notes}
                    setNotes={setNotes}
                    catalog={byId}
                    apiBase={api.base}
                    onShow={(id) => {
                      setSelected(id)
                      setTab('effect')
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="tab-body">
              <Console log={log} data={gameData} canSend={canSend} onCommand={send} value={consoleValue} setValue={setConsoleValue} inputRef={consoleRef} />
            </div>
          )}
        </div>
      </main>

      {palette && (
        <Palette
          data={gameData}
          canSend={canSend}
          send={send}
          onClose={() => setPalette(false)}
          fillCommand={(c) => focusConsole(c)}
          showEffect={showEffect}
        />
      )}

      <PositionDock data={gameData} online={online} pc={positionCopy}>
        <div className="player-dock-bar">
          <label>
            Player
            <select
              value={chosen?.account_id ?? ''}
              onChange={(e) => {
                const p = players?.find((x) => x.account_id === Number(e.target.value))
                setChosen(p ? { account_id: p.account_id, username: p.username, character_name: p.character_name } : null)
              }}
            >
              <option value="">{players?.length ? 'choose a player…' : seesEveryone ? 'nobody online' : 'log in to the game first'}</option>
              {chosen && !online && (
                <option value={chosen.account_id}>
                  {chosen.character_name} ({chosen.username}) — offline
                </option>
              )}
              {players?.map((p) => (
                <option key={p.account_id} value={p.account_id}>
                  {p.character_name} ({p.username}){p.mode ? ` · ${modeName(p.mode)}` : ''}{p.gm_level < 1 ? ' — GM level 0' : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="ghost" onClick={loadPlayers} title="Refresh the players online">
            ↻
          </button>
          <label title={online ? `!mode: play ${online.character_name}'s character in another game mode` : 'choose a player online first'}>
            Mode
            <select value={online?.mode ?? ''} disabled={!online || !canSend || !may('!mode')} onChange={(e) => send(`!mode ${e.target.value === 'world-editor' ? 'editor' : e.target.value}`)}>
              {!online?.mode && <option value="">—</option>}
              {MODES.map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </PositionDock>

      <footer className="status">
        <span className="keys">
          <kbd>Ctrl K</kbd> search all · <kbd>:</kbd> command · <kbd>Ctrl Shift C</kbd> copy position
          {effectsOpen && (
            <>
              {' '}
              · <kbd>j</kbd>/<kbd>k</kbd> next/prev · <kbd>Enter</kbd> play · <kbd>s</kbd> stop · <kbd>1</kbd>–<kbd>9</kbd> tag · <kbd>/</kbd> search
            </>
          )}
        </span>
        <span className={`last ${last?.status ?? ''}`}>
          {last ? (
            <>
              <code>{last.command}</code>{' '}
              {last.status === 'pending' ? '…' : last.status === 'ok' ? (last.replies?.length ? `✓ ${last.replies.join(' · ')}` : '✓') : `— ${last.message}`}
            </>
          ) : (
            catalogSource && <span className="muted">{catalog?.length.toLocaleString()} effects from {catalogSource}</span>
          )}
        </span>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const c = normalizeCatalog(JSON.parse(await f.text()) as EffectCatalog)
            if (!Array.isArray(c.effects)) throw new Error('no "effects" list')
            setCatalog(c.effects)
            setCatalogSource(f.name)
            setCatalogError('')
          } catch (err) {
            setCatalogError(`${f.name}: ${err instanceof Error ? err.message : err}`)
          }
        }}
      />
    </div>
  )
}
