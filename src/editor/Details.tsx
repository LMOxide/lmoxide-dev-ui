// What the right side shows for the row selected in the tree.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MapPinIcon, PlusIcon } from 'lucide-react'
import { Combobox, MultiCombobox, type ComboOption } from '@/components/combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Editor } from './Editor'
import { fmtPos } from './geometry'
import { NoteEditor, newId, StatusSelect } from './NotesPanel'
import { newWave, TriggerEditor } from './WaveTrigger'
import { TagSelect } from './Tags'
import type { Sel } from './Tree'
import { NEW_WALL, WallFields } from './Walls'
import { WaveStepper } from './Waves'
import type { Ctx } from './WorldEditor'
import { worldName } from './nodes'
import type { WorldData, Worlds } from './worlds'
import { findKey, type Kind, type Note, type Placeable, type Script, type SmashAchievement, type WallAction, type WallSettings, type WaveRef } from './types'
import { useDraft } from './AreaEditor'

/** The editor as one world sees it: its objects and scripts; changes load it again. */
export function ctxFor(ctx: Ctx, worlds: Worlds, pf: number): Ctx {
  if (pf === ctx.state.playfield) return ctx
  const w = worlds.data[pf] ?? { objects: [], notes: { notes: [], scripts: [] } }
  return {
    ...ctx,
    objects: w.objects,
    notes: w.notes,
    run: async (f, what) => {
      const r = await ctx.run(f, what)
      await worlds.reload(pf)
      return r
    },
    upsert: (o, replaced) => worlds.upsert(o, pf, replaced),
  }
}

function Field({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2" title={title}>
      <span className="pt-1.5 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Head({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

/** Something has to be done in game first (standing in that world). */
function Elsewhere({ ctx, worlds, pf, what }: { ctx: Ctx; worlds: Worlds; pf: number; what: string }) {
  if (ctx.state.playfield < 0)
    return (
      <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
        Nobody in game: choose a character online on the survey server, and go to <b>{worldName(worlds, pf)}</b> to {what}.
      </p>
    )
  return (
    <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
      You're in {ctx.state.playfield_name ?? worldName(worlds, ctx.state.playfield)}: go to <b>{worldName(worlds, pf)}</b> in game to {what}.
    </p>
  )
}

const KIND_GROUP: Record<Kind, string> = { enemy: 'Enemies', npc: 'NPCs', smashable: 'Smashables', buildie: 'Buildies', interactable: 'Interactables' }
const placeableKey = (p: Placeable) => `${p.kind}:${p.name}:${p.monster_data ?? ''}:${p.template ?? ''}`

/** The spawns that can be placed, for a combo box. */
export function spawnOptions(catalog: Placeable[]): ComboOption[] {
  return catalog.map((p) => ({
    value: placeableKey(p),
    label: p.name,
    detail: p.used ?? (p.monster_data != null ? `look ${p.monster_data}` : p.template != null ? `template ${p.template}` : undefined),
    keywords: `${p.kind} ${p.monster_data ?? ''} ${p.template ?? ''}`,
    group: KIND_GROUP[p.kind],
  }))
}

/** Buildies and interactables aren't looks a character can wear: the server shows a ghost. */
const wearable = (p: Placeable) => p.kind === 'enemy' || p.kind === 'npc' || p.kind === 'smashable'
const same = (a: Placeable | null, b: Placeable | null) => !!a && !!b && placeableKey(a) === placeableKey(b)

/**
 * Place a spawn (picked from the catalog) or a trigger wall where you stand. `wave`: spawns go
 * into it; `wall`: what a new wall does (starts this script, discovers this location).
 */
export function PlacePanel({ ctx, wave, wall: wallAction, spawns = true, walls = true }: { ctx: Ctx; wave?: WaveRef | null; wall?: WallAction; spawns?: boolean; walls?: boolean }) {
  const { backend, account, state } = ctx
  const [key, setKey] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [wall, setWall] = useState<WallSettings | null>(null)
  const chosen = ctx.catalog.find((p) => placeableKey(p) === key) ?? null
  const options = useMemo(() => spawnOptions(ctx.catalog), [ctx.catalog])
  const what = chosen && { ...chosen, level: chosen.kind === 'enemy' ? level : chosen.level }
  const wearing = same(state.wearing, chosen)
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {spawns && (
          <Combobox
            className="min-w-48 flex-1"
            options={options}
            value={key}
            onChange={(v) => {
              setKey(v)
              setWall(null)
              const p = ctx.catalog.find((x) => placeableKey(x) === v)
              setLevel(p?.level ?? null)
            }}
            placeholder={wave ? 'Add a spawn to this wave…' : 'Place a spawn…'}
            search="Search names, looks, templates…"
          />
        )}
        {walls && (
          <Button variant={wall ? 'default' : 'outline'} size="sm" onClick={() => (wall ? setWall(null) : (setWall({ ...NEW_WALL, action: wallAction ?? NEW_WALL.action }), setKey(null)))}>
            <PlusIcon /> Trigger wall
          </Button>
        )}
      </div>
      {chosen && what && (
        <div className="space-y-2">
          {chosen.kind === 'enemy' && (
            <Field label="level">
              <Input className="h-8 w-24" type="number" min={1} value={level ?? ''} onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : null)} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            {wearing ? (
              <Button size="sm" variant="outline" onClick={() => ctx.run(() => backend.wear(account, null))}>
                Take off
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => ctx.run(() => backend.wear(account, what))} title={wearable(chosen) ? 'Your character takes its look' : 'A ghost of it follows you'}>
                {wearable(chosen) ? 'Wear it' : 'Show ghost'}
              </Button>
            )}
            <Button
              size="sm"
              onClick={async () => {
                const o = await ctx.run(() => backend.place(account, what, wave ?? null, ctx.feature, ctx.newTags), 'all')
                if (o) ctx.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
              }}
              title="Where you stand, facing your way"
            >
              <MapPinIcon /> Place here
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Walk to where it stood and face its way, then place it. It is selected after placing, to fine-tune.</p>
        </div>
      )}
      {wall && (
        <div className="space-y-2">
          <label className="sv-field">
            <span>name</span>
            <input placeholder="optional" value={wall.name} onChange={(e) => setWall({ ...wall, name: e.target.value })} />
          </label>
          <WallFields value={wall} scripts={ctx.notes.scripts} looks={ctx.looks} targets={ctx.targets} playfield={state.playfield} onChange={(w) => setWall({ ...wall, ...w })} />
          <Button
            size="sm"
            onClick={async () => {
              const o = await ctx.run(() => backend.placeTrigger(account, wall, ctx.feature, ctx.newTags), 'all')
              if (o) ctx.history.record({ kind: 'place', id: o.id, name: o.name, snapshot: o })
            }}
            title="Standing in its middle, facing the way players walk through it"
          >
            <MapPinIcon /> Place here
          </Button>
        </div>
      )}
    </div>
  )
}

function WorldDetail({ ctx, worlds, pf }: { ctx: Ctx; worlds: Worlds; pf: number }) {
  const info = worlds.playfields.find((p) => p.id === pf)
  const here = ctx.state.playfield === pf
  return (
    <div className="space-y-3">
      <Head title={worldName(worlds, pf, here ? ctx.state.playfield_name : null)} sub={`Playfield ${pf}${here ? ' · you are here' : ''}`} />
      {info && (
        <p className="text-sm text-muted-foreground">
          {info.base} from live, the demo or client data · {info.placements} placed · {info.triggers} trigger walls · {info.scripts} scripts · {info.notes} notes
        </p>
      )}
      {here ? <PlacePanel ctx={ctx} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place things in it" />}
      {here && (
        <Button
          size="sm"
          variant="outline"
          title="Something someone has to check and implement here: a mission area, an achievement, a dialogue, a comment"
          onClick={async () => {
            const note: Note = { id: newId('n'), kind: 'comment', area: { point: [...ctx.state.pos] }, reference: null, comment: '', status: 'unreviewed', tags: ctx.newTags }
            await ctx.run(() => ctx.backend.saveNote(pf, note), 'all')
          }}
        >
          <PlusIcon /> New note here
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Copy spawns, trigger walls, waves or scripts anywhere in the tree and paste them here (right click, or Ctrl+C and Ctrl+V).</p>
    </div>
  )
}

function ScriptDetail({ ctx, worlds, pf, script, onSelect }: { ctx: Ctx; worlds: Worlds; pf: number; script: Script; onSelect: (s: Sel) => void }) {
  const { backend, account } = ctx
  const w = worlds.data[pf]
  const [draft, update] = useDraft(script, (s) => ctx.run(() => backend.saveScript(pf, s), 'all'))
  const [reallyDelete, setReallyDelete] = useState(false)
  const spawned = (wave: string) => (w?.objects ?? []).filter((o) => o.wave?.script === script.id && o.wave.wave === wave).length
  const total = (w?.objects ?? []).filter((o) => o.wave?.script === script.id).length
  return (
    <div className="space-y-3">
      <Head title={draft.name || 'script'} sub={worldName(worlds, pf)}>
        {ctx.state.playfield === pf && script.waves.length > 1 && <WaveStepper ctx={ctx} script={script} />}
      </Head>
      <Field label="name">
        <Input className="h-8" value={draft.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} />
      </Field>
      <Field label="which">
        <Input className="h-8" placeholder="optional: the script's name or id, if you found it" value={draft.reference ?? ''} onChange={(e) => update((d) => ({ ...d, reference: e.target.value || null }))} />
      </Field>
      <Field label="comment">
        <Textarea rows={2} value={draft.comment} onChange={(e) => update((d) => ({ ...d, comment: e.target.value }))} />
      </Field>
      <Field label="review">
        <StatusSelect value={draft.status} onChange={(s) => update((d) => ({ ...d, status: s }))} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={draft.tags ?? []} onChange={(tags) => update((d) => ({ ...d, tags }))} />
      </Field>
      <Field label="waves">
        <ul className="space-y-1 text-sm">
          {draft.waves.map((wave, i) => (
            <li key={wave.id} className="flex items-center gap-2">
              <button type="button" data-slot="link" className="truncate text-primary hover:underline" onClick={() => onSelect({ t: 'wave', pf, script: script.id, wave: wave.id })}>
                {wave.name || `wave ${i + 1}`}
              </button>
              <span className={spawned(wave.id) ? 'text-xs text-muted-foreground' : 'text-xs text-warn'}>{spawned(wave.id) || 'nothing'} spawned</span>
            </li>
          ))}
        </ul>
        <Button className="mt-1" size="sm" variant="outline" onClick={() => update((d) => ({ ...d, waves: [...d.waves, newWave(d.waves.length + 1)] }))}>
          <PlusIcon /> Add a wave
        </Button>
      </Field>
      <div className="flex flex-wrap gap-2">
        {draft.area && ctx.state.playfield === pf && (
          <Button size="sm" variant="outline" onClick={() => ctx.run(() => backend.teleport(account, 'point' in draft.area! ? draft.area.point : 'circle' in draft.area! ? draft.area.circle.center : draft.area!.polygon.points[0]))}>
            Go to it
          </Button>
        )}
        {reallyDelete ? (
          <Button size="sm" variant="destructive" onClick={() => ctx.run(() => backend.deleteScript(pf, script.id), 'all').then(() => worlds.reload(pf))}>
            Really delete
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="text-destructive" disabled={total > 0} title={total ? 'Delete or move its spawns first' : ''} onClick={() => setReallyDelete(true)}>
            Delete script
          </Button>
        )}
      </div>
    </div>
  )
}

function WaveDetail({ ctx, worlds, pf, script, waveId }: { ctx: Ctx; worlds: Worlds; pf: number; script: Script; waveId: string }) {
  const { backend, account } = ctx
  const w = worlds.data[pf]
  const [draft, update] = useDraft(script, (s) => ctx.run(() => backend.saveScript(pf, s), 'all'))
  const i = draft.waves.findIndex((x) => x.id === waveId)
  const wave = draft.waves[i]
  if (!wave) return <p className="text-muted-foreground">This wave is gone.</p>
  const set = (f: (x: typeof wave) => typeof wave) => update((d) => ({ ...d, waves: d.waves.map((x) => (x.id === waveId ? f(x) : x)) }))
  const n = (w?.objects ?? []).filter((o) => o.wave?.script === script.id && o.wave.wave === waveId).length
  const here = ctx.state.playfield === pf
  const ref = { script: script.id, wave: waveId }
  return (
    <div className="space-y-3">
      <Head title={wave.name || `wave ${i + 1}`} sub={`${script.name || 'script'} · ${worldName(worlds, pf)} · ${n ? `${n} spawned` : 'nothing spawns yet'}`} />
      <Field label="name">
        <Input className="h-8" value={wave.name} placeholder={`wave ${i + 1}`} onChange={(e) => set((x) => ({ ...x, name: e.target.value }))} />
      </Field>
      <Field label="trigger">
        <TriggerEditor ctx={ctxFor(ctx, worlds, pf)} script={draft} wave={wave} onChange={(t) => set((x) => ({ ...x, trigger: t }))} />
      </Field>
      <Field label="comment">
        <Textarea rows={2} placeholder="how it starts, in your words" value={wave.comment} onChange={(e) => set((x) => ({ ...x, comment: e.target.value }))} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={wave.tags ?? []} onChange={(tags) => set((x) => ({ ...x, tags }))} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {here && (
          <>
            <Button size="sm" variant="outline" disabled={draft.waves.length < 2} onClick={() => ctx.run(() => backend.showWave(account, script.id, waveId))} title="Show this wave's spawns, and hide the script's other waves">
              Show this wave
            </Button>
            <Button size="sm" variant="outline" disabled={!n} onClick={() => ctx.run(() => backend.previewWave(account, ref))} title="Spawn this wave for a while, as its trigger would">
              Preview
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={n > 0 || draft.waves.length === 1}
          title={n ? 'Delete or move its spawns first' : draft.waves.length === 1 ? 'A script has at least one wave' : 'Delete this wave'}
          onClick={() => update((d) => ({ ...d, waves: d.waves.filter((x) => x.id !== waveId) }))}
        >
          Delete wave
        </Button>
      </div>
      {here ? <PlacePanel ctx={ctx} wave={ref} walls={false} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place spawns in this wave" />}
    </div>
  )
}

/** The enemies and smashables of the catalog, by name (what defeat events name), for picking. */
function enemyOptions(catalog: Placeable[], data: Record<number, WorldData>, worlds: Worlds): ComboOption[] {
  const where = new Map<string, Map<number, number>>()
  for (const [pf, w] of Object.entries(data))
    for (const o of w.objects) {
      if (o.kind !== 'enemy' && o.kind !== 'smashable') continue
      const m = where.get(o.name) ?? new Map()
      m.set(Number(pf), (m.get(Number(pf)) ?? 0) + 1)
      where.set(o.name, m)
    }
  const seen = new Map<string, ComboOption>()
  for (const p of catalog) {
    if ((p.kind !== 'enemy' && p.kind !== 'smashable') || seen.has(p.name)) continue
    const w = where.get(p.name)
    seen.set(p.name, {
      value: p.name,
      label: p.name,
      detail: w ? [...w].map(([pf, n]) => `${worldName(worlds, pf)} ×${n}`).join(', ') : p.used,
      group: KIND_GROUP[p.kind],
      near: !!w,
    })
  }
  return [...seen.values()]
}

function SmashDetail({ ctx, worlds, a }: { ctx: Ctx; worlds: Worlds; a: SmashAchievement }) {
  const rule = a.rule ?? worlds.rules[a.key] ?? null
  const options = useMemo(() => enemyOptions(ctx.catalog, worlds.data, worlds), [ctx.catalog, worlds])
  const [comment, setComment] = useState(rule?.comment ?? '')
  useEffect(() => setComment(rule?.comment ?? ''), [rule?.comment])
  const save = (r: Partial<{ enemies: string[]; comment: string; tags: string[] }>) =>
    worlds.saveRule(a.key, { enemies: rule?.enemies ?? [], comment: rule?.comment ?? '', tags: rule?.tags ?? [], feature: rule?.feature ?? ctx.feature, ...r })
  return (
    <div className="space-y-3">
      <Head title={a.title} sub={[a.group, a.kind === 'defeat' ? 'smash once' : `smash ${a.n}`, a.minifigures ? `every minifigure has it (${a.minifigures})` : null].filter(Boolean).join(' · ')} />
      <p className="text-sm">“{a.text}”</p>
      {!rule?.enemies.length && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">No enemies chosen yet{a.match ? `: the game data counts anything named like “${a.match}”` : a.what ? ': every one counts' : ''}.</p>}
      <Field label="counts" title="The enemies (or smashables) that count toward it">
        <MultiCombobox options={options} value={rule?.enemies ?? []} onChange={(enemies) => save({ enemies })} placeholder="choose enemies…" search="Search enemies…" className="w-full" />
      </Field>
      <Field label="comment">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (rule?.comment ?? '') && save({ comment })} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={rule?.tags ?? []} onChange={(tags) => save({ tags })} />
      </Field>
      <p className="text-xs text-muted-foreground">
        ids {a.ids.join(', ')}
        {rule?.author && ` · by ${rule.author}`}
      </p>
    </div>
  )
}

function EnemyDetail({ ctx, worlds, a, name }: { ctx: Ctx; worlds: Worlds; a: SmashAchievement; name: string }) {
  const rule = a.rule ?? worlds.rules[a.key] ?? null
  const where: [number, number][] = []
  for (const [pf, w] of Object.entries(worlds.data)) {
    const n = w.objects.filter((o) => o.name === name).length
    if (n) where.push([Number(pf), n])
  }
  const kinds = [...new Set(ctx.catalog.filter((p) => p.name === name).map((p) => p.kind))]
  return (
    <div className="space-y-3">
      <Head title={name} sub={`${kinds.join(', ') || 'not in the catalog'} · counts toward ${a.title}`} />
      <p className="text-sm text-muted-foreground">{where.length ? `Spawns in ${where.map(([pf, n]) => `${worldName(worlds, pf)} ×${n}`).join(', ')}.` : 'It spawns nowhere loaded yet.'}</p>
      <Button size="sm" variant="outline" className="text-destructive" onClick={() => rule && worlds.saveRule(a.key, { ...rule, enemies: rule.enemies.filter((e) => e !== name) })}>
        Remove from this achievement
      </Button>
    </div>
  )
}

function LocationDetail({ ctx, worlds, pf, name }: { ctx: Ctx; worlds: Worlds; pf: number; name: string }) {
  const l = ctx.targets?.locations.find((x) => x.playfield === pf && x.name === name)
  const key = findKey(pf, name)
  const rule = worlds.rules[key]
  const [comment, setComment] = useState(rule?.comment ?? '')
  useEffect(() => setComment(rule?.comment ?? ''), [rule?.comment])
  if (!l) return <p className="text-muted-foreground">Unknown location.</p>
  const achs = l.achievements.map((id) => ctx.targets!.achievements.find((a) => a.id === id)).filter((a) => !!a)
  const walls = (worlds.data[pf]?.objects ?? []).filter((o) => o.kind === 'trigger' && typeof o.action === 'object' && 'discover' in o.action && o.action.discover.name === name)
  const save = (r: Partial<{ comment: string; tags: string[] }>) => worlds.saveRule(key, { enemies: [], comment: rule?.comment ?? '', tags: rule?.tags ?? [], feature: rule?.feature ?? ctx.feature, ...r })
  const here = ctx.state.playfield === pf
  return (
    <div className="space-y-3">
      <Head title={l.title || name} sub={`${l.playfield_name ?? worldName(worlds, pf)} · ${name}`} />
      {achs.map((a) => (
        <p key={a!.id} className="text-sm">
          <b>{a!.group ? `${a!.group} › ` : ''}{a!.title || a!.name}</b> <span className="text-muted-foreground">[{a!.id}]</span>
          {a!.text && <span className="text-muted-foreground"> — “{a!.text}”</span>}
          {a!.locations.length > 1 && <span className="text-muted-foreground"> (needs all {a!.locations.length} locations)</span>}
        </p>
      ))}
      {!walls.length && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">No trigger wall discovers it yet.</p>}
      <Field label="comment">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (rule?.comment ?? '') && save({ comment })} />
      </Field>
      <Field label="tags">
        <TagSelect ctx={ctx} value={rule?.tags ?? []} onChange={(tags) => save({ tags })} />
      </Field>
      {l.pos && here && (
        <Button size="sm" variant="outline" onClick={() => ctx.run(() => ctx.backend.teleport(ctx.account, l.pos!))} title={fmtPos(l.pos)}>
          Go to its area
        </Button>
      )}
      {here ? (
        <PlacePanel ctx={ctx} spawns={false} wall={{ discover: { name, achievement: l.achievements.length === 1 ? String(l.achievements[0]) : null } }} />
      ) : (
        <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place a trigger wall for it" />
      )}
    </div>
  )
}

function FolderDetail({ ctx, worlds, sel }: { ctx: Ctx; worlds: Worlds; sel: Extract<Sel, { t: 'folder' }> }) {
  const pf = sel.pf ?? ctx.state.playfield
  const here = ctx.state.playfield === pf
  const w = worlds.data[pf]
  const script = sel.id ? w?.notes.scripts.find((s) => s.id === sel.id) : undefined
  switch (sel.kind) {
    case 'smash': {
      const done = worlds.smash.filter((a) => (a.rule ?? worlds.rules[a.key])?.enemies.length).length
      return (
        <div className="space-y-2">
          <Head title="Smash achievements" sub={`${done} of ${worlds.smash.length} have their enemies chosen`} />
          <p className="text-sm text-muted-foreground">Open one and choose the enemies (or smashables) that count toward it. Those marked amber have none yet.</p>
        </div>
      )
    }
    case 'discover': {
      const n = ctx.targets?.locations.length ?? 0
      return (
        <div className="space-y-2">
          <Head title="Discover locations" sub={`${n} locations`} />
          <p className="text-sm text-muted-foreground">Each location needs a trigger wall that discovers it. Those marked amber have none yet.</p>
        </div>
      )
    }
    case 'waves':
      return script ? (
        <div className="space-y-2">
          <Head title={`${script.name || 'script'} › waves`} sub={worldName(worlds, pf)} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => ctx.run(() => ctx.backend.saveScript(pf, { ...script, waves: [...script.waves, newWave(script.waves.length + 1)] }), 'all').then(() => worlds.reload(pf))}
          >
            <PlusIcon /> Add a wave
          </Button>
        </div>
      ) : null
    case 'script-triggers':
      return script ? (
        <div className="space-y-3">
          <Head title={`${script.name || 'script'} › triggers`} sub="Optional: trigger walls that start it (the server may start it otherwise)" />
          {here ? <PlacePanel ctx={ctx} spawns={false} wall={{ script: { script: script.id, wave: null } }} /> : <Elsewhere ctx={ctx} worlds={worlds} pf={pf} what="place a trigger wall for it" />}
        </div>
      ) : null
    case 'location-triggers':
      return <LocationDetail ctx={ctx} worlds={worlds} pf={pf} name={sel.name!} />
    case 'world-scripts':
      return (
        <div className="space-y-2">
          <Head title="Scripts" sub={worldName(worlds, pf)} />
          <NewScript ctx={ctx} worlds={worlds} pf={pf} />
        </div>
      )
    case 'world-notes':
      return (
        <div className="space-y-2">
          <Head title="Notes" sub={worldName(worlds, pf)} />
          <p className="text-sm text-muted-foreground">Areas someone has to check and implement. Add one from the world's page with <i>New note here</i>.</p>
        </div>
      )
    default:
      return <WorldDetail ctx={ctx} worlds={worlds} pf={pf} />
  }
}

/** A new script in a world (chosen from every world; the surveyor's by default). */
export function NewScript({ ctx, worlds, pf: initial }: { ctx: Ctx; worlds: Worlds; pf?: number }) {
  const [pf, setPf] = useState(initial ?? ctx.state.playfield)
  const options = worlds.playfields.map((p) => ({ value: String(p.id), label: p.name, detail: String(p.id), near: p.scripts + p.placements + p.base > 0 }))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {initial === undefined && <Combobox className="min-w-48" options={options} value={String(pf)} onChange={(v) => v && setPf(Number(v))} search="Search worlds…" />}
      <Button
        size="sm"
        onClick={async () => {
          const s: Script = { id: newId('s'), name: 'New script', area: null, reference: null, comment: '', waves: [newWave(1)], status: 'unreviewed', tags: ctx.newTags }
          await ctx.run(() => ctx.backend.saveScript(pf, s), 'all')
          await worlds.reload(pf)
        }}
      >
        <PlusIcon /> New script
      </Button>
    </div>
  )
}

export function Details({ ctx, worlds, sel, onSelect }: { ctx: Ctx; worlds: Worlds; sel: Sel | null; onSelect: (s: Sel) => void }) {
  if (!sel)
    return (
      <p className="text-muted-foreground">
        Pick something in the tree, use <i>Select nearest</i>, or attack it in game.
      </p>
    )
  switch (sel.t) {
    case 'world':
      return <WorldDetail ctx={ctx} worlds={worlds} pf={sel.pf} />
    case 'object': {
      const o = worlds.data[sel.pf]?.objects.find((x) => x.id === sel.id)
      return o ? <Editor key={o.id} ctx={ctxFor(ctx, worlds, sel.pf)} object={o} /> : <p className="text-muted-foreground">It's gone (deleted, or replaced).</p>
    }
    case 'note': {
      const n = worlds.data[sel.pf]?.notes.notes.find((x) => x.id === sel.id)
      return n ? <NoteEditor key={n.id} ctx={ctxFor(ctx, worlds, sel.pf)} note={n} playfield={sel.pf} /> : null
    }
    case 'script': {
      const s = worlds.data[sel.pf]?.notes.scripts.find((x) => x.id === sel.id)
      return s ? <ScriptDetail key={s.id} ctx={ctx} worlds={worlds} pf={sel.pf} script={s} onSelect={onSelect} /> : null
    }
    case 'wave': {
      const s = worlds.data[sel.pf]?.notes.scripts.find((x) => x.id === sel.script)
      return s ? <WaveDetail key={`${s.id}/${sel.wave}`} ctx={ctx} worlds={worlds} pf={sel.pf} script={s} waveId={sel.wave} /> : null
    }
    case 'smash': {
      const a = worlds.smash.find((x) => x.key === sel.key)
      return a ? <SmashDetail key={a.key} ctx={ctx} worlds={worlds} a={a} /> : null
    }
    case 'enemy': {
      const a = worlds.smash.find((x) => x.key === sel.key)
      return a ? <EnemyDetail ctx={ctx} worlds={worlds} a={a} name={sel.name} /> : null
    }
    case 'location':
      return <LocationDetail key={`${sel.pf}:${sel.name}`} ctx={ctx} worlds={worlds} pf={sel.pf} name={sel.name} />
    case 'folder':
      return <FolderDetail ctx={ctx} worlds={worlds} sel={sel} />
  }
}
