"use client"

import type { LucideIcon } from "lucide-react"
import { useId, useRef, useState } from "react"

import { TONE_TEXT, TONE_VAR, type Tone } from "@/components/glass/tone"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- helpers

const VIEW_W = 1000
const VIEW_H = 300

// Path through the non-null values, broken where data is missing.
function linePath(values: (number | null)[], y: (v: number) => number) {
  const n = values.length
  if (n === 0) return ""
  const x = (i: number) => (n === 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W)
  let d = ""
  let open = false
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      open = false
      return
    }
    d += `${open ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    open = true
  })
  return d.trim()
}

// Same path, closed down to the baseline for the area fill.
function areaPath(values: (number | null)[], y: (v: number) => number) {
  const n = values.length
  const x = (i: number) => (n === 1 ? VIEW_W / 2 : (i / (n - 1)) * VIEW_W)
  let d = ""
  let start: number | null = null
  let last = 0
  const close = () => {
    if (start !== null) d += `L${x(last).toFixed(1)} ${VIEW_H} L${x(start).toFixed(1)} ${VIEW_H} Z `
    start = null
  }
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return close()
    d += `${start === null ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    if (start === null) start = i
    last = i
  })
  close()
  return d.trim()
}

// --------------------------------------------------------------- sparkline

export function Sparkline({
  values,
  tone = "stable",
  domain,
  className,
}: {
  values: (number | null)[]
  tone?: Tone
  // fixed [min, max] for the y axis (e.g. [95, 100] for uptime); otherwise
  // it fits the data, and a flat series sits in the middle
  domain?: [number, number]
  className?: string
}) {
  const id = useId()
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v))
  const min = domain ? domain[0] : nums.length ? Math.min(...nums) : 0
  const max = domain ? domain[1] : nums.length ? Math.max(...nums) : 1
  const span = max - min
  const y = (v: number) =>
    span > 0
      ? VIEW_H - 30 - (Math.min(1, Math.max(0, (v - min) / span)) * (VIEW_H - 60))
      : VIEW_H / 2
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("overflow-visible", TONE_TEXT[tone], className)}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(values, y)} fill={`url(#${id}-fill)`} />
      <path
        d={linePath(values, y)}
        className="glow"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ------------------------------------------------------------ health score

// "⚡ Electricity Health  ~~~  69.5%": the header card of a health panel.
export function HealthScore({
  icon: Icon,
  label,
  value,
  tone,
  values,
  domain,
  className,
}: {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  tone: Tone
  values: (number | null)[]
  // passed to the sparkline, e.g. [95, 100] for uptime
  domain?: [number, number]
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-2xl border border-panel-border bg-panel-strong py-3 pr-4 pl-5",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full glow"
        style={{ background: TONE_VAR[tone], color: TONE_VAR[tone] }}
      />
      <Icon aria-hidden="true" className="size-4 shrink-0 text-foreground" />
      {/* The label keeps its width; the sparkline gives way first. */}
      <span className="min-w-0 shrink truncate text-sm font-semibold">{label}</span>
      <Sparkline
        values={values}
        tone={tone}
        domain={domain}
        className="hidden h-8 max-w-24 min-w-8 flex-1 sm:block"
      />
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
    </div>
  )
}

// --------------------------------------------------------------- bar chart

export type Bar = {
  key: string
  label: string
  // 0..1 of the chart height
  value: number
  tone: Tone
  // tooltip / screen-reader text, e.g. "shop.example.com: 312 ms"
  title: string
  href?: string
}

// Vertical bars with a gradient, scan lines and a soft glow; dotted guides.
export function GlowBarChart({
  bars,
  yTicks,
  label,
  className,
  height = "h-44",
}: {
  bars: Bar[]
  // labels from top to bottom, evenly spaced (e.g. ["1 s", "500 ms", "0"])
  yTicks: string[]
  label: string
  className?: string
  height?: string
}) {
  return (
    <figure className={cn("grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2", className)}>
      <div className={cn("relative", height)} aria-hidden="true">
        {yTicks.map((t, i) => (
          <span
            key={t + i}
            className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
            style={{ top: `${(i / Math.max(1, yTicks.length - 1)) * 100}%` }}
          >
            {t}
          </span>
        ))}
      </div>
      <div role="img" aria-label={label} className={cn("relative", height)}>
        {yTicks.map((t, i) => (
          <span
            key={t + i}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-grid-line"
            style={{ top: `${(i / Math.max(1, yTicks.length - 1)) * 100}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end justify-around px-1">
          {bars.map((bar) => (
            <div key={bar.key} className="relative flex h-full min-w-0 flex-1 justify-center">
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 border-l border-dotted border-grid-line" />
              <span
                title={bar.title}
                className={cn("relative mt-auto w-[min(28px,55%)] overflow-hidden rounded-t-[3px] glow-soft", TONE_TEXT[bar.tone])}
                style={{
                  height: `${Math.max(2, Math.min(100, bar.value * 100))}%`,
                  background: `linear-gradient(to bottom, ${TONE_VAR[bar.tone]}, color-mix(in oklab, ${TONE_VAR[bar.tone]} 50%, transparent))`,
                }}
              >
                <span aria-hidden="true" className="scanlines absolute inset-0 opacity-50" />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" />
      <div className="mt-2 flex justify-around px-1">
        {bars.map((bar) => (
          <span
            key={bar.key}
            title={bar.title}
            className="min-w-0 flex-1 truncate px-0.5 text-center text-[10px] text-muted-foreground"
          >
            {bar.label}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        <ul>
          {bars.map((bar) => (
            <li key={bar.key}>{bar.title}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

// -------------------------------------------------------------- line chart

// A glowing line over a soft area fill, with dotted guides, axis labels and a
// hover/keyboard readout. Values are evenly spaced in time.
export function GlowLineChart({
  values,
  secondary,
  tone = "critical",
  max,
  yTicks,
  xLabels,
  label,
  formatValue,
  pointLabel,
  className,
  height = "h-44",
}: {
  values: (number | null)[]
  // optional dashed second series on the same scale (e.g. p95)
  secondary?: (number | null)[]
  tone?: Tone
  // top of the y axis
  max: number
  // guide lines from top to bottom, e.g. [{ value: 1000, label: "1 s" }, ...]
  yTicks: { value: number; label: string }[]
  // labels along the bottom at value indexes
  xLabels: { index: number; label: string }[]
  label: string
  formatValue: (v: number | null) => string
  // what point i is, e.g. "14:10"
  pointLabel: (i: number) => string
  className?: string
  height?: string
}) {
  const id = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<number | null>(null)
  const n = values.length
  const top = max > 0 ? max : 1
  const y = (v: number) => VIEW_H - Math.min(1, Math.max(0, v / top)) * (VIEW_H - 12)
  const xPct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)

  function indexAt(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || n === 0) return null
    return Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * (n - 1))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (n === 0) return
    const i = active ?? n - 1
    const next =
      e.key === "ArrowLeft" ? Math.max(0, i - 1)
      : e.key === "ArrowRight" ? Math.min(n - 1, i + 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : e.key === "Escape" ? -1
      : null
    if (next === null) return
    e.preventDefault()
    setActive(next < 0 ? null : next)
  }

  const shown = active !== null && active < n ? active : null

  return (
    <figure className={cn("grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2", className)}>
      <div className={cn("relative", height)} aria-hidden="true">
        {yTicks.map((t) => (
          <span
            key={t.label}
            className="absolute right-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
            style={{ top: `${(y(t.value) / VIEW_H) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div
        ref={boxRef}
        role="img"
        tabIndex={0}
        aria-label={label}
        onPointerMove={(e) => setActive(indexAt(e.clientX))}
        onPointerDown={(e) => setActive(indexAt(e.clientX))}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") setActive(null)
        }}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        className={cn("relative touch-pan-y rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50", height)}
      >
        {yTicks.map((t) => (
          <span
            key={t.label}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-grid-line"
            style={{ top: `${(y(t.value) / VIEW_H) * 100}%` }}
          />
        ))}
        {xLabels.map((l) => (
          <span
            key={l.index}
            aria-hidden="true"
            className="absolute inset-y-0 border-l border-dotted border-grid-line"
            style={{ left: `${xPct(l.index)}%` }}
          />
        ))}
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className={cn("absolute inset-0 size-full overflow-visible", TONE_TEXT[tone])}
        >
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(values, y)} fill={`url(#${id}-area)`} />
          {secondary && (
            <path
              d={linePath(secondary, y)}
              stroke="currentColor"
              strokeOpacity={0.55}
              strokeWidth={1.25}
              strokeDasharray="5 4"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={linePath(values, y)}
            className="glow"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {shown !== null && (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-foreground/40"
              style={{ left: `${xPct(shown)}%` }}
            />
            <div
              role="tooltip"
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-panel-border bg-popover/95 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
              style={{ left: `clamp(3.5rem, ${xPct(shown)}%, calc(100% - 3.5rem))` }}
            >
              <span className="text-muted-foreground">{pointLabel(shown)}</span>
              <span className={cn("ml-2 font-semibold tabular-nums", TONE_TEXT[tone])}>{formatValue(values[shown] ?? null)}</span>
              {secondary && (
                <span className="ml-2 text-muted-foreground tabular-nums">
                  p95 {formatValue(secondary[shown] ?? null)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      <div aria-hidden="true" />
      <div className="relative mt-2 h-4" aria-hidden="true">
        {xLabels.map((l) => (
          <span
            key={l.index}
            className="absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-muted-foreground"
            style={{ left: `clamp(1.5rem, ${xPct(l.index)}%, calc(100% - 1.5rem))` }}
          >
            {l.label}
          </span>
        ))}
      </div>
    </figure>
  )
}
