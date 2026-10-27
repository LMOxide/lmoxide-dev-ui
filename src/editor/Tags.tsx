import { MultiSelect } from '../MultiSelect'
import type { Ctx } from './WorldEditor'

/**
 * Tags as the server keeps them (lmoxide_survey::tidy_tags): lower case, no `#`, letters, digits,
 * `-`, `_` and `/` (spaces become `-`), each once.
 */
export function tidyTags(tags: string[]): string[] {
  const out: string[] = []
  for (const t of tags) {
    const v = t
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/\s/g, '-')
      .replace(/[^\p{L}\p{N}\-_/]/gu, '')
      .slice(0, 32)
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/** Picks tags: the ones in use (with how many records carry them) and the suggested ones; typing adds a new one. */
export function TagSelect({ ctx, value, onChange, label, none = 'no tags', title }: { ctx: Ctx; value: string[]; onChange: (v: string[]) => void; label?: string; none?: string; title?: string }) {
  const known = ctx.tags.map((t) => ({ value: t.tag, label: `#${t.tag}`, detail: t.count || undefined }))
  // tags it has that the list doesn't know yet
  const extra = value.filter((v) => !ctx.tags.some((t) => t.tag === v)).map((v) => ({ value: v, label: `#${v}` }))
  return (
    <MultiSelect
      label={label}
      none={none}
      options={[...known, ...extra]}
      value={value}
      onChange={(v) => onChange(tidyTags(v))}
      create="Add tag"
      title={title ?? 'Labels for sorting work out (#approximate: rough, fix later; #todo; #review; ...). They change nothing in game.'}
    />
  )
}

/** A record's tags, as badges. */
export function TagBadges({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return (
    <>
      {tags.map((t) => (
        <span key={t} className="badge tag" title={`tagged #${t}`}>
          #{t}
        </span>
      ))}
    </>
  )
}

/** The tags new placements, walls, notes and scripts get (beside "Working on"). */
export function NewTagsPicker({ ctx }: { ctx: Ctx }) {
  return (
    <div className="sv-row tight sv-feature">
      <span className="small" title="What you place or write next gets these tags (e.g. #approximate while placing rough data to fix later)">
        Tagging
      </span>
      <TagSelect ctx={ctx} value={ctx.newTags} onChange={ctx.setNewTags} none="nothing" title="What you place or write next gets these tags (e.g. #approximate while placing rough data to fix later)" />
    </div>
  )
}
