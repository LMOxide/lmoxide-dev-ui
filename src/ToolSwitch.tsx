import { session, TOOL, TOOLS, type Tool } from './tools'

/** Top left of both tools: the other one is a click away (both use the same session). */
export function ToolSwitch({ current }: { current: Tool }) {
  return (
    <div className="segmented tool-switch" role="tablist" aria-label="Tool">
      {TOOLS.map((t) => {
        const available = t === current || session() !== null
        return (
          <button
            key={t}
            className={t === current ? 'on' : ''}
            disabled={!available}
            title={t === current ? TOOL[t].about : available ? `Switch to the ${TOOL[t].label.toLowerCase()}` : 'Not signed in: sign in again.'}
            onClick={() => t !== current && (window.location.href = `../${TOOL[t].path}`)}
          >
            {TOOL[t].label}
          </button>
        )
      })}
    </div>
  )
}
