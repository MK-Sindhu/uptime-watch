"use client"

import { useId, useMemo, useRef, useState } from "react"

import { Legend } from "@/components/glass/indicators"
import { TONE_BG, TONE_TEXT, type Tone } from "@/components/glass/tone"
import type { Series, SeriesPoint } from "@/lib/api"
import {
  areaPath,
  bucketAt,
  bucketCenter,
  bucketKind,
  bucketSpan,
  calibrationMarks,
  flatPath,
  latencyDomain,
  loneBuckets,
  runs,
  timeTicks,
  tracePath,
  VIEW_H,
  VIEW_W,
  yFor,
} from "@/lib/chart"
import { formatCount, formatMs } from "@/lib/format"
import { RANGE_LABEL, RANGE_STEP_LABEL } from "@/lib/ranges"
import { cn } from "@/lib/utils"

// The response-time chart on the site page, in the glass line-chart style:
// the average as a glowing line over a soft area fill, p95 as a thin dashed
// line, failed checks as glowing coral marks on the baseline with a faint
// column above them, and steps without checks as a dotted baseline. Lines
// live in a stretched SVG; every label and dot is HTML so none of them
// stretch with it.

const PLOT_H = "h-48 sm:h-64"
const GUTTER = "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2"
const TIP_WIDTH = "13rem"

const pct = (v: number) => `${v * 100}%`

function buildModel(series: Series) {
  const pts = series.points
  const n = pts.length
  const domain = latencyDomain(pts)
  const avg = pts.map((p) => p.avgMs)
  const failed = runs(n, (i) => pts[i]!.down > 0)
  return {
    n,
    domain,
    marks: calibrationMarks(domain),
    avg: tracePath(avg, domain),
    area: areaPath(avg, domain),
    p95: tracePath(
      pts.map((p) => p.p95Ms),
      domain
    ),
    lone: loneBuckets(avg),
    // One faint column per run of failing steps, stronger when more of its
    // checks failed.
    failed: failed.map(([a, b]) => {
      let down = 0
      let all = 0
      for (let i = a; i < b; i++) {
        down += pts[i]!.down
        all += pts[i]!.up + pts[i]!.down
      }
      return { a, b, share: all ? down / all : 1 }
    }),
    down: flatPath(failed, n, VIEW_H),
    empty: flatPath(
      runs(n, (i) => pts[i]!.up + pts[i]!.down === 0),
      n,
      VIEW_H
    ),
    ticks: timeTicks(Date.parse(series.from), Date.parse(series.to), series.range),
    end: Date.parse(series.to),
    hasData: pts.some((p) => p.up + p.down > 0),
  }
}

// One sentence for the chart's aria-label.
function summarize(series: Series, scope: string) {
  const range = RANGE_LABEL[series.range]
  const withData = series.points.filter((p) => p.up + p.down > 0)
  if (withData.length === 0) return `Response time over the last ${range}${scope}: no checks.`
  let weighted = 0
  let answered = 0
  let worstP95: number | null = null
  for (const p of withData) {
    if (p.avgMs !== null) {
      weighted += p.avgMs * p.up
      answered += p.up
    }
    if (p.p95Ms !== null) worstP95 = Math.max(worstP95 ?? 0, p.p95Ms)
  }
  const failed = withData.filter((p) => p.down > 0).length
  const avg = answered ? formatMs(weighted / answered) : "no answers"
  return (
    `Response time over the last ${range}${scope}: average ${avg}, ` +
    `slowest 95th percentile ${formatMs(worstP95)}. ` +
    (failed ? `${formatCount(failed, "step", "steps")} with failed checks. ` : "No failed checks. ") +
    `Use the left and right arrow keys to read each ${RANGE_STEP_LABEL[series.range]} step.`
  )
}

// Tone of the live cursor: the state of the newest step with checks.
function cursorTone(points: SeriesPoint[]): Tone {
  for (let i = points.length - 1; i >= 0; i--) {
    const kind = bucketKind(points[i]!)
    if (kind === "empty") continue
    return kind === "down" ? "critical" : "stable"
  }
  return "info"
}

export function ResponseChart({
  series,
  tone = "stable",
  live = false,
  stale = false,
  emptyMessage,
  scope = "",
  className,
}: {
  series: Series
  // colour of the average line and its fill (failures are always critical)
  tone?: Tone
  // a live range (1h, 24h): draw the blinking cursor at the right edge
  live?: boolean
  // data still belongs to the previous range or region
  stale?: boolean
  // shown over the chart when it has no checks at all
  emptyMessage?: string
  // e.g. " from USA", appended to the summary
  scope?: string
  className?: string
}) {
  const model = useMemo(() => buildModel(series), [series])
  const [active, setActive] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const tipId = useId()
  const fillId = useId()
  const { n } = model
  // A shorter series (new range) can leave the old index out of bounds.
  const shown = active !== null && active < n ? active : null
  const point = shown !== null ? series.points[shown]! : null

  function indexAt(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || n === 0) return null
    return bucketAt((clientX - box.left) / box.width, n)
  }

  function onPointer(e: React.PointerEvent) {
    const i = indexAt(e.clientX)
    if (i !== null) setActive(i)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (n === 0) return
    let next: number
    if (e.key === "Escape" && shown !== null) next = -1
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = n - 1
    else if (e.key === "ArrowLeft") next = shown === null ? n - 1 : Math.max(0, shown - 1)
    else if (e.key === "ArrowRight") next = shown === null ? n - 1 : Math.min(n - 1, shown + 1)
    else return
    e.preventDefault()
    setActive(next < 0 ? null : next)
  }

  const x = shown !== null ? bucketCenter(shown, n) / VIEW_W : 0
  const yPct = (ms: number) => pct(yFor(ms, model.domain) / VIEW_H)
  const cursor = live && model.hasData ? cursorTone(series.points) : null

  return (
    <figure className={cn("inset-surface grid grid-cols-1 gap-3 p-3 sm:p-4", className)}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <Legend
          items={[
            { label: "Average", tone },
            { label: "95th percentile", tone, dashed: true },
            { label: "Failed checks", tone: "critical" },
            { label: "No checks", tone: "info", dashed: true },
          ]}
        />
        <span className="text-[11px] text-muted-foreground">
          Each step {RANGE_STEP_LABEL[series.range]} · square-root scale
        </span>
      </figcaption>

      <div className={GUTTER}>
        {/* Latency labels beside their guide lines. */}
        <div aria-hidden="true" className={cn("relative", PLOT_H)}>
          {model.marks.map((m) => (
            <span
              key={m.ms}
              className="absolute right-0 -translate-y-1/2 text-[10px] whitespace-nowrap text-muted-foreground"
              style={{ top: pct(m.y / VIEW_H) }}
            >
              {m.label}
            </span>
          ))}
          <span className="absolute right-0 bottom-0 translate-y-1/2 text-[10px] text-muted-foreground">
            0
          </span>
        </div>

        <div className="relative min-w-0">
          <div
            ref={boxRef}
            role="img"
            tabIndex={0}
            aria-label={summarize(series, scope)}
            aria-describedby={point ? tipId : undefined}
            aria-busy={stale || undefined}
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            // A finger lifting also "leaves"; keep the reading until the next
            // tap elsewhere (blur) so it can be read.
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") setActive(null)
            }}
            onBlur={() => setActive(null)}
            onKeyDown={onKeyDown}
            className={cn(
              "relative touch-pan-y rounded-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
              PLOT_H
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none",
                stale && "opacity-40"
              )}
            >
              {/* Dotted guides: one per latency mark, one per time label. */}
              {model.marks.map((m) => (
                <span
                  key={m.ms}
                  className="absolute inset-x-0 border-t border-dashed border-grid-line"
                  style={{ top: pct(m.y / VIEW_H) }}
                />
              ))}
              {model.ticks.map((t) => (
                <span
                  key={t.t}
                  className={cn(
                    "absolute inset-y-0 border-l border-dotted border-grid-line",
                    t.minor && "hidden sm:block"
                  )}
                  style={{ left: pct(t.x) }}
                />
              ))}
              <span className="absolute inset-x-0 bottom-0 border-t border-grid-line" />

              {/* A faint coral column over each run of failed checks. */}
              {model.failed.map((f) => (
                <span
                  key={f.a}
                  className="absolute inset-y-0 overflow-hidden"
                  style={{
                    left: pct(f.a / n),
                    width: `max(3px, ${pct((f.b - f.a) / n)})`,
                    opacity: 0.45 + 0.55 * f.share,
                    background:
                      "linear-gradient(to top, color-mix(in oklab, var(--critical) 34%, transparent), color-mix(in oklab, var(--critical) 6%, transparent) 75%, transparent)",
                  }}
                >
                  <span className="scanlines absolute inset-0 opacity-40" />
                </span>
              ))}

              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="none"
                className={cn("absolute inset-0 size-full overflow-visible", TONE_TEXT[tone])}
              >
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={model.area} fill={`url(#${fillId})`} />
                <path
                  d={model.empty}
                  className="stroke-info/60"
                  strokeWidth={1.5}
                  strokeDasharray="1 5"
                  strokeLinecap="round"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={model.p95}
                  stroke="currentColor"
                  strokeOpacity={0.6}
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* The glowing lines get their own layers: the glow is a CSS
                  filter, which would also blur the fill and the guides. */}
              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="none"
                className={cn("glow absolute inset-0 size-full overflow-visible", TONE_TEXT[tone])}
              >
                <path
                  d={model.avg}
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="none"
                className="glow absolute inset-0 size-full overflow-visible text-critical"
              >
                <path
                  d={model.down}
                  stroke="currentColor"
                  strokeWidth={4}
                  strokeLinecap="round"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* A lone reading is only a short dash; a dot makes it visible. */}
              {model.lone.map((i) => (
                <span
                  key={i}
                  className={cn("glow-soft absolute size-1.5 -translate-1/2 rounded-full", TONE_BG[tone], TONE_TEXT[tone])}
                  style={{
                    left: pct(bucketCenter(i, n) / VIEW_W),
                    top: yPct(series.points[i]!.avgMs ?? 0),
                  }}
                />
              ))}

              {cursor && (
                <span
                  className={cn(
                    "cursor-blink glow-soft absolute top-[8%] right-0 bottom-0 w-[2px] rounded-full",
                    TONE_BG[cursor],
                    TONE_TEXT[cursor]
                  )}
                />
              )}

              {point && (
                <>
                  <span
                    className="absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/35"
                    style={{ left: pct(x) }}
                  />
                  {point.p95Ms !== null && (
                    <span
                      className={cn(
                        "absolute size-2 -translate-1/2 rounded-full border-2 border-current bg-card",
                        TONE_TEXT[tone]
                      )}
                      style={{ left: pct(x), top: yPct(point.p95Ms) }}
                    />
                  )}
                  {point.avgMs !== null && (
                    <span
                      className={cn(
                        "glow-soft absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-card",
                        TONE_BG[tone],
                        TONE_TEXT[tone]
                      )}
                      style={{ left: pct(x), top: yPct(point.avgMs) }}
                    />
                  )}
                  {point.down > 0 && (
                    <span
                      className="glow-soft absolute bottom-0 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-[3px] bg-critical text-critical ring-2 ring-card"
                      style={{ left: pct(x) }}
                    />
                  )}
                </>
              )}
            </div>

            {!model.hasData && emptyMessage && (
              <div className="absolute inset-0 grid place-items-center p-4">
                <p className="rounded-full border border-panel-border bg-panel-strong px-3.5 py-1.5 text-center text-sm text-muted-foreground shadow-sm">
                  {emptyMessage}
                </p>
              </div>
            )}
          </div>

          {point && shown !== null && (
            <ChartTooltip
              id={tipId}
              point={point}
              span={bucketSpan(point.t, series.stepSeconds, model.end)}
              x={x}
              tone={tone}
            />
          )}
        </div>

        <div aria-hidden="true" />
        <div aria-hidden="true" className="relative mt-2 h-3">
          {model.ticks.map((t) => (
            <span
              key={t.t}
              className={cn(
                "absolute -translate-x-1/2 text-[10px] leading-none whitespace-nowrap text-muted-foreground",
                t.minor && "hidden sm:block"
              )}
              style={{ left: pct(t.x) }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <SeriesTable series={series} end={model.end} />
    </figure>
  )
}

function ChartTooltip({
  id,
  point,
  span,
  x,
  tone,
}: {
  id: string
  point: SeriesPoint
  span: string
  x: number
  tone: Tone
}) {
  const kind = bucketKind(point)
  // Beside the crosshair, on the side with more room, and never past the
  // chart's edges (which would scroll the page sideways on a phone).
  const at = `${x * 100}%`
  const left =
    x < 0.5
      ? `min(calc(${at} + 12px), calc(100% - ${TIP_WIDTH}))`
      : `max(calc(${at} - ${TIP_WIDTH} - 12px), 0px)`
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute top-2 z-10 rounded-xl border border-panel-border bg-popover/95 px-3 py-2 text-popover-foreground shadow-lg backdrop-blur-md"
      style={{ left, width: TIP_WIDTH }}
    >
      <p className="text-xs text-muted-foreground">{span}</p>
      {kind === "empty" ? (
        <p className="mt-1 text-sm">No checks in this step.</p>
      ) : (
        <>
          {point.up > 0 && (
            <dl className="mt-1.5 grid gap-0.5">
              <ReadingRow label="avg" value={point.avgMs}>
                <span className={cn("block h-0.5 w-full rounded-full", TONE_BG[tone])} />
              </ReadingRow>
              <ReadingRow label="p50" value={point.p50Ms} />
              <ReadingRow label="p95" value={point.p95Ms}>
                <span className={cn("block w-full border-t border-dashed border-current", TONE_TEXT[tone])} />
              </ReadingRow>
            </dl>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs">
            {point.down > 0 && (
              <span aria-hidden="true" className="inline-block size-2 rounded-[2px] bg-critical" />
            )}
            <span className={cn(point.down > 0 && "font-semibold text-critical")}>
              {formatCount(point.up, "answered", "answered")}
              {" · "}
              {formatCount(point.down, "failed", "failed")}
            </span>
          </p>
        </>
      )}
    </div>
  )
}

function ReadingRow({
  label,
  value,
  children,
}: {
  label: string
  value: number | null
  // a short stroke keyed to the line, when the chart draws this reading
  children?: React.ReactNode
}) {
  // Value first and strongest; the label follows (dt stays first in the DOM).
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="w-3.5 shrink-0">
        {children}
      </span>
      <dt className="order-last text-xs text-muted-foreground">{label}</dt>
      <dd className="w-14 text-right text-sm font-semibold tabular-nums">{formatMs(value)}</dd>
    </div>
  )
}

// The same numbers for screen readers. Steps without checks are left out.
function SeriesTable({ series, end }: { series: Series; end: number }) {
  const rows = series.points.filter((p) => p.up + p.down > 0)
  // sr-only goes on a wrapper: tables ignore the 1px width/height it sets,
  // so on the table itself the hidden rows would still stretch the page.
  return (
    <div className="sr-only">
      <table>
        <caption>
          Response time per {RANGE_STEP_LABEL[series.range]} step over the last{" "}
          {RANGE_LABEL[series.range]}. Steps without checks are left out.
        </caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Average</th>
            <th scope="col">50th percentile</th>
            <th scope="col">95th percentile</th>
            <th scope="col">Answered checks</th>
            <th scope="col">Failed checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.t}>
              <th scope="row">{bucketSpan(p.t, series.stepSeconds, end)}</th>
              <td>{formatMs(p.avgMs)}</td>
              <td>{formatMs(p.p50Ms)}</td>
              <td>{formatMs(p.p95Ms)}</td>
              <td>{p.up}</td>
              <td>{p.down}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Loading state: the empty chart surface with its guides and a dotted
// baseline, no spinner.
export function ResponseChartSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("inset-surface grid grid-cols-1 gap-3 p-3 sm:p-4", className)}>
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 w-16 rounded-full bg-foreground/[0.06] motion-safe:animate-pulse" />
        ))}
      </div>
      <div className={GUTTER}>
        <div className={PLOT_H} />
        <div className={cn("relative", PLOT_H)}>
          {[0.06, 0.4, 0.7].map((y) => (
            <span
              key={y}
              className="absolute inset-x-0 border-t border-dashed border-grid-line"
              style={{ top: pct(y) }}
            />
          ))}
          <span className="absolute inset-x-0 bottom-0 border-t-2 border-dotted border-info/40" />
        </div>
        <div />
        <div className="mt-2 h-3" />
      </div>
    </div>
  )
}
