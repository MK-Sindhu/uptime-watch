import { ToneDot } from "@/components/glass/indicators"
import { Panel } from "@/components/glass/panel"
import type { Tone } from "@/components/glass/tone"
import { Flatline } from "@/components/status-page/flatline"
import { cn } from "@/lib/utils"

// Button classes for the actions under a message: a little larger and
// rounder than the default, to match the glass panel.
export const MESSAGE_BUTTON = "h-10 rounded-xl px-4 text-sm font-semibold"

// A whole-page message in a glass panel, under a monitor whose trace has gone
// flat: the not-found and error pages. No hooks, so server and client pages
// can both use it. Render it inside <main>.
export function ChartMessage({
  code,
  title,
  children,
  actions,
  tone = "critical",
  signal = "No signal",
  className,
}: {
  // small label above the heading, e.g. "404 · no signal"
  code: string
  title: string
  children?: React.ReactNode
  actions?: React.ReactNode
  // colour of the dot next to `code`
  tone?: Tone
  // the readout on the monitor, next to the flatline
  signal?: string
  className?: string
}) {
  return (
    <Panel className={cn("w-full max-w-2xl p-5 sm:p-8", className)}>
      <div className="inset-surface relative h-28 overflow-hidden sm:h-36">
        {/* Dashed guides across, dotted guides down, plus a red bloom where
            the line went flat. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(45% 70% at 72% 60%, color-mix(in oklab, var(--critical) 13%, transparent), transparent 70%)",
          }}
        />
        {[0.3, 0.6].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-grid-line"
            style={{ top: `${t * 100}%` }}
          />
        ))}
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute inset-y-0 border-l border-dotted border-grid-line"
            style={{ left: `${(i / 6) * 100}%` }}
          />
        ))}
        <Flatline className="absolute inset-y-0 right-4 left-0 h-full w-[calc(100%-1rem)]" />
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-critical/30 bg-panel-strong px-2 py-1 text-xs font-semibold text-critical shadow-sm"
        >
          <ToneDot tone="critical" className="cursor-blink" />
          {signal}
        </span>
      </div>

      <p className="mt-6 flex items-center gap-2">
        <ToneDot tone={tone} />
        <span className="eyebrow">{code}</span>
      </p>
      <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h1>
      {children && (
        <div className="mt-3 flex flex-col gap-2 text-base text-pretty text-muted-foreground">
          {children}
        </div>
      )}
      {actions && <div className="mt-7 flex flex-wrap items-center gap-3">{actions}</div>}
    </Panel>
  )
}
