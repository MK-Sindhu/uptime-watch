import { PulseTrace } from "@/components/pulse-trace"
import { StatusBadge } from "@/components/status-badge"
import type { RangeKey, RegionOverview, Tick } from "@/lib/api"
import { formatMs, formatPct } from "@/lib/format"
import { RANGE_LABEL } from "@/lib/ranges"
import type { SiteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"

// One glass row per region: its status, the latest response, uptime and p50
// for the range, and a strip of its newest checks.

// The API sends the newest 30 checks per site across all regions, so each
// region gets about 30 / regions of them.
const TICKS_PER_SITE = 30

const ROW = "grid grid-cols-1 gap-2.5 rounded-xl border border-panel-border bg-foreground/[0.03] p-3"

export function RegionLeads({
  regions,
  ticks,
  paused,
  selected,
  range,
  nameOf,
  className,
}: {
  regions: RegionOverview[] | undefined
  // newest first, every region mixed (from listWebsites)
  ticks: Tick[]
  paused: boolean
  // "all" or a region id
  selected: string
  range: RangeKey
  nameOf: (regionId: string) => string
  className?: string
}) {
  if (!regions) {
    return (
      <ul aria-hidden="true" className={cn("grid grid-cols-1 gap-2", className)}>
        {[0, 1].map((i) => (
          <li key={i} className={ROW}>
            <div className="h-4 w-24 rounded-full bg-foreground/[0.06] motion-safe:animate-pulse" />
            <div className="ecg-paper-fine h-14 rounded-md border" />
          </li>
        ))}
      </ul>
    )
  }

  if (regions.length === 0) {
    return (
      <p className={cn("rounded-xl border border-dashed border-panel-border px-3 py-4 text-sm text-muted-foreground", className)}>
        No region checked this site in the last {RANGE_LABEL[range]}.
      </p>
    )
  }

  const slots = Math.max(10, Math.round(TICKS_PER_SITE / regions.length))
  const sorted = [...regions].sort((a, b) => nameOf(a.regionId).localeCompare(nameOf(b.regionId)))

  return (
    <ul className={cn("grid grid-cols-1 gap-2", className)}>
      {sorted.map((r) => {
        const name = nameOf(r.regionId)
        const own = ticks.filter((t) => t.region_id === r.regionId)
        const latest = own[0]
        const status: SiteStatus = paused ? "Paused" : (latest?.status ?? r.lastStatus ?? "Waiting")
        const lastStatus = latest?.status ?? r.lastStatus
        const lastMs = latest ? latest.response_time_ms : r.lastMs
        const recent = own.slice(0, slots)
        const answered = recent.filter((t) => t.status === "Up").length
        const failed = recent.filter((t) => t.status === "Down").length
        const label = recent.length
          ? `${name}: last ${recent.length} checks, ${answered} answered, ${failed} did not.`
          : `${name}: no recent checks.`
        const isSelected = selected === r.regionId

        return (
          <li key={r.regionId} className={cn(ROW, "relative", isSelected && "border-foreground/20 bg-foreground/[0.07]")}>
            {isSelected && (
              <span
                aria-hidden="true"
                className="glow-soft absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-foreground text-foreground"
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 className="flex items-center gap-2.5 text-sm font-semibold">
                {name}
                <StatusBadge status={status} className="text-xs font-semibold" />
                {isSelected && <span className="sr-only">(selected)</span>}
              </h3>
              <p className="flex items-baseline gap-3 text-xs text-muted-foreground tabular-nums">
                <span title="Latest response time">
                  {lastStatus === "Down" ? (
                    <span className="font-semibold text-critical">no answer</span>
                  ) : (
                    <span className="text-sm font-semibold text-foreground">{formatMs(lastMs)}</span>
                  )}
                  <span className="sr-only"> latest</span>
                </span>
                <span title={`Median response over the last ${RANGE_LABEL[range]}`}>
                  p50 {formatMs(r.latency.p50Ms)}
                </span>
                <span title={`Uptime over the last ${RANGE_LABEL[range]}`}>
                  {formatPct(r.uptimePct)}
                  <span className="sr-only"> uptime over the last {RANGE_LABEL[range]}</span>
                </span>
              </p>
            </div>
            <PulseTrace ticks={own} slots={slots} label={label} className="h-12" />
          </li>
        )
      })}
    </ul>
  )
}
