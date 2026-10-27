import { useState } from 'react'
import { Api, ApiError } from './api'
import { apiBase, lastTool, session, setApiBase, setLastTool, setSession, TOOL, TOOLS, type Tool } from './tools'
import type { Session } from './types'

function why(e: unknown): string {
  if (!(e instanceof ApiError)) return String(e)
  if (e.code === 'bad_credentials') return 'wrong username or password (or the account is banned)'
  if (e.code === 'unauthorized') return 'the API key is not valid'
  if (e.code === 'forbidden') return 'this key has no read scope'
  if (e.code === 'network' || e.status === 502 || e.status === 504) return 'its server is not reachable'
  return e.message
}

/** One tool's sign-in: an account login, or an API key checked against its API. */
async function signIn(base: string, mode: 'account' | 'key', username: string, password: string, key: string): Promise<Session> {
  if (mode === 'account') {
    const r = await new Api(base, null).login(username, password)
    return { token: r.token, expires_at: r.expires_at, scope: r.scope, label: r.account.username }
  }
  const api = new Api(base, key)
  await api.players() // needs read
  return { token: key, scope: (await api.isAdmin()) ? 'admin' : 'read', label: 'API key' }
}

/**
 * The dev UI's front page: sign in once (to both tools' servers; they share accounts) and open
 * the debugger or the world editor. A tool whose server can't be signed in to stays unavailable
 * (greyed out in the switcher at the top left of each tool).
 */
export function SignIn() {
  const asked = new URLSearchParams(window.location.search).get('tool')
  const [tool, setTool] = useState<Tool>(asked === 'editor' || asked === 'debugger' ? asked : lastTool())
  const [mode, setMode] = useState<'account' | 'key'>('account')
  const [bases, setBases] = useState<Record<Tool, string>>({ debugger: apiBase('debugger'), editor: apiBase('editor') })
  const [servers, setServers] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Tool, string>>>({})
  const signedIn = TOOLS.filter((t) => session(t))

  function open(t: Tool) {
    setLastTool(t)
    window.location.href = `./${TOOL[t].path}`
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setBusy(true)
    setErrors({})
    const results = await Promise.allSettled(
      TOOLS.map((t) => {
        setApiBase(t, bases[t].trim())
        return signIn(bases[t].trim(), mode, username.trim(), password, key.trim())
      }),
    )
    const errs: Partial<Record<Tool, string>> = {}
    TOOLS.forEach((t, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') setSession(t, r.value)
      else {
        setSession(t, null)
        errs[t] = why(r.reason)
      }
    })
    setBusy(false)
    if (!errs[tool]) return open(tool)
    setErrors(errs)
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
          The {TOOL[tool].label.toLowerCase()}: {TOOL[tool].about}. Needs an admin account (or an API key with the admin scope) on its{' '}
          <code>lmoxide-api</code>.
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
        <button type="button" className="link small" onClick={() => setServers(!servers)}>
          {servers ? 'Hide servers' : 'Servers…'}
        </button>
        {servers &&
          TOOLS.map((t) => (
            <label key={t}>
              {TOOL[t].label} API
              <input value={bases[t]} onChange={(e) => setBases({ ...bases, [t]: e.target.value })} placeholder={`http://server:${TOOL[t].port}`} spellCheck={false} />
            </label>
          ))}
        {TOOLS.filter((t) => errors[t]).map((t) => (
          <p key={t} className="error">
            {TOOL[t].label}: {errors[t]}.
          </p>
        ))}
        {errors[tool] && TOOLS.some((t) => t !== tool && !errors[t] && session(t)) && (
          <p className="small">
            Signed in to the {TOOLS.filter((t) => t !== tool).map((t) => TOOL[t].label.toLowerCase())} only:{' '}
            {TOOLS.filter((t) => t !== tool && session(t)).map((t) => (
              <button key={t} type="button" className="link" onClick={() => open(t)}>
                open the {TOOL[t].label.toLowerCase()}
              </button>
            ))}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : `Sign in to the ${TOOL[tool].label.toLowerCase()}`}
        </button>
        {signedIn.length > 0 && (
          <p className="small">
            Still signed in ({session(signedIn[0])?.label}):{' '}
            {signedIn.map((t, i) => (
              <span key={t}>
                {i > 0 && ' · '}
                <button type="button" className="link" onClick={() => open(t)}>
                  {TOOL[t].label}
                </button>
              </span>
            ))}
          </p>
        )}
        <p className="muted small">Session tokens stay in this tab (sessionStorage) and go only to the APIs above.</p>
      </form>
    </main>
  )
}
