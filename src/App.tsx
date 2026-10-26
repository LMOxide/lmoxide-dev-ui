import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Api, ApiError, defaultApiBase } from './api'
import { NO_FILTERS, facts as factsOf, matches, textMatcher, type Filters } from './catalog'
import { Detail } from './Detail'
import { EffectList } from './EffectList'
import { FilterPanel } from './Filters'
import { Login } from './Login'
import { DEFAULT_TAGS, isEmpty, type Note, type Notes } from './notes'
import { NotesPanel } from './NotesPanel'
import { KEYS, loadJson, saveJson } from './storage'
import { Console, type LogEntry } from './Console'
import { Debug, type Section } from './Debug'
import { Palette } from './Palette'
import { playfieldName, searchSuggestions, vocabulary, type GameData } from './suggest'
import type { Effect, EffectCatalog, Minifigure, Player, Playfield, Session, TestCatalog } from './types'

/** The player chosen to preview on, remembered across visits (they may be offline now). */
interface Chosen {
  account_id: number
  username: string
  character_name: string
}

type Tab = 'effect' | 'console' | 'notes'
type View = 'effects' | 'debug'

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

export default function App() {
  const [apiBase, setApiBase] = useStored(KEYS.apiBase, defaultApiBase())
  const [session, setSession] = useStored<Session | null>(KEYS.session, null, true)
  const api = useMemo(() => new Api(apiBase, session?.token ?? null), [apiBase, session])

  const expired = session?.expires_at !== undefined && session.expires_at * 1000 < Date.now()
  useEffect(() => {
    if (expired) setSession(null)
  }, [expired, setSession])

  if (!session || expired) return <Login apiBase={apiBase} onApiBase={setApiBase} onSession={setSession} />
  return <Browser api={api} session={session} setApiBase={setApiBase} logout={() => setSession(null)} />
}

function Browser({ api, session, setApiBase, logout }: { api: Api; session: Session; setApiBase: (b: string) => void; logout: () => void }) {
  const [catalog, setCatalog] = useState<Effect[] | null>(null)
  const [catalogSource, setCatalogSource] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [players, setPlayers] = useState<Player[] | null>(null)
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
  const [view, setView] = useStored<View>(KEYS.view, 'effects')
  const [section, setSection] = useStored<Section>(KEYS.debugSection, 'quick')
  const [consoleValue, setConsoleValue] = useState('')
  const [palette, setPalette] = useState(false)
  const [playfields, setPlayfields] = useState<Playfield[]>([])
  const [minifigures, setMinifigures] = useState<Minifigure[]>([])
  const [tests, setTests] = useState<TestCatalog | null>(null)
  const [testsError, setTestsError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const consoleRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const logId = useRef(0)

  /** 401 anywhere means the session is gone: back to the login. */
  const failed = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError && e.status === 401) logout()
      if (e instanceof ApiError) {
        if (e.code === 'game_server_unavailable') return 'the game server is down'
        if (e.code === 'no_control') return 'the API runs without a game server connection'
        if (e.code === 'forbidden') return 'not allowed (commands need the admin scope)'
        return e.message
      }
      return String(e)
    },
    [logout],
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
    api
      .testCatalog()
      .then((t) => {
        setTests(t)
        setTestsError('')
      })
      .catch((e) => setTestsError(failed(e)))
  }, [api, failed])

  useEffect(loadGameData, [loadGameData])

  const loadPlayers = useCallback(() => {
    api
      .players()
      .then((p) => {
        setPlayers(p)
        setPlayersError('')
      })
      .catch((e) => setPlayersError(failed(e)))
  }, [api, failed])

  useEffect(() => {
    loadPlayers()
    const t = setInterval(() => document.visibilityState === 'visible' && loadPlayers(), 20_000)
    return () => clearInterval(t)
  }, [loadPlayers])

  const gameData: GameData = useMemo(() => ({ effects: catalog ?? [], playfields, minifigures, tests }), [catalog, playfields, minifigures, tests])

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

  const online = players?.find((p) => p.account_id === chosen?.account_id)
  const admin = session.scope === 'admin'
  const canSend = admin && !!chosen

  const send = useCallback(
    async (command: string) => {
      if (!chosen) return
      const id = ++logId.current
      setLog((l) => [{ id, at: Date.now(), command, player: chosen.character_name || chosen.username, status: 'pending' as const }, ...l].slice(0, 200))
      const update = (patch: Partial<LogEntry>) => setLog((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
      try {
        const r = await api.command(chosen.account_id, command)
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
    [api, chosen, failed],
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
      if (autoplay && canSend && next.kind === 'effectpackage' && next.id !== selected) send(`!fx ${next.id}`)
    },
    [filtered, selected, autoplay, canSend, send],
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
      if (view !== 'effects') return
      const sel = selected === null ? undefined : byId.get(selected)
      if (e.key === 'j' || e.key === 'ArrowDown') step(1)
      else if (e.key === 'k' || e.key === 'ArrowUp') step(-1)
      else if (e.key === 'PageDown') step(10)
      else if (e.key === 'PageUp') step(-10)
      else if ((e.key === 'Enter' || e.key === 'p') && sel?.kind === 'effectpackage' && canSend && !el.closest('button')) send(`!fx ${sel.id}`)
      else if (e.key === 's' && canSend) send('!fx stop')
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
  }, [step, selected, byId, canSend, send, tags, notes, setNote, view])

  /** Shows the console (a tab in the effect view, always there in the debug view) and focuses it. */
  function focusConsole(value?: string) {
    if (value !== undefined) setConsoleValue(value)
    if (view === 'effects') setTab('console')
    setTimeout(() => consoleRef.current?.focus(), 0)
  }

  const current = selected === null ? undefined : byId.get(selected)
  const noteCount = Object.values(notes).filter((n) => !isEmpty(n)).length
  const last = log[0]

  return (
    <div className="app">
      <header className="top">
        <h1>
          LMOxide <span className="muted">debug browser</span>
        </h1>
        <nav className="views" aria-label="Views">
          <button className={view === 'effects' ? 'on' : ''} onClick={() => setView('effects')}>
            Effects
          </button>
          <button className={view === 'debug' ? 'on' : ''} onClick={() => setView('debug')}>
            Debug
          </button>
          <button className="ghost search-all" onClick={() => setPalette(true)} title="Search everything (Ctrl+K)">
            ⌕ Search all <kbd>Ctrl K</kbd>
          </button>
        </nav>
        <div className="player">
          <label>
            Player
            <select
              value={chosen?.account_id ?? ''}
              onChange={(e) => {
                const p = players?.find((x) => x.account_id === Number(e.target.value))
                setChosen(p ? { account_id: p.account_id, username: p.username, character_name: p.character_name } : null)
              }}
            >
              <option value="">{players?.length ? 'choose a player…' : 'nobody online'}</option>
              {chosen && !online && (
                <option value={chosen.account_id}>
                  {chosen.character_name} ({chosen.username}) — offline
                </option>
              )}
              {players?.map((p) => (
                <option key={p.account_id} value={p.account_id}>
                  {p.character_name} ({p.username}){p.gm_level < 1 ? ' — GM level 0' : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="ghost" onClick={loadPlayers} title="Refresh the players online">
            ↻
          </button>
          {online?.playfield != null && <span className="muted small">in {playfieldName(gameData, online.playfield)}</span>}
          <label className="check" title="Play each entry as you step with j/k or the arrow keys">
            <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} /> play on step
          </label>
          <button className="ghost" disabled={!canSend} onClick={() => send('!fx stop')} title="!fx stop (s)">
            ■ stop
          </button>
        </div>
        <div className="who">
          <span className="muted small" title={api.base}>
            {session.label} · {session.scope ?? 'no scope'}
          </span>
          <button
            className="ghost"
            onClick={() => {
              const b = window.prompt('API base URL', api.base)
              if (b && b.trim() && b.trim() !== api.base) {
                setApiBase(b.trim())
                logout()
              }
            }}
            title={`API: ${api.base}`}
          >
            ⚙
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (session.expires_at !== undefined) api.logout().catch(() => {})
              logout()
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {(!admin || playersError || (chosen && players && !online) || (online && online.gm_level < 1)) && (
        <div className="banners">
          {!admin && <p className="banner warn">This login has the “{session.scope ?? 'none'}” scope: you can browse, but sending commands needs admin.</p>}
          {playersError && <p className="banner warn">Players: {playersError}</p>}
          {chosen && players && !online && (
            <p className="banner warn">
              {chosen.character_name} ({chosen.username}) isn't online; log in with the game client, then ↻.
            </p>
          )}
          {online && online.gm_level < 1 && (
            <p className="banner warn">
              {online.username} has GM level {online.gm_level}: test commands need GM level 1 or more (set it in the admin web UI and log in again).
            </p>
          )}
        </div>
      )}

      {view === 'debug' ? (
        <main className="panes debug-panes">
          <div className="left">
            <Debug
              data={gameData}
              testsError={testsError}
              online={online}
              canSend={canSend}
              send={send}
              section={section}
              setSection={setSection}
              fillCommand={(c) => focusConsole(c)}
            />
          </div>
          <div className="right">
            <div className="tab-body">
              <Console log={log} data={gameData} canSend={canSend} onCommand={send} value={consoleValue} setValue={setConsoleValue} inputRef={consoleRef} />
            </div>
          </div>
        </main>
      ) : !catalog ? (
        <main className="loading">
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
        </main>
      ) : (
        <main className="panes">
          <div className="left">
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
              onPlay={(id) => canSend && send(`!fx ${id}`)}
            />
          </div>
          <div className="right">
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
                    canSend={canSend}
                    onCommand={send}
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
          </div>
        </main>
      )}

      {palette && (
        <Palette
          data={gameData}
          canSend={canSend}
          send={send}
          onClose={() => setPalette(false)}
          fillCommand={(c) => focusConsole(c)}
          showEffect={(id, play) => {
            setView('effects')
            setFilters((f) => (filtered.some((e) => e.id === id) ? f : { ...NO_FILTERS, desc: f.desc }))
            setSelected(id)
            setTab('effect')
            if (play && canSend && byId.get(id)?.kind === 'effectpackage') send(`!fx ${id}`)
          }}
        />
      )}

      <footer className="status">
        <span className="keys">
          <kbd>Ctrl K</kbd> search all · <kbd>:</kbd> command
          {view === 'effects' && (
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
            const c = JSON.parse(await f.text()) as EffectCatalog
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
