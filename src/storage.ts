// localStorage / sessionStorage that never throws (private windows, blocked site data).

function get(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key)
  } catch {
    return null
  }
}

function set(store: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) store().removeItem(key)
    else store().setItem(key, value)
  } catch {
    // not persisted; the app still works for this visit
  }
}

const local = () => window.localStorage
const session = () => window.sessionStorage

export function loadJson<T>(key: string, fallback: T, inSession = false): T {
  const raw = get(inSession ? session : local, key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown, inSession = false) {
  set(inSession ? session : local, key, value === undefined || value === null ? null : JSON.stringify(value))
}

export const KEYS = {
  apiBase: 'lmofx.apiBase',
  session: 'lmofx.session', // sessionStorage, as docs/WEB-UI.md asks for tokens
  player: 'lmofx.player',
  notes: 'lmofx.notes',
  tags: 'lmofx.tags',
  filters: 'lmofx.filters',
  autoplay: 'lmofx.autoplay',
  history: 'lmofx.history',
  fxAt: 'lmofx.fxAt',
  view: 'lmofx.view',
  debugSection: 'lmofx.debugSection',
  coordFormat: 'lmofx.coordFormat',
} as const
