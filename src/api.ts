import type { AnimationCatalog, ParticleRef, SoundRef, BccStates, CommandResult, EffectCatalog, Minifigure, MonsterData, Player, Playfield, Scope, TestCatalog } from './types'

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

  /** remember: a long session ("stay signed in", the API's --remember-days). */
  login(username: string, password: string, remember = false) {
    return this.call<{ token: string; expires_at: number; scope: Scope | null; account: { username: string } }>(
      'POST',
      '/v1/auth/login',
      { username, password, remember },
    )
  }

  /** A fresh session for this one (new token and expiry; this token stops working). */
  renew(remember: boolean) {
    return this.call<{ token: string; expires_at: number; scope: Scope | null }>('POST', '/v1/auth/renew', { remember })
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

  async effects() {
    return normalizeCatalog(await this.call<EffectCatalog>('GET', '/v1/catalog/effects'))
  }

  monsters() {
    return this.call<{ monster_data: MonsterData[] }>('GET', '/v1/catalog/monsters')
  }

  animations() {
    return this.call<AnimationCatalog>('GET', '/v1/catalog/animations')
  }

  bccStates() {
    return this.call<BccStates>('GET', '/v1/catalog/bcc-states')
  }

  /** A package's sound as an Ogg Vorbis blob (needs the API's --client-dir). */
  async sound(id: number): Promise<Blob> {
    let res: Response
    try {
      res = await fetch(`${this.base}/v1/catalog/sounds/${id}`, { headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} })
    } catch (e) {
      throw new ApiError(0, 'network', String(e))
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
      throw new ApiError(res.status, body?.error?.code ?? `http_${res.status}`, body?.error?.message ?? res.statusText)
    }
    return res.blob()
  }

  testCatalog() {
    return this.call<TestCatalog>('GET', '/v1/catalog/test-commands')
  }

  playfields() {
    return this.call<Playfield[]>('GET', '/v1/playfields')
  }

  minifigures() {
    return this.call<Minifigure[]>('GET', '/v1/minifigures')
  }

  /** A test command run as that player, as if typed in chat; `replies` are its chat answers. */
  command(accountId: number, command: string) {
    return this.call<CommandResult>('POST', `/v1/players/${accountId}/command`, { command })
  }
}

/**
 * lmoxide-api builds before the typed catalog sent particles and sounds as plain strings and
 * looping parts as 86400 s: brought to the current shape.
 */
export function normalizeCatalog(c: EffectCatalog): EffectCatalog {
  for (const e of c.effects) {
    if (e.kind !== 'effectpackage') continue
    e.particles = (e.particles as unknown[]).map((p) => (typeof p === 'string' ? (/^\d+$/.test(p) ? { id: Number(p), name: null } : { id: null, name: p }) : (p as ParticleRef)))
    e.sounds = (e.sounds as unknown[]).map((s) => (typeof s === 'string' ? { path: s, id: null } : (s as SoundRef)))
    for (const t of e.timelines) {
      if (t.until_stopped === undefined) {
        t.until_stopped = (t.duration ?? 0) >= 3600
        if (t.until_stopped) t.duration = null
      }
      t.hook ??= null
    }
  }
  return c
}
