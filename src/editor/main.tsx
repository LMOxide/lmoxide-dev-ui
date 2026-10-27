import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { apiBase, expired, renewSessions, session, signOut, toSignIn } from '../tools'
import { HttpBackend } from './backend'
import { MockBackend } from './mock'
import { WorldEditor } from './WorldEditor'
import '../styles.css'
import './editor.css'

/** /editor/?mock runs against an in-memory server; otherwise the world editor's session (sign-in page). */
function EditorApp() {
  const mock = useMemo(() => (new URLSearchParams(window.location.search).has('mock') ? new MockBackend() : null), [])
  const s = mock ? null : session('editor')
  const backend = useMemo(() => mock ?? new HttpBackend(apiBase('editor'), s?.token ?? null), [mock, s?.token])
  if (mock) return <WorldEditor backend={mock} />
  if (!s) {
    toSignIn('editor')
    return null
  }
  return <WorldEditor backend={backend} onLogout={() => signOut('editor')} onExpire={() => expired('editor')} />
}

// a remembered session past half its life is renewed before anything uses its token
renewSessions().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <EditorApp />
    </StrictMode>,
  ),
)
