// The dev UI's two tools, each a page: the debugger (/debugger/) and the world editor (/editor/).
// Both talk to the LMOxide server through its lmoxide-api (one server runs every game mode:
// progression, maxed and the world editor, lmoxide docs/SERVER-ARCHITECTURE.md). One sign-in,
// one session, used by both tools; the world editor's routes (/v1/survey, /v1/editor) need GM
// level 1 or more (the moderate scope).

import { Api } from './api'
import { KEYS, loadJson, saveJson } from './storage'
import type { Session } from './types'

export type Tool = 'debugger' | 'editor'

export const TOOLS: Tool[] = ['debugger', 'editor']

/** The API's port when the page isn't served by the dev server (which proxies /api to it). */
export const API_PORT = 8090

interface ToolInfo {
  label: string
  /** the page, relative to the site's root */
  path: string
  /** what it needs, for the sign-in page */
  about: string
}

export const TOOL: Record<Tool, ToolInfo> = {
  debugger: {
    label: 'Debugger',
    path: 'debugger/',
    about: 'effects, teleports, test scenarios, spawns and the other test commands, on the characters online in any game mode',
  },
  editor: {
    label: 'World editor',
    path: 'editor/',
    about: 'place and fix enemies, NPCs, smashables and trigger walls, and mark scripts and areas, as a character in the world editor mode',
  },
}

/** Which tool was used last (the sign-in page's choice). */
const LAST_TOOL = 'lmofx.tool'
/** Sessions by API base: remembered ones in localStorage, the others in this tab only. */
const SESSIONS = 'lmofx.sessions'
/** Whether the sign-in page's "Stay signed in" is ticked. */
const REMEMBER = 'lmofx.remember'

export function lastTool(): Tool {
  const t = loadJson<string>(LAST_TOOL, 'debugger')
  return t === 'editor' ? 'editor' : 'debugger'
}

export function setLastTool(t: Tool) {
  saveJson(LAST_TOOL, t)
}

export function rememberChoice(): boolean {
  return loadJson(REMEMBER, true)
}

export function setRememberChoice(on: boolean) {
  saveJson(REMEMBER, on)
}

/** The API base the build was made for (`VITE_API_URL`, e.g. `/api` behind one reverse proxy). */
const BUILT_BASE: string | undefined = import.meta.env.VITE_API_URL || undefined

function defaultBase(): string {
  if (import.meta.env.DEV) return '/api'
  if (BUILT_BASE) return BUILT_BASE
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:${API_PORT}`
}

/** The API's base URL (both tools use it). */
export function apiBase(): string {
  return loadJson(KEYS.apiBase, defaultBase())
}

export function setApiBase(base: string) {
  saveJson(KEYS.apiBase, base.trim() || defaultBase())
}

const norm = (base: string) => base.trim().replace(/\/+$/, '')

type Sessions = Record<string, Session>

function stored(remembered: boolean): Sessions {
  return loadJson<Sessions>(SESSIONS, {}, !remembered)
}

function live(s: Session | undefined): Session | null {
  return s && (s.expires_at === undefined || s.expires_at * 1000 > Date.now()) ? s : null
}

/** The session for an API base, if it hasn't expired (this tab's first, then a remembered one). */
export function sessionFor(base: string): Session | null {
  const b = norm(base)
  return live(stored(false)[b]) ?? live(stored(true)[b])
}

/** Keeps (or with null drops) the session of an API base; `remember` puts it in localStorage. */
export function setSessionFor(base: string, s: Session | null) {
  const b = norm(base)
  for (const remembered of [false, true]) {
    const all = stored(remembered)
    delete all[b]
    if (s && !!s.remember === remembered) all[b] = s
    saveJson(SESSIONS, all, !remembered)
  }
}

/** The session (the API's), if it hasn't expired. */
export function session(): Session | null {
  return sessionFor(apiBase())
}

/**
 * Renews remembered sessions past half their life (a new token; the old one ends), so staying
 * signed in lasts while the dev UI is used. Run before a page builds its API clients.
 */
export async function renewSessions() {
  const now = Date.now() / 1000
  await Promise.all(
    Object.entries(stored(true)).map(async ([base, s]) => {
      if (!live(s) || s.expires_at === undefined || s.issued_at === undefined) return
      if (now < s.issued_at + (s.expires_at - s.issued_at) / 2) return
      try {
        const r = await new Api(base, s.token).renew(true)
        setSessionFor(base, { ...s, token: r.token, expires_at: r.expires_at, scope: r.scope, issued_at: Math.floor(now) })
      } catch {
        // offline or gone: keep it until it expires, a 401 later signs out
      }
    }),
  )
}

/** Ends every session (on the servers too) and goes to the sign-in page. */
export async function signOut(from: Tool) {
  const ends: Promise<unknown>[] = []
  for (const remembered of [false, true]) {
    for (const [base, s] of Object.entries(stored(remembered))) {
      if (s.expires_at !== undefined) ends.push(new Api(base, s.token).logout())
    }
    saveJson(SESSIONS, null, !remembered)
  }
  await Promise.race([Promise.allSettled(ends), new Promise((r) => setTimeout(r, 2000))])
  window.location.href = `../?tool=${from}`
}

/** The session was refused (401): forget it and sign in again. */
export function expired(t: Tool) {
  setSessionFor(apiBase(), null)
  toSignIn(t)
}

/** The sign-in page, from a tool's page (when it has no session). */
export function toSignIn(t: Tool) {
  window.location.replace(`../?tool=${t}`)
}
