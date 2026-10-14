"use client"

import { PlayIcon } from "lucide-react"
import Link from "next/link"

import { Baseline } from "@/components/dashboard/baseline"
import { downFor } from "@/components/dashboard/fleet"
import { RegionDots } from "@/components/dashboard/region-dots"
import { TONE_TEXT, toneOfLatency, toneOfUptime } from "@/components/glass/tone"
import { PulseTrace } from "@/components/pulse-trace"
import { SiteActionsMenu } from "@/components/site-actions"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import type { Website, WebsiteDetail } from "@/lib/api"
import { formatMs, formatPct } from "@/lib/format"
import { displayName, hostOf, siteStatus } from "@/lib/site"
import { clockTime, timeAgo } from "@/lib/time"
import { cn } from "@/lib/utils"

export const TRACE_SLOTS = 30

// Shared with the column header in SiteList, so labels line up with cells.
// Phone: status · name · ⋯ on one line, then trace, meta and readout below.
export const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 @2xl:grid-cols-[minmax(0,1fr)_minmax(9rem,15rem)_6.5rem_1.75rem] @2xl:gap-x-5"

// The row's main link; j/k move focus between these.
export const rowLinkId = (id: string) => `site-link-${id}`

function Separated({ items }: { items: React.ReactNode[] }) {
  return items.filter(Boolean).map((item, i) => (
    <span key={i} className="inline-flex items-center gap-1.5">
      {i > 0 && (
        <span aria-hidden="true" className="text-muted-foreground/50">
          ·
        </span>
      )}
      {item}
    </span>
  ))
}

export function SiteRow({
  site,
  now,
  regionNames,
  active,
  onFocus,
  onChanged,
  onDeleted,
  onResume,
  onError,
}: {
  site: Website
  now: number
  regionNames: Map<string, string>
  active: boolean
  onFocus: (id: string) => void
  onChanged: (updated: WebsiteDetail) => void
  onDeleted: (id: string) => void
  onResume: (site: Website) => void
  onError: (message: string) => void
}) {
  const status = siteStatus(site)
  const name = displayName(site)
  const href = `/sites/${site.id}`
  const latest = site.ticks[0]
  const recent = site.ticks.slice(0, TRACE_SLOTS)
  const answered = recent.filter((t) => t.status === "Up").length
  const failed = recent.filter((t) => t.status === "Down").length
  const traceLabel = recent.length
    ? `${name}, last ${recent.length} checks: ${answered} answered, ${failed} did not.`
    : `${name}: no checks yet.`
  const p50 = site.stats24h.p50Ms

  const checked = latest && (
    <span key="checked" title={clockTime(latest.createdAt)}>
      {site.paused ? "Last checked" : "Checked"} {timeAgo(latest.createdAt, now)}
    </span>
  )
  const down = status === "Down" ? downFor(site, now) : null
  const meta =
    status === "Paused"
      ? [checked || "No checks yet"]
      : status === "Waiting"
        ? [`Added ${timeAgo(site.time_added, now) ?? "recently"}`, "first check pending"]
        : [
            down && (
              <span key="down" className="font-semibold text-critical">
                down for {down}
              </span>
            ),
            checked,
            p50 !== null && (
              <span key="p50" title="Median response time in the last 24 hours">
                p50 <span className={cn("font-medium", TONE_TEXT[toneOfLatency(p50)])}>{formatMs(p50)}</span>
              </span>
            ),
            <RegionDots key="regions" ticks={site.ticks} regionNames={regionNames} now={now} />,
          ]

  return (
    <li
      data-active={active || undefined}
      className={cn(
        ROW_GRID,
        "group/row relative -mx-2 rounded-2xl px-2 py-4 transition-colors focus-within:bg-foreground/[0.035] hover:bg-foreground/[0.025] sm:-mx-3 sm:px-3 @2xl:gap-y-1 data-active:bg-foreground/[0.06]",
        // hairline between rows, straight even though the row is rounded
        "before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-border first:before:hidden sm:before:inset-x-3"
      )}
    >
      {/* the highlighted row's glowing edge (j/k) */}
      <span
        aria-hidden="true"
        className="absolute inset-y-4 left-0 hidden w-[3px] rounded-r-full bg-glow text-glow glow group-data-active/row:block"
      />

      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
        <StatusBadge
          status={status}
          className="shrink-0 rounded-full border border-current/20 bg-current/[0.08] px-2 py-0.5 text-xs font-semibold"
        />
        <Link
          id={rowLinkId(site.id)}
          href={href}
          onFocus={() => onFocus(site.id)}
          title={site.url}
          className="scroll-mt-40 truncate rounded-sm text-[15px] font-semibold tracking-tight outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {name}
        </Link>
        {site.name && (
          <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
            {hostOf(site.url)}
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-1 justify-self-end @2xl:col-start-4 @2xl:row-span-2">
        <SiteActionsMenu
          site={site}
          onChanged={onChanged}
          onDeleted={() => onDeleted(site.id)}
          onError={onError}
        />
      </div>

      {/* The trace opens the site too; mouse only, the name link covers keyboards. */}
      <Link
        href={href}
        tabIndex={-1}
        className="col-span-2 row-start-2 block rounded-xl @2xl:col-span-1 @2xl:col-start-2 @2xl:row-span-2 @2xl:row-start-1"
      >
        {status === "Paused" ? (
          <Baseline variant="dashed" text="Paused" label={`${name}: checks paused.`} className="h-12" />
        ) : (
          <PulseTrace
            ticks={site.ticks}
            slots={TRACE_SLOTS}
            label={traceLabel}
            className="h-12 rounded-xl border-panel-border"
          />
        )}
      </Link>

      <p className="col-span-2 row-start-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground @2xl:col-span-1 @2xl:col-start-1 @2xl:row-start-2">
        <Separated items={meta} />
      </p>

      <div className="col-span-2 row-start-4 flex items-center justify-between gap-2 @2xl:col-span-1 @2xl:col-start-3 @2xl:row-span-2 @2xl:row-start-1 @2xl:justify-end @2xl:text-right">
        <span className="text-sm text-muted-foreground @2xl:hidden">
          {status === "Paused" ? "Checks paused" : "Latest response"}
        </span>
        <Readout site={site} onResume={onResume} />
      </div>
    </li>
  )
}

function Readout({ site, onResume }: { site: Website; onResume: (site: Website) => void }) {
  const status = siteStatus(site)
  const latest = site.ticks[0]
  const pct = site.stats24h.uptimePct
  const uptime = pct !== null && (
    <p
      title="Share of checks that answered in the last 24 hours"
      className="mt-1 text-xs font-medium text-muted-foreground"
    >
      <span className={cn("font-semibold", TONE_TEXT[toneOfUptime(pct)])}>{formatPct(pct)}</span> · 24 h
    </p>
  )

  if (status === "Paused") {
    return (
      <div className="flex flex-col items-end">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => onResume(site)}>
          <PlayIcon />
          Resume
        </Button>
        {uptime}
      </div>
    )
  }
  if (status === "Down") {
    return (
      <div className="flex flex-col items-end">
        <p className="text-xl leading-none font-semibold tracking-tight text-critical glow-soft">No answer</p>
        {uptime}
      </div>
    )
  }
  if (status === "Up" && latest) {
    // "312 ms" / "1.4 s": big number, small unit
    const [value, unit] = formatMs(latest.response_time_ms).split(" ")
    return (
      <div className="flex flex-col items-end">
        <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
          <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>
        </p>
        {uptime}
      </div>
    )
  }
  return (
    <p className="text-3xl leading-none font-semibold text-muted-foreground">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{status === "Unknown" ? "Status unknown" : "No response yet"}</span>
    </p>
  )
}
