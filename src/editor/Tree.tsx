import { memo, useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { CheckIcon, ChevronRightIcon, EyeIcon, EyeOffIcon, type LucideIcon } from 'lucide-react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import type { Clip, Target } from './clipboard'

export interface MenuItem {
  label: string
  run: () => void
  disabled?: boolean
  danger?: boolean
  shortcut?: string
  /** a line above it */
  separator?: boolean
}

/** What a row is, for the details beside the tree. */
export type Sel =
  | { t: 'world'; pf: number }
  | { t: 'object'; pf: number; id: string }
  | { t: 'note'; pf: number; id: string }
  | { t: 'script'; pf: number; id: string }
  | { t: 'wave'; pf: number; script: string; wave: string }
  /** a rule's row: a smash achievement, a collectible or drop, a category (by rule key) */
  | { t: 'smash'; key: string }
  | { t: 'enemy'; key: string; name: string }
  | { t: 'location'; pf: number; name: string }
  | { t: 'folder'; kind: 'smash' | 'collect' | 'categories' | 'discover' | 'world-scripts' | 'world-triggers' | 'world-notes' | 'world-kind' | 'script-triggers' | 'waves' | 'location-triggers'; pf?: number; id?: string; name?: string }

/** One row of the tree: a folder (it has children) or a file. */
export interface TNode {
  /** its path, unique in the tree ("spawns/1200/p-…") */
  key: string
  label: string
  /** small, after the name */
  detail?: string
  icon: LucideIcon
  /**
   * todo: it needs work (an achievement nobody gave enemies, a location without a trigger, a
   * wave with nothing in it); done: it has what it needs. Folders say how many are done.
   */
  status?: 'todo' | 'done'
  tags?: string[]
  /** small badges after the name (category, feature, ...) */
  badges?: ReactNode
  /** right-aligned (a distance, "3/12") */
  aside?: string
  /** a folder's children (built only when it is open, if a function) */
  children?: TNode[] | (() => TNode[])
  /** how many children a lazy folder has (shown before it is opened) */
  count?: number
  /** called when a folder is opened (loads a world) */
  onOpen?: () => void
  /** shown in game? (an eye toggles it) */
  shown?: boolean
  toggleShown?: () => void
  /** in the multi-selection */
  picked?: boolean
  /** what the multi-selection holds for it (rows without one can't be multi-selected) */
  pickItem?: PickItem
  /** greyed (hidden in game, recorded only) */
  dim?: boolean
  /** a hint when hovering */
  title?: string
  menu?: () => MenuItem[]
  sel?: Sel
  /** Ctrl+C */
  copy?: () => Clip
  /** where Ctrl+V pastes */
  target?: Target
}

/** An object in the multi-selection: its id and world. */
export interface PickItem {
  id: string
  pf: number
}
/** toggle: each flips; add: they join; replace: they become the selection */
export type PickMode = 'toggle' | 'add' | 'replace'

export const kidsOf = (n: TNode): TNode[] => (typeof n.children === 'function' ? n.children() : (n.children ?? []))

/**
 * A file-system-like tree: folders open and close (remembered by the caller), a click selects,
 * a right click opens the row's menu (copy, paste, ...), arrow keys move.
 *
 * Multi-selection (rows with a `pickItem`), as in a file manager: Ctrl+click toggles a row,
 * Shift+click selects the range from the last clicked row (Ctrl+Shift+click adds it), Shift+arrows
 * extend it, Ctrl+A selects every visible row, Space toggles the current row.
 */
export function Tree({
  nodes,
  open,
  setOpen,
  selected,
  onSelect,
  onKey,
  pickCount = 0,
  onPick,
}: {
  nodes: TNode[]
  open: Set<string>
  setOpen: (key: string, open: boolean) => void
  selected: string | null
  onSelect: (n: TNode) => void
  /** keys pressed on the selected row (Ctrl+C, Ctrl+V, ...) */
  onKey?: (e: KeyboardEvent, n: TNode) => void
  /** how many are multi-selected (also in closed folders) */
  pickCount?: number
  onPick?: (items: PickItem[], mode: PickMode) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  // the visible rows in order, for the arrow keys
  const flat: { n: TNode; depth: number }[] = []
  const walk = (list: TNode[], depth: number) => {
    for (const n of list) {
      flat.push({ n, depth })
      if (n.children && open.has(n.key)) walk(kidsOf(n), depth + 1)
    }
  }
  walk(nodes, 0)

  // where a Shift range starts: the last row selected without Shift
  const anchor = useRef<string | null>(selected)
  const shifting = useRef(false)
  useEffect(() => {
    if (!shifting.current) anchor.current = selected
    shifting.current = false
  }, [selected])
  const items = (rows: { n: TNode }[]) => rows.map((r) => r.n.pickItem).filter((x): x is PickItem => !!x)
  /** the rows from the anchor to `to` */
  const range = (to: number) => {
    let a = flat.findIndex((r) => r.n.key === anchor.current)
    if (a < 0) a = to
    return flat.slice(Math.min(a, to), Math.max(a, to) + 1)
  }

  function click(e: MouseEvent, n: TNode) {
    const i = flat.findIndex((r) => r.n.key === n.key)
    const ctrl = e.ctrlKey || e.metaKey
    if (onPick && e.shiftKey) {
      onPick(items(range(i)), ctrl ? 'add' : 'replace')
      if (n.key !== selected) ((shifting.current = true), onSelect(n))
      return
    }
    if (onPick && ctrl && n.pickItem) {
      // starting a selection: the row you were on joins it (as in a file manager)
      const cur = flat.find((r) => r.n.key === selected)?.n.pickItem
      if (!pickCount && cur && cur.id !== n.pickItem.id) onPick([cur], 'add')
      onPick([n.pickItem], 'toggle')
      anchor.current = n.key
      return
    }
    onSelect(n)
  }
  // (a stable handler, so rows stay memoized)
  const clickRef = useRef(click)
  clickRef.current = click
  const onClick = useCallback((e: MouseEvent, n: TNode) => clickRef.current(e, n), [])

  // the selected row scrolled into view (selected in game, or by a link)
  useEffect(() => {
    if (!selected) return
    const el = box.current?.querySelector(`[data-key="${CSS.escape(selected)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  function keyDown(e: KeyboardEvent) {
    const i = flat.findIndex((r) => r.n.key === selected)
    const cur = flat[i]?.n
    if (cur && onKey) {
      onKey(e, cur)
      if (e.defaultPrevented) return
    }
    const go = (j: number) => {
      const to = Math.max(0, Math.min(flat.length - 1, j))
      const r = flat[to]
      if (!r) return
      e.preventDefault()
      if (e.shiftKey && onPick) {
        onPick(items(range(to)), 'replace')
        shifting.current = true
      }
      onSelect(r.n)
    }
    if (onPick && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      onPick(items(flat), 'add')
      return
    }
    if (onPick && e.key === ' ' && cur?.pickItem) {
      e.preventDefault()
      onPick([cur.pickItem], 'toggle')
      return
    }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (cur && e.key === 'ArrowRight' && cur.children) (e.preventDefault(), open.has(cur.key) ? go(i + 1) : (setOpen(cur.key, true), cur.onOpen?.()))
    else if (cur && e.key === 'ArrowLeft') {
      e.preventDefault()
      if (cur.children && open.has(cur.key)) setOpen(cur.key, false)
      else {
        // to its folder
        const d = flat[i].depth
        for (let j = i - 1; j >= 0; j--) if (flat[j].depth < d) return go(j)
      }
    }
  }

  return (
    <div ref={box} role="tree" tabIndex={0} onKeyDown={keyDown} className="min-h-0 flex-1 overflow-auto py-1 text-[13px] outline-none">
      {flat.map(({ n, depth }) => (
        <Row key={n.key} n={n} depth={depth} isOpen={open.has(n.key)} isSelected={n.key === selected} setOpen={setOpen} onClick={onClick} />
      ))}
      {!flat.length && <p className="px-3 py-2 text-muted-foreground">Nothing here matches.</p>}
    </div>
  )
}

const Row = memo(function Row({
  n,
  depth,
  isOpen,
  isSelected,
  setOpen,
  onClick,
}: {
  n: TNode
  depth: number
  isOpen: boolean
  isSelected: boolean
  setOpen: (key: string, open: boolean) => void
  onClick: (e: MouseEvent, n: TNode) => void
}) {
  const folder = !!n.children
  const toggle = () => {
    setOpen(n.key, !isOpen)
    if (!isOpen) n.onOpen?.()
  }
  const Icon = n.icon
  const row = (
    <div
      data-key={n.key}
      role="treeitem"
      aria-expanded={folder ? isOpen : undefined}
      aria-selected={isSelected}
      title={n.title}
      onClick={(e) => onClick(e, n)}
      onDoubleClick={() => folder && toggle()}
      onContextMenu={(e) => onClick(e, n)}
      className={cn('group flex h-7 cursor-default items-center gap-1 pr-2 select-none hover:bg-muted', isSelected && 'bg-accent hover:bg-accent', n.picked && 'bg-primary/10', n.dim && 'opacity-55')}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      <span
        className={cn('flex size-4 shrink-0 items-center justify-center rounded-sm', folder && 'hover:bg-secondary')}
        onClick={(e) => {
          if (!folder) return
          e.stopPropagation()
          toggle()
        }}
      >
        {folder && <ChevronRightIcon className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />}
      </span>
      {n.picked ? (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground" title="Selected (Ctrl+click to unselect, Esc clears)">
          <CheckIcon className="size-3" />
        </span>
      ) : (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      )}
      {n.status && (
        <span
          className={cn('size-2 shrink-0 rounded-full', n.status === 'todo' ? 'bg-amber-500' : 'bg-emerald-500')}
          title={n.status === 'todo' ? 'Needs work' : 'Has what it needs'}
        />
      )}
      <span className="min-w-0 truncate">{n.label}</span>
      {n.detail && <span className="min-w-0 shrink truncate text-xs text-muted-foreground">{n.detail}</span>}
      {n.badges}
      {n.tags?.map((t) => (
        <span key={t} className="shrink-0 rounded-sm bg-tag-bg px-1 text-[11px] text-tag">
          #{t}
        </span>
      ))}
      <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
        {(n.aside ?? (folder && n.count !== undefined && !isOpen ? String(n.count) : undefined)) && (
          <span className="text-xs text-muted-foreground tabular-nums">{n.aside ?? n.count}</span>
        )}
        {n.toggleShown && (
          <button
            type="button"
            data-slot="eye"
            className={cn('rounded-sm p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground', n.shown !== false && 'opacity-0 group-hover:opacity-100', isSelected && 'opacity-100')}
            title={n.shown === false ? 'Hidden in game (only for you): show it' : 'Hide it in game (only for you, until you show it again)'}
            onClick={(e) => (e.stopPropagation(), n.toggleShown!())}
          >
            {n.shown === false ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
          </button>
        )}
      </span>
    </div>
  )
  if (!n.menu) return row
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        <Menu items={n.menu} />
      </ContextMenuContent>
    </ContextMenu>
  )
})

/** The menu is built when it opens (what can be pasted depends on the clipboard then). */
function Menu({ items }: { items: () => MenuItem[] }) {
  return (
    <>
      {items().map((m, i) => (
        <span key={i}>
          {m.separator && i > 0 && <ContextMenuSeparator />}
          <ContextMenuItem disabled={m.disabled} variant={m.danger ? 'destructive' : 'default'} onSelect={m.run}>
            {m.label}
            {m.shortcut && <ContextMenuShortcut>{m.shortcut}</ContextMenuShortcut>}
          </ContextMenuItem>
        </span>
      ))}
    </>
  )
}
