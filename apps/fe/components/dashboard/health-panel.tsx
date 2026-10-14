"use client"

import {
  ActivityIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  HourglassIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"

import {
  dataStart,
  downFor,
  isWorse,
  joinSites,
  p50Of,
  siteLabel,
  SLOW_P50_MS,
  worstTone,
} from "@/components/dashboard/fleet"
import { HealthScore } from "@/components/glass/charts"
import { AlertBanner, MetricTable, type MetricRow } from "@/components/glass/indicators"
import { Panel } from "@/components/glass/panel"
import { toneOfLatency, toneOfUptime, type Tone } from "@/components/glass/tone"
import type { Fleet, Website } from "@/lib/api"
import { formatMs, formatPct } from "@/lib/format"
import { siteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"

const LATENCY_WORD: Partial<Record<Tone, string>> = {
  stable: "Fast",
  warning: "Normal",
  high: "Slow",
}

const linkCls =
  "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold underline underline-offset-3 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50"

// The sidebar's header card: fleet health, what needs attention now, and
// the key numbers for the last 24 hours.
export function HealthPanel({
  fleet,
  sites,
  failed,
  now,
  onShowDown,
  className,
}: {
  fleet: Fleet | undefined
  sites: Website[] | undefined
  // the fleet request failed and nothing has loaded yet
  failed: boolean
  now: number
  // filter the site list to the sites that are down and jump to it
  onShowDown: () => void
  className?: string
}) {
  const uptime = fleet?.health.uptimePct ?? null
  const tone = fleet ? toneOfUptime(uptime) : "info"
  const allValues = fleet?.series.map((p) => p.uptimePct) ?? []
  const uptimeValues = allValues.slice(dataStart(allValues))

  return (
    <Panel aria-label="Fleet health" className={cn("flex flex-col gap-3 p-3 sm:p-4", className)}>
      <HealthScore
        icon={ActivityIcon}
        label="Fleet health"
        value={fleet ? formatPct(uptime) : "—"}
        tone={tone}
        values={uptimeValues}
        // a narrower sparkline in the 380px sidebar, so the label fits
        className="[&>svg:nth-of-type(2)]:w-14 xl:[&>svg:nth-of-type(2)]:w-24"
      />
      <FleetAlert sites={sites} fleet={fleet} now={now} onShowDown={onShowDown} />
      <MetricTable rows={metricRows(fleet, sites, failed)} />
      <p className="px-1 text-xs text-muted-foreground">
        Fleet health is the share of all checks that answered in the last 24 hours.
      </p>
    </Panel>
  )
}

function FleetAlert({
  sites,
  fleet,
  now,
  onShowDown,
}: {
  sites: Website[] | undefined
  fleet: Fleet | undefined
  now: number
  onShowDown: () => void
}) {
  if (!sites) {
    return <div aria-hidden="true" className="h-[42px] rounded-xl bg-foreground/[0.05] motion-safe:animate-pulse" />
  }
  if (sites.length === 0) {
    return (
      <AlertBanner tone="info" icon={HourglassIcon}>
        No sites yet. Add one to start watching.
      </AlertBanner>
    )
  }

  const down = sites.filter((s) => siteStatus(s) === "Down")
  if (down.length === 1) {
    const site = down[0]!
    const since = downFor(site, now)
    return (
      <AlertBanner
        tone="critical"
        className="glow-soft"
        action={
          <Link href={`/sites/${site.id}`} className={linkCls}>
            Open
          </Link>
        }
      >
        {siteLabel(site)} not answering
        {/* The clock ticks; keep it out of the announcement. */}
        {since && <span aria-hidden="true"> · down {since}</span>}
      </AlertBanner>
    )
  }
  if (down.length > 1) {
    return (
      <AlertBanner
        tone="critical"
        action={
          <button type="button" onClick={onShowDown} className={linkCls}>
            Show
          </button>
        }
      >
        {down.length} sites not answering · {down.map(siteLabel).join(", ")}
      </AlertBanner>
    )
  }

  const active = sites.filter((s) => !s.paused)
  const slow = joinSites(active, fleet)
    .filter((j) => (p50Of(j) ?? 0) >= SLOW_P50_MS)
    .sort((a, b) => (p50Of(b) ?? 0) - (p50Of(a) ?? 0))
  if (slow.length === 1) {
    const j = slow[0]!
    return (
      <AlertBanner
        tone="high"
        icon={TriangleAlertIcon}
        action={
          <Link href={`/sites/${j.site.id}`} className={linkCls}>
            Open
          </Link>
        }
      >
        {siteLabel(j.site)} is slow · p50 {formatMs(p50Of(j))}
      </AlertBanner>
    )
  }
  if (slow.length > 1) {
    return (
      <AlertBanner tone="high" icon={TriangleAlertIcon}>
        {slow.length} sites are slow · {slow.map((j) => siteLabel(j.site)).join(", ")}
      </AlertBanner>
    )
  }
  if (active.length === 0) {
    return (
      <AlertBanner tone="info" icon={CirclePauseIcon}>
        Every site is paused. Resume one to see live numbers.
      </AlertBanner>
    )
  }
  const up = active.filter((s) => siteStatus(s) === "Up").length
  if (up < active.length) {
    return (
      <AlertBanner tone="info" icon={HourglassIcon}>
        {up} of {active.length} sites answering · waiting for first checks
      </AlertBanner>
    )
  }
  return (
    <AlertBanner tone="stable" icon={CircleCheckIcon}>
      All sites answering
    </AlertBanner>
  )
}

function metricRows(fleet: Fleet | undefined, sites: Website[] | undefined, fleetFailed: boolean): MetricRow[] {
  const waiting = fleetFailed ? "No data" : "Loading"
  const active = sites?.filter((s) => !s.paused) ?? []
  const up = active.filter((s) => siteStatus(s) === "Up").length
  const downNow = active.filter((s) => siteStatus(s) === "Down").length
  const latency = fleet?.health.latency
  const { fastMs = 300, slowMs = 1000 } = fleet?.thresholds ?? {}
  const latencyRow = (label: string, ms: number | null | undefined, title: string): MetricRow => {
    const tone = fleet ? toneOfLatency(ms, fastMs, slowMs) : "info"
    return {
      label,
      value: fleet ? formatMs(ms) : "—",
      tone,
      status: fleet ? (LATENCY_WORD[tone] ?? "No data") : waiting,
      title,
    }
  }

  // The slowest site by its 24 h median.
  const slowest = sites
    ? joinSites(active, fleet)
        .filter((j) => p50Of(j) !== null)
        .sort((a, b) => p50Of(b)! - p50Of(a)!)[0]
    : undefined
  const slowestTone = slowest ? toneOfLatency(p50Of(slowest), fastMs, slowMs) : "info"
  const failed = fleet?.health.down ?? 0

  const rows: MetricRow[] = [
    {
      label: "Sites answering",
      value: sites ? (active.length ? `${up}/${active.length}` : "—") : "—",
      tone: !sites ? "info" : downNow > 0 ? "critical" : up === active.length && up > 0 ? "stable" : "info",
      status: !sites ? "Loading" : downNow > 0 ? "Critical" : up === active.length && up > 0 ? "Stable" : "Waiting",
      title: "Sites whose latest check answered, out of those not paused",
    },
    latencyRow("Avg response", latency?.avgMs, "Mean response time of every check in the last 24 hours"),
    latencyRow("p95 response", latency?.p95Ms, "95% of checks answered faster than this"),
    {
      label: "Failed checks · 24 h",
      value: fleet ? failed.toLocaleString("en-GB") : "—",
      tone: !fleet ? "info" : failed > 0 ? "critical" : "stable",
      status: !fleet ? waiting : undefined,
      title: "Checks that got no answer in the last 24 hours",
    },
    {
      // The site's name rides in the label, so the value column stays narrow.
      label: slowest ? `Slowest · ${siteLabel(slowest.site)}` : "Slowest site",
      value: slowest ? formatMs(p50Of(slowest)) : "—",
      tone: slowestTone,
      status: slowest ? (LATENCY_WORD[slowestTone] ?? undefined) : sites ? "No data" : "Loading",
      title: "Median response time of the slowest site in the last 24 hours",
    },
  ]

  // Light up the row that needs attention most.
  const worst = worstTone(rows.map((r) => r.tone))
  const at = isWorse(worst, "info") ? rows.findIndex((r) => r.tone === worst) : -1
  return rows.map((r, i) => (i === at ? { ...r, highlight: true } : r))
}
