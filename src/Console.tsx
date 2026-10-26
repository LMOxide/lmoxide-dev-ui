import { useCallback, useState } from 'react'
import { AutoInput } from './AutoInput'
import { KEYS, loadJson, saveJson } from './storage'
import { commandSuggestions, type GameData } from './suggest'

export interface LogEntry {
  id: number
  at: number
  command: string
  player: string
  /** pending, ok (reached the player), warn (reached nobody), error */
  status: 'pending' | 'ok' | 'warn' | 'error'
  message?: string
  /** what the server answered in chat */
  replies?: string[]
}

/** The test command box (completion for every command and its arguments) and the log. */
export function Console({
  log,
  data,
  canSend,
  onCommand,
  value,
  setValue,
  inputRef,
}: {
  log: LogEntry[]
  data: GameData
  canSend: boolean
  onCommand: (cmd: string) => void
  value: string
  setValue: (v: string) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const [history, setHistory] = useState<string[]>(() => loadJson(KEYS.history, []))
  const [at, setAt] = useState(-1)
  const suggest = useCallback((v: string) => commandSuggestions(v, data), [data])

  function submit(v: string) {
    const c = v.trim()
    if (!c || !canSend) return
    const cmd = c.startsWith('!') || c.startsWith('/') ? c : '!' + c
    onCommand(cmd)
    const next = [cmd, ...history.filter((x) => x !== cmd)].slice(0, 100)
    setHistory(next)
    saveJson(KEYS.history, next)
    setAt(-1)
    setValue('')
  }

  return (
    <div className="console">
      <form
        className="console-input"
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
      >
        <AutoInput
          inputRef={inputRef}
          className="grow mono"
          value={value}
          onChange={setValue}
          suggest={suggest}
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && history.length) {
              e.preventDefault()
              const i = Math.min(at + 1, history.length - 1)
              setAt(i)
              setValue(history[i])
            } else if (e.key === 'ArrowDown' && at >= 0) {
              e.preventDefault()
              setAt(at - 1)
              setValue(at - 1 < 0 ? '' : history[at - 1])
            } else if (e.key === 'Escape') e.currentTarget.blur()
          }}
          placeholder="! for commands: !tp, !goto boss, !spawn, !test …  ( : )"
          aria-label="Test command"
        />
        <button disabled={!canSend || !value.trim()}>Send</button>
      </form>
      {log.length === 0 ? (
        <p className="muted small">Commands you send and the server's answers show up here.</p>
      ) : (
        <ol className="log">
          {log.map((l) => (
            <li key={l.id} className={l.status}>
              <div>
                <time>{new Date(l.at).toLocaleTimeString()}</time>{' '}
                <button type="button" className="link mono" title="Put it in the command box" onClick={() => setValue(l.command)}>
                  {l.command}
                </button>{' '}
                <span className="muted">→ {l.player}</span>
                {l.message && <span className="msg"> {l.message}</span>}
              </div>
              {l.replies?.map((r, i) => (
                <div key={i} className="reply">
                  {r}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
