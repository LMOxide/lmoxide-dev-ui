import { StrictMode, useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Login } from '../Login'
import { loadJson, saveJson } from '../storage'
import type { Session } from '../types'
import { HttpBackend } from './backend'
import { MockBackend } from './mock'
import { Survey } from './Survey'
import '../styles.css'
import './survey.css'

/** Its own API base and session: the survey server's API is not the debug browser's. */
const SURVEY_KEYS = { apiBase: 'lmofx.survey.apiBase', session: 'lmofx.survey.session' }

/** The survey server's API: the dev server's /survey-api, else port 8091 of this host. */
function defaultSurveyApiBase(): string {
  if (import.meta.env.DEV) return '/survey-api'
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:8091`
}

/** survey.html?mock runs against an in-memory server. Otherwise the debug browser's login. */
function SurveyApp() {
  const mock = useMemo(() => (new URLSearchParams(window.location.search).has('mock') ? new MockBackend() : null), [])
  const [apiBase, setApiBaseState] = useState(() => loadJson(SURVEY_KEYS.apiBase, defaultSurveyApiBase()))
  const [session, setSessionState] = useState<Session | null>(() => loadJson<Session | null>(SURVEY_KEYS.session, null, true))
  const setApiBase = useCallback((b: string) => (saveJson(SURVEY_KEYS.apiBase, b), setApiBaseState(b)), [])
  const setSession = useCallback((s: Session | null) => (saveJson(SURVEY_KEYS.session, s, true), setSessionState(s)), [])
  const backend = useMemo(() => mock ?? new HttpBackend(apiBase, session?.token ?? null), [mock, apiBase, session])

  if (mock) return <Survey backend={mock} />
  const expired = session?.expires_at !== undefined && session.expires_at * 1000 < Date.now()
  if (!session || expired) return <Login apiBase={apiBase} onApiBase={setApiBase} onSession={setSession} />
  return <Survey backend={backend} onLogout={() => setSession(null)} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SurveyApp />
  </StrictMode>,
)
