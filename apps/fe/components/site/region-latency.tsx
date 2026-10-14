"use client"

import { GlowBarChart, type Bar } from "@/components/glass/charts"
import { Legend } from "@/components/glass/indicators"
import { toneOfLatency, type Tone } from "@/components/glass/tone"
import type { RangeKey, RegionOverview } from "@/lib/api"
import { latencyScale } from "@/lib/chart"
import { formatMs } from "@/lib/format"
import { RANGE_LABEL } from "@/lib/ranges"

const LEGEND: { label: string; tone: Tone }[] = [
  { label: "Under 300 ms", tone: "stable" },
  { label: "Under 1 s", tone: "warning" },
  { label: "1 s or more", tone: "high" },
]

// p50 per region as glowing bars on a linear axis scaled to the slowest,
// with each region's p95 printed under its name.
export function RegionLatency({
  regions,
  range,
  nameOf,
}: {
  regions: RegionOverview[] | undefined
  range: RangeKey
  nameOf: (regionId: string) => string
}) {
  if (!regions) {
    return <div aria-hidden="true" className="ecg-paper h-56 rounded-xl border" />
  }
  if (regions.length === 0) {
    return (
      <p className="inset-surface px-3 py-6 text-center text-sm text-muted-foreground">
        No region answered in the last {RANGE_LABEL[range]}.
      </p>
    )
  }

  const sorted = [...regions].sort((a, b) => nameOf(a.regionId).localeCompare(nameOf(b.regionId)))
  const slowest = Math.max(1, ...sorted.map((r) => r.latency.p50Ms ?? 0))
  const { top, ticks } = latencyScale(slowest)
  const bars: Bar[] = sorted.map((r) => {
    const p50 = r.latency.p50Ms
    const name = nameOf(r.regionId)
    return {
      key: r.regionId,
      label: name,
      value: p50 === null ? 0 : p50 / top,
      tone: toneOfLatency(p50),
      title:
        p50 === null
          ? `${name}: no answers`
          : `${name}: p50 ${formatMs(p50)}, p95 ${formatMs(r.latency.p95Ms)}`,
    }
  })
  const used = new Set(bars.map((b) => b.tone))

  return (
    <div className="inset-surface grid grid-cols-1 gap-3 p-3 sm:p-4">
      <Legend items={LEGEND.filter((l) => used.has(l.tone))} className="justify-end" />
      <GlowBarChart
        bars={bars}
        yTicks={ticks}
        height="h-40"
        label={`Median response time by region over the last ${RANGE_LABEL[range]}: ${bars.map((b) => b.title).join("; ")}.`}
      />
      {/* p95 under each bar, on the chart's own columns. */}
      <div aria-hidden="true" className="-mt-2 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
        <span className="text-right text-[10px] text-muted-foreground">p95</span>
        <div className="flex justify-around px-1">
          {sorted.map((r) => (
            <span
              key={r.regionId}
              className="min-w-0 flex-1 truncate px-0.5 text-center text-[10px] font-semibold tabular-nums"
            >
              {formatMs(r.latency.p95Ms)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
