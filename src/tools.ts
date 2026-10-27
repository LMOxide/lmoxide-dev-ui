// The dev UI's two tools, each a page with its own API and session: the debugger (/debugger/,
// the play server's API) and the world editor (/editor/, a survey server's API).

import { KEYS, loadJson, saveJson } from './storage'
import type { Session } from './types'

export type Tool = 'debugger' | 'editor'

export const TOOLS: Tool[] = ['debugger', 'editor']

interface ToolInfo {
  label: string
  /** the page, relative to the site's root */
  path: string
  /** where its API base and session are kept */
  apiKey: string
  sessionKey: string
  /** the dev server's proxy path; elsewhere this port on this host */
  devApi: string
  port: number
  /** what it needs, for the sign-in page */
  about: string
}

export const TOOL: Record<Tool, ToolInfo> = {
  debugger: {
    label: 'Debugger',
    path: 'debugger/',
    apiKey: KEYS.apiBase,
    sessionKey: KEYS.session,
    devApi: '/api',
    port: 8090,
    about: "effects, teleports, test scenarios, spawns and the other test commands, on the play server's characters",
  },
  editor: {
    label: 'World editor',
    path: 'editor/',
    apiKey: 'lmofx.editor.apiBase',
    sessionKey: 'lmofx.editor.session',
    devApi: '/editor-api',
    port: 8091,
    about: 'place and fix enemies, NPCs, smashables and trigger walls, and mark scripts and areas, on a survey server (lmoxide tools/survey-server.sh)',
  },
}

/** Which tool was used last (the sign-in page's choice). */
const LAST_TOOL = 'lmofx.tool'

export function lastTool(): Tool {
  const t = loadJson<string>(LAST_TOOL, 'debugger')
  return t === 'editor' ? 'editor' : 'debugger'
}

export function setLastTool(t: Tool) {
  saveJson(LAST_TOOL, t)
}

export function defaultApiBase(t: Tool): string {
  if (import.meta.env.DEV) return TOOL[t].devApi
  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:${TOOL[t].port}`
}

export function apiBase(t: Tool): string {
  return loadJson(TOOL[t].apiKey, defaultApiBase(t))
}

export function setApiBase(t: Tool, base: string) {
  saveJson(TOOL[t].apiKey, base)
}

/** The tool's session in this tab, if it hasn't expired. */
export function session(t: Tool): Session | null {
  const s = loadJson<Session | null>(TOOL[t].sessionKey, null, true)
  return s && (s.expires_at === undefined || s.expires_at * 1000 > Date.now()) ? s : null
}

export function setSession(t: Tool, s: Session | null) {
  saveJson(TOOL[t].sessionKey, s, true)
}

/** Ends every tool's session and goes to the sign-in page. */
export function signOut(from: Tool) {
  for (const t of TOOLS) setSession(t, null)
  window.location.href = `../?tool=${from}`
}

/** The sign-in page, from a tool's page (when it has no session). */
export function toSignIn(t: Tool) {
  window.location.replace(`../?tool=${t}`)
}
