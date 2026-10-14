import { MetricTable, type MetricRow } from "@/components/glass/indicators"
import { TONE_TEXT, TONE_VAR, toneOfUptime, type Tone } from "@/components/glass/tone"
import { StatusMark } from "@/components/status-badge"
import type { PublicSite, PublicStatus } from "@/lib/api"
import { formatPct } from "@/lib/format"
import type { SiteStatus } from "@/lib/site"
import { displayName } from "@/lib/site"
import { cn } from "@/lib/utils"

// The one-line answer at the top of the page. `allUp` comes from the API
// (every site is paused or not Down); the extra cases keep it from claiming
// "all answering" when nothing is actually being checked.
function overall(status: PublicStatus): {
  mark: SiteStatus
  tone: Tone
  title: string
  detail?: string
} {
  const active = status.sites.filter((s) => !s.paused)
  if (status.sites.length === 0) {
    return { mark: "Waiting", tone: "info", title: "No sites on this page yet" }
  }
  if (!status.allUp) {
    const down = active.filter((s) => s.status === "Down").map(displayName)
    return {
      mark: "Down",
      tone: "critical",
      title:
        down.length === 0
          ? "Some systems are not answering"
          : `${down.length} ${down.length === 1 ? "system" : "systems"} not answering`,
      detail: down.length ? `Not answering: ${down.join(", ")}` : undefined,
    }
  }
  if (active.length === 0) {
    return {
      mark: "Paused",
      tone: "info",
      title: "Checks are paused",
      detail: "Every site on this page is paused.",
    }
  }
  if (active.every((s) => s.status === null)) {
    return { mark: "Waiting", tone: "info", title: "Waiting for the first checks" }
  }
  const n = active.length
  return {
    mark: "Up",
    tone: "stable",
    title: "All systems answering",
    detail: `${n} ${n === 1 ? "system" : "systems"} checked${n < status.sites.length ? `, ${status.sites.length - n} paused` : ""}.`,
  }
}

// Every site's daily checks added together, oldest day first. Days before
// the first check anywhere are dropped so a new page's line isn't mostly gap.
function fleetDaily(sites: PublicSite[]) {
  const byDay = new Map<string, { up: number; down: number }>()
  for (const site of sites) {
    for (const d of site.daily) {
      const day = byDay.get(d.day) ?? { up: 0, down: 0 }
      day.up += d.up
      day.down += d.down
      byDay.set(d.day, day)
    }
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  let values = days.map(([, d]) => (d.up + d.down === 0 ? null : (d.up / (d.up + d.down)) * 100))
  const first = values.findIndex((v) => v !== null)
  values = first === -1 ? [] : values.slice(first)
  const up = days.reduce((n, [, d]) => n + d.up, 0)
  const down = days.reduce((n, [, d]) => n + d.down, 0)
  return { values, pct: up + down === 0 ? null : (up / (up + down)) * 100 }
}

const W = 1000
const H = 200

// A sparkline on a fixed scale with 100% at the top, so a quiet fleet reads
// as a full, steady line and a bad day shows as a dip. (The kit's Sparkline
// scales to its own min..max, which would put a flat 100% at the bottom.)
function UptimeSpark({ values, tone, label }: { values: (number | null)[]; tone: Tone; label: string }) {
  const nums = values.filter((v): v is number => v !== null)
  const lo = Math.min(99, ...nums) - 0.5
  const y = (v: number) => 14 + ((100 - v) / (100 - lo)) * (H - 28)
  const x = (i: number) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W)

  let line = ""
  let area = ""
  let start: number | null = null
  let last = 0
  const close = () => {
    if (start !== null) area += `L${x(last)} ${H} L${x(start)} ${H} Z `
    start = null
  }
  values.forEach((v, i) => {
    if (v === null) {
      close()
      return
    }
    const cmd = start === null ? "M" : "L"
    line += `${cmd}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    area += `${cmd}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    if (start === null) start = i
    last = i
  })
  close()

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("h-14 w-full overflow-visible", TONE_TEXT[tone])}
    >
      <defs>
        <linearGradient id="fleet-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area.trim()} fill="url(#fleet-spark-fill)" />
      <path
        d={line.trim()}
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

// HealthScore-style card: the overall answer, a line of daily fleet uptime
// and the 90-day figure.
export function OverallBanner({ status, className }: { status: PublicStatus; className?: string }) {
  const state = overall(status)
  const fleet = fleetDaily(status.sites)
  const lowest = fleet.values.reduce<number | null>((m, v) => (v === null ? m : m === null ? v : Math.min(m, v)), null)
  // Red while something is down, so the card reads as one state; otherwise
  // coloured like the 90-day figure beside it (a bad day shows as a dip).
  const sparkTone: Tone = state.tone === "critical" ? "critical" : toneOfUptime(fleet.pct)

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-panel-border bg-panel-strong p-4 pl-5 sm:p-5 sm:pl-6",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="glow absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{ background: TONE_VAR[state.tone], color: TONE_VAR[state.tone] }}
      />
      <div aria-live="polite">
        <p className="eyebrow">Right now</p>
        <p
          className={cn(
            "mt-1.5 flex items-center gap-3 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl",
            TONE_TEXT[state.tone]
          )}
        >
          <StatusMark status={state.mark} className="glow-soft scale-125" />
          {state.title}
        </p>
        {state.detail && (
          <p className="mt-1.5 text-sm wrap-anywhere text-muted-foreground">{state.detail}</p>
        )}
      </div>

      {fleet.values.length > 0 && (
        <div className="mt-auto flex items-end gap-4 pt-5">
          <div className="min-w-0 flex-1">
            <UptimeSpark
              values={fleet.values}
              tone={sparkTone}
              label={`Daily uptime across every system over the last ${fleet.values.length} ${fleet.values.length === 1 ? "day" : "days"}; lowest day ${formatPct(lowest)}.`}
            />
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-3xl leading-none font-semibold tracking-tight sm:text-4xl">
              {formatPct(fleet.pct)}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">uptime, 90 days</span>
          </p>
        </div>
      )}
    </div>
  )
}

function average(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v !== null)
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

// Label · value · ● status rows under the overall card.
export function OverallMetrics({ status, className }: { status: PublicStatus; className?: string }) {
  const active = status.sites.filter((s) => !s.paused)
  const down = active.filter((s) => s.status === "Down").length
  const answering = active.filter((s) => s.status === "Up").length
  const incidents = status.sites.flatMap((s) => s.incidents30d)
  const ongoing = incidents.filter((i) => i.ongoing).length
  const day = average(active.map((s) => s.uptime24hPct))

  const rows: MetricRow[] = [
    {
      label: "Systems answering",
      value: active.length ? `${answering} of ${active.length}` : "—",
      tone: down > 0 ? "critical" : active.length && answering === active.length ? "stable" : "info",
      // Not down but not answering yet: waiting for a first check, or unknown.
      status: down > 0 ? `${down} down` : active.length ? (answering === active.length ? "All up" : "Checking") : "Paused",
    },
    {
      label: "Uptime, last 24 h",
      value: formatPct(day),
      tone: toneOfUptime(day),
      status: day === null ? "No data" : undefined,
    },
    {
      label: "Open incidents",
      value: String(ongoing),
      tone: ongoing > 0 ? "critical" : "stable",
      status: ongoing > 0 ? "Ongoing" : "None",
    },
    {
      label: "Incidents, 30 days",
      value: String(incidents.length),
      tone: incidents.length > 0 ? "warning" : "stable",
      status: incidents.length > 0 ? "Resolved" : "None",
    },
  ]
  // An open incident is also in the 30-day count; say so rather than "Resolved".
  if (ongoing > 0) rows[3]!.status = `${incidents.length - ongoing} resolved`

  return (
    <MetricTable
      rows={rows}
      className={cn("rounded-2xl border border-panel-border bg-panel-strong/50", className)}
    />
  )
}
