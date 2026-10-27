// Players on the other server: the play server and the survey server run side by side, and a
// player can go from one to the other in game (`!server play` / `!server editor`, lmoxide
// switch.rs) with the same login. Accounts are matched by username: the same login can have
// another account id on each server.

import { Api } from './api'
import { serverBase, sessionFor, SERVER, type Server } from './tools'
import type { Player } from './types'

/** What the game's `!server` command calls each server. */
export const GAME_NAME: Record<Server, string> = { play: 'play', survey: 'editor' }

export const otherServer = (s: Server): Server => (s === 'play' ? 'survey' : 'play')

export const serverLabel = (s: Server) => SERVER[s].label.toLowerCase()

/** That server's API with this browser's session for it (`null`: not signed in there). */
export function apiOf(server: Server): Api | null {
  const base = serverBase(server)
  const s = sessionFor(base)
  return s ? new Api(base, s.token) : null
}

/** `username` among the players online on `server` (`null`: not there, or no session/answer). */
export async function findOn(server: Server, username: string): Promise<Player | null> {
  const api = apiOf(server)
  if (!api) return null
  try {
    const name = username.toLowerCase()
    return (await api.players()).find((p) => p.username.toLowerCase() === name) ?? null
  } catch {
    return null
  }
}

/** Sends the player (online on `from`) to the other server; the reply line, or why it failed. */
export async function sendAcross(from: Server, accountId: number): Promise<string> {
  const api = apiOf(from)
  if (!api) return `not signed in to the ${serverLabel(from)}`
  try {
    const r = await api.command(accountId, `!server ${GAME_NAME[otherServer(from)]}`)
    return r.affected > 0 ? (r.replies?.[0] ?? 'on the way') : 'reached nobody: are they still online?'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
