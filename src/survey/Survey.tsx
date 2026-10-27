import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api'
import { loadJson, saveJson } from '../storage'
import type { SurveyBackend } from './backend'
import { Catalog } from './Catalog'
import { Editor } from './Editor'
import { fmtPos, toDegrees } from './geometry'
import { ImportExport } from './ImportExport'
import type { MockBackend } from './mock'
import { NotesPanel } from './NotesPanel'
import { Objects } from './Objects'
import { ScriptsPanel } from './ScriptsPanel'
import type { Placeable, PlayerState, PlayfieldNotes, SurveyObject, Surveyor, WaveRef } from './types'

const ACCOUNT_KEY = 'lmofx.survey.account'
const POLL_MS = 1000

type RightTab = 'selection' | 'scripts' | 'notes'

/** What the panels share: the surveyor's state and the calls that change it. */
export interface Ctx {
  backend: SurveyBackend
  account: number
  state: PlayerState
  objects: SurveyObject[]
  notes: PlayfieldNotes
  catalog: Placeable[]
  /** the looks trigger walls can have */
  looks: string[]
  /** Runs a call, shows its error, refreshes what it may have changed. */
  run: <T>(f: () => Promise<T>, refresh?: 'state' | 'all') => Promise<T | undefined>
  setState: (s: PlayerState) => void
  /** Puts a changed object in the list (and drops the guess it replaced). */
  upsert: (o: SurveyObject, replaced?: string) => void
}

export function Survey({ backend, onLogout }: { backend: SurveyBackend; onLogout?: () => void }) {
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [account, setAccount] = useState<number | null>(() => loadJson<number | null>(ACCOUNT_KEY, null))
  const [state, setState] = useState<PlayerState | null>(null)
  const [objects, setObjects] = useState<SurveyObject[]>([])
  const [notes, setNotes] = useState<PlayfieldNotes>({ notes: [], scripts: [] })
  const [catalog, setCatalog] = useState<Placeable[]>([])
  const [looks, setLooks] = useState<string[]>(['red', 'green'])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<RightTab>('selection')
  const [transfer, setTransfer] = useState(false)
  const [waveFilter, setWaveFilter] = useState<WaveRef | 'static' | null>(null)
  const loaded = useRef<{ playfield: number; revision: number } | null>(null)

  const failed = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout?.()
      setError(e instanceof ApiError && e.code === 'not_found' && e.message.includes('survey') ? `the API at ${backend.label} doesn't reach a survey server: log out and use the survey server's API (/survey-api here, or port 8091; tools/survey-server.sh)` : e instanceof Error ? e.message : String(e))
    },
    [onLogout, backend],
  )

  const loadPlayfield = useCallback(
    async (s: PlayerState) => {
      const [o, n] = await Promise.all([backend.objects(s.playfield), backend.notes(s.playfield)])
      setObjects(o.objects)
      setNotes(n)
      loaded.current = { playfield: s.playfield, revision: o.revision }
    },
    [backend],
  )

  const refresh = useCallback(
    async (all = false) => {
      if (account === null) return
      const s = await backend.state(account)
      setState(s)
      const l = loaded.current
      if (all || !l || l.playfield !== s.playfield || l.revision !== s.revision) await loadPlayfield(s)
    },
    [account, backend, loadPlayfield],
  )

  useEffect(() => {
    backend.surveyors().then(setSurveyors).catch(failed)
    backend.catalog().then(setCatalog).catch(failed)
    backend.wallLooks().then(setLooks).catch(() => {})
  }, [backend, failed])

  // pick the only surveyor online if none is chosen
  useEffect(() => {
    if (account === null && surveyors.length === 1) setAccount(surveyors[0].account_id)
  }, [account, surveyors])

  useEffect(() => {
    saveJson(ACCOUNT_KEY, account)
    loaded.current = null
    if (account === null) return
    let stop = false
    const tick = () =>
      refresh()
        .then(() => !stop && setError(''))
        .catch((e) => !stop && failed(e))
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [account, refresh, failed])

  const run = useCallback(
    async <T,>(f: () => Promise<T>, what: 'state' | 'all' = 'state') => {
      try {
        const r = await f()
        await refresh(what === 'all')
        return r
      } catch (e) {
        failed(e)
        return undefined
      }
    },
    [refresh, failed],
  )

  const upsert = useCallback((o: SurveyObject, replaced?: string) => {
    setObjects((list) => [...list.filter((x) => x.id !== o.id && x.id !== replaced), o])
  }, [])

  const ctx: Ctx | null = useMemo(
    () => (state && account !== null ? { backend, account, state, objects, notes, catalog, looks, run, setState, upsert } : null),
    [backend, account, state, objects, notes, catalog, looks, run, upsert],
  )
  const selected = ctx && state?.selected ? (objects.find((o) => o.id === state.selected) ?? null) : null

  // selecting in game (by attacking) shows the selection
  const lastSelected = useRef<string | null>(null)
  useEffect(() => {
    if (state?.selected && state.selected !== lastSelected.current) setTab('selection')
    lastSelected.current = state?.selected ?? null
  }, [state?.selected])

  const mock = 'move' in backend ? (backend as unknown as MockBackend) : null

  return (
    <div className="sv">
      <header className="top sv-top">
        <h1>
          LMOxide <span className="muted">survey</span>
        </h1>
        <div className="player">
          <label>
            Surveyor
            <select value={account ?? ''} onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {surveyors.map((s) => (
                <option key={s.account_id} value={s.account_id}>
                  {s.character_name} ({s.username})
                </option>
              ))}
            </select>
          </label>
          <button className="ghost" onClick={() => backend.surveyors().then(setSurveyors).catch(failed)} title="Refresh the surveyors online">
            ↻
          </button>
          {state && (
            <span className="where small">
              <b>{state.playfield_name ?? `Playfield ${state.playfield}`}</b>
              <span className="mono muted" title="Your position and heading">
                {fmtPos(state.pos)} · {toDegrees(state.heading)}°
              </span>
              {state.wearing && <span className="badge wave">wearing {state.wearing.name}</span>}
            </span>
          )}
          {mock && (
            <span className="sv-row tight" title="The mock's stand-in for walking in game">
              <button onClick={() => (mock.move(0, -Math.PI / 8), refresh())}>⟲</button>
              <button onClick={() => (mock.move(2, 0), refresh())}>walk 2 m</button>
              <button onClick={() => (mock.move(0, Math.PI / 8), refresh())}>⟳</button>
            </span>
          )}
        </div>
        <div className="who">
          <button onClick={() => setTransfer(true)}>Import / export</button>
          <a className="small" href="./index.html">
            Debug browser
          </a>
          <span className="muted small">{backend.label}</span>
          {onLogout && (
            <button className="ghost" onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      </header>
      <div className="banners">
        {error && <p className="banner warn">{error}</p>}
        {account === null && <p className="banner warn">Choose the surveyor (a character online on the survey server) whose position places things.</p>}
      </div>
      {ctx && (
        <main className="sv-cols">
          <section className="sv-col">
            <Catalog ctx={ctx} catalog={catalog} />
          </section>
          <section className="sv-col">
            <Objects ctx={ctx} waveFilter={waveFilter} setWaveFilter={setWaveFilter} onSelect={() => setTab('selection')} />
          </section>
          <section className="sv-col">
            <div className="segmented sv-tabs">
              {(['selection', 'scripts', 'notes'] as RightTab[]).map((t) => (
                <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                  {t === 'selection' ? 'Selection' : t === 'scripts' ? `Scripts (${notes.scripts.length})` : `Notes (${notes.notes.length})`}
                </button>
              ))}
            </div>
            {tab === 'selection' &&
              (selected ? (
                <Editor key={selected.id} ctx={ctx} object={selected} />
              ) : (
                <p className="muted">
                  Nothing selected. Pick something in the list, use <i>Select nearest</i>, or attack it in game.
                </p>
              ))}
            {tab === 'scripts' && <ScriptsPanel ctx={ctx} showWave={(w) => setWaveFilter(w)} />}
            {tab === 'notes' && <NotesPanel ctx={ctx} />}
          </section>
        </main>
      )}
      {transfer && <ImportExport backend={backend} playfield={state?.playfield ?? null} objects={objects} onClose={() => setTransfer(false)} onImported={() => refresh(true).catch(failed)} />}
    </div>
  )
}
