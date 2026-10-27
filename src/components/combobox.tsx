import { useMemo, useState, type ReactNode } from 'react'
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboOption {
  /** what is stored when it is picked */
  value: string
  label: string
  /** shown small beside it (and searched) */
  detail?: string
  /** searched, not shown (other names it goes by) */
  keywords?: string
  /** a heading it is listed under ("In this world", "Enemies") */
  group?: string
  /** listed first */
  near?: boolean
}

/** How many options a list shows at once (type to narrow it). */
const LIMIT = 200

/** Every word typed, anywhere in it ("fiery paleo", "volcano dino", "1613"). */
function matching(options: ComboOption[], query: string) {
  const words = query.toLowerCase().split(/[\s>[\]#]+/).filter(Boolean)
  const hits = options.filter((o) => {
    const hay = `${o.label} ${o.detail ?? ''} ${o.keywords ?? ''} ${o.value}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  return [...hits.filter((o) => o.near), ...hits.filter((o) => !o.near)]
}

/** Options in their groups, in the order the groups first appear. */
function grouped(options: ComboOption[]) {
  const groups = new Map<string, ComboOption[]>()
  for (const o of options) {
    const g = o.group ?? ''
    groups.set(g, [...(groups.get(g) ?? []), o])
  }
  return [...groups]
}

function OptionRow({ o, on }: { o: ComboOption; on: boolean }) {
  return (
    <>
      <CheckIcon className={cn('size-4 shrink-0', on ? 'opacity-100' : 'opacity-0')} />
      <span className="truncate">{o.label}</span>
      {o.detail && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{o.detail}</span>}
    </>
  )
}

function List({
  options,
  isOn,
  onPick,
  query,
  setQuery,
  placeholder,
  free,
  empty,
}: {
  options: ComboOption[]
  isOn: (v: string) => boolean
  onPick: (v: string) => void
  query: string
  setQuery: (q: string) => void
  placeholder: string
  /** "Use “…”" for typed text that isn't listed */
  free?: (text: string) => string
  empty?: string
}) {
  const hits = useMemo(() => matching(options, query), [options, query])
  const typed = query.trim()
  const canFree = !!free && typed !== '' && !options.some((o) => o.value.toLowerCase() === typed.toLowerCase())
  return (
    // the list is filtered here (words anywhere, near ones first), not by cmdk
    <Command shouldFilter={false}>
      <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{empty ?? 'Nothing matches.'}</CommandEmpty>
        {canFree && (
          <CommandGroup>
            <CommandItem value={`free:${typed}`} onSelect={() => onPick(typed)}>
              {free!(typed)}
            </CommandItem>
          </CommandGroup>
        )}
        {grouped(hits.slice(0, LIMIT)).map(([g, list]) => (
          <CommandGroup key={g} heading={g || undefined}>
            {list.map((o) => (
              <CommandItem key={o.value} value={o.value} onSelect={() => onPick(o.value)}>
                <OptionRow o={o} on={isOn(o.value)} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {hits.length > LIMIT && <div className="px-2 py-1.5 text-xs text-muted-foreground">{hits.length - LIMIT} more: type to narrow it.</div>}
      </CommandList>
    </Command>
  )
}

/**
 * Picks one value from a list, searching as you type. The button shows the picked option's name
 * (and its detail, small), never the raw value. `free` lets typed text that isn't listed be kept
 * (naming the thing is optional).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  search = 'Search…',
  free,
  clearable,
  className,
  disabled,
  title,
  defaultOpen = false,
}: {
  options: ComboOption[]
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
  search?: string
  free?: (text: string) => string
  /** an × that sets it back to nothing */
  clearable?: boolean
  className?: string
  disabled?: boolean
  title?: string
  /** opens its list at once (shown on demand) */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const picked = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQuery(''))}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} title={title} className={cn('h-8 min-w-0 justify-between gap-1 px-2 font-normal', className)}>
          <span className={cn('flex min-w-0 items-baseline gap-2', !value && 'text-muted-foreground')}>
            <span className="truncate">{picked?.label ?? value ?? placeholder}</span>
            {picked?.detail && <span className="truncate text-xs text-muted-foreground">{picked.detail}</span>}
          </span>
          <span className="flex shrink-0 items-center">
            {clearable && value && (
              <XIcon
                className="size-3.5 opacity-60 hover:opacity-100"
                onPointerDown={(e) => (e.preventDefault(), e.stopPropagation(), onChange(null))}
                aria-label="Clear"
              />
            )}
            <ChevronsUpDownIcon className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <List
          options={options}
          isOn={(v) => v === value}
          onPick={(v) => (onChange(v), setOpen(false), setQuery(''))}
          query={query}
          setQuery={setQuery}
          placeholder={search}
          free={free}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Picks several values: the button shows them as chips (× removes one), the list ticks them.
 * `create` lets typed text that isn't listed be added (tags).
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = 'None',
  search = 'Search…',
  create,
  label,
  chip,
  all,
  className,
  title,
}: {
  options: ComboOption[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  search?: string
  /** "Add tag" for typed text that isn't listed */
  create?: string
  /** before the chips ("Show", "Tags") */
  label?: string
  /** how a picked value shows (default: its option's label) */
  chip?: (o: ComboOption) => ReactNode
  /** the button's text when every option is picked */
  all?: string
  className?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const picked = new Set(value)
  const optionOf = (v: string): ComboOption => options.find((o) => o.value === v) ?? { value: v, label: v }
  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const everything = !!all && options.length > 0 && options.every((o) => picked.has(o.value))
  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQuery(''))}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} title={title} className={cn('h-auto min-h-8 min-w-0 justify-between gap-1 px-2 py-1 font-normal', className)}>
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {label && <span className="text-muted-foreground">{label}:</span>}
            {everything ? (
              <span>{all}</span>
            ) : value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              value.map((v) => (
                <span key={v} className="inline-flex max-w-full items-center gap-0.5 rounded-sm bg-secondary px-1.5 text-xs">
                  <span className="truncate">{chip ? chip(optionOf(v)) : optionOf(v).label}</span>
                  <XIcon className="size-3 shrink-0 opacity-60 hover:opacity-100" aria-label={`Remove ${v}`} onPointerDown={(e) => (e.preventDefault(), e.stopPropagation(), toggle(v))} />
                </span>
              ))
            )}
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
        <List
          options={options}
          isOn={(v) => picked.has(v)}
          onPick={(v) => (toggle(v), setQuery(''))}
          query={query}
          setQuery={setQuery}
          placeholder={create ? `${search.replace(/…$/, '')} or ${create.toLowerCase()}…` : search}
          free={create ? (t) => `${create}: “${t}”` : undefined}
        />
        <div className="flex gap-3 border-t px-2 py-1.5 text-xs">
          <button type="button" data-slot="link" className="text-primary hover:underline" onClick={() => onChange([...new Set([...value, ...matching(options, query).map((o) => o.value)])])}>
            all{query && ' shown'}
          </button>
          <button type="button" data-slot="link" className="text-primary hover:underline" onClick={() => onChange([])}>
            none
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
