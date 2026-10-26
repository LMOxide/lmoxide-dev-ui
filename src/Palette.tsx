import { useEffect, useMemo, useRef, useState } from 'react'
import { describe, isPackage } from './catalog'
import { places, playfieldName, score, type GameData } from './suggest'

/** One thing the palette finds, and what Enter does with it. */
interface Hit {
  key: string
  kind: string
  title: string
  detail: string
  /** sent as a test command */
  command?: string
  /** shown in the effect browser */
  effect?: number
  /** put in the command box (a command that needs more typing) */
  fill?: string
}

/** Everything searchable, built once per data change. */
function entries(data: GameData): Hit[] {
  const pf = (id: number) => playfieldName(data, id)
  const out: Hit[] = []
  for (const c of data.tests?.commands ?? []) {
    const word = c.usage.split(/\s/)[0]
    out.push({ key: `c${c.usage}`, kind: 'command', title: c.usage, detail: c.about, ...(/\s/.test(c.usage) ? { fill: `${word} ` } : { command: word }) })
  }
  for (const p of data.playfields) out.push({ key: `p${p.id}`, kind: 'teleport', title: p.name, detail: `playfield ${p.id}`, command: `!tp ${p.id}` })
  for (const s of data.tests?.scenarios ?? []) out.push({ key: `s${s.n}`, kind: 'test', title: s.label, detail: s.about, command: `!test ${s.n}` })
  for (const k of data.tests?.kinds ?? [])
    for (const t of k.targets) out.push({ key: `t${k.kind}${t.n}`, kind: `go to ${k.kind}`, title: t.label, detail: pf(t.playfield), command: `!goto ${k.kind} ${t.n}` })
  for (const s of data.tests?.spawnable ?? [])
    out.push({ key: `sp${s.name}`, kind: 'spawn', title: s.name, detail: `${s.kind}, level ${s.level} · ${places(data, s.playfields)}`, command: `!spawn ${s.name}` })
  for (const l of data.tests?.looks ?? []) out.push({ key: `l${l.monster_data}`, kind: 'look', title: l.names.join(', '), detail: `monster data ${l.monster_data}`, command: `!skin ${l.monster_data}` })
  for (const f of data.minifigures) out.push({ key: `f${f.id}`, kind: 'own', title: f.name, detail: `series ${f.series}`, command: `!own ${f.name}` })
  for (const d of data.tests?.dialogues ?? []) out.push({ key: `d${d.n}`, kind: 'dialogue', title: d.npc, detail: pf(d.playfield), command: `!dialog ${d.n}` })
  for (const k of data.tests?.loot_kinds ?? []) out.push({ key: `lo${k}`, kind: 'loot', title: `${k} loot bag`, detail: 'at your feet', command: `!loot ${k}` })
  for (const e of data.effects) out.push({ key: `e${e.id}`, kind: isPackage(e) ? 'effect' : 'particle system', title: String(e.id), detail: describe(e), effect: e.id })
  return out
}

export function Palette({
  data,
  onClose,
  send,
  showEffect,
  fillCommand,
  canSend,
}: {
  data: GameData
  onClose: () => void
  send: (cmd: string) => void
  showEffect: (id: number, play: boolean) => void
  fillCommand: (cmd: string) => void
  canSend: boolean
}) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const all = useMemo(() => entries(data), [data])
  const list = useRef<HTMLUListElement>(null)
  const hits = useMemo(() => {
    const query = q.trim()
    if (!query) return all.filter((h) => h.kind === 'command' || h.kind === 'teleport').slice(0, 40)
    return all
      .map((h) => [h, score(query, h.title, h.kind, h.detail) + (score(query, h.title) > 0 ? 2 : 0)] as const)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([h]) => h)
  }, [all, q])

  useEffect(() => setAt(0), [q])
  useEffect(() => {
    list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  function run(h: Hit, alt: boolean) {
    if (h.effect !== undefined) showEffect(h.effect, alt)
    else if (h.fill) fillCommand(h.fill)
    else if (h.command && alt) fillCommand(h.command)
    else if (h.command && canSend) send(h.command)
    else if (h.command) fillCommand(h.command)
    onClose()
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Search everything" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search effects, playfields, tests, bosses, enemies, looks, minifigures, commands…"
          spellCheck={false}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setAt((i) => Math.min(hits.length - 1, i + 1))
            else if (e.key === 'ArrowUp') setAt((i) => Math.max(0, i - 1))
            else if (e.key === 'Enter' && hits[at]) run(hits[at], e.shiftKey)
            else if (e.key === 'Escape') onClose()
            else return
            e.preventDefault()
          }}
        />
        <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === at} className={i === at ? 'on' : ''} onMouseEnter={() => setAt(i)} onClick={(e) => run(h, e.shiftKey)}>
              <span className="badge dim">{h.kind}</span>
              <span className="s-label">{h.title}</span>
              <span className="s-detail">{h.detail}</span>
              {(h.command || h.fill) && <code className="s-cmd">{h.command ?? h.fill}</code>}
            </li>
          ))}
          {!hits.length && <li className="muted">Nothing found.</li>}
        </ul>
        <div className="palette-help muted small">
          <kbd>Enter</kbd> run / show · <kbd>Shift</kbd>+<kbd>Enter</kbd> play the effect, or edit the command first · <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  )
}
