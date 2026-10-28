import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { apiBase, expired, renewSessions, session, signOut, toSignIn } from '../tools'
import { HttpBackend } from './backend'
import { MockBackend } from './mock'
import { HttpContent } from './content'
import { MockContent } from './contentMock'
import { WorldEditor } from './WorldEditor'
import { TooltipProvider } from '@/components/ui/tooltip'
import './app.css'

/** /editor/?mock runs against an in-memory server; otherwise the world editor's session (sign-in page). */
function EditorApp() {
  const mock = useMemo(() => (new URLSearchParams(window.location.search).has('mock') ? new MockBackend() : null), [])
  const s = mock ? null : session('editor')
  const backend = useMemo(() => mock ?? new HttpBackend(apiBase('editor'), s?.token ?? null), [mock, s?.token])
  const content = useMemo(() => (mock ? new MockContent() : new HttpContent(apiBase('editor'), s?.token ?? null)), [mock, s?.token])
  if (mock) return <WorldEditor backend={mock} content={content} />
  if (!s) {
    toSignIn('editor')
    return null
  }
  return <WorldEditor backend={backend} content={content} onLogout={() => signOut('editor')} onExpire={() => expired('editor')} />
}

// a remembered session past half its life is renewed before anything uses its token
renewSessions().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TooltipProvider>
        <EditorApp />
      </TooltipProvider>
    </StrictMode>,
  ),
)
