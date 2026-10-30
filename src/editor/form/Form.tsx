import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, CrosshairIcon, ExternalLinkIcon, LocateFixedIcon, PlusIcon, XIcon } from 'lucide-react'
import { Combobox, MultiCombobox, type ComboOption } from '@/components/combobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { compassPoint, screenAngle } from '@/compass'
import type { CatalogEntry, Json, JsonObject, Schema, Summary } from '../content'
import { recordLabel } from '../content'
import type { Vec3 } from '../types'
import {
  clientCatalog,
  emptyOf,
  enumOptions,
  fieldLabel,
  isPosition,
  isRotation,
  obj,
  parseUnit,
  refKeyKinds,
  refKinds,
  tupleSize,
  types,
  unitOf,
  unNull,
  variantOf,
  variants,
  type S,
} from './schema'

/** What the form's widgets need from the editor. */
export interface FormEnv {
  /** the schema `$ref`s point into */
  root: S
  /** records of these kinds, for reference pickers (loaded once per kind) */
  records: (kinds: string[]) => Promise<Summary[]>
  catalog: (name: string) => Promise<CatalogEntry[]>
  /** opens a record ("go to") */
  open: (id: string) => void
  /** the editor's character in game (none: nobody online) */
  here: { pos: Vec3; heading: number } | null
  /** teleports there (none: nobody online) */
  goTo: ((pos: Vec3) => void) | null
  /** the world of the record edited (its playfield's records are offered first) */
  world: string | null
}

/** One cached promise per key (records of a kind, a catalog), shared by every form. */
export function memo<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (key) => {
    let p = cache.get(key)
    if (!p) {
      p = load(key)
      p.catch(() => cache.delete(key))
      cache.set(key, p)
    }
    return p
  }
}

function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    let gone = false
    load().then((x) => !gone && setV(x)).catch(() => {})
    return () => {
      gone = true
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return v
}

const Hint = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>

// ------------------------------------------------------------------ objects

/**
 * An object's fields in schema order: required ones always, optional ones when set (× removes
 * them), the rest behind "Add field". `inherited` values (from `extends`, a feature, a spawn's
 * template) show greyed with where they come from, and can be overridden.
 */
export function ObjectForm({
  schema,
  value,
  onChange,
  env,
  skip = [],
  inherited,
}: {
  schema: S
  value: JsonObject
  onChange: (v: JsonObject) => void
  env: FormEnv
  skip?: string[]
  inherited?: { value: JsonObject; origin: (field: string) => string | null }
}) {
  const props = (schema.properties ?? {}) as Record<string, Schema>
  const required = new Set((schema.required as string[] | undefined) ?? [])
  const keys = Object.keys(props).filter((k) => !skip.includes(k))
  const set = (k: string, v: Json | undefined) => {
    const next = { ...value }
    if (v === undefined) delete next[k]
    else next[k] = v
    onChange(next)
  }
  const shown = keys.filter((k) => required.has(k) || k in value)
  const fromElsewhere = inherited ? keys.filter((k) => !(k in value) && inherited.value[k] !== undefined) : []
  const addable = keys.filter((k) => !shown.includes(k) && !fromElsewhere.includes(k))
  const extra = Object.keys(value).filter((k) => !(k in props) && !skip.includes(k))
  return (
    <div className="space-y-3">
      {shown.map((k) => (
        <Field key={k} name={k} schema={props[k]} value={value[k]} env={env} onChange={(v) => set(k, v)} onRemove={required.has(k) ? undefined : () => set(k, undefined)} />
      ))}
      {fromElsewhere.map((k) => (
        <div key={k} className="rounded-md border border-dashed px-2 py-1.5 opacity-70" title={describe(props[k], env.root)}>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{fieldLabel(k)}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{short(inherited!.value[k])}</span>
            <span className="text-xs text-muted-foreground">from {inherited!.origin(k) ?? 'its template'}</span>
            <Button size="xs" variant="outline" onClick={() => set(k, inherited!.value[k])} title="Give this record its own value (starting from the inherited one)">
              Override
            </Button>
          </div>
        </div>
      ))}
      {extra.map((k) => (
        <Field key={k} name={k} schema={true} value={value[k]} env={env} onChange={(v) => set(k, v)} onRemove={() => set(k, undefined)} />
      ))}
      {addable.length > 0 && (
        <Combobox
          className="w-56"
          options={addable.map((k) => ({ value: k, label: fieldLabel(k), detail: firstLine(describe(props[k], env.root)) }))}
          value={null}
          onChange={(k) => k && set(k, emptyOf(env.root, props[k]))}
          placeholder="Add field…"
          search="Search fields…"
        />
      )}
    </div>
  )
}

function describe(s: Schema | undefined, root: S): string {
  const o = obj(s)
  return (o.description as string | undefined) ?? (unNull(root, s).s.description as string | undefined) ?? ''
}

const firstLine = (t: string) => t.split('\n')[0].slice(0, 80)

function short(v: Json | undefined): string {
  const t = JSON.stringify(v) ?? ''
  return t.length > 80 ? `${t.slice(0, 77)}…` : t
}

/** A labelled field: name, description as a hint, the value's editor, × when optional. */
export function Field({ name, schema, value, onChange, onRemove, env }: { name: string; schema: Schema; value: Json | undefined; onChange: (v: Json) => void; onRemove?: () => void; env: FormEnv }) {
  const hint = describe(schema, env.root)
  return (
    <div className="space-y-1" data-field={name}>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{fieldLabel(name)}</label>
        {onRemove && (
          <button type="button" data-slot="plain" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${fieldLabel(name)}`} title="Remove this field" onClick={onRemove}>
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      {hint && <Hint>{hint}</Hint>}
      <ValueEditor schema={schema} value={value ?? null} onChange={onChange} env={env} />
    </div>
  )
}

// ------------------------------------------------------------------ any value

/** The editor for a value of `schema`: chosen by its annotations, then its shape. */
export function ValueEditor({ schema, value, onChange, env }: { schema: Schema; value: Json; onChange: (v: Json) => void; env: FormEnv }) {
  const { root } = env
  const outer = obj(schema)
  const { s, nullable } = unNull(root, schema)
  // annotations count on the field (outer) and on its type
  const ann = { ...s, ...outer }
  if (nullable && value === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        none
        <Button size="xs" variant="outline" onClick={() => onChange(emptyOf(root, s))}>
          Set
        </Button>
      </div>
    )
  }
  const clear = nullable ? () => onChange(null) : undefined
  const refs = refKinds(ann)
  if (refs) {
    if (types(s).includes('array') || Array.isArray(value)) return <RefList kinds={refs} value={(value as string[]) ?? []} onChange={onChange} env={env} />
    if (types(s).includes('string') || typeof value === 'string') return <RefPicker kinds={refs} value={(value as string) || null} onChange={(v) => onChange(v ?? (nullable ? null : ''))} env={env} clearable={nullable} />
  }
  const catalog = clientCatalog(ann)
  if (catalog) {
    if (Array.isArray(value) || types(s).includes('array')) return <ListOf value={(value as Json[]) ?? []} onChange={onChange} make={() => 0} item={(v, set) => <ClientPicker catalog={catalog} value={v as number} onChange={set} env={env} />} />
    return <ClientPicker catalog={catalog} value={value as number | null} onChange={(v) => onChange(v ?? (nullable ? null : 0))} env={env} onClear={clear} />
  }
  if (isPosition(ann)) {
    if (Array.isArray(value) && Array.isArray(value[0])) return <ListOf value={value} onChange={onChange} make={() => (env.here?.pos ?? [0, 0, 0]) as Json} item={(v, set) => <PositionInput value={v as number[]} onChange={set} env={env} />} />
    if (types(s).includes('array') && !tupleSize(s)) return <ListOf value={(value as Json[]) ?? []} onChange={onChange} make={() => (env.here?.pos ?? [0, 0, 0]) as Json} item={(v, set) => <PositionInput value={v as number[]} onChange={set} env={env} />} />
    return <PositionInput value={value as number[]} onChange={onChange} env={env} onClear={clear} />
  }
  if (isRotation(ann)) return <RotationInput value={value} onChange={onChange} env={env} onClear={clear} />
  const unit = unitOf(ann)
  if (unit) return <UnitInput unit={unit} value={value} onChange={onChange} onClear={clear} />
  const vs = variants(root, s)
  if (vs) return <VariantEditor variants={vs} value={value} onChange={onChange} env={env} />
  const opts = enumOptions(root, s)
  if (opts) {
    return (
      <Combobox
        className="w-64"
        options={opts.map((o) => ({ value: o.value, label: fieldLabel(o.value), detail: o.description ? firstLine(o.description) : undefined }))}
        value={typeof value === 'string' ? value : null}
        onChange={(v) => onChange(v ?? (nullable ? null : opts[0].value))}
        clearable={nullable}
      />
    )
  }
  const n = tupleSize(s)
  if (n) return <NumbersInput value={(value as number[]) ?? Array(n).fill(0)} size={n} onChange={onChange} />
  // untagged choices (a heading or a quaternion, "world" or minifigures): by the value's type
  const any = (s.anyOf ?? s.oneOf) as Schema[] | undefined
  if (any) return <AnyOfEditor branches={any} value={value} onChange={onChange} env={env} />
  const t = types(s)
  if (t.includes('object') && s.properties) {
    return (
      <div className="rounded-md border p-2">
        <ObjectForm schema={s} value={(value as JsonObject) ?? {}} onChange={onChange} env={env} />
      </div>
    )
  }
  if (t.includes('object') && s.additionalProperties && typeof s.additionalProperties === 'object') {
    return <MapEditor schema={s} value={(value as JsonObject) ?? {}} onChange={onChange} env={env} />
  }
  if (t.includes('array')) {
    const item = s.items as Schema
    return <ListOf value={(value as Json[]) ?? []} onChange={onChange} make={() => emptyOf(root, item)} item={(v, set) => <ValueEditor schema={item} value={v} onChange={set} env={env} />} boxed />
  }
  if (t.includes('boolean')) {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input data-slot="plain" type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {value ? 'yes' : 'no'}
      </label>
    )
  }
  if (t.includes('integer') || t.includes('number')) return <NumberInput value={value as number | null} integer={t.includes('integer') && !t.includes('number')} onChange={(v) => onChange(v ?? (nullable ? null : 0))} />
  if (t.includes('string')) return <TextInput value={(value as string) ?? ''} onChange={onChange} multiline={typeof value === 'string' && (value.length > 60 || value.includes('\n'))} />
  return <JsonInput value={value} onChange={onChange} />
}

// ------------------------------------------------------------------ plain inputs

/** Text kept while typing, given on blur (and Enter in one line). */
export function TextInput({ value, onChange, multiline, className, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const done = () => text !== value && onChange(text)
  return multiline ? (
    <Textarea className={className} rows={3} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={done} />
  ) : (
    <Input className={cn('h-8', className)} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && done()} />
  )
}

export function NumberInput({ value, onChange, integer, className }: { value: number | null; onChange: (v: number | null) => void; integer?: boolean; className?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value))
  useEffect(() => setText(value === null || value === undefined ? '' : String(value)), [value])
  const n = text.trim() === '' ? null : Number(text)
  const bad = n !== null && (isNaN(n) || (integer && !Number.isInteger(n)))
  const done = () => !bad && n !== value && onChange(n)
  return <Input className={cn('h-8 w-32 font-mono', bad && 'border-destructive', className)} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && done()} />
}

function NumbersInput({ value, size, onChange }: { value: number[]; size: number; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: size }, (_, i) => (
        <NumberInput key={i} className="w-24" value={value[i] ?? 0} onChange={(x) => onChange(value.map((y, j) => (j === i ? (x ?? 0) : y)))} />
      ))}
    </div>
  )
}

/** Any JSON, as text (checked when it's left). */
export function JsonInput({ value, onChange }: { value: Json; onChange: (v: Json) => void }) {
  const show = (v: Json) => (v === null ? '' : JSON.stringify(v, null, 1))
  const [text, setText] = useState(show(value))
  const [bad, setBad] = useState('')
  useEffect(() => setText(show(value)), [value])
  return (
    <div className="space-y-1">
      <Textarea
        className={cn('font-mono text-xs', bad && 'border-destructive')}
        rows={Math.min(10, Math.max(2, text.split('\n').length))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            const v = text.trim() ? (JSON.parse(text) as Json) : null
            setBad('')
            if (JSON.stringify(v) !== JSON.stringify(value)) onChange(v)
          } catch (e) {
            setBad(e instanceof Error ? e.message : String(e))
          }
        }}
      />
      {bad ? <p className="text-xs text-destructive">{bad}</p> : <Hint>JSON</Hint>}
    </div>
  )
}

/** `"1.5s"`, `"200ms"`, `"20%"`, a number, `[min, max]`: shows what it parsed to. */
function UnitInput({ unit, value, onChange, onClear }: { unit: 'duration' | 'ratio' | 'range'; value: Json; onChange: (v: Json) => void; onClear?: () => void }) {
  const show = (v: Json) => (Array.isArray(v) ? v.join(', ') : v === null ? '' : String(v))
  const [text, setText] = useState(show(value))
  useEffect(() => setText(show(value)), [value])
  const parsed = (t: string): Json => {
    const s = t.trim()
    if (unit === 'range') {
      const parts = s.split(/[\s,]+|\s*-\s*|\s+to\s+/).filter(Boolean).map(Number)
      return parts.length === 2 ? parts : parts.length === 1 ? parts[0] : s
    }
    return s !== '' && !isNaN(Number(s)) ? Number(s) : s
  }
  const v = parsed(text)
  const meaning = parseUnit(unit, v)
  const placeholder = { duration: '1.5s, 200ms, 2m', ratio: '20%', range: '3 or 1, 5' }[unit]
  return (
    <div className="flex items-center gap-2">
      <Input
        className={cn('h-8 w-36 font-mono', !meaning && text && 'border-destructive')}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => meaning && JSON.stringify(v) !== JSON.stringify(value) && onChange(v)}
        onKeyDown={(e) => e.key === 'Enter' && meaning && onChange(v)}
      />
      <span className={cn('text-xs', meaning ? 'text-muted-foreground' : 'text-destructive')}>{meaning ? `= ${meaning}` : text ? `not a ${unit} (${placeholder})` : ''}</span>
      {onClear && <ClearButton onClick={onClear} />}
    </div>
  )
}

const ClearButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" data-slot="plain" className="text-muted-foreground hover:text-foreground" aria-label="Clear" title="Set to none" onClick={onClick}>
    <XIcon className="size-3.5" />
  </button>
)

// ------------------------------------------------------------------ positions and headings

function PositionInput({ value, onChange, env, onClear }: { value: number[] | null; onChange: (v: number[]) => void; env: FormEnv; onClear?: () => void }) {
  const v = value ?? [0, 0, 0]
  return (
    <div className="flex flex-wrap items-center gap-1">
      {['x', 'y', 'z'].map((axis, i) => (
        <label key={axis} className="flex items-center gap-1 text-xs text-muted-foreground">
          {axis}
          <NumberInput className="w-24" value={v[i] ?? 0} onChange={(x) => onChange(v.map((y, j) => (j === i ? (x ?? 0) : y)))} />
        </label>
      ))}
      <Button size="xs" variant="outline" disabled={!env.here} title={env.here ? 'Where your character stands' : 'Nobody in game'} onClick={() => env.here && onChange(env.here.pos.map((x) => Math.round(x * 100) / 100))}>
        <LocateFixedIcon /> my position
      </Button>
      <Button size="xs" variant="outline" disabled={!env.goTo} title={env.goTo ? 'Teleport your character there' : 'Nobody in game'} onClick={() => env.goTo?.(v as Vec3)}>
        <CrosshairIcon /> go there
      </Button>
      {onClear && <ClearButton onClick={onClear} />}
    </div>
  )
}

const toDeg = (rad: number) => Math.round(((rad * 180) / Math.PI) * 10) / 10
/** A quaternion's heading about the up axis (lmoxide_content::Rot::heading). */
const quatHeading = (q: number[]) => 2 * Math.atan2(q[1], q[3])

/** A heading in degrees (stored in radians); a quaternion shows its heading and is replaced when edited. */
function RotationInput({ value, onChange, env, onClear }: { value: Json; onChange: (v: Json) => void; env: FormEnv; onClear?: () => void }) {
  const quat = Array.isArray(value) && value.length === 4
  const rad = quat ? quatHeading(value as number[]) : typeof value === 'number' ? value : 0
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NumberInput className="w-24" value={toDeg(rad)} onChange={(d) => onChange(Math.round((((d ?? 0) * Math.PI) / 180) * 1000) / 1000)} />
      <span className="text-xs text-muted-foreground">degrees{quat && ' (a quaternion: editing writes a heading)'}</span>
      <HeadingDial rad={rad} />
      <Button size="xs" variant="outline" disabled={!env.here} onClick={() => env.here && onChange(Math.round(env.here.heading * 1000) / 1000)}>
        my heading
      </Button>
      {onClear && <ClearButton onClick={onClear} />}
    </div>
  )
}

function HeadingDial({ rad }: { rad: number }) {
  // (as the game's camera shows it: up is north-east, heading 45°; 0, north, faces +z, up-left)
  const a = (screenAngle((rad * 180) / Math.PI) * Math.PI) / 180
  const x = 10 + 8 * Math.sin(a)
  const y = 10 - 8 * Math.cos(a)
  return (
    <svg viewBox="0 0 20 20" className="size-6 text-muted-foreground" aria-hidden>
      <title>{`${compassPoint((rad * 180) / Math.PI)} in game (up is north-east)`}</title>
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="10" x2={x} y2={y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ------------------------------------------------------------------ references and client ids

function refOptions(list: Summary[], world: string | null, kinds: string[]): ComboOption[] {
  return list.map((r) => ({
    value: r.id,
    label: recordLabel(r),
    detail: r.id,
    group: kinds.length > 1 ? r.kind : undefined,
    near: !!world && r.world === world,
  }))
}

function RefPicker({ kinds, value, onChange, env, clearable }: { kinds: string[]; value: string | null; onChange: (v: string | null) => void; env: FormEnv; clearable?: boolean }) {
  const list = useLoaded(() => env.records(kinds), [kinds.join()])
  const options = useMemo(() => refOptions(list ?? [], env.world, kinds), [list, env.world, kinds])
  const missing = !!value && !!list && !list.some((r) => r.id === value)
  return (
    <div className="flex items-center gap-1">
      <Combobox
        className={cn('w-80', missing && 'border-destructive')}
        options={value && !options.some((o) => o.value === value) ? [{ value, label: value, detail: list ? "doesn't exist" : 'loading…' }, ...options] : options}
        value={value}
        onChange={onChange}
        placeholder={`Choose a ${kinds.join(' or ')}…`}
        search={`Search ${kinds.join(', ')}…`}
        clearable={clearable}
      />
      {value && (
        <Button size="xs" variant="ghost" title={`Go to ${value}`} onClick={() => env.open(value)}>
          <ExternalLinkIcon />
        </Button>
      )}
    </div>
  )
}

function RefList({ kinds, value, onChange, env }: { kinds: string[]; value: string[]; onChange: (v: string[]) => void; env: FormEnv }) {
  const list = useLoaded(() => env.records(kinds), [kinds.join()])
  const options = useMemo(() => refOptions(list ?? [], env.world, kinds), [list, env.world, kinds])
  return (
    <div className="space-y-1">
      <MultiCombobox className="w-full" options={options} value={value} onChange={onChange} placeholder="none" search={`Search ${kinds.join(', ')}…`} />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-x-2 text-xs">
          {value.map((id) => (
            <button key={id} type="button" data-slot="plain" className="text-primary hover:underline" onClick={() => env.open(id)}>
              {id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A client id from a catalog: its name, the id, and its record when it has one. */
export function ClientPicker({ catalog, value, onChange, env, onClear }: { catalog: string; value: number | null; onChange: (v: number | null) => void; env: FormEnv; onClear?: () => void }) {
  const list = useLoaded(() => env.catalog(catalog), [catalog])
  const options = useMemo(() => (list ?? []).map((e) => ({ value: String(e.id), label: e.name || `#${e.id}`, detail: `${e.id}${e.detail ? ` · ${e.detail}` : ''}` })), [list])
  const entry = list?.find((e) => e.id === value)
  return (
    <div className="flex items-center gap-1">
      <Combobox
        className="w-80"
        options={value !== null && !entry ? [{ value: String(value), label: `#${value}`, detail: list ? `not in the ${catalog} catalog` : 'loading…' }, ...options] : options}
        value={value === null ? null : String(value)}
        onChange={(v) => onChange(v === null ? null : Number(v))}
        placeholder={`Choose (${catalog.replace(/_/g, ' ')})…`}
        search="Search by name or id…"
        free={(t) => (/^\d+$/.test(t) ? `Use id ${t}` : `Not an id: ${t}`)}
      />
      {entry?.record && (
        <Button size="xs" variant="ghost" title={`Go to ${entry.record}`} onClick={() => env.open(entry.record!)}>
          <ExternalLinkIcon />
        </Button>
      )}
      {onClear && <ClearButton onClick={onClear} />}
    </div>
  )
}

// ------------------------------------------------------------------ choices, lists, maps

function VariantEditor({ variants: vs, value, onChange, env }: { variants: ReturnType<typeof variants> & object; value: Json; onChange: (v: Json) => void; env: FormEnv }) {
  const name = variantOf(value)
  const v = vs.find((x) => x.name === name)
  const pick = (n: string | null) => {
    const to = vs.find((x) => x.name === n)
    if (!to || to.name === name) return
    onChange(to.schema ? { [to.name]: emptyOf(env.root, to.schema) } : to.name)
  }
  return (
    <div className="space-y-2 rounded-md border p-2">
      <Combobox className="w-64" options={vs.map((x) => ({ value: x.name, label: fieldLabel(x.name), detail: x.description ? firstLine(x.description) : undefined }))} value={name} onChange={pick} search="Search…" />
      {v?.description && <Hint>{v.description}</Hint>}
      {v?.schema && value && typeof value === 'object' && !Array.isArray(value) && <ValueEditor schema={v.schema} value={(value as JsonObject)[v.name]} onChange={(x) => onChange({ [v.name]: x })} env={env} />}
    </div>
  )
}

function AnyOfEditor({ branches, value, onChange, env }: { branches: Schema[]; value: Json; onChange: (v: Json) => void; env: FormEnv }) {
  const bs = branches.map((b) => unNull(env.root, b).s)
  const jsType = (v: Json) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'object' ? 'object' : typeof v)
  const fits = (s: S) => types(s).some((t) => t === jsType(value) || (t === 'integer' && jsType(value) === 'number'))
  const i = Math.max(0, bs.findIndex(fits))
  const label = (s: S, j: number) => firstLine((s.description as string | undefined) ?? types(s).join(' or ')) || `choice ${j + 1}`
  return (
    <div className="space-y-2">
      {bs.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {bs.map((s, j) => (
            <Button key={j} size="xs" variant={j === i ? 'default' : 'outline'} onClick={() => j !== i && onChange(emptyOf(env.root, s))}>
              {label(s, j)}
            </Button>
          ))}
        </div>
      )}
      <ValueEditor schema={bs[i]} value={value} onChange={onChange} env={env} />
    </div>
  )
}

/** A list: each item's editor, × and ↑ ↓ per item, + to add. */
function ListOf({ value, onChange, make, item, boxed }: { value: Json[]; onChange: (v: Json[]) => void; make: () => Json; item: (v: Json, set: (v: Json) => void) => ReactNode; boxed?: boolean }) {
  const move = (i: number, d: number) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="space-y-1">
      {value.map((v, i) => (
        <div key={i} className={cn('flex items-start gap-1', boxed && 'rounded-md border p-2')}>
          <span className="w-5 pt-1.5 text-right text-xs text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">{item(v, (x) => onChange(value.map((y, j) => (j === i ? x : y))))}</div>
          <div className="flex shrink-0 flex-col">
            <button type="button" data-slot="plain" disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up" onClick={() => move(i, -1)}>
              <ArrowUpIcon className="size-3.5" />
            </button>
            <button type="button" data-slot="plain" disabled={i === value.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down" onClick={() => move(i, 1)}>
              <ArrowDownIcon className="size-3.5" />
            </button>
          </div>
          <button type="button" data-slot="plain" className="pt-1 text-muted-foreground hover:text-destructive" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
      <Button size="xs" variant="outline" onClick={() => onChange([...value, make()])}>
        <PlusIcon /> add
      </Button>
    </div>
  )
}

function MapEditor({ schema, value, onChange, env }: { schema: S; value: JsonObject; onChange: (v: JsonObject) => void; env: FormEnv }) {
  const item = schema.additionalProperties as Schema
  const keyKinds = refKeyKinds(schema)
  const [key, setKey] = useState('')
  const add = (k: string | null) => {
    if (!k || k in value) return
    onChange({ ...value, [k]: emptyOf(env.root, item) })
    setKey('')
  }
  return (
    <div className="space-y-2 rounded-md border p-2">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            {keyKinds ? (
              <button type="button" data-slot="plain" className="font-mono text-primary hover:underline" onClick={() => env.open(k)}>
                {k}
              </button>
            ) : (
              <span className="font-mono">{k}</span>
            )}
            <button
              type="button"
              data-slot="plain"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${k}`}
              onClick={() => {
                const next = { ...value }
                delete next[k]
                onChange(next)
              }}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          <ValueEditor schema={item} value={v} onChange={(x) => onChange({ ...value, [k]: x })} env={env} />
        </div>
      ))}
      <div className="flex items-center gap-1">
        {keyKinds ? (
          <RefPicker kinds={keyKinds} value={null} onChange={add} env={env} />
        ) : (
          <>
            <Input className="h-8 w-48" placeholder="new key" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(key.trim())} />
            <Button size="xs" variant="outline" disabled={!key.trim() || key.trim() in value} onClick={() => add(key.trim())}>
              <PlusIcon /> add
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
