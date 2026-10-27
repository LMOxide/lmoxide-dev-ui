import { StrictMode, useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultApiBase } from '../api'
import { Login } from '../Login'
import { KEYS, loadJson, saveJson } from '../storage'
import type { Session } from '../types'
import { HttpBackend } from './backend'
import { MockBackend } from './mock'
import { Survey } from './Survey'
import '../styles.css'
import './survey.css'

/** survey.html?mock runs against an in-memory server. Otherwise the debug browser's login. */
function SurveyApp() {
  const mock = useMemo(() => (new URLSearchParams(window.location.search).has('mock') ? new MockBackend() : null), [])
  const [apiBase, setApiBaseState] = useState(() => loadJson(KEYS.apiBase, defaultApiBase()))
  const [session, setSessionState] = useState<Session | null>(() => loadJson<Session | null>(KEYS.session, null, true))
  const setApiBase = useCallback((b: string) => (saveJson(KEYS.apiBase, b), setApiBaseState(b)), [])
  const setSession = useCallback((s: Session | null) => (saveJson(KEYS.session, s, true), setSessionState(s)), [])
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
