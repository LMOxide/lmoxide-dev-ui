import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api'
import { ToolSwitch } from '../ToolSwitch'
import { describe, useHistory, type History } from './history'
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
import { FeaturePicker } from './Features'
import type { FeaturesView, Placeable, PlayerState, PlayfieldNotes, SurveyObject, Surveyor, TriggerTargets, WaveRef } from './types'

const ACCOUNT_KEY = 'lmofx.survey.account'
/** the feature new things go into */
const FEATURE_KEY = 'lmofx.editor.feature'
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
  /** what trigger walls can discover or open (null: not loaded) */
  targets: TriggerTargets | null
  /** what records can belong to */
  features: FeaturesView
  /** the feature new placements and walls go into */
  feature: string
  setFeature: (id: string) => void
  setFeatures: (f: FeaturesView) => void
  /** the looks marks can have */
  markLooks: string[]
  /** undo and redo */
  history: History
  /** Runs a call, shows its error, refreshes what it may have changed. */
  run: <T>(f: () => Promise<T>, refresh?: 'state' | 'all') => Promise<T | undefined>
  setState: (s: PlayerState) => void
  /** Puts a changed object in the list (and drops the guess it replaced). */
  upsert: (o: SurveyObject, replaced?: string) => void
}

export function WorldEditor({ backend, onLogout, onExpire }: { backend: SurveyBackend; onLogout?: () => void; onExpire?: () => void }) {
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [account, setAccount] = useState<number | null>(() => loadJson<number | null>(ACCOUNT_KEY, null))
  const [state, setState] = useState<PlayerState | null>(null)
  const [objects, setObjects] = useState<SurveyObject[]>([])
  const [notes, setNotes] = useState<PlayfieldNotes>({ notes: [], scripts: [] })
  const [catalog, setCatalog] = useState<Placeable[]>([])
  const [looks, setLooks] = useState<string[]>(['green'])
  const [targets, setTargets] = useState<TriggerTargets | null>(null)
  const [features, setFeatures] = useState<FeaturesView>({ categories: [], features: [] })
  const [feature, setFeatureState] = useState<string>(() => loadJson(FEATURE_KEY, 'live'))
  const setFeature = useCallback((id: string) => {
    setFeatureState(id)
    saveJson(FEATURE_KEY, id)
  }, [])
  const [markLooks, setMarkLooks] = useState<string[]>([])
  const history = useHistory(backend)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<RightTab>('selection')
  /** narrow screens: which column shows (0 place, 1 the playfield's objects, 2 the right one) */
  const [col, setCol] = useState(1)
  const [transfer, setTransfer] = useState(false)
  const [waveFilter, setWaveFilter] = useState<WaveRef | 'static' | null>(null)
  const loaded = useRef<{ playfield: number; revision: number } | null>(null)

  const failed = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) (onExpire ?? onLogout)?.()
      setError(e instanceof ApiError && e.code === 'not_found' && e.message.includes('survey') ? `the API at ${backend.label} doesn't reach a survey server: log out and sign in with the world editor's API (/editor-api on the dev server, or port 8091; lmoxide tools/survey-server.sh)` : e instanceof Error ? e.message : String(e))
    },
    [onExpire, onLogout, backend],
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
    backend.triggerTargets().then(setTargets).catch(() => {})
    backend.features().then(setFeatures).catch(() => {})
    backend.markLooks().then(setMarkLooks).catch(() => {})
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
    () =>
      state && account !== null
        ? { backend, account, state, objects, notes, catalog, looks, targets, features, feature, setFeature, setFeatures, markLooks, history, run, setState, upsert }
        : null,
    [backend, account, state, objects, notes, catalog, looks, targets, features, feature, setFeature, markLooks, history, run, upsert],
  )
  const selected = ctx && state?.selected ? (objects.find((o) => o.id === state.selected) ?? null) : null

  // selecting in game (by attacking) shows the selection
  const lastSelected = useRef<string | null>(null)
  useEffect(() => {
    if (state?.selected && state.selected !== lastSelected.current) setTab('selection')
    lastSelected.current = state?.selected ?? null
  }, [state?.selected])

  /** Undoes (or redoes) a step and selects what it leaves. */
  const undoRedo = useCallback(
    async (back: boolean) => {
      const id = await run(() => (back ? history.undo() : history.redo()), 'all')
      if (id && account !== null) run(() => backend.select(account, id))
    },
    [run, history, account, backend],
  )

  // Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y outside text boxes (where they edit the text)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!(e.ctrlKey || e.metaKey) || (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey && history.undoStack.length) (e.preventDefault(), undoRedo(true))
      else if (((k === 'z' && e.shiftKey) || k === 'y') && history.redoStack.length) (e.preventDefault(), undoRedo(false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, undoRedo])

  const mock = 'move' in backend ? (backend as unknown as MockBackend) : null

  return (
    <div className="sv">
      <header className="top sv-top">
        <ToolSwitch current="editor" />
        <div className="player">
          <label>
            Editing as
            <select value={account ?? ''} onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {surveyors.map((s) => (
                <option key={s.account_id} value={s.account_id}>
                  {s.character_name} ({s.username})
                </option>
              ))}
            </select>
          </label>
          <button className="ghost" onClick={() => backend.surveyors().then(setSurveyors).catch(failed)} title="Refresh the characters online on the survey server">
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
        {ctx && <FeaturePicker ctx={ctx} />}
        <div className="who">
          <button disabled={!history.undoStack.length || account === null} onClick={() => undoRedo(true)} title={history.undoStack.length ? `Undo: ${describe(history.undoStack[history.undoStack.length - 1])} (Ctrl+Z)` : 'Nothing to undo'}>
            ↶ Undo
          </button>
          <button disabled={!history.redoStack.length || account === null} onClick={() => undoRedo(false)} title={history.redoStack.length ? `Redo: ${describe(history.redoStack[history.redoStack.length - 1])} (Ctrl+Shift+Z)` : 'Nothing to redo'}>
            ↷ Redo
          </button>
          <button onClick={() => setTransfer(true)}>Import / export</button>
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
        {account === null && <p className="banner warn">Choose who you edit as: a character online on the survey server (its position places things).</p>}
      </div>
      {ctx && (
        <main className="sv-cols">
          {/* narrow screens: one column at a time */}
          <div className="segmented narrow-tabs">
            {['Place', 'In this playfield', selected ? 'Selection' : 'Selection & scripts'].map((label, i) => (
              <button key={i} className={col === i ? 'on' : ''} onClick={() => setCol(i)}>
                {label}
              </button>
            ))}
          </div>
          <section className={`sv-col${col === 0 ? '' : ' narrow-hidden'}`}>
            <Catalog ctx={ctx} catalog={catalog} />
          </section>
          <section className={`sv-col${col === 1 ? '' : ' narrow-hidden'}`}>
            <Objects
              ctx={ctx}
              waveFilter={waveFilter}
              setWaveFilter={setWaveFilter}
              onSelect={() => {
                setTab('selection')
                setCol(2)
              }}
            />
          </section>
          <section className={`sv-col${col === 2 ? '' : ' narrow-hidden'}`}>
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
