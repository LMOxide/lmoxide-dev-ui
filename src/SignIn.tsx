import { useState } from 'react'
import { Api, ApiError } from './api'
import {
  lastTool,
  rememberChoice,
  SERVER,
  serverBase,
  SERVERS,
  sessionFor,
  setLastTool,
  setRememberChoice,
  setServerBase,
  setSessionFor,
  TOOL,
  toolServer,
  TOOLS,
  type Server,
  type Tool,
} from './tools'
import type { Session } from './types'

function why(e: unknown): string {
  if (!(e instanceof ApiError)) return String(e)
  if (e.code === 'bad_credentials') return 'wrong username or password (or the account is banned)'
  if (e.code === 'too_many_requests' || e.status === 429) return 'too many attempts, try again in a few minutes'
  if (e.code === 'unauthorized') return 'the API key is not valid'
  if (e.code === 'forbidden') return 'this key has no read scope'
  if (e.code === 'network' || e.status === 502 || e.status === 504) return 'its server is not reachable'
  return e.message
}

/** One server's sign-in: an account login, or an API key checked against its API. */
async function signIn(base: string, mode: 'account' | 'key', username: string, password: string, key: string, remember: boolean): Promise<Session> {
  if (mode === 'account') {
    const r = await new Api(base, null).login(username, password, remember)
    return { token: r.token, expires_at: r.expires_at, scope: r.scope, label: r.account.username, remember, issued_at: Math.floor(Date.now() / 1000) }
  }
  const api = new Api(base, key)
  await api.players() // needs read
  return { token: key, scope: (await api.isAdmin()) ? 'admin' : 'read', label: 'API key', remember }
}

/** "Debugger" / "Debugger and world editor": the tools that work on a server. */
function toolsOn(s: Server): string {
  return TOOLS.filter((t) => t === 'debugger' || toolServer(t) === s)
    .map((t) => TOOL[t].label.toLowerCase())
    .join(' and ')
}

/**
 * The dev UI's front page: sign in once (to the play server's and the survey server's APIs;
 * they share accounts) and open the debugger or the world editor. Sessions belong to a server,
 * so the debugger can switch servers without signing in again; a server that can't be signed
 * in to stays unavailable (greyed out in the switchers).
 */
export function SignIn() {
  const asked = new URLSearchParams(window.location.search).get('tool')
  const [tool, setTool] = useState<Tool>(asked === 'editor' || asked === 'debugger' ? asked : lastTool())
  const [mode, setMode] = useState<'account' | 'key'>('account')
  const [bases, setBases] = useState<Record<Server, string>>({ play: serverBase('play'), survey: serverBase('survey') })
  const [servers, setServers] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [key, setKey] = useState('')
  const [remember, setRemember] = useState(rememberChoice)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Server, string>>>({})
  const signedIn = SERVERS.filter((s) => sessionFor(serverBase(s)))
  const openable = TOOLS.filter((t) => sessionFor(serverBase(toolServer(t))))
  const needed = toolServer(tool)

  function open(t: Tool) {
    setLastTool(t)
    window.location.href = `./${TOOL[t].path}`
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setBusy(true)
    setErrors({})
    setRememberChoice(remember)
    for (const s of SERVERS) setServerBase(s, bases[s])
    // the same API twice (both bases pointed at one server) is signed in to once
    const targets = [...new Set(SERVERS.map(serverBase))]
    const results = await Promise.allSettled(targets.map((b) => signIn(b, mode, username.trim(), password, key.trim(), remember)))
    const byBase = new Map(targets.map((b, i) => [b, results[i]]))
    const errs: Partial<Record<Server, string>> = {}
    for (const s of SERVERS) {
      const r = byBase.get(serverBase(s))!
      if (r.status === 'fulfilled') setSessionFor(serverBase(s), r.value)
      else {
        setSessionFor(serverBase(s), null)
        errs[s] = why(r.reason)
      }
    }
    setBusy(false)
    if (!errs[needed]) return open(tool)
    setErrors(errs)
  }

  // one line per distinct problem: a wrong password is wrong on every server
  const problems = new Map<string, Server[]>()
  for (const s of SERVERS) if (errors[s]) problems.set(errors[s]!, [...(problems.get(errors[s]!) ?? []), s])
  const everywhere = (list: Server[]) => list.length === SERVERS.length

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
          The {TOOL[tool].label.toLowerCase()}: {TOOL[tool].about}. Needs an admin account (or an API key with the admin scope) on its server's{' '}
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
        <label className="check" title="Keeps the session token (never the password) in this browser, renewed while you use the dev UI; Log out ends it">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay signed in
        </label>
        <button type="button" className="link small" onClick={() => setServers(!servers)}>
          {servers ? 'Hide servers' : 'Servers…'}
        </button>
        {servers &&
          SERVERS.map((s) => (
            <label key={s}>
              {SERVER[s].label} API <span className="muted small">({toolsOn(s)})</span>
              <input value={bases[s]} onChange={(e) => setBases({ ...bases, [s]: e.target.value })} placeholder={`http://server:${SERVER[s].port}`} spellCheck={false} />
            </label>
          ))}
        {[...problems].map(([problem, list]) => (
          <p key={problem} className="error">
            {everywhere(list) ? problem[0].toUpperCase() + problem.slice(1) : `${list.map((s) => SERVER[s].label).join(', ')}: ${problem}`}.
          </p>
        ))}
        {errors[needed] && openable.some((t) => t !== tool) && (
          <p className="small">
            Signed in to the {SERVERS.filter((s) => !errors[s]).map((s) => SERVER[s].label.toLowerCase())} only:{' '}
            {openable
              .filter((t) => t !== tool)
              .map((t) => (
                <button key={t} type="button" className="link" onClick={() => open(t)}>
                  open the {TOOL[t].label.toLowerCase()}
                </button>
              ))}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : `Sign in to the ${TOOL[tool].label.toLowerCase()}`}
        </button>
        {signedIn.length > 0 && openable.length > 0 && (
          <p className="small">
            Still signed in ({sessionFor(serverBase(signedIn[0]))?.label}):{' '}
            {openable.map((t, i) => (
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
            ? 'Session tokens stay in this browser (localStorage) until you log out or they expire unused, and go only to the APIs above. Your password is never kept.'
            : 'Session tokens stay in this tab (sessionStorage) and go only to the APIs above.'}
        </p>
      </form>
    </main>
  )
}
