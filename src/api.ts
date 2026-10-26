import type { EffectCatalog, Player, Scope } from './types'

/** `{"error": {"code", "message"}}` from the API, or a network failure (code `network`). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Where the API is when nothing is configured: the dev proxy, else port 8090 of this host. */
export function defaultApiBase(): string {
  if (import.meta.env.DEV) return '/api'
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:8090`
}

export class Api {
  readonly base: string
  readonly token: string | null

  constructor(base: string, token: string | null) {
    this.base = base.replace(/\/+$/, '')
    this.token = token
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      throw new ApiError(0, 'network', `can't reach ${this.base} (${e instanceof Error ? e.message : e}); check the URL and the API's CORS origins`)
    }
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // not JSON (a proxy error page, ...)
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? (text.slice(0, 200) || res.statusText))
    }
    return json as T
  }

  login(username: string, password: string) {
    return this.call<{ token: string; expires_at: number; scope: Scope | null; account: { username: string } }>(
      'POST',
      '/v1/auth/login',
      { username, password },
    )
  }

  logout() {
    return this.call<unknown>('POST', '/v1/auth/logout')
  }

  /** For an API key: there is no "who am I" for keys, so probe a read route. */
  players() {
    return this.call<Player[]>('GET', '/v1/players')
  }

  /** Whether the token has the admin scope (needed for commands): the audit log is admin-only. */
  async isAdmin(): Promise<boolean> {
    try {
      await this.call<unknown>('GET', '/v1/audit?limit=1')
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return false
      throw e
    }
  }

  effects() {
    return this.call<EffectCatalog>('GET', '/v1/catalog/effects')
  }

  /** A test command run as that player, as if typed in chat. Only `affected` comes back. */
  command(accountId: number, command: string) {
    return this.call<{ affected: number }>('POST', `/v1/players/${accountId}/command`, { command })
  }
}
