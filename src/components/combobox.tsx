import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

/**
 * Opens a list just after it is shown: a menu that was closing (the tree's right click menu)
 * gives the focus back first, which would close a list opened at once.
 */
function useOpenAtFirst(on: boolean, setOpen: (o: boolean) => void) {
  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => setOpen(true), 80)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The box a combo box shows: looks like an outline button, holds the trigger (which opens the
 * list) and buttons of its own beside it (× to clear or remove one). Those can't be inside the
 * trigger: a button in a button is invalid, and shadcn's Button gives its icons
 * `pointer-events: none`, so a click on an × inside it opened the list instead.
 */
function Box({ className, title, disabled, onOpen, children }: { className?: string; title?: string; disabled?: boolean; onOpen: () => void; children: ReactNode }) {
  return (
    <PopoverAnchor asChild>
      <div
        title={title}
        data-disabled={disabled || undefined}
        className={cn(
          'flex min-h-8 min-w-0 cursor-pointer items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-sm shadow-xs transition-all hover:bg-accent focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-disabled:pointer-events-none data-disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
          className,
        )}
        // a click on the box around the trigger (a chip's name, the padding) opens it too
        onClick={(e) => !(e.target as Element).closest('button') && onOpen()}
      >
        {children}
      </div>
    </PopoverAnchor>
  )
}

/** An × beside a combo box's trigger. */
function Remove({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn('inline-flex shrink-0 cursor-pointer items-center rounded-sm opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-1', className)} onClick={onClick}>
      <XIcon className="size-3.5" />
    </button>
  )
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
  const [open, setOpen] = useState(false)
  useOpenAtFirst(defaultOpen, setOpen)
  const [query, setQuery] = useState('')
  const picked = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQuery(''))}>
      <Box className={className} title={title} disabled={disabled} onOpen={() => setOpen(true)}>
        <PopoverTrigger asChild>
          <button type="button" role="combobox" aria-expanded={open} disabled={disabled} className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 text-left outline-none">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{picked?.label ?? value ?? placeholder}</span>
            {picked?.detail && <span className="truncate text-xs text-muted-foreground">{picked.detail}</span>}
          </button>
        </PopoverTrigger>
        {clearable && value && <Remove label="Clear" onClick={() => onChange(null)} />}
        <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
      </Box>
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
  defaultOpen = false,
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
  /** opens its list at once (shown on demand) */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  useOpenAtFirst(defaultOpen, setOpen)
  const [query, setQuery] = useState('')
  const picked = new Set(value)
  const optionOf = (v: string): ComboOption => options.find((o) => o.value === v) ?? { value: v, label: v }
  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const everything = !!all && options.length > 0 && options.every((o) => picked.has(o.value))
  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQuery(''))}>
      <Box className={cn('flex-wrap', className)} title={title} onOpen={() => setOpen(true)}>
        {label && <span className="text-muted-foreground">{label}:</span>}
        {!everything &&
          value.map((v) => (
            <span key={v} className="inline-flex max-w-full items-center gap-0.5 rounded-sm bg-secondary px-1.5 text-xs">
              <span className="truncate">{chip ? chip(optionOf(v)) : optionOf(v).label}</span>
              <Remove label={`Remove ${optionOf(v).label}`} className="[&_svg]:size-3" onClick={() => toggle(v)} />
            </span>
          ))}
        <PopoverTrigger asChild>
          <button type="button" role="combobox" aria-expanded={open} aria-label={label ? `${label}: choose` : 'Choose'} className="flex min-w-4 flex-1 cursor-pointer items-center justify-between gap-1 self-stretch text-left outline-none">
            {everything ? <span>{all}</span> : value.length === 0 ? <span className="text-muted-foreground">{placeholder}</span> : <span />}
            <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
      </Box>
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
