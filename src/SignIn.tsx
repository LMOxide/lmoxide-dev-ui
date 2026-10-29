import { useState } from 'react'
import { Api, ApiError } from './api'
import { API_PORT, apiBase, lastTool, rememberChoice, session, setApiBase, setLastTool, setRememberChoice, setSessionFor, TOOL, TOOLS, type Tool } from './tools'
import type { Session } from './types'

function why(e: unknown): string {
  if (!(e instanceof ApiError)) return String(e)
  if (e.code === 'bad_credentials') return 'wrong username or password (or the account is banned)'
  if (e.code === 'too_many_requests' || e.status === 429) return 'too many attempts, try again in a few minutes'
  if (e.code === 'unauthorized') return 'the API key is not valid'
  if (e.code === 'forbidden') return 'this key has no read scope'
  if (e.code === 'network' || e.status === 502 || e.status === 504) return 'the server is not reachable'
  return e.message
}

/** The sign-in: an account login, or an API key checked against its API. */
async function signIn(base: string, mode: 'account' | 'key', username: string, password: string, key: string, remember: boolean): Promise<Session> {
  if (mode === 'account') {
    const r = await new Api(base, null).login(username, password, remember)
    return { token: r.token, expires_at: r.expires_at, scope: r.scope, label: r.account.username, remember, issued_at: Math.floor(Date.now() / 1000) }
  }
  const api = new Api(base, key)
  await api.players() // needs read
  return { token: key, scope: (await api.isAdmin()) ? 'admin' : 'read', label: 'API key', remember }
}

/**
 * The dev UI's front page: sign in once (to the server's lmoxide-api) and open the debugger or
 * the world editor; both use the same session.
 */
export function SignIn() {
  const asked = new URLSearchParams(window.location.search).get('tool')
  const [tool, setTool] = useState<Tool>(asked === 'editor' || asked === 'debugger' ? asked : lastTool())
  const [mode, setMode] = useState<'account' | 'key'>('account')
  const [base, setBase] = useState(apiBase)
  const [servers, setServers] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [key, setKey] = useState('')
  const [remember, setRemember] = useState(rememberChoice)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = session()

  function open(t: Tool) {
    setLastTool(t)
    window.location.href = `./${TOOL[t].path}`
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setBusy(true)
    setError('')
    setRememberChoice(remember)
    setApiBase(base)
    try {
      setSessionFor(apiBase(), await signIn(apiBase(), mode, username.trim(), password, key.trim(), remember))
      setBusy(false)
      open(tool)
    } catch (e) {
      setSessionFor(apiBase(), null)
      setBusy(false)
      setError(why(e))
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>LMOxide dev UI</h1>
        <div className="segmented" role="tablist" aria-label="Open">
          {TOOLS.map((t) => (
            <button type="button" key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
              {TOOL[t].label}
            </button>
          ))}
        </div>
        <p className="muted">
          The {TOOL[tool].label.toLowerCase()}: {TOOL[tool].about}.{' '}
          {tool === 'editor'
            ? 'Needs an account with GM level 1 or more (the moderate scope).'
            : 'Needs an admin account (or an API key with the admin scope) for commands.'}
        </p>
        <div className="segmented" role="tablist">
          <button type="button" className={mode === 'account' ? 'on' : ''} onClick={() => setMode('account')}>
            Account
          </button>
          <button type="button" className={mode === 'key' ? 'on' : ''} onClick={() => setMode('key')}>
            API key
          </button>
        </div>
        {mode === 'account' ? (
          <>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
          </>
        ) : (
          <label>
            API key
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} required />
          </label>
        )}
        <label className="check" title="Keeps the session token (never the password) in this browser, renewed while you use the dev UI; Log out ends it">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay signed in
        </label>
        <button type="button" className="link small" onClick={() => setServers(!servers)}>
          {servers ? 'Hide server' : 'Server…'}
        </button>
        {servers && (
          <label>
            API <span className="muted small">(lmoxide-api)</span>
            <input value={base} onChange={(e) => setBase(e.target.value)} placeholder={`http://server:${API_PORT}`} spellCheck={false} />
          </label>
        )}
        {error && <p className="error">{error[0].toUpperCase() + error.slice(1)}.</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : `Sign in to the ${TOOL[tool].label.toLowerCase()}`}
        </button>
        {current && (
          <p className="small">
            Still signed in ({current.label}):{' '}
            {TOOLS.map((t, i) => (
              <span key={t}>
                {i > 0 && ' · '}
                <button type="button" className="link" onClick={() => open(t)}>
                  {TOOL[t].label}
                </button>
              </span>
            ))}
          </p>
        )}
        <p className="muted small">
          {remember
            ? 'Session tokens stay in this browser (localStorage) until you log out or they expire unused, and go only to the API above. Your password is never kept.'
            : 'Session tokens stay in this tab (sessionStorage) and go only to the API above.'}
        </p>
      </form>
    </main>
  )
}
