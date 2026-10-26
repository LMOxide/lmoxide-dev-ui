import { useState } from 'react'

export interface LogEntry {
  id: number
  at: number
  command: string
  player: string
  /** pending, ok (affected > 0), warn (affected 0), error */
  status: 'pending' | 'ok' | 'warn' | 'error'
  message?: string
}

const STATES: [number, string][] = [
  [1, 'normal'],
  [29, 'Limbo (smashed)'],
  [104, 'building'],
]

/** Other previews through the same command endpoint, and a free command box. */
export function Tools({ canSend, onCommand }: { canSend: boolean; onCommand: (cmd: string) => void }) {
  const [skin, setSkin] = useState('')
  const [state, setState] = useState('')
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [at, setAt] = useState(-1)

  return (
    <div className="tools">
      <section>
        <h3>Look (<code>!skin</code>)</h3>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^\d+$/.test(skin.trim())) onCommand(`!skin ${skin.trim()}`)
          }}
        >
          <input value={skin} onChange={(e) => setSkin(e.target.value)} placeholder="monster data id, e.g. 2212" inputMode="numeric" aria-label="Monster data id" />
          <button disabled={!canSend || !/^\d+$/.test(skin.trim())}>Wear</button>
          <button type="button" disabled={!canSend} onClick={() => onCommand('!skin reset')}>
            Reset
          </button>
        </form>
        <p className="muted small">
          No catalog of monster data looks yet (proposed: <code>GET /v1/catalog/monsters</code>, see docs/API-PROPOSALS.md).
        </p>
      </section>

      <section>
        <h3>Character state (<code>!state</code>, BCCState)</h3>
        <div className="chips">
          {STATES.map(([n, label]) => (
            <button key={n} type="button" className="chip" disabled={!canSend} onClick={() => onCommand(`!state ${n}`)}>
              {n} {label}
            </button>
          ))}
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault()
              if (/^\d+$/.test(state.trim())) onCommand(`!state ${state.trim()}`)
            }}
          >
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="n" inputMode="numeric" size={5} aria-label="BCCState" />
            <button disabled={!canSend || !/^\d+$/.test(state.trim())}>Set</button>
          </form>
        </div>
      </section>

      <section>
        <h3>Any test command</h3>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault()
            const c = cmd.trim()
            if (!c) return
            onCommand(c.startsWith('!') || c.startsWith('/') ? c : '!' + c)
            setHistory((h) => [c, ...h.filter((x) => x !== c)].slice(0, 50))
            setAt(-1)
            setCmd('')
          }}
        >
          <input
            className="grow mono"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && history.length) {
                e.preventDefault()
                const i = Math.min(at + 1, history.length - 1)
                setAt(i)
                setCmd(history[i])
              } else if (e.key === 'ArrowDown' && at >= 0) {
                e.preventDefault()
                const i = at - 1
                setAt(i)
                setCmd(i < 0 ? '' : history[i])
              } else if (e.key === 'Escape') e.currentTarget.blur()
            }}
            placeholder="!where, !tp 1, !smashme, !revive, !help …"
            spellCheck={false}
            aria-label="Test command"
          />
          <button disabled={!canSend || !cmd.trim()}>Send</button>
        </form>
        <p className="muted small">
          The answer appears in the game's chat; the API only says how many players it reached.
        </p>
      </section>
    </div>
  )
}

export function CommandLog({ log }: { log: LogEntry[] }) {
  if (!log.length) return <p className="muted small">Commands you send show up here.</p>
  return (
    <ol className="log">
      {log.map((l) => (
        <li key={l.id} className={l.status}>
          <time>{new Date(l.at).toLocaleTimeString()}</time> <code>{l.command}</code> <span className="muted">→ {l.player}</span>
          {l.message && <span className="msg"> {l.message}</span>}
        </li>
      ))}
    </ol>
  )
}
