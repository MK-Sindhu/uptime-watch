"use client"

import { useState } from "react"

import type { DailyUptimeDay } from "@/lib/api"
import { formatCount, formatDay, formatPct } from "@/lib/format"
import { cn } from "@/lib/utils"

// One chart-paper cell per day. Colour plus pattern, so the level reads
// without colour: solid = every check answered, diagonal hatch = 99% or
// better, cross hatch = below 99%, hollow = no checks that day.
type Level = "none" | "up" | "degraded" | "down"

function levelOf(d: DailyUptimeDay): Level {
  if (d.uptimePct === null) return "none"
  if (d.uptimePct >= 100) return "up"
  if (d.uptimePct >= 99) return "degraded"
  return "down"
}

// Glowing cells; the hatching keeps levels apart without colour.
const CELL: Record<Level, string> = {
  none: "border border-grid-line bg-transparent",
  up: "bg-[linear-gradient(to_bottom,var(--stable),color-mix(in_oklab,var(--stable)_55%,transparent))] shadow-[0_0_10px_-3px_var(--stable)]",
  degraded:
    "bg-warning/30 shadow-[0_0_10px_-3px_var(--warning)] [background-image:repeating-linear-gradient(45deg,var(--warning)_0_2px,transparent_2px_5px)]",
  down:
    "bg-critical/30 shadow-[0_0_12px_-2px_var(--critical)] [background-image:repeating-linear-gradient(45deg,var(--critical)_0_2px,transparent_2px_5px),repeating-linear-gradient(-45deg,var(--critical)_0_2px,transparent_2px_5px)]",
}

function describe(d: DailyUptimeDay) {
  if (d.uptimePct === null) return `${formatDay(d.day)} · no checks`
  const failed = d.down > 0 ? ` · ${formatCount(d.down, "failed check", "failed checks")}` : ""
  return `${formatDay(d.day)} · ${formatPct(d.uptimePct)} answered${failed}`
}

export function UptimeBar({
  days,
  className,
  height = "h-8",
}: {
  days: DailyUptimeDay[]
  className?: string
  height?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const last = days.length - 1
  const shown = active ?? last
  const withData = days.filter((d) => d.uptimePct !== null)
  const up = withData.reduce((n, d) => n + d.up, 0)
  const down = withData.reduce((n, d) => n + d.down, 0)
  const overall = up + down === 0 ? null : (up / (up + down)) * 100

  function onKeyDown(e: React.KeyboardEvent) {
    const i = active ?? last
    const next =
      e.key === "ArrowLeft" ? Math.max(0, i - 1)
      : e.key === "ArrowRight" ? Math.min(last, i + 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null
    if (next === null) return
    e.preventDefault()
    setActive(next)
  }

  if (days.length === 0) return null

  return (
    <div className={className}>
      <div
        role="group"
        tabIndex={0}
        aria-label={`Uptime per day for the last ${days.length} days: ${formatPct(overall)} overall. Use the arrow keys to read each day.`}
        aria-describedby={undefined}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="inset-surface p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div
          className={cn(
            "grid gap-[2px]",
            days.length > 45 ? "grid-cols-[repeat(45,minmax(0,1fr))] md:grid-cols-[repeat(90,minmax(0,1fr))]" : "grid-cols-[repeat(45,minmax(0,1fr))]"
          )}
          style={days.length !== 90 && days.length <= 45 ? { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } : undefined}
        >
          {days.map((d, i) => (
            <span
              key={d.day}
              onMouseEnter={() => setActive(i)}
              className={cn(
                height,
                "rounded-[3px] transition-transform",
                CELL[levelOf(d)],
                i === active && "ring-2 ring-foreground ring-offset-1 ring-offset-card"
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4 text-xs text-muted-foreground tabular-nums">
        <span aria-live="polite">{describe(days[shown]!)}</span>
        <span className="hidden sm:inline">
          {formatDay(days[0]!.day)} – today
        </span>
      </div>
    </div>
  )
}

export function UptimeLegend({ className }: { className?: string }) {
  const item = (level: Level, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("inline-block size-3 rounded-[2px]", CELL[level])} />
      {label}
    </span>
  )
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {item("up", "All checks answered")}
      {item("degraded", "99% or more")}
      {item("down", "Below 99%")}
      {item("none", "No checks")}
    </div>
  )
}
