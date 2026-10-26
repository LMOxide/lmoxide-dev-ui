import { useRef, useState } from 'react'
import { describe } from './catalog'
import { download, exportJson, exportMarkdown, importJson, isEmpty, type Notes } from './notes'
import type { Effect } from './types'

export function NotesPanel({
  notes,
  setNotes,
  catalog,
  apiBase,
  onShow,
}: {
  notes: Notes
  setNotes: (n: Notes) => void
  catalog: Map<number, Effect>
  apiBase: string
  onShow: (id: number) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const entries = Object.entries(notes)
    .filter(([, n]) => !isEmpty(n))
    .sort((a, b) => b[1].updated - a[1].updated)
  const stamp = new Date().toISOString().slice(0, 10)

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMsg(`${what} copied.`)
    } catch {
      setMsg("Couldn't use the clipboard; use the download instead.")
    }
  }

  return (
    <div className="notes-panel">
      <div className="toolbar">
        <button disabled={!entries.length} onClick={() => download(`effect-notes-${stamp}.json`, exportJson(notes, catalog, apiBase), 'application/json')}>
          ⤓ JSON
        </button>
        <button disabled={!entries.length} onClick={() => download(`effect-notes-${stamp}.md`, exportMarkdown(notes, catalog), 'text/markdown')}>
          ⤓ Markdown
        </button>
        <button disabled={!entries.length} onClick={() => copy(exportMarkdown(notes, catalog), 'Markdown')}>
          Copy Markdown
        </button>
        <button onClick={() => file.current?.click()}>Import JSON…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const next = importJson(await f.text(), notes)
              setNotes(next)
              setMsg(`Imported; ${Object.values(next).filter((n) => !isEmpty(n)).length} notes now.`)
            } catch (err) {
              setMsg(`Import failed: ${err instanceof Error ? err.message : err}`)
            }
          }}
        />
      </div>
      {msg && <p className="muted small">{msg}</p>}
      {!entries.length ? (
        <p className="muted">
          No notes yet. Tag an entry (keys 1–9) or write a line about it; the notes stay in this browser until you export them.
        </p>
      ) : (
        <ul className="plain notes-list">
          {entries.map(([id, n]) => {
            const e = catalog.get(Number(id))
            return (
              <li key={id}>
                <button className="link mono" onClick={() => onShow(Number(id))}>
                  {id}
                </button>{' '}
                {n.tags.map((t) => (
                  <span key={t} className="badge tag">
                    {t}
                  </span>
                ))}{' '}
                {n.text && <span>{n.text}</span>}
                {e && <div className="muted small desc">{describe(e)}</div>}
              </li>
            )
          })}
        </ul>
      )}
      {entries.length > 0 && (
        <p>
          <button
            className="link danger"
            onClick={() => {
              if (window.confirm(`Delete all ${entries.length} notes from this browser? Export them first if you need them.`)) setNotes({})
            }}
          >
            Delete all notes
          </button>
        </p>
      )}
    </div>
  )
}
