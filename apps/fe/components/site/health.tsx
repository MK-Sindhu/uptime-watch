"use client"

import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  GaugeIcon,
  HeartPulseIcon,
  HourglassIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"

import { HealthScore } from "@/components/glass/charts"
import { AlertBanner, MetricTable, type MetricRow } from "@/components/glass/indicators"
import { Eyebrow } from "@/components/glass/panel"
import { toneOfLatency, toneOfUptime, type Tone } from "@/components/glass/tone"
import { RelativeTime, useNow } from "@/components/site/relative-time"
import { Button } from "@/components/ui/button"
import type { Latency, RangeKey, SeriesPoint } from "@/lib/api"
import { formatDuration, formatMs, formatPct, formatTime } from "@/lib/format"
import { RANGE_LABEL } from "@/lib/ranges"
import { cn } from "@/lib/utils"
import { formatInterval, staleAfterMs } from "@/lib/checks"

export type ReadoutStats = { uptimePct: number | null; latency: Latency }

// What the banner under the health score says, most urgent first.
export type SiteAlert =
  | { kind: "paused" }
  | { kind: "down"; since: string | null; regions: string[] }
  | { kind: "unknown" }
  | { kind: "waiting" }
  | { kind: "slow"; p50Ms: number }
  | { kind: "ok"; p50Ms: number | null }

// p50 at or above this reads as slow (the "slow" band of the check flow).
export const SLOW_MS = 1000
// A last check older than this means the checks have stalled.
// A last check older than 2.5 check intervals means checks stopped arriving.
const STALE_MS = staleAfterMs()

// ---------------------------------------------------------------- sparkline

// The health score's sparkline: one reading per step that had checks, drawn
// so that up means healthier, like the score beside it. A step with failed
// checks dips to the floor; otherwise the line follows response time upside
// down (faster is higher). Steps without checks are skipped, so a sparse
// range still draws a line.
export function healthTrend(points: SeriesPoint[], max = 48) {
  const withData = points.filter((p) => p.up + p.down > 0)
  let slowest = 0
  for (const p of withData) slowest = Math.max(slowest, p.avgMs ?? 0)
  return withData
    .slice(-max)
    .map((p) => (p.down > 0 || p.avgMs === null ? -slowest * 1.5 - 1 : -p.avgMs))
}

// ------------------------------------------------------------------ summary

export function HealthSummary({
  uptimePct,
  range,
  trend,
  alert,
  onResume,
  resuming,
  className,
}: {
  uptimePct: number | null | undefined
  range: RangeKey
  trend: number[]
  alert: SiteAlert
  onResume: () => void
  resuming: boolean
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-3", className)}>
      <HealthScore
        icon={HeartPulseIcon}
        // The range is in the readings header right below; with it the
        // label would truncate in the 380 px sidebar.
        label="Site health"
        value={formatPct(uptimePct)}
        tone={toneOfUptime(uptimePct)}
        values={trend}
      />
      <SiteAlertBanner alert={alert} range={range} onResume={onResume} resuming={resuming} />
    </div>
  )
}

function SiteAlertBanner({
  alert,
  range,
  onResume,
  resuming,
}: {
  alert: SiteAlert
  range: RangeKey
  onResume: () => void
  resuming: boolean
}) {
  switch (alert.kind) {
    case "down":
      return <DownBanner since={alert.since} regions={alert.regions} />
    case "paused":
      return (
        <AlertBanner
          tone="info"
          icon={PauseIcon}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={onResume}
              disabled={resuming}
              className="h-7 rounded-lg border border-panel-border bg-panel-strong px-2.5 text-xs text-foreground"
            >
              <PlayIcon />
              Resume
            </Button>
          }
        >
          Checks are paused
        </AlertBanner>
      )
    case "unknown":
      return (
        <AlertBanner tone="warning" icon={CircleHelpIcon}>
          <Line text="The last check gave no clear answer" />
        </AlertBanner>
      )
    case "waiting":
      return (
        <AlertBanner tone="info" icon={HourglassIcon}>
          <Line text={`Waiting for the first check · within ${formatInterval()}`} />
        </AlertBanner>
      )
    // The banners are live regions: numbers that move on every refresh
    // stay out of what a screen reader hears (they're in the readings).
    case "slow":
      return (
        <AlertBanner tone="high" icon={GaugeIcon}>
          <Line text="Slow to answer">
            {` · p50 ${formatMs(alert.p50Ms)} over ${RANGE_LABEL[range]}`}
          </Line>
        </AlertBanner>
      )
    case "ok":
      return (
        <AlertBanner tone="stable" icon={CircleCheckIcon}>
          <Line text="Answering normally">{alert.p50Ms !== null && ` · p50 ${formatMs(alert.p50Ms)}`}</Line>
        </AlertBanner>
      )
  }
}

// The kit's banner truncates to one line; these wrap instead, so a phone
// still shows which regions are down. `children` is shown but not read out.
function Line({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <span className="block whitespace-normal">
      {text}
      {children && <span aria-hidden="true">{children}</span>}
    </span>
  )
}

// "Not answering · since 14:02 (4 min) · USA, India". Keeps its own clock so
// the duration grows between refreshes.
function DownBanner({ since, regions }: { since: string | null; regions: string[] }) {
  const now = useNow(15_000)
  const start = since ? Date.parse(since) : null
  const today = start !== null && new Date(start).toDateString() === new Date(now).toDateString()
  return (
    <AlertBanner tone="critical" icon={CircleAlertIcon}>
      <span className="block whitespace-normal">
        Not answering
        {since && start !== null && (
          <>
            {` · since ${formatTime(since, !today)}`}
            {/* Grows every minute; read out once, not on every tick. */}
            <span aria-hidden="true">{` (${formatDuration(Math.max(0, now - start))})`}</span>
          </>
        )}
        {regions.length > 0 && ` · ${regions.join(", ")}`}
      </span>
    </AlertBanner>
  )
}

// ----------------------------------------------------------------- readings

const SEVERITY: Record<Tone, number> = { stable: 0, info: 0, glow: 0, warning: 1, high: 2, critical: 3 }

const LATENCY_WORD: Partial<Record<Tone, string>> = {
  stable: "Fast",
  warning: "Moderate",
  high: "Slow",
  info: "No data",
}

function latencyRow(label: string, ms: number | null | undefined, title: string): MetricRow {
  const tone = toneOfLatency(ms)
  return { label, value: formatMs(ms), tone, status: ms === undefined ? "Loading" : LATENCY_WORD[tone], title }
}

// Uptime, p50, p95, avg, max and the last check, each with a status dot; the
// worst row lights up. Replaces the old big-number readout row.
export function Readings({
  stats,
  lastCheckAt,
  paused,
  range,
  scope,
  stale = false,
  className,
}: {
  // null while loading
  stats: ReadoutStats | null
  lastCheckAt: string | null
  paused: boolean
  range: RangeKey
  // e.g. "USA", or null for every region
  scope: string | null
  // numbers still belong to the previous range or region
  stale?: boolean
  className?: string
}) {
  const now = useNow(10_000)
  const latency = stats?.latency
  const uptimeTone = toneOfUptime(stats?.uptimePct)
  const age = lastCheckAt ? now - Date.parse(lastCheckAt) : null

  const lastTone: Tone = paused || age === null ? "info" : age < STALE_MS ? "stable" : "warning"
  const lastWord = paused ? "Paused" : age === null ? "None yet" : age < STALE_MS ? "Live" : "Stale"

  const rows: MetricRow[] = [
    {
      label: "Uptime",
      value: formatPct(stats?.uptimePct),
      tone: uptimeTone,
      status: !stats ? "Loading" : stats.uptimePct === null ? "No data" : undefined,
      title: "Checks that answered, as a share of all checks",
    },
    latencyRow("P50", latency?.p50Ms, "Half of the answers came faster than this"),
    latencyRow("P95", latency?.p95Ms, "95 of 100 answers came faster than this"),
    latencyRow("Avg", latency?.avgMs, "Average response time"),
    latencyRow("Max", latency?.maxMs, "Slowest answer"),
    {
      label: "Last check",
      value: lastCheckAt ? <RelativeTime iso={lastCheckAt} /> : "—",
      tone: lastTone,
      status: lastWord,
    },
  ]
  // Light up the first of the worst rows, if any row is worse than fine.
  const worst = Math.max(...rows.map((r) => SEVERITY[r.tone]))
  if (stats && worst > 0) rows.find((r) => SEVERITY[r.tone] === worst)!.highlight = true

  return (
    <div
      aria-busy={stale || !stats || undefined}
      className={cn("grid grid-cols-1 gap-1.5 transition-opacity", stale && "opacity-50", className)}
    >
      <Eyebrow className="px-3">
        Readings · {RANGE_LABEL[range]}
        {scope ? ` · ${scope}` : ""}
      </Eyebrow>
      <MetricTable rows={rows} />
    </div>
  )
}
