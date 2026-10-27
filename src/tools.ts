// The dev UI's two tools, each a page: the debugger (/debugger/) and the world editor (/editor/).
// They talk to LMOxide servers through each server's lmoxide-api: the play server (the LAN
// server) and a survey server (tools/survey-server.sh). Every lmoxide-api serves the same routes
// (a survey server's also answers /v1/survey), so the debugger works on either; the world editor
// needs the survey server. Sessions belong to a server's API (by its URL), not to a tool, so
// switching the debugger between servers needs no new sign-in.

import { Api } from './api'
import { KEYS, loadJson, saveJson } from './storage'
import type { Session } from './types'

export type Tool = 'debugger' | 'editor'

export const TOOLS: Tool[] = ['debugger', 'editor']

export type Server = 'play' | 'survey'

export const SERVERS: Server[] = ['play', 'survey']

interface ServerInfo {
  label: string
  /** where its API base is kept */
  baseKey: string
  /** the dev server's proxy path; elsewhere this port on this host */
  devApi: string
  port: number
}

export const SERVER: Record<Server, ServerInfo> = {
  play: { label: 'Play server', baseKey: KEYS.apiBase, devApi: '/api', port: 8090 },
  survey: { label: 'Survey server', baseKey: 'lmofx.editor.apiBase', devApi: '/editor-api', port: 8091 },
}

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
    about: "effects, teleports, test scenarios, spawns and the other test commands, on a server's characters (the play server's or the survey server's)",
  },
  editor: {
    label: 'World editor',
    path: 'editor/',
    about: 'place and fix enemies, NPCs, smashables and trigger walls, and mark scripts and areas, on a survey server (lmoxide tools/survey-server.sh)',
  },
}

/** Which tool was used last (the sign-in page's choice). */
const LAST_TOOL = 'lmofx.tool'
/** The debugger's server. */
const DEBUGGER_SERVER = 'lmofx.debugger.server'
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

function defaultBase(s: Server): string {
  if (import.meta.env.DEV) return SERVER[s].devApi
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:${SERVER[s].port}`
}

export function serverBase(s: Server): string {
  return loadJson(SERVER[s].baseKey, defaultBase(s))
}

export function setServerBase(s: Server, base: string) {
  saveJson(SERVER[s].baseKey, base.trim() || defaultBase(s))
}

/** The server a tool works on: the world editor always the survey server. */
export function toolServer(t: Tool): Server {
  if (t === 'editor') return 'survey'
  return loadJson<string>(DEBUGGER_SERVER, 'play') === 'survey' ? 'survey' : 'play'
}

export function setDebuggerServer(s: Server) {
  saveJson(DEBUGGER_SERVER, s)
}

export function apiBase(t: Tool): string {
  return serverBase(toolServer(t))
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

/** The tool's session (its server's), if it hasn't expired. */
export function session(t: Tool): Session | null {
  return sessionFor(apiBase(t))
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

/** The tool's session was refused (401): forget it and sign in again. */
export function expired(t: Tool) {
  setSessionFor(apiBase(t), null)
  toSignIn(t)
}

/** The sign-in page, from a tool's page (when it has no session). */
export function toSignIn(t: Tool) {
  window.location.replace(`../?tool=${t}`)
}
