import { useMemo, useState } from 'react'
import { best, bossNames, places, playfieldName, type GameData } from './suggest'
import type { Player } from './types'

export type Section = 'quick' | 'teleport' | 'scenarios' | 'targets' | 'spawn' | 'looks' | 'minifigures' | 'progress' | 'dialogues' | 'commands'

const SECTIONS: [Section, string][] = [
  ['quick', 'Quick'],
  ['teleport', 'Teleport'],
  ['scenarios', 'Test scenarios'],
  ['targets', 'Go to'],
  ['spawn', 'Spawn & loot'],
  ['looks', 'Looks & state'],
  ['minifigures', 'Minifigures'],
  ['progress', 'Progress'],
  ['dialogues', 'Dialogues'],
  ['commands', 'All commands'],
]

/** Shown at most per list; the filter narrows it. */
const SHOWN = 300

function Filter({ value, set, placeholder }: { value: string; set: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      className="search"
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
      spellCheck={false}
    />
  )
}

function More({ total }: { total: number }) {
  return total > SHOWN ? <p className="muted small">{total - SHOWN} more: narrow the filter.</p> : null
}

function Missing() {
  return (
    <p className="banner warn">
      This API has no test command catalog (<code>GET /v1/catalog/test-commands</code>, lmoxide 2c668c5 or later), so there is nothing to pick from here; the command box
      still works.
    </p>
  )
}

/** Picks and buttons for every test command, each sending through `send`. */
export function Debug({
  data,
  testsError,
  online,
  canSend,
  send,
  section,
  setSection,
  fillCommand,
}: {
  data: GameData
  testsError: string
  online: Player | undefined
  canSend: boolean
  send: (cmd: string) => void
  section: Section
  setSection: (s: Section) => void
  fillCommand: (cmd: string) => void
}) {
  const [q, setQ] = useState<Record<string, string>>({})
  const query = q[section] ?? ''
  const setQuery = (v: string) => setQ((old) => ({ ...old, [section]: v }))
  const pf = (id: number) => playfieldName(data, id)
  const tests = data.tests
  const here = online?.playfield ?? null

  return (
    <div className="debug">
      <nav className="sections" aria-label="Debug sections">
        {SECTIONS.map(([s, label]) => (
          <button key={s} className={s === section ? 'on' : ''} onClick={() => setSection(s)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="section-body">
        {testsError && section !== 'quick' && section !== 'teleport' && section !== 'minifigures' && <Missing />}
        {section === 'quick' && <Quick send={send} canSend={canSend} />}
        {section === 'teleport' && (
          <PickList
            query={query}
            setQuery={setQuery}
            placeholder="Filter playfields…"
            items={data.playfields}
            fields={(p) => [p.name, String(p.id)]}
            itemKey={(p) => p.id}
            render={(p) => (
              <>
                <span className="title">{p.name}</span> <span className="muted mono">{p.id}</span>
                {p.id === here && <span className="badge play">you are here</span>}
              </>
            )}
            actions={(p) => [[`!tp ${p.id}`, 'Go']]}
            send={send}
            canSend={canSend}
          />
        )}
        {section === 'scenarios' && (
          <PickList
            query={query}
            setQuery={setQuery}
            placeholder="Filter test scenarios…"
            items={tests?.scenarios ?? []}
            fields={(s) => [s.label, s.about, ...s.team, ...s.spawn.map((x) => x.name)]}
            itemKey={(s) => s.n}
            render={(s) => (
              <>
                <div>
                  <span className="muted mono">{s.n}</span> <span className="title">{s.label}</span>
                </div>
                <div className="desc">{s.about}</div>
                {(s.team.length > 0 || s.spawn.length > 0) && (
                  <div className="small muted">
                    {s.team.length > 0 && <>team: {s.team.join(', ')}</>}
                    {s.team.length > 0 && s.spawn.length > 0 && ' · '}
                    {s.spawn.length > 0 && <>spawns: {s.spawn.map((x) => `${x.count} × ${x.name}`).join(', ')}</>}
                  </div>
                )}
              </>
            )}
            actions={(s) => [[`!test ${s.n}`, 'Run']]}
            send={send}
            canSend={canSend}
          />
        )}
        {section === 'targets' && <Targets data={data} query={query} setQuery={setQuery} send={send} canSend={canSend} here={here} />}
        {section === 'spawn' && <Spawn data={data} query={query} setQuery={setQuery} send={send} canSend={canSend} />}
        {section === 'looks' && <Looks data={data} query={query} setQuery={setQuery} send={send} canSend={canSend} />}
        {section === 'minifigures' && (
          <>
            <div className="chips row-gap">
              <span className="muted small">Aura</span>
              {['none', 'Disciple', 'Master', 'Grandmaster', 'Superachiever'].map((a, i) => (
                <button key={a} className="chip" disabled={!canSend} onClick={() => send(`!aura ${i}`)}>
                  {i} {a}
                </button>
              ))}
            </div>
            <div className="chips row-gap">
              <span className="muted small">Collection</span>
              <button className="chip" disabled={!canSend} onClick={() => send('!collection limit')} title="own only the team and the members' minifigures">
                limit
              </button>
              <button className="chip" disabled={!canSend} onClick={() => send('!collection all')} title="own every minifigure (relog to see it)">
                all
              </button>
              <button className="chip" disabled={!canSend} onClick={() => send('!own')}>
                how many?
              </button>
            </div>
            <PickList
              query={query}
              setQuery={setQuery}
              placeholder="Filter minifigures…"
              items={data.minifigures}
              fields={(f) => [f.name, f.normal_attack ?? '', f.special_attack ?? '', `series ${f.series}`]}
              itemKey={(f) => f.id}
              render={(f) => (
                <>
                  <span className="title">{f.name}</span> <span className="muted small">series {f.series}</span>
                  <div className="desc">{[f.normal_attack, f.special_attack].filter(Boolean).join(' · ')}</div>
                </>
              )}
              actions={(f) => [[`!own ${f.name}`, 'Own']]}
              send={send}
              canSend={canSend}
            />
          </>
        )}
        {section === 'progress' && <Progress data={data} send={send} canSend={canSend} />}
        {section === 'dialogues' && (
          <PickList
            query={query}
            setQuery={setQuery}
            placeholder="Filter dialogues…"
            items={tests?.dialogues ?? []}
            fields={(d) => [d.npc, pf(d.playfield)]}
            itemKey={(d) => d.n}
            render={(d) => (
              <>
                <span className="muted mono">{d.n}</span> <span className="title">{d.npc}</span> <span className="muted">in {pf(d.playfield)}</span>
              </>
            )}
            actions={(d) => [[`!dialog ${d.n}`, 'Play']]}
            send={send}
            canSend={canSend}
          />
        )}
        {section === 'commands' && (
          <>
            <Filter value={query} set={setQuery} placeholder="Filter commands…" />
            <ul className="plain picklist">
              {(tests?.commands ?? []).filter((c) => !query || (c.usage + ' ' + c.about).toLowerCase().includes(query.toLowerCase())).map((c) => (
                <li key={c.usage}>
                  <div className="pick-main">
                    <code>{c.usage}</code>
                    <div className="desc">{c.about}</div>
                  </div>
                  <button onClick={() => fillCommand(c.usage.split(/\s/)[0] + (/\s/.test(c.usage) ? ' ' : ''))}>Use</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function PickList<T>({
  query,
  setQuery,
  placeholder,
  items,
  fields,
  itemKey,
  render,
  actions,
  send,
  canSend,
}: {
  query: string
  setQuery: (v: string) => void
  placeholder: string
  items: T[]
  fields: (t: T) => string[]
  itemKey: (t: T) => string | number
  render: (t: T) => React.ReactNode
  /** [command, button label] */
  actions: (t: T) => [string, string][]
  send: (cmd: string) => void
  canSend: boolean
}) {
  const shown = useMemo(() => (query.trim() ? best(items, query, fields, Infinity) : items), [items, query, fields])
  return (
    <>
      <Filter value={query} set={setQuery} placeholder={placeholder} />
      <p className="muted small">
        {shown.length} of {items.length}
      </p>
      <ul className="plain picklist">
        {shown.slice(0, SHOWN).map((t) => (
          <li key={itemKey(t)}>
            <div className="pick-main">{render(t)}</div>
            {actions(t).map(([cmd, label]) => (
              <button key={cmd} disabled={!canSend} title={cmd} onClick={() => send(cmd)}>
                {label}
              </button>
            ))}
          </li>
        ))}
      </ul>
      <More total={shown.length} />
    </>
  )
}

function Quick({ send, canSend }: { send: (cmd: string) => void; canSend: boolean }) {
  const [xp, setXp] = useState('1000')
  const [stars, setStars] = useState('100')
  const b = (cmd: string, label: string, title?: string) => (
    <button disabled={!canSend} onClick={() => send(cmd)} title={title ?? cmd}>
      {label}
    </button>
  )
  return (
    <div className="quick">
      <h3>Character</h3>
      <div className="chips">
        {b('!where', 'Where am I?')}
        {b('!revive', 'Revive all')}
        {b('!smashme', 'Smash me')}
        {b('!smash', 'Smash nearest', 'smash the nearest smashable or defeat the nearest enemy within 15 m')}
        {b('!skin reset', 'Own look')}
        {b('!state 1', 'State normal')}
        {b('!fx stop', 'Stop effect')}
      </div>
      <h3>Progress</h3>
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault()
          if (/^\d+$/.test(xp)) send(`!xp ${xp}`)
        }}
      >
        <input value={xp} onChange={(e) => setXp(e.target.value)} inputMode="numeric" size={8} aria-label="XP" />
        <button disabled={!canSend}>+ XP</button>
      </form>{' '}
      <form
        className="inline"
        onSubmit={(e) => {
          e.preventDefault()
          if (/^\d+$/.test(stars)) send(`!stars ${stars}`)
        }}
      >
        <input value={stars} onChange={(e) => setStars(e.target.value)} inputMode="numeric" size={8} aria-label="Stars" />
        <button disabled={!canSend}>+ stars</button>
      </form>{' '}
      {b('!ach', 'Achievements')}
      <h3>Puzzles</h3>
      <div className="chips">
        {b('!mirrors solve', 'Mirrors: solve')}
        {b('!mirrors reset', 'Mirrors: reset')}
        {b('!plates solve', 'Plates: solve')}
        {b('!plates reset', 'Plates: reset')}
      </div>
      <p className="muted small">The server's answer to each command appears in the console.</p>
    </div>
  )
}

function Targets({ data, query, setQuery, send, canSend, here }: { data: GameData; query: string; setQuery: (v: string) => void; send: (c: string) => void; canSend: boolean; here: number | null }) {
  const kinds = data.tests?.kinds ?? []
  const [kind, setKind] = useState('boss')
  const [onlyHere, setOnlyHere] = useState(false)
  const k = kinds.find((x) => x.kind === kind) ?? kinds[0]
  const pf = (id: number) => playfieldName(data, id)
  const items = useMemo(() => (k?.targets ?? []).filter((t) => !onlyHere || t.playfield === here), [k, onlyHere, here])
  return (
    <>
      <div className="chips row-gap">
        {kinds.map((x) => (
          <button key={x.kind} className={`chip${x.kind === k?.kind ? ' on' : ''}`} onClick={() => setKind(x.kind)} title={x.about} disabled={!x.targets.length}>
            {x.kind} <span className="muted">{x.targets.length}</span>
          </button>
        ))}
      </div>
      {k && (
        <p className="muted small">
          {k.about}.{' '}
          <label className="check inline-check">
            <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} disabled={here === null} /> only where you are
          </label>
        </p>
      )}
      {k && (
        <PickList
          query={query}
          setQuery={setQuery}
          placeholder={`Filter ${k.kind} targets by name or playfield…`}
          items={items}
          fields={(t) => [t.label, pf(t.playfield)]}
          itemKey={(t) => t.n}
          render={(t) => (
            <>
              <span className="muted mono">{t.n}</span> <span className="title">{t.label}</span>
              <div className="desc">
                {pf(t.playfield)}
                {t.playfield === here && <span className="badge play">here</span>} <span className="mono small">({t.pos.map((v) => v.toFixed(0)).join(', ')})</span>
              </div>
            </>
          )}
          actions={(t) => [[`!goto ${k.kind} ${t.n}`, 'Go']]}
          send={send}
          canSend={canSend}
        />
      )}
    </>
  )
}

function Spawn({ data, query, setQuery, send, canSend }: { data: GameData; query: string; setQuery: (v: string) => void; send: (c: string) => void; canSend: boolean }) {
  const [count, setCount] = useState('1')
  const n = Math.min(30, Math.max(1, Number(count) || 1))
  const pf = (id: number) => playfieldName(data, id)
  return (
    <>
      <h3>Loot bag at your feet</h3>
      <div className="chips">
        {(data.tests?.loot_kinds ?? []).map((k) => (
          <button key={k} className="chip" disabled={!canSend} onClick={() => send(`!loot ${k}`)}>
            {k}
          </button>
        ))}
      </div>
      <h3>Spawn around you (15 minutes)</h3>
      <label className="check">
        How many <input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" size={4} aria-label="How many" /> <span className="muted small">(1–30)</span>
      </label>
      <PickList
        query={query}
        setQuery={setQuery}
        placeholder="Filter enemies and smashables…"
        items={data.tests?.spawnable ?? []}
        fields={(s) => [s.name, s.kind, ...s.playfields.map(pf)]}
        itemKey={(s) => s.name}
        render={(s) => (
          <>
            <span className="title">{s.name}</span> <span className="badge dim">{s.kind}</span> <span className="muted small">level {s.level}</span>
            <div className="desc" title={s.playfields.map(pf).join(', ')}>
              {places(data, s.playfields, 6)}
            </div>
          </>
        )}
        actions={(s) => [[`!spawn ${n} ${s.name}`, `Spawn ${n}`]]}
        send={send}
        canSend={canSend}
      />
    </>
  )
}

function Looks({ data, query, setQuery, send, canSend }: { data: GameData; query: string; setQuery: (v: string) => void; send: (c: string) => void; canSend: boolean }) {
  const [skin, setSkin] = useState('')
  const [state, setState] = useState('')
  return (
    <>
      <h3>Character state (BCCState)</h3>
      <div className="chips">
        {(
          [
            [1, 'normal'],
            [29, 'Limbo (smashed)'],
            [104, 'building'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className="chip" disabled={!canSend} onClick={() => send(`!state ${v}`)}>
            {v} {label}
          </button>
        ))}
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^\d+$/.test(state.trim())) send(`!state ${state.trim()}`)
          }}
        >
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="n" inputMode="numeric" size={5} aria-label="BCCState" />
          <button disabled={!canSend || !/^\d+$/.test(state.trim())}>Set</button>
        </form>
      </div>
      <h3>Look like (monster data)</h3>
      <div className="chips">
        <button className="chip" disabled={!canSend} onClick={() => send('!skin reset')}>
          Reset: your minifigure
        </button>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^\d+$/.test(skin.trim())) send(`!skin ${skin.trim()}`)
          }}
        >
          <input value={skin} onChange={(e) => setSkin(e.target.value)} placeholder="any monster data id" inputMode="numeric" size={16} aria-label="Monster data id" />
          <button disabled={!canSend || !/^\d+$/.test(skin.trim())}>Wear</button>
        </form>
      </div>
      <PickList
        query={query}
        setQuery={setQuery}
        placeholder="Filter looks by name or id…"
        items={data.tests?.looks ?? []}
        fields={(l) => [...l.names, String(l.monster_data), l.kind]}
        itemKey={(l) => l.monster_data}
        render={(l) => (
          <>
            <span className="title">{l.names.join(', ')}</span> <span className="badge dim">{l.kind}</span> <span className="muted mono small">{l.monster_data}</span>
          </>
        )}
        actions={(l) => [[`!skin ${l.monster_data}`, 'Wear']]}
        send={send}
        canSend={canSend}
      />
    </>
  )
}

function Progress({ data, send, canSend }: { data: GameData; send: (c: string) => void; canSend: boolean }) {
  const [what, setWhat] = useState('kills')
  const [n, setN] = useState('1')
  const [name, setName] = useState('')
  const [q, setQ] = useState('')
  const bosses = bossNames(data.tests).filter((b) => b.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <h3>Count for achievements</h3>
      <form
        className="inline wrap"
        onSubmit={(e) => {
          e.preventDefault()
          send(`!count ${what} ${Number(n) || 1}${name.trim() ? ' ' + name.trim() : ''}`)
        }}
      >
        <select value={what} onChange={(e) => setWhat(e.target.value)} aria-label="What">
          <option>kills</option>
          <option>smashes</option>
          <option>builds</option>
        </select>
        <input value={n} onChange={(e) => setN(e.target.value)} inputMode="numeric" size={6} aria-label="How many" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (default Test Dummy)" list="spawn-names" aria-label="Name" />
        <datalist id="spawn-names">
          {data.tests?.spawnable.map((s) => <option key={s.name} value={s.name} />)}
        </datalist>
        <button disabled={!canSend}>Count</button>
      </form>
      <p>
        <button disabled={!canSend} onClick={() => send('!ach')}>
          Show achievements
        </button>
      </p>
      <h3>Count a boss defeat</h3>
      <Filter value={q} set={setQ} placeholder="Filter bosses…" />
      <ul className="plain picklist">
        {bosses.map((b) => (
          <li key={b}>
            <div className="pick-main">
              <span className="title">{b}</span>
            </div>
            <button disabled={!canSend} onClick={() => send(`!defeat ${b}`)}>
              Defeat
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
