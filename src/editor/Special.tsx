import { useEffect, useState } from 'react'
import { DicesIcon } from 'lucide-react'
import { Combobox } from '@/components/combobox'
import type { ContentBackend, Json, JsonObject, LootSimulation } from './content'

// Views beside a record's form where the form alone doesn't show what it means: loot tables'
// drop rates, buffs' effects as sentences, skills' client actions, dialogues' lines, minifigures'
// upgrades.

const o = (v: Json | undefined): JsonObject => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const pct = (x: number) => `${+(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`
const variant = (v: Json): [string, Json] => (typeof v === 'string' ? [v, null] : (Object.entries(o(v))[0] ?? ['?', null]))
const share = (v: Json | undefined) => (typeof v === 'number' ? pct(v) : String(v ?? ''))
const words = (k: string) => k.replace(/_/g, ' ')

function target(t: Json | undefined): string {
  if (t === undefined || t === null || t === 'target') return ''
  const [k, v] = variant(t)
  if (k === 'self') return ' on itself'
  if (k === 'placement') return ` on ${v}`
  if (k === 'tag') return ` on everything tagged ${v}`
  return ` on ${words(k)}`
}

/** An action (lmoxide_content::Action) in words. */
export function describeAction(a: Json): string {
  const [k, raw] = variant(a)
  const v = o(raw)
  switch (k) {
    case 'apply_buff':
      return `gives ${v.buff}${v.amount !== undefined ? ` (${v.amount})` : ''}${v.duration ? ` for ${v.duration}` : ''}${v.stacks ? ` ×${v.stacks}` : ''}${target(v.target)}`
    case 'remove_buff':
      return `removes ${v.buff}${target(v.target)}`
    case 'damage':
      return `deals ${v.amount ?? `${v.mod ?? 1}× power`}${v.type ? ` ${v.type}` : ''} damage${v.radius ? ` within ${v.radius} m` : ''}${target(v.target)}`
    case 'heal':
      return `heals ${share(v.amount)} of max health${target(v.target)}`
    case 'knockback':
      return `knocks back ${v.distance} m${v.radius ? ` within ${v.radius} m` : ''}${target(v.target)}`
    case 'spawn':
      return `spawns ${v.count && v.count !== 1 ? `${v.count}× ` : ''}${v.template}${v.lifetime ? ` for ${v.lifetime}` : ''}`
    case 'drop':
      return `drops loot ${v.loot}`
    case 'give_item':
      return `gives ${v.count && v.count !== 1 ? `${v.count}× ` : ''}${v.item}`
    case 'effect':
      return `shows effect ${v.effect_package}${target(v.target)}`
    case 'teleport':
      return `teleports to ${o(v.to).world ?? 'a place'}${o(v.to).point ? ` (${o(v.to).point})` : ''}`
    case 'start_script':
      return `starts ${v.script}${v.wave ? ` at wave ${v.wave}` : ''}`
    case 'end_script':
      return `ends ${v.script}`
    case 'set_state':
      return `sets ${target(v.target).trim() || 'it'} to ${v.state}`
    case 'command':
      return `runs ${v.name}${Object.keys(o(v.args)).length ? ` (${JSON.stringify(v.args)})` : ''}`
    case 'other':
      return `(not known yet${v.comment ? `: ${v.comment}` : ''})`
    default:
      return `${words(k)}${raw !== null ? ` ${JSON.stringify(raw)}` : ''}`
  }
}

function describeProc(p: JsonObject): string {
  const when = [
    p.every ? `every ${p.every}${p.every === 2 ? 'nd' : p.every === 3 ? 'rd' : 'th'} time` : '',
    p.chance !== undefined ? `${share(p.chance)} chance` : '',
    p.below !== undefined ? `below ${share(p.below)} health` : '',
    p.after ? `after ${p.after} without a hit` : '',
    p.every_time ? `every ${p.every_time}` : '',
    p.lockout ? `at most once per ${p.lockout}` : '',
    p.channelling ? 'while channelling' : '',
  ].filter(Boolean)
  const then = ((p.then as Json[]) ?? []).map(describeAction).join(', then ')
  return `On ${words(String(p.on))}${when.length ? ` (${when.join(', ')})` : ''}: ${then || 'nothing'}`
}

/** A buff effect (lmoxide_content::BuffEffect) in words. */
export function describeEffect(e: Json): string {
  const [k, raw] = variant(e)
  const v = o(raw)
  switch (k) {
    case 'stat': {
      const value = typeof v.value === 'number' && v.op !== 'set' ? (v.op === 'mul' ? `×${1 + v.value}` : `${v.value >= 0 ? '+' : ''}${Math.abs(v.value) < 1 && v.value !== 0 ? pct(v.value) : v.value}`) : String(v.value)
      return `${v.op === 'set' ? `sets ${words(String(v.stat))} to ${value}` : `${value} ${words(String(v.stat))}`}`
    }
    case 'damage_type':
      return `deals its damage as ${raw}`
    case 'proc':
      return describeProc(v)
    case 'skill_mod':
      return `changes ${v.skill}: ${[v.projectiles ? `${v.projectiles} more projectiles` : '', v.cooldown ? `cooldown ${share(v.cooldown)}` : '', v.ability_mod ? `power ${share(v.ability_mod)}` : ''].filter(Boolean).join(', ')}`
    case 'override':
      return `shortcut ${v.slot} casts ${v.skill} instead`
    case 'client':
      return `client action ${v.type}${v.client ? ' (the client runs it)' : ''}`
    default:
      return words(k)
  }
}

/** The page's extra view for a record of `kind`, if it has one. */
export function SpecialView({ kind, record, content, open }: { kind: string; record: JsonObject; content: ContentBackend; open: (id: string) => void }) {
  switch (kind) {
    case 'loot':
      return <LootRates content={content} record={record} />
    case 'buff':
      return <Sentences title="What it does" lines={((record.effects as Json[]) ?? []).map(describeEffect)} />
    case 'npc':
    case 'object':
    case 'trigger':
      return <Sentences title="What it runs" lines={['on_defeat', 'on_use', 'on_built', 'on_smashed', 'actions'].flatMap((f) => ((record[f] as Json[]) ?? []).map((a) => `${words(f)}: ${describeAction(a)}`))} />
    case 'skill':
      return <SkillView record={record} />
    case 'dialogue':
      return <DialogueLines content={content} texts={(record.texts as number[]) ?? []} />
    case 'minifig':
      return <Upgrades content={content} record={record} open={open} />
    default:
      return null
  }
}

function Sentences({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null
  return (
    <section className="space-y-1 rounded-md bg-secondary/50 p-3" data-special>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  )
}

/** Drop rates of a loot table as saved (the server's rules), re-rolled after each save. */
function LootRates({ content, record }: { content: ContentBackend; record: JsonObject }) {
  const [sim, setSim] = useState<LootSimulation | null>(null)
  const [playfield, setPlayfield] = useState<string | null>(null)
  const [worlds, setWorlds] = useState<{ value: string; label: string; detail: string }[]>([])
  const [error, setError] = useState('')
  const id = record.id as string
  const rev = record.rev
  useEffect(() => {
    content.catalog('playfield', { limit: 1000 }).then((c) => setWorlds(c.entries.map((e) => ({ value: String(e.id), label: e.name, detail: String(e.id) }))))
  }, [content])
  useEffect(() => {
    let gone = false
    content
      .simulateLoot(id, 10_000, playfield === null ? undefined : Number(playfield))
      .then((s) => !gone && (setSim(s), setError('')))
      .catch((e) => !gone && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      gone = true
    }
  }, [content, id, rev, playfield])
  return (
    <section className="space-y-2 rounded-md bg-secondary/50 p-3" data-special="loot">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1 text-sm font-medium">
          <DicesIcon className="size-4" /> Drop rates
        </h3>
        <span className="text-xs text-muted-foreground">{sim ? `${sim.rolls.toLocaleString()} rolls as saved` : 'rolling…'}</span>
        <Combobox className="ml-auto h-7 w-56" options={worlds} value={playfield} onChange={setPlayfield} placeholder="in no particular world" search="Search worlds…" clearable />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {sim && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-normal">drops</th>
              <th className="w-24 text-right font-normal">chance</th>
              <th className="w-24 text-right font-normal">per roll</th>
            </tr>
          </thead>
          <tbody>
            {sim.rates.map((r) => (
              <tr key={r.what} className="border-t">
                <td className="py-0.5 font-mono text-xs">{r.what}</td>
                <td className="text-right">{pct(r.chance)}</td>
                <td className="text-right">{+r.per_roll.toFixed(r.per_roll < 0.1 ? 4 : 2)}</td>
              </tr>
            ))}
            <tr className="border-t text-muted-foreground">
              <td className="py-0.5 text-xs">nothing at all</td>
              <td className="text-right">{pct(sim.nothing)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
      {sim?.warnings.map((w) => (
        <p key={w} className="text-xs text-warn">
          {w}
        </p>
      ))}
    </section>
  )
}

/** A skill's client definition, read only: the server runs these where the skill has no effects of its own. */
function SkillView({ record }: { record: JsonObject }) {
  const client = o(record.client)
  const actions = o(client.actions)
  if (!client.spell) return null
  return (
    <section className="space-y-1 rounded-md bg-secondary/50 p-3" data-special="skill">
      <h3 className="text-sm font-medium">The client's spell {String(client.spell)}</h3>
      <p className="text-xs text-muted-foreground">From the client's data (read only here). {((record.effects as Json[]) ?? []).length ? 'Its own effects run instead.' : 'The server runs these actions.'}</p>
      {Object.entries(o(client.stats)).length > 0 && (
        <p className="font-mono text-xs">
          {Object.entries(o(client.stats))
            .map(([k, v]) => `${k} ${JSON.stringify(v)}`)
            .join(' · ')}
        </p>
      )}
      {Object.entries(actions).map(([list, as]) => (
        <div key={list} className="text-xs">
          <p className="font-medium">List {list}</p>
          <ul className="list-disc pl-5 font-mono">
            {((as as Json[]) ?? []).map((a, i) => (
              <li key={i}>
                {String(o(a).type)} {JSON.stringify(o(a).args ?? {})}
                {(o(a).criteria as Json[] | undefined)?.length ? ` if ${JSON.stringify(o(a).criteria)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** A dialogue's lines in order (texts.json, without the client's markup). */
function DialogueLines({ content, texts }: { content: ContentBackend; texts: number[] }) {
  const [names, setNames] = useState<Map<number, string> | null>(null)
  const key = texts.join()
  useEffect(() => {
    if (!texts.length) return
    content.catalog('text', { ids: texts, limit: texts.length }).then((c) => setNames(new Map(c.entries.map((e) => [e.id, e.name]))))
  }, [content, key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!texts.length) return null
  return (
    <section className="space-y-1 rounded-md bg-secondary/50 p-3" data-special="dialogue">
      <h3 className="text-sm font-medium">Lines</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {texts.map((t, i) => (
          <li key={i}>
            {names?.get(t) ?? '…'} <span className="text-xs text-muted-foreground">#{t}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A minifigure's stats, attacks and upgrades, each upgrade with what its buff does. */
function Upgrades({ content, record, open }: { content: ContentBackend; record: JsonObject; open: (id: string) => void }) {
  const upgrades = (record.upgrades as JsonObject[] | undefined) ?? []
  const [buffs, setBuffs] = useState<Map<string, JsonObject>>(new Map())
  const key = upgrades.map((u) => u.buff).join()
  useEffect(() => {
    let gone = false
    Promise.all(upgrades.map((u) => content.get({ id: u.buff as string, feature: 'live' }).then((v) => [u.buff as string, v.resolved] as const).catch(() => null))).then(
      (list) => !gone && setBuffs(new Map(list.filter((x): x is readonly [string, JsonObject] => !!x))),
    )
    return () => {
      gone = true
    }
  }, [content, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const stats = o(record.stats)
  return (
    <section className="space-y-2 rounded-md bg-secondary/50 p-3" data-special="minifig">
      <p className="text-sm">
        {['life', 'power', 'defense', 'creativity'].map((s) => `${s} ${stats[s] ?? '?'}`).join(' · ')}
        {' · '}normal: {String(o(record.normal).name || o(record.normal).skill)} · special: {String(o(record.special).name || o(record.special).skill)}
      </p>
      {upgrades.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {upgrades.map((u) => {
              const b = buffs.get(u.buff as string)
              return (
                <tr key={String(u.bit)} className="border-t align-top">
                  <td className="w-8 py-1 text-xs text-muted-foreground">{String(u.bit)}</td>
                  <td className="py-1">
                    <button type="button" data-slot="plain" className="text-primary hover:underline" onClick={() => open(u.buff as string)}>
                      {(b?.name as string) || String(u.buff)}
                    </button>
                    {u.amount !== undefined && <span className="text-xs text-muted-foreground"> ({JSON.stringify(u.amount)})</span>}
                    <div className="text-xs text-muted-foreground">{((b?.effects as Json[]) ?? []).map(describeEffect).join('; ')}</div>
                  </td>
                  <td className="w-16 py-1 text-right text-xs">{u.price !== undefined ? `${u.price} ★` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
