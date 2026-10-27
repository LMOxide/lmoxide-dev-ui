import { memo, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRightIcon, EyeIcon, EyeOffIcon, type LucideIcon } from 'lucide-react'
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
  | { t: 'smash'; key: string }
  | { t: 'enemy'; key: string; name: string }
  | { t: 'location'; pf: number; name: string }
  | { t: 'folder'; kind: 'smash' | 'discover' | 'world-scripts' | 'world-triggers' | 'world-notes' | 'world-kind' | 'script-triggers' | 'waves' | 'location-triggers'; pf?: number; id?: string; name?: string }

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

export const kidsOf = (n: TNode): TNode[] => (typeof n.children === 'function' ? n.children() : (n.children ?? []))

/**
 * A file-system-like tree: folders open and close (remembered by the caller), a click selects,
 * a right click opens the row's menu (copy, paste, ...), arrow keys move.
 */
export function Tree({
  nodes,
  open,
  setOpen,
  selected,
  onSelect,
  onKey,
}: {
  nodes: TNode[]
  open: Set<string>
  setOpen: (key: string, open: boolean) => void
  selected: string | null
  onSelect: (n: TNode) => void
  /** keys pressed on the selected row (Ctrl+C, Ctrl+V, ...) */
  onKey?: (e: KeyboardEvent, n: TNode) => void
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
      const r = flat[Math.max(0, Math.min(flat.length - 1, j))]
      if (r) (e.preventDefault(), onSelect(r.n))
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
        <Row key={n.key} n={n} depth={depth} isOpen={open.has(n.key)} isSelected={n.key === selected} setOpen={setOpen} onSelect={onSelect} />
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
  onSelect,
}: {
  n: TNode
  depth: number
  isOpen: boolean
  isSelected: boolean
  setOpen: (key: string, open: boolean) => void
  onSelect: (n: TNode) => void
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
      onClick={() => onSelect(n)}
      onDoubleClick={() => folder && toggle()}
      onContextMenu={() => onSelect(n)}
      className={cn('group flex h-7 cursor-default items-center gap-1 pr-2 select-none hover:bg-muted', isSelected && 'bg-accent hover:bg-accent', n.dim && 'opacity-55')}
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
      <Icon className="size-4 shrink-0 text-muted-foreground" />
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
      <ContextMenuContent className="w-56">
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
