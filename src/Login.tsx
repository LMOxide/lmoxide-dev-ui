import { useState } from 'react'
import { Api, ApiError } from './api'
import type { Session } from './types'

/** Log in with an admin account, or paste an API key with the admin scope. */
export function Login({ apiBase, onApiBase, onSession }: { apiBase: string; onApiBase: (b: string) => void; onSession: (s: Session) => void }) {
  const [mode, setMode] = useState<'account' | 'key'>('account')
  const [base, setBase] = useState(apiBase)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    setBusy(true)
    setError('')
    const b = base.trim() || apiBase
    onApiBase(b)
    try {
      if (mode === 'account') {
        const r = await new Api(b, null).login(username.trim(), password)
        onSession({ token: r.token, expires_at: r.expires_at, scope: r.scope, label: r.account.username })
      } else {
        const api = new Api(b, key.trim())
        await api.players() // needs read
        const admin = await api.isAdmin()
        onSession({ token: key.trim(), scope: admin ? 'admin' : 'read', label: 'API key' })
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.code === 'bad_credentials'
            ? 'Wrong username or password (or the account is banned).'
            : e.code === 'unauthorized'
              ? 'The API key is not valid.'
              : e.code === 'forbidden'
                ? 'This key has no read scope.'
                : e.message
          : String(e),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card">
        <h1>LMOxide effect browser</h1>
        <p className="muted">
          Browse the game client's effect packages and play them on a character in the running game.
          Needs an admin account (or an API key with the admin scope) on <code>lmoxide-api</code>.
        </p>
        <label>
          API base URL
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://server:8090" spellCheck={false} />
        </label>
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
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <p className="muted small">The session token stays in this tab (sessionStorage) and is sent only to the API above.</p>
      </form>
    </main>
  )
}
