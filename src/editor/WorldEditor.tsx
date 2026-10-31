import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api'
import { ToolSwitch } from '../ToolSwitch'

import type { Instances, Player } from '../types'
import { modeName } from '../suggest'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { describe, useHistory, type History } from './history'
import { loadJson, saveJson } from '../storage'
import type { SurveyBackend } from './backend'
import type { ContentBackend, Kinds } from './content'
import { PositionDock, usePositionCopy } from '../PositionCopy'
import { Browser } from './Browser'
import { useWorlds } from './worlds'
import type { Suggestion } from './Suggest'
import { Publish, recordCount } from './Publish'
import type { MockBackend } from './mock'
import { FeaturePicker } from './Features'
import { NewTagsPicker } from './Tags'
import type { FeaturesView, WallLook, Placeable, PlayerState, PlayfieldNotes, SurveyObject, Surveyor, TagUse, TriggerTargets, Unpublished } from './types'

/** The state the editor uses with nobody in game (playfield -1: no world is "here"). */
const OFFLINE: PlayerState = { account_id: -1, character_name: '', playfield: -1, pos: [0, 0, 0], heading: 0, selected: null, hidden: [], shown_waves: {}, wearing: null, revision: 0 }

/** (the browser gives the real one: it owns the tabs) */
const noOpen = () => {}

const ACCOUNT_KEY = 'lmofx.survey.account'
/** the feature new things go into */
const FEATURE_KEY = 'lmofx.editor.feature'
/** the tags new things get */
const NEW_TAGS_KEY = 'lmofx.editor.new-tags'
const POLL_MS = 1000
/** how often the unpublished changes are counted */
const UNPUBLISHED_MS = 5000

/** What the panels share: the surveyor's state and the calls that change it. */
export interface Ctx {
  backend: SurveyBackend
  /** the content tree (records, schemas, catalogs) */
  content: ContentBackend
  /** its kinds and schemas (null: not loaded, or the server has no content routes) */
  kinds: Kinds | null
  /** opens a content record's page (the Definitions tab) */
  openRecord: (id: string, feature?: string) => void
  account: number
  state: PlayerState
  objects: SurveyObject[]
  notes: PlayfieldNotes
  catalog: Placeable[]
  /** the looks trigger walls and radii can have */
  looks: WallLook[]
  /** what trigger walls can discover or open (null: not loaded) */
  targets: TriggerTargets | null
  /** what records can belong to */
  features: FeaturesView
  /** the feature new placements and walls go into */
  feature: string
  setFeature: (id: string) => void
  setFeatures: (f: FeaturesView) => void
  /** every tag in use and the suggested ones */
  tags: TagUse[]
  /** the tags new placements, walls, notes and scripts get */
  newTags: string[]
  setNewTags: (tags: string[]) => void
  /** the looks marks can have */
  markLooks: string[]
  /** what a trigger wall can give: collect achievements and drops (their rule keys) */
  collects: Suggestion[]
  /** undo and redo */
  history: History
  /** Runs a call, shows its error, refreshes what it may have changed. */
  run: <T>(f: () => Promise<T>, refresh?: 'state' | 'all') => Promise<T | undefined>
  setState: (s: PlayerState) => void
  /** Puts a changed object in the list (and drops the guess it replaced). */
  upsert: (o: SurveyObject, replaced?: string) => void
}

export function WorldEditor({
  backend,
  content,
  username,
  onLogout,
  onExpire,
}: {
  backend: SurveyBackend
  content: ContentBackend
  /** the signed-in login (its character online is the one "Play this" previews with) */
  username?: string | null
  onLogout?: () => void
  onExpire?: () => void
}) {
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  /** everyone online in every mode, and the running copies (for "Play this" / "End preview") */
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [instances, setInstances] = useState<Instances | null>(null)
  /** the answer to the last "Play this" / "End preview" */
  const [moving, setMoving] = useState('')
  const [account, setAccount] = useState<number | null>(() => loadJson<number | null>(ACCOUNT_KEY, null))
  const [state, setState] = useState<PlayerState | null>(null)
  const [objects, setObjects] = useState<SurveyObject[]>([])
  const [notes, setNotes] = useState<PlayfieldNotes>({ notes: [], scripts: [] })
  const [catalog, setCatalog] = useState<Placeable[]>([])
  const [looks, setLooks] = useState<WallLook[]>([{ color: 'green', shape: 'wall' }])
  const [targets, setTargets] = useState<TriggerTargets | null>(null)
  const [features, setFeatures] = useState<FeaturesView>({ categories: [], features: [] })
  const [feature, setFeatureState] = useState<string>(() => loadJson(FEATURE_KEY, 'live'))
  const setFeature = useCallback((id: string) => {
    setFeatureState(id)
    saveJson(FEATURE_KEY, id)
  }, [])
  const [tags, setTags] = useState<TagUse[]>([])
  const [newTags, setNewTagsState] = useState<string[]>(() => loadJson(NEW_TAGS_KEY, []))
  const setNewTags = useCallback((t: string[]) => {
    setNewTagsState(t)
    saveJson(NEW_TAGS_KEY, t)
  }, [])
  const [markLooks, setMarkLooks] = useState<string[]>([])
  const [kinds, setKinds] = useState<Kinds | null>(null)
  useEffect(() => {
    content.kinds().then(setKinds).catch(() => setKinds(null))
  }, [content])
  const history = useHistory(backend)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)
  /** null: the server can't tell (older than publishing) */
  const [unpublished, setUnpublished] = useState<Unpublished[] | null>(null)
  const loaded = useRef<{ playfield: number; revision: number } | null>(null)

  const failed = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) (onExpire ?? onLogout)?.()
      setError(e instanceof ApiError && e.code === 'not_found' && e.message.includes('survey') ? `the API at ${backend.label} has no world editor routes (/v1/survey): is it an older lmoxide-api?` : e instanceof Error ? e.message : String(e))
    },
    [onExpire, onLogout, backend],
  )

  const worlds = useWorlds(backend, failed)
  const setWorld = worlds.set

  const loadPlayfield = useCallback(
    async (s: PlayerState) => {
      const [o, n] = await Promise.all([backend.objects(s.playfield), backend.notes(s.playfield)])
      setObjects(o.objects)
      setNotes(n)
      setWorld(s.playfield, { objects: o.objects, notes: n })
      loaded.current = { playfield: s.playfield, revision: o.revision }
      // (the tags in use change with the records)
      backend.tags().then(setTags).catch(() => {})
    },
    [backend, setWorld],
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

  // who is online, again every few seconds (a client logging in shows up without ↻)
  useEffect(() => {
    const load = () => {
      backend.surveyors().then(setSurveyors).catch(failed)
      backend
        .players()
        .then(setPlayers)
        .catch(() => setPlayers(null))
      backend
        .instances()
        .then(setInstances)
        .catch(() => setInstances(null))
    }
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 5_000)
    return () => clearInterval(t)
  }, [backend, failed])

  // the signed-in login edits as its own character when nobody (or someone gone) is chosen
  const me = username?.toLowerCase() ?? null
  const mine = surveyors.find((s) => s.username.toLowerCase() === me)
  useEffect(() => {
    if (mine && !surveyors.some((s) => s.account_id === account)) setAccount(mine.account_id)
  }, [mine, surveyors, account])

  // the signed-in login in game (any mode), and whether it is in its preview
  const myPlayer = players?.find((p) => p.username.toLowerCase() === me) ?? null
  const inPreview =
    !!myPlayer &&
    myPlayer.copy != null &&
    (instances
      ? instances.instances.some((i) => i.kind === 'preview' && i.playfield === myPlayer.playfield && i.copy === myPlayer.copy)
      : // (instances not readable: a copy past the main ones in the world editor mode)
        myPlayer.mode === 'world-editor' && myPlayer.copy >= 3)
  const previewBlocked = !myPlayer
      ? `${username ? `${username} isn't` : "You aren't"} in game: log in with the game client in the world editor mode`
      : myPlayer.mode !== 'world-editor'
        ? `${myPlayer.character_name} is in the ${modeName(myPlayer.mode ?? 'unknown')} mode: previews start from the world editor mode`
        : myPlayer.playfield == null
          ? `${myPlayer.character_name} isn't in a world yet`
          : null
  const preview = useCallback(
    async (end: boolean) => {
      if (!myPlayer) return
      const cmd = end ? '!preview end' : '!preview'
      try {
        const r = await backend.preview(end)
        setMoving(r.affected > 0 ? (r.replies?.join(' · ') ?? (end ? 'back from the preview' : 'on the way to the preview')) : `${cmd} reached nobody: are you still online?`)
      } catch (e) {
        setMoving(`${cmd}: ${e instanceof Error ? e.message : String(e)}`)
      }
      setTimeout(() => {
        backend.players().then(setPlayers).catch(() => {})
        backend.instances().then(setInstances).catch(() => {})
      }, 1500)
    },
    [backend, myPlayer],
  )

  // !mode: your character of the other game mode (the client asks to relocate; Yes goes there)
  const switchMode = useCallback(
    async (to: 'progression' | 'editor') => {
      try {
        const r = await backend.switchMode(to)
        setMoving(r.affected > 0 ? (r.replies?.join(' · ') ?? `on the way to the ${to} mode`) : `!mode ${to} reached nobody: are you still online?`)
      } catch (e) {
        setMoving(`!mode ${to}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [backend],
  )

  useEffect(() => {
    backend.catalog().then(setCatalog).catch(failed)
    backend.wallLooks().then(setLooks).catch(() => {})
    backend.triggerTargets().then(setTargets).catch(() => {})
    backend.features().then(setFeatures).catch(() => {})
    backend.markLooks().then(setMarkLooks).catch(() => {})
  }, [backend, failed])

  // what isn't published yet (edits are saved on the server as they are made)
  useEffect(() => {
    const load = () =>
      backend
        .unpublished()
        .then(setUnpublished)
        .catch(() => setUnpublished(null))
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), UNPUBLISHED_MS)
    return () => clearInterval(t)
  }, [backend])
  const mineUnpublished = recordCount(unpublished?.filter((c) => c.mine) ?? [])

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

  const worldUpsert = worlds.upsert
  const playfield = state?.playfield
  const upsert = useCallback(
    (o: SurveyObject, replaced?: string) => {
      setObjects((list) => [...list.filter((x) => x.id !== o.id && x.id !== replaced), o])
      if (playfield !== undefined) worldUpsert(o, playfield, replaced)
    },
    [worldUpsert, playfield],
  )

  const collects: Suggestion[] = useMemo(
    () => [
      ...worlds.smash.filter((a) => a.kind === 'collect').map((a) => ({ value: a.key, label: a.title, detail: a.text, group: 'Collectibles' })),
      ...Object.keys(worlds.rules)
        .filter((k) => k.startsWith('drop:'))
        .map((k) => ({ value: k, label: k.slice(5), group: 'Drops' })),
    ],
    [worlds.smash, worlds.rules],
  )

  const ctx: Ctx = useMemo(
    () =>
      // nobody chosen (or online): the tree can still be read and edited, without the game
      state && account !== null
        ? { backend, content, kinds, openRecord: noOpen, account, state, objects, notes, catalog, looks, targets, features, feature, setFeature, setFeatures, tags, newTags, setNewTags, markLooks, collects, history, run, setState, upsert }
        : { backend, content, kinds, openRecord: noOpen, account: -1, state: OFFLINE, objects: [], notes: { notes: [], scripts: [] }, catalog, looks, targets, features, feature, setFeature, setFeatures, tags, newTags, setNewTags, markLooks, collects, history, run, setState, upsert },
    [backend, content, kinds, account, state, objects, notes, catalog, looks, targets, features, feature, setFeature, tags, newTags, setNewTags, markLooks, collects, history, run, upsert],
  )
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
  // the debugger's position dock, for your own character here (heading in degrees there)
  const whereabouts = useMemo(
    () => (state && state.playfield >= 0 ? { position: state.pos, heading: (state.heading * 180) / Math.PI, playfield: state.playfield } : undefined),
    [state],
  )
  const positionCopy = usePositionCopy(whereabouts)

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
          <button className="ghost" onClick={() => backend.surveyors().then(setSurveyors).catch(failed)} title="Refresh the characters online in the world editor mode">
            ↻
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={previewBlocked ? 0 : -1}>
                <Button
                  variant={inPreview ? 'default' : 'outline'}
                  size="sm"
                  disabled={!!previewBlocked}
                  onClick={() => preview(inPreview)}
                >
                  {inPreview ? 'End preview' : 'Play this (preview)'}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {previewBlocked ??
                (inPreview
                  ? `!preview end: back to the world editor (you're in your preview, copy ${myPlayer?.copy})`
                  : '!preview: play this world as your working copy has it (unpublished changes too), enemies fighting, in a copy of your own')}
            </TooltipContent>
          </Tooltip>
          {myPlayer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => switchMode(myPlayer.mode === 'world-editor' ? 'progression' : 'editor')}
              title={`!mode: ${myPlayer.character_name} leaves for your character in the other mode; the game asks to relocate to a new server, click Yes`}
            >
              {myPlayer.mode === 'world-editor' ? 'Switch to Progression' : 'Switch to World Editor'}
            </Button>
          )}
          {state && (
            <span className="where small">
              <b>{state.playfield_name ?? `Playfield ${state.playfield}`}</b>
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
        {ctx && <NewTagsPicker ctx={ctx} />}
        <div className="who">
          <button disabled={!history.undoStack.length || account === null} onClick={() => undoRedo(true)} title={history.undoStack.length ? `Undo: ${describe(history.undoStack[history.undoStack.length - 1])} (Ctrl+Z)` : 'Nothing to undo'}>
            ↶ Undo
          </button>
          <button disabled={!history.redoStack.length || account === null} onClick={() => undoRedo(false)} title={history.redoStack.length ? `Redo: ${describe(history.redoStack[history.redoStack.length - 1])} (Ctrl+Shift+Z)` : 'Nothing to redo'}>
            ↷ Redo
          </button>
          {unpublished && (
            <button
              className={mineUnpublished ? 'primary' : ''}
              onClick={() => setPublishing(true)}
              title="Your work is saved on the server as you go; the progression and maxed modes only take in what you publish"
            >
              {mineUnpublished ? `Publish (${mineUnpublished})` : 'Saved · all published'}
            </button>
          )}
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
        {account === null && (
          <p className="banner warn">
            Nobody chosen to edit as: you can browse and edit the tree, but placing, moving to you and showing things in game need a character online in the world editor mode (choose it above).
            {myPlayer && myPlayer.mode !== 'world-editor' && (
              <>
                {` You're in game in the ${modeName(myPlayer.mode ?? 'unknown')} mode. `}
                <button onClick={() => switchMode('editor')}>Switch to World Editor</button>
              </>
            )}
          </p>
        )}
        {inPreview && <p className="banner">You're playing your preview (copy {myPlayer?.copy}) in game; End preview takes you back to the world editor.</p>}
        {moving && (
          <p className="banner" onClick={() => setMoving('')}>
            {moving}
          </p>
        )}
      </div>
      <Browser ctx={ctx} worlds={worlds} />
      <PositionDock place={state?.playfield_name ?? (whereabouts ? `Playfield ${whereabouts.playfield}` : undefined)} online={whereabouts} pc={positionCopy} empty="nobody chosen to edit as" />
      {publishing && unpublished && <Publish backend={backend} unpublished={unpublished} setUnpublished={setUnpublished} onClose={() => setPublishing(false)} />}
    </div>
  )
}
