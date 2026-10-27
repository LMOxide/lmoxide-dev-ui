import { useState } from 'react'
import type { Ctx } from './WorldEditor'
import type { Feature, FeaturesView } from './types'

/** Every feature, categories first, each followed by what is nested under it. */
export function allFeatures(f: FeaturesView): Feature[] {
  const list = [...f.categories, ...f.features]
  return list.sort((a, b) => {
    const order = (x: Feature) => f.categories.findIndex((c) => c.id === x.category)
    return order(a) - order(b) || a.id.localeCompare(b.id)
  })
}

/** "Mimic live", "New content > Christmas Event > 2026" (the id if it isn't known). */
export function featureLabel(f: FeaturesView, id: string | undefined): string {
  const x = allFeatures(f).find((y) => y.id === (id ?? 'live'))
  return x?.path ?? id ?? 'Mimic live'
}

/** A select of every feature, indented by nesting. */
export function FeatureSelect({
  features,
  value,
  onChange,
  title,
  any,
}: {
  features: FeaturesView
  value: string
  onChange: (id: string) => void
  title?: string
  /** the label of an option for none ('' value) */
  any?: string
}) {
  const list = allFeatures(features)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title={title}>
      {any !== undefined && <option value="">{any}</option>}
      {value !== '' && !list.some((f) => f.id === value) && <option value={value}>{value}</option>}
      {list.map((f) => (
        <option key={f.id} value={f.id}>
          {'  '.repeat(f.id.split('/').length - 1)}
          {f.title || f.id}
        </option>
      ))}
    </select>
  )
}

/**
 * The header's "Working on" feature: new placements and walls go into it. Manage… creates a
 * nested feature ("Christmas Event" under New content, then "2026" under it) or copies one with
 * everything in it (2027 starts as 2026).
 */
export function FeaturePicker({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sv-row tight sv-feature">
      <label className="small" title="What you place goes into this feature: mimic live (the default), new content (events, ...) or other. Servers decide by feature what they apply.">
        Working on{' '}
        <FeatureSelect features={ctx.features} value={ctx.feature} onChange={ctx.setFeature} />
      </label>
      <button className="ghost" onClick={() => setOpen(true)} title="Create or copy features">
        Manage…
      </button>
      {open && <FeatureManager ctx={ctx} onClose={() => setOpen(false)} />}
    </div>
  )
}

function FeatureManager({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [parent, setParent] = useState('feature')
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [from, setFrom] = useState('')
  const [copyParent, setCopyParent] = useState('feature')
  const [copyTitle, setCopyTitle] = useState('')
  const [note, setNote] = useState('')
  const f = ctx.features
  const nonCategories = f.features
  return (
    <div className="sv-modal-back" onClick={onClose}>
      <div className="card sv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Features</h2>
        <p className="muted small">
          Everything you place belongs to a feature. <b>Mimic live</b> is recreating live as it was; <b>New content</b> holds events and additions, nested as you like
          (New content &gt; Christmas Event &gt; 2026); <b>Other</b> anything else. Each server picks which features it runs and whose changes it takes without asking.
        </p>
        <ul className="sv-list sv-features">
          {allFeatures(f).map((x) => (
            <li key={x.id} className={x.id === ctx.feature ? 'on' : ''} onClick={() => ctx.setFeature(x.id)} title={x.comment || x.id}>
              <span className="sv-name">
                {'  '.repeat(x.id.split('/').length - 1)}
                {x.title || x.id}
              </span>
              {x.copied_from && <span className="muted small">copy of {featureLabel(f, x.copied_from)}</span>}
              <span className="mono muted small">{x.id}</span>
            </li>
          ))}
        </ul>
        <h3>New feature</h3>
        <div className="sv-row">
          <label className="small">
            under <FeatureSelect features={f} value={parent} onChange={setParent} />
          </label>
          <input className="sv-grow" placeholder="Title, e.g. Christmas Event or 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="sv-row">
          <input className="sv-grow" placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button
            className="primary"
            disabled={!title.trim()}
            onClick={async () => {
              const v = await ctx.run(() => ctx.backend.createFeature(parent, title, comment))
              if (v) {
                ctx.setFeatures(v)
                const made = v.features.find((x) => x.id.startsWith(`${parent}/`) && x.title === title.trim())
                if (made) ctx.setFeature(made.id)
                setNote(`Created ${made ? made.path : title}; you work on it now.`)
                setTitle('')
                setComment('')
              }
            }}
          >
            Create
          </button>
        </div>
        <h3>Copy a feature</h3>
        <p className="muted small">Copies every placement, trigger wall, note and script of it (and of what is nested under it) into a new feature, so next year starts as this year.</p>
        <div className="sv-row">
          <label className="small">
            copy{' '}
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">choose…</option>
              {nonCategories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.path}
                </option>
              ))}
            </select>
          </label>
          <label className="small">
            under <FeatureSelect features={f} value={copyParent} onChange={setCopyParent} />
          </label>
          <input className="sv-grow" placeholder="New title, e.g. 2027" value={copyTitle} onChange={(e) => setCopyTitle(e.target.value)} />
          <button
            className="primary"
            disabled={!from || !copyTitle.trim()}
            onClick={async () => {
              const r = await ctx.run(() => ctx.backend.copyFeature(from, copyParent, copyTitle), 'all')
              if (r) {
                ctx.setFeatures(r.features)
                ctx.setFeature(r.id)
                setNote(`Copied ${r.records} records into ${featureLabel(r.features, r.id)}; you work on it now.`)
                setCopyTitle('')
              }
            }}
          >
            Copy
          </button>
        </div>
        {note && <p className="small">{note}</p>}
        <div className="sv-row">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
