import { useMemo, useState } from 'react'
import { best, bossNames, modeName, places, playfieldName, score, type GameData } from './suggest'
import type { Instances, MonsterData, Player } from './types'
import { Heading } from './Heading'
import { Group } from './Group'
import { Achievements, Story } from './Progress'
import type { Api } from './api'
export { Heading }
import type { PositionCopy } from './PositionCopy'

export type Section = 'quick' | 'teleport' | 'scenarios' | 'targets' | 'spawn' | 'looks' | 'animations' | 'minifigures' | 'progress' | 'story' | 'dialogues' | 'instances' | 'commands'

const SECTIONS: [Section, string][] = [
  ['quick', 'Quick'],
  ['teleport', 'Teleport'],
  ['scenarios', 'Test scenarios'],
  ['targets', 'Go to'],
  ['spawn', 'Spawns'],
  ['looks', 'Looks & state'],
  ['animations', 'Animations'],
  ['minifigures', 'Minifigures & loot'],
  ['progress', 'Achievements'],
  ['story', 'Story'],
  ['dialogues', 'Dialogues'],
  ['instances', 'Instances'],
  ['commands', 'All commands'],
]

/** A command each section is about: the section shows when that one may run (alpha testers
 * have some sections, contributors all). */
const SECTION_COMMAND: Partial<Record<Section, string>> = {
  quick: '!where',
  teleport: '!tp',
  scenarios: '!test',
  targets: '!goto',
  spawn: '!spawn',
  looks: '!skin',
  animations: '!anim',
  minifigures: '!own',
  progress: '!grant',
  story: '!story',
  dialogues: '!dialog',
}

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

function More({ total, limit, setLimit }: { total: number; limit: number; setLimit: (n: number) => void }) {
  if (total <= limit) return null
  return (
    <p className="muted small">
      {total - limit} more: narrow the filter, or{' '}
      <button className="link" onClick={() => setLimit(limit + SHOWN)}>
        view {Math.min(SHOWN, total - limit)} more
      </button>
      {total - limit > SHOWN && (
        <>
          {' '}
          ·{' '}
          <button className="link" onClick={() => setLimit(Infinity)}>
            view all
          </button>
        </>
      )}
    </p>
  )
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
  players,
  instances,
  instancesError,
  loadInstances,
  canSend,
  may,
  moderator,
  send,
  section,
  setSection,
  fillCommand,
  showEffect,
  positionCopy,
  api,
}: {
  data: GameData
  testsError: string
  online: Player | undefined
  /** everyone online (teleport to a player) */
  players: Player[]
  /** `GET /v1/instances` (null: not loaded yet, or refused) */
  instances: Instances | null
  instancesError: string
  loadInstances: () => void
  canSend: boolean
  /** whether a command may run for the chosen player (its GM level) */
  may: (cmd: string) => boolean
  /** the Instances section (moderate scope) */
  moderator: boolean
  send: (cmd: string) => void
  section: Section
  setSection: (s: Section) => void
  fillCommand: (cmd: string) => void
  /** shows an effect package in the effect view */
  showEffect: (id: number) => void
  /** the coordinates in the chosen copy format (shared with the dock bottom right) */
  positionCopy: PositionCopy
  /** the achievements and story read the chosen player's saved character */
  api: Api
}) {
  const [q, setQ] = useState<Record<string, string>>({})
  const query = q[section] ?? ''
  const setQuery = (v: string) => setQ((old) => ({ ...old, [section]: v }))
  const pf = (id: number) => playfieldName(data, id)
  const tests = data.tests
  const here = online?.playfield ?? null
  const sections = SECTIONS.filter(([s]) => (s === 'instances' ? moderator : !SECTION_COMMAND[s] || may(SECTION_COMMAND[s])))
  // a remembered section this account doesn't have: the first one
  if (!sections.some(([s]) => s === section)) section = sections[0][0]

  return (
    <div className="debug">
      <nav className="sections" aria-label="Debug sections">
        {sections.map(([s, label]) => (
          <button key={s} className={s === section ? 'on' : ''} onClick={() => setSection(s)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="section-body">
        {testsError && section !== 'quick' && section !== 'teleport' && section !== 'minifigures' && section !== 'instances' && <Missing />}
        {section === 'quick' && <Quick send={send} canSend={canSend} may={may} />}
        {section === 'teleport' && <Whereabouts data={data} online={online} pc={positionCopy} send={send} canSend={canSend} />}
        {section === 'teleport' && <MovePanel send={send} canSend={canSend} />}
        {section === 'teleport' && <TeleportTo data={data} players={players} online={online} query={query} setQuery={setQuery} send={send} canSend={canSend} />}
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
        {section === 'animations' && <Animations data={data} query={query} setQuery={setQuery} send={send} canSend={canSend} showEffect={showEffect} />}
        {section === 'minifigures' && (
          <>
            <h3>Loot bag at your feet</h3>
            <div className="chips">
              {(tests?.loot_kinds ?? []).map((k) => (
                <button key={k} className="chip" disabled={!canSend} onClick={() => send(`!loot ${k}`)}>
                  {k}
                </button>
              ))}
            </div>
            <div className="chips row-gap">
              <span className="muted small">Aura</span>
              {['none', 'Disciple', 'Master', 'Grandmaster', 'Superachiever'].map((a, i) => (
                <button key={a} className="chip" disabled={!canSend || !may('!aura')} onClick={() => send(`!aura ${i}`)}>
                  {i} {a}
                </button>
              ))}
            </div>
            <div className="chips row-gap">
              <span className="muted small">Collection</span>
              <button className="chip" disabled={!canSend || !may('!collection')} onClick={() => send('!collection limit')} title="own only the team and the members' minifigures">
                limit
              </button>
              <button className="chip" disabled={!canSend || !may('!collection')} onClick={() => send('!collection all')} title="own every minifigure (relog to see it)">
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
              group={(f) => `Series ${f.series}`}
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
        {section === 'instances' && (
          <InstanceList data={data} instances={instances} error={instancesError} reload={loadInstances} online={online} query={query} setQuery={setQuery} />
        )}
        {section === 'progress' && (
          <Achievements api={api} online={online} send={send} canSend={canSend}>
            <Progress data={data} send={send} canSend={canSend} />
          </Achievements>
        )}
        {section === 'story' && <Story api={api} online={online} send={send} canSend={canSend} />}
        {section === 'dialogues' && (
          <PickList
            query={query}
            setQuery={setQuery}
            placeholder="Filter dialogues…"
            items={tests?.dialogues ?? []}
            fields={(d) => [d.npc, pf(d.playfield)]}
            group={(d) => pf(d.playfield)}
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
            {groupBy(
              (tests?.commands ?? []).filter((c) => may(c.usage) && (!query || (c.usage + ' ' + c.about).toLowerCase().includes(query.toLowerCase()))),
              (c) => c.usage.split(/\s/)[0],
            ).map(([base, cs]) =>
              cs.length === 1 ? (
                <ul key={base} className="plain picklist">
                  <CommandRow c={cs[0]} fillCommand={fillCommand} />
                </ul>
              ) : (
                <Group key={base} title={<code>{base}</code>} count={cs.length} open={!!query}>
                  <ul className="plain picklist">
                    {cs.map((c) => (
                      <CommandRow key={c.usage} c={c} fillCommand={fillCommand} />
                    ))}
                  </ul>
                </Group>
              ),
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Items by key, in the order the keys first come. */
function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const t of items) (m.get(key(t)) ?? m.set(key(t), []).get(key(t))!).push(t)
  return [...m]
}

function CommandRow({ c, fillCommand }: { c: { usage: string; about: string }; fillCommand: (cmd: string) => void }) {
  return (
    <li>
      <div className="pick-main">
        <code>{c.usage}</code>
        <div className="desc">{c.about}</div>
      </div>
      <button onClick={() => fillCommand(c.usage.split(/\s/)[0] + (/\s/.test(c.usage) ? ' ' : ''))}>Use</button>
    </li>
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
  group,
}: {
  query: string
  setQuery: (v: string) => void
  placeholder: string
  items: T[]
  fields: (t: T) => string[]
  itemKey: (t: T) => string | number
  /** collapsible groups (by name; open while filtering or when there is one) */
  group?: (t: T) => string
  render: (t: T) => React.ReactNode
  /** [command, button label] */
  actions: (t: T) => [string, string][]
  send: (cmd: string) => void
  canSend: boolean
}) {
  const shown = useMemo(() => (query.trim() ? best(items, query, fields, Infinity) : items), [items, query, fields])
  // how many rows to draw; back to one page whenever the filter changes
  const [limit, setLimit] = useState(SHOWN)
  const [limitFor, setLimitFor] = useState(query)
  if (limitFor !== query) {
    setLimitFor(query)
    setLimit(SHOWN)
  }
  // grouped: in name order, or in the order of the best matches while filtering
  const groups = useMemo(() => {
    if (!group) return null
    const m = new Map<string, T[]>()
    for (const t of shown) {
      const g = group(t)
      ;(m.get(g) ?? m.set(g, []).get(g)!).push(t)
    }
    const entries = [...m]
    if (!query.trim()) entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    return entries
  }, [shown, group, query])
  const row = (t: T) => (
    <li key={itemKey(t)}>
      <div className="pick-main">{render(t)}</div>
      {actions(t).map(([cmd, label]) => (
        <button key={cmd} disabled={!canSend} title={cmd} onClick={() => send(cmd)}>
          {label}
        </button>
      ))}
    </li>
  )
  return (
    <>
      <Filter value={query} set={setQuery} placeholder={placeholder} />
      <p className="muted small">
        {shown.length} of {items.length}
      </p>
      {groups ? (
        groups.map(([g, ts]) => (
          <Group key={g} title={g} count={ts.length} open={!!query.trim() || groups.length === 1}>
            <ul className="plain picklist">{ts.map(row)}</ul>
          </Group>
        ))
      ) : (
        <>
          <ul className="plain picklist">{shown.slice(0, limit).map(row)}</ul>
          <More total={shown.length} limit={limit} setLimit={setLimit} />
        </>
      )}
    </>
  )
}

function Quick({ send, canSend, may }: { send: (cmd: string) => void; canSend: boolean; may: (cmd: string) => boolean }) {
  const [xp, setXp] = useState('1000')
  const [stars, setStars] = useState('100')
  const b = (cmd: string, label: string, title?: string) => (
    <button disabled={!canSend || !may(cmd)} onClick={() => send(cmd)} title={title ?? cmd}>
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

interface Destination {
  key: string
  /** 'playfield', 'player' or a target kind */
  type: string
  label: string
  playfield: number | null
  pos: [number, number, number] | null
  cmd: string
}

/**
 * Teleport anywhere: a playfield (`!tp`), any spawn or other target (`!goto <kind> <n>`), or a
 * player online (`!goto player <name>`), filtered by type.
 */
function TeleportTo({
  data,
  players,
  online,
  query,
  setQuery,
  send,
  canSend,
}: {
  data: GameData
  players: Player[]
  online: Player | undefined
  query: string
  setQuery: (v: string) => void
  send: (c: string) => void
  canSend: boolean
}) {
  const [type, setType] = useState('playfield')
  const [onlyHere, setOnlyHere] = useState(false)
  const here = online?.playfield ?? null
  const pf = (id: number) => playfieldName(data, id)
  const kinds = data.tests?.kinds ?? []
  const types: [string, number, string][] = [
    ['playfield', data.playfields.filter((p) => p.teleport !== false).length, 'playfields (their arrival point)'],
    ['player', players.filter((p) => p.account_id !== online?.account_id).length, 'players online'],
    ['all', kinds.reduce((n, k) => n + k.targets.length, 0), 'every spawn and other target below'],
    ...kinds.map((k): [string, number, string] => [k.kind, k.targets.length, k.about]),
  ]
  const items = useMemo((): Destination[] => {
    let list: Destination[]
    if (type === 'playfield') {
      list = data.playfields
        .filter((p) => p.teleport !== false)
        .map((p) => ({ key: `pf:${p.id}`, type, label: p.name, playfield: p.id, pos: null, cmd: `!tp ${p.id}` }))
    } else if (type === 'player') {
      list = players
        .filter((p) => p.account_id !== online?.account_id)
        .map((p) => ({ key: `player:${p.account_id}`, type, label: `${p.character_name} (${p.username})`, playfield: p.playfield ?? null, pos: null, cmd: `!goto player ${p.character_name}` }))
    } else {
      list = kinds
        .filter((k) => type === 'all' || k.kind === type)
        .flatMap((k) => k.targets.map((t) => ({ key: `${k.kind}:${t.n}`, type: k.kind, label: t.label, playfield: t.playfield, pos: t.pos, cmd: `!goto ${k.kind} ${t.n}` })))
    }
    return list.filter((d) => !onlyHere || d.playfield === here)
  }, [type, data.playfields, players, online?.account_id, kinds, onlyHere, here])
  return (
    <>
      <div className="chips row-gap">
        {types.map(([t, n, about]) => (
          <button key={t} className={`chip${t === type ? ' on' : ''}`} onClick={() => setType(t)} title={about} disabled={!n}>
            {t} <span className="muted">{n}</span>
          </button>
        ))}
      </div>
      <p className="muted small">
        <label className="check inline-check">
          <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} disabled={here === null} /> only where you are
        </label>
      </p>
      <PickList
        query={query}
        setQuery={setQuery}
        placeholder={`Filter ${type === 'all' ? 'targets' : `${type}s`} by name or playfield…`}
        items={items}
        fields={(d) => [d.label, d.type, d.playfield === null ? '' : pf(d.playfield), d.playfield === null ? '' : String(d.playfield)]}
        group={(d) => (d.playfield === null ? 'Anywhere' : pf(d.playfield))}
        itemKey={(d) => d.key}
        render={(d) => (
          <>
            {d.type !== type && <span className="badge">{d.type}</span>} <span className="title">{d.label}</span>
            {d.type === 'playfield' && d.playfield !== null && <span className="muted mono"> {d.playfield}</span>}
            {d.type !== 'playfield' && d.playfield !== null && (
              <div className="desc">
                {pf(d.playfield)}
                {d.playfield === here && <span className="badge play">here</span>}{' '}
                {d.pos && <span className="mono small">({d.pos.map((v) => v.toFixed(0)).join(', ')})</span>}
              </div>
            )}
            {d.type === 'playfield' && d.playfield === here && <span className="badge play">you are here</span>}
          </>
        )}
        actions={(d) => [[d.cmd, 'Go']]}
        send={send}
        canSend={canSend}
      />
    </>
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
          group={(t) => pf(t.playfield)}
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
  // every name of each spawnable's look: the others wearing it, live's, the minifigures', the client's
  const lookNames = useMemo(() => {
    const byLook = new Map<number, Set<string>>()
    const add = (look: number, n: string) => n && (byLook.get(look) ?? byLook.set(look, new Set()).get(look)!).add(n)
    for (const s of data.tests?.spawnable ?? []) if (s.monster_data) add(s.monster_data, s.name)
    for (const m of data.monsters) {
      if (!byLook.has(m.id)) continue
      add(m.id, m.name)
      for (const u of m.used_by) add(m.id, u.name)
      for (const t of m.minifigures) add(m.id, data.minifigures.find((f) => f.id === t)?.name ?? '')
    }
    return (s: { name: string; monster_data?: number }) => [...(s.monster_data ? (byLook.get(s.monster_data) ?? []) : [])].filter((n) => n !== s.name)
  }, [data])
  return (
    <>
      <h3>Spawn around you (15 minutes)</h3>
      <div className="chips row-gap">
        <button className="chip" disabled={!canSend} onClick={() => send('!despawn')} title="remove the test spawns within 30 m">
          Despawn near me
        </button>
        <button className="chip" disabled={!canSend} onClick={() => send('!despawn all')} title="remove every test spawn on this playfield">
          Despawn all here
        </button>
      </div>
      <label className="check">
        How many <input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" size={4} aria-label="How many" /> <span className="muted small">(1–30)</span>
      </label>
      <PickList
        query={query}
        setQuery={setQuery}
        placeholder="Filter enemies and smashables…"
        items={data.tests?.spawnable ?? []}
        fields={(s) => [s.name, s.kind, ...s.playfields.map(pf), ...lookNames(s)]}
        group={(s) => (s.playfields.length ? pf(s.playfields[0]) : 'Not placed in any world')}
        itemKey={(s) => s.name}
        render={(s) => (
          <>
            <span className="title">{s.name}</span> <span className="badge dim">{s.kind}</span> <span className="muted small">level {s.level}</span>
            <div className="desc" title={s.playfields.map(pf).join(', ')}>
              {s.playfields.length ? places(data, s.playfields, 6) : 'no world places it'}
              {lookNames(s).length > 0 && <span className="muted small"> · look also: {lookNames(s).join(', ')}</span>}
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

/** A look's names for people: what the world calls it, the minifigures with its body, else the designers' name. */
function lookTitle(data: GameData, m: MonsterData): string {
  const figures = m.minifigures.map((t) => data.minifigures.find((f) => f.id === t)?.name).filter(Boolean)
  const names = [...new Set([...m.used_by.map((u) => u.name), ...figures])]
  return names.length ? names.join(', ') : m.name
}

function Looks({ data, query, setQuery, send, canSend }: { data: GameData; query: string; setQuery: (v: string) => void; send: (c: string) => void; canSend: boolean }) {
  const [skin, setSkin] = useState('')
  const [state, setState] = useState('')
  const [onlyUsed, setOnlyUsed] = useState(false)
  const states = data.bccStates?.states ?? [
    { value: 1, name: 'normal', groups: [] },
    { value: 29, name: 'Limbo (smashed)', groups: [] },
    { value: 104, name: 'building', groups: [] },
  ]
  // used looks first, then by id
  const looks = useMemo(
    () =>
      data.monsters
        .filter((m) => !onlyUsed || m.used_by.length || m.minifigures.length)
        .sort((a, b) => Number(!(b.used_by.length || b.minifigures.length)) - Number(!(a.used_by.length || a.minifigures.length)) || a.id - b.id),
    [data.monsters, onlyUsed],
  )
  const motionSet = (id: number | null) => data.animations?.motion_sets.find((x) => x.id === id)
  return (
    <>
      <h3>Character state (BCCState, stat 20)</h3>
      <div className="chips">
        {states.map((st) => (
          <button key={st.value} className="chip" disabled={!canSend} onClick={() => send(`!state ${st.value}`)} title={[st.about, st.groups.length ? `allows: ${st.groups.join(', ')}` : ''].filter(Boolean).join('\n')}>
            {st.value} {st.name}
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
      {data.bccStates && (
        <p className="muted small">
          Substates (set by the game, not by <code>!state</code>): {data.bccStates.substates.map((x) => `${x.value} ${x.name}`).join(', ')}.
        </p>
      )}
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
        <label className="check">
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} /> only looks the world or a minifigure uses
        </label>
      </div>
      {data.monsters.length ? (
        <PickList
          query={query}
          setQuery={setQuery}
          placeholder="Filter looks by name, designers' name or id…"
          items={looks}
          fields={(m) => [lookTitle(data, m), m.name, String(m.id), ...m.used_by.map((u) => u.kind)]}
          group={(m) => (m.used_by[0] ? `${m.used_by[0].kind[0].toUpperCase()}${m.used_by[0].kind.slice(1)} looks` : m.minifigures.length ? 'Minifigure looks' : 'Unused looks')}
          itemKey={(m) => m.id}
          render={(m) => (
            <>
              <span className="title">{lookTitle(data, m)}</span> {m.used_by[0] && <span className="badge dim">{m.used_by[0].kind}</span>}
              {m.minifigures.length > 0 && <span className="badge dim">minifigure</span>} <span className="muted mono small">{m.id}</span>
              <div className="desc">
                {m.name}
                {motionSet(m.motion_set) && ` · ${motionSet(m.motion_set)!.motions.length} motions`}
                {m.death_effect_package && ` · death effect ${m.death_effect_package}`}
              </div>
            </>
          )}
          actions={(m) => [[`!skin ${m.id}`, 'Wear'], ...(m.death_effect_package ? ([[`!fx ${m.death_effect_package}`, 'Death fx']] as [string, string][]) : [])]}
          send={send}
          canSend={canSend}
        />
      ) : (
        <PickList
          query={query}
          setQuery={setQuery}
          placeholder="Filter looks by name or id…"
          items={data.tests?.looks ?? []}
          fields={(l) => [...l.names, String(l.monster_data), l.kind]}
          group={(l) => l.kind}
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
      )}
    </>
  )
}

function Animations({ data, query, setQuery, send, canSend, showEffect }: { data: GameData; query: string; setQuery: (v: string) => void; send: (c: string) => void; canSend: boolean; showEffect: (id: number) => void }) {
  const anim = data.animations
  if (!anim) return <p className="banner warn">This API has no animation catalog (<code>GET /v1/catalog/animations</code>); <code>!anim &lt;attribute&gt;</code> may still work.</p>
  // the looks whose anim graph reacts to an attribute
  const looksWith = (graphs: number[]) => data.monsters.filter((m) => m.anim_graph !== null && graphs.includes(m.anim_graph))
  return (
    <>
      <p className="muted small">
        Animation attributes are what effect packages set to switch a character's animation (<code>emotionfxattribute</code> parts). <code>!anim</code> plays a package
        that sets one, on your character: whether it shows depends on your look's anim graph.
      </p>
      <PickList
        query={query}
        setQuery={setQuery}
        placeholder="Filter animation attributes…"
        items={anim.attributes}
        fields={(a) => [a.name]}
        itemKey={(a) => a.name}
        render={(a) => (
          <>
            <span className="title mono">{a.name}</span>
            <div className="desc">
              {a.packages.length} packages set it · {a.graphs.length} anim graphs · {looksWith(a.graphs).length} looks
              {a.package !== null && (
                <>
                  {' '}
                  ·{' '}
                  <button className="link" onClick={() => showEffect(a.package!)}>
                    package {a.package}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        actions={(a) => (a.package !== null ? [[`!anim ${a.name}`, 'Play']] : [])}
        send={send}
        canSend={canSend}
      />
      <p className="muted small">
        {anim.motion_sets.length} motion sets ({anim.motion_sets.reduce((n, m) => n + m.motions.length, 0)} motions) and {anim.anim_graphs.length} anim graphs in the
        client.
      </p>
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
      <h3>Count toward achievements</h3>
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

/** Where the chosen player is now (the players list, refreshed every second here). */
function Whereabouts({ data, online, pc, send, canSend }: { data: GameData; online: Player | undefined; pc: PositionCopy; send: (cmd: string) => void; canSend: boolean }) {
  if (!online) return <p className="muted small">Choose a player online to see where they are.</p>
  const pos = online.position
  const { copy, copied } = pc
  return (
    <p className="whereabouts">
      <span className="muted small">You are at</span>{' '}
      {online.playfield != null && (
        <>
          <span className="title">{playfieldName(data, online.playfield)}</span> <span className="muted mono">{online.playfield}</span>{' '}
          {(online.copy != null || online.mode) && (
            <span className="muted small">
              {[online.copy != null && `copy ${online.copy}`, online.mode && modeName(online.mode)].filter(Boolean).join(' · ')}
            </span>
          )}{' '}
        </>
      )}
      {pos ? (
        <>
          <button className="chip mono" onClick={copy} title="x, y (up), z — click to copy (format: bottom right; Ctrl+Shift+C)">
            {copied === 'ok' ? '✓ copied' : `(${pos.map((v) => v.toFixed(1)).join(', ')})`}
          </button>
          {online.heading != null && <Heading degrees={online.heading} />}
        </>
      ) : (
        <span className="muted small">{online.playfield == null ? 'not in play yet' : 'no position (server older than 2026-10-27)'}</span>
      )}{' '}
      {online.mode && (
        <button
          disabled={!canSend}
          onClick={() => send(online.mode === 'world-editor' ? '!mode progression' : '!mode editor')}
          title="!mode: to this account's character in the other game mode; the game asks to relocate to a new server, Yes goes there"
        >
          {online.mode === 'world-editor' ? 'Switch to Progression' : 'Switch to World Editor'}
        </button>
      )}
    </p>
  )
}

/** !moveto / !move: a position in this playfield, or a step from where the player is (y is up). */
function MovePanel({ send, canSend }: { send: (cmd: string) => void; canSend: boolean }) {
  const [xyz, setXyz] = useState(['', '', ''])
  const nums = xyz.map((v) => Number(v.trim() || '0'))
  const valid = nums.every((n) => Number.isFinite(n))
  const args = nums.join(' ')
  return (
    <div className="move-panel">
      <div className="move-row">
        {['x', 'y (up)', 'z'].map((label, i) => (
          <label key={label}>
            {label}
            <input
              className="mono"
              inputMode="decimal"
              placeholder="0"
              value={xyz[i]}
              onChange={(e) => setXyz(xyz.map((v, j) => (j === i ? e.target.value : v)))}
              onKeyDown={(e) => e.key === 'Enter' && valid && canSend && send(`!move ${args}`)}
            />
          </label>
        ))}
        <button disabled={!canSend || !valid || xyz.every((v) => !v.trim())} onClick={() => send(`!moveto ${args}`)} title={`!moveto ${args}: this position in this playfield`}>
          Go to
        </button>
        <button disabled={!canSend || !valid} onClick={() => send(`!move ${args}`)} title={`!move ${args}: this far from where you are`}>
          Move by
        </button>
      </div>
      <div className="move-row">
        <span className="muted small">Fell under the map?</span>
        {[10, 100, 1000].map((d) => (
          <button key={d} className="chip" disabled={!canSend} onClick={() => send(`!move 0 ${d} 0`)} title={`!move 0 ${d} 0`}>
            ↑ {d} m
          </button>
        ))}
        <button className="chip" disabled={!canSend} onClick={() => send('!move 0 -10 0')} title="!move 0 -10 0">
          ↓ 10 m
        </button>
        <button className="chip" disabled={!canSend} onClick={() => send('!where')}>
          !where
        </button>
      </div>
    </div>
  )
}

/** The running copies of worlds (`GET /v1/instances`, refreshed every 5 s while shown). */
function InstanceList({
  data,
  instances,
  error,
  reload,
  online,
  query,
  setQuery,
}: {
  data: GameData
  instances: Instances | null
  error: string
  reload: () => void
  online: Player | undefined
  query: string
  setQuery: (v: string) => void
}) {
  const list = useMemo(
    () =>
      (instances?.instances ?? [])
        .filter((i) => score(query, playfieldName(data, i.playfield), String(i.playfield), i.mode, i.kind, `copy ${i.copy}`) > 0)
        .sort((a, b) => b.players - a.players || a.playfield - b.playfield || a.copy - b.copy),
    [instances, query, data],
  )
  return (
    <>
      <div className="chips row-gap">
        <button className="chip" onClick={reload} title="Refresh (every 5 s while this shows)">
          ↻
        </button>
        {instances && (
          <span className="muted small">
            {instances.instances.length} running · AI tick {instances.ai_tick_ms.toFixed(1)} ms (longest in the last minute {instances.ai_tick_max_ms.toFixed(1)} ms) · open worlds take{' '}
            {instances.open_world_cap} players a copy
          </span>
        )}
      </div>
      {error && <p className="banner warn">Instances: {error}</p>}
      {!instances && !error && <p className="muted small">Loading…</p>}
      {instances && (
        <>
          <Filter value={query} set={setQuery} placeholder="Filter by world, mode, kind…" />
          <ul className="plain picklist">
            {list.map((i) => (
              <li key={i.key}>
                <div className="pick-main">
                  <div>
                    <span className="title">{playfieldName(data, i.playfield)}</span> <span className="muted mono">{i.playfield}</span>
                    {online && online.playfield === i.playfield && online.copy === i.copy && <span className="badge play">{online.character_name} is here</span>}
                  </div>
                  <div className="small muted">
                    copy {i.copy} · {modeName(i.mode)} · {i.kind}
                    {i.preview_owner != null && <> · owner character {i.preview_owner}</>} · key <span className="mono">{i.key}</span>
                  </div>
                </div>
                <span className={i.players ? 'badge' : 'badge dim'}>
                  {i.players} player{i.players === 1 ? '' : 's'}
                </span>
                <span className="badge dim" title={`${i.characters} characters (players and the NPCs that joined: pets, escorts)`}>
                  {i.npcs} NPCs
                </span>
              </li>
            ))}
          </ul>
          {!list.length && <p className="muted small">{instances.instances.length ? 'Nothing matches the filter.' : 'No world is running.'}</p>}
        </>
      )}
    </>
  )
}
