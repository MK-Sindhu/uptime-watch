import { ActivityIcon, CalendarDaysIcon, HeartPulseIcon, SirenIcon, type LucideIcon } from "lucide-react"

import { ResponseChartSkeleton } from "@/components/charts/response-chart"
import { RANGE_KEYS } from "@/lib/ranges"
import { cn } from "@/lib/utils"

// The site page before its data arrives: the same glass layout with empty
// chart surfaces, a dotted baseline and soft placeholder bars. No spinners.

const BAR = "rounded-full bg-foreground/[0.07] motion-safe:animate-pulse"
const PANEL = "panel p-4 sm:p-5"

function Title({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight text-muted-foreground sm:text-lg">
      <Icon className="size-4 shrink-0" />
      {children}
    </p>
  )
}

function Health({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3", className)}>
      <div className="flex items-center gap-3 rounded-2xl border border-panel-border bg-panel-strong py-3 pr-4 pl-5">
        <HeartPulseIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold text-muted-foreground">Site health</span>
        <span className="text-3xl font-semibold text-muted-foreground/60">—</span>
      </div>
      <div className="h-10 rounded-xl border border-panel-border bg-foreground/[0.04]" />
    </div>
  )
}

function Readings() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <div className={`mx-3 h-3 w-28 ${BAR}`} />
      <div className="divide-y divide-border">
        {["Uptime", "P50", "P95", "Avg", "Max", "Last check"].map((label) => (
          <div key={label} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-muted-foreground/60">—</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SiteDetailSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading the site…</p>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]"
      >
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
          <div className="grid grid-cols-1 gap-3 px-1 pt-1 pb-2">
            <div className={`h-4 w-44 ${BAR}`} />
            <div className={`h-7 w-20 ${BAR}`} />
            <div className={`h-9 w-72 max-w-full ${BAR}`} />
            <div className={`h-4 w-96 max-w-full ${BAR}`} />
          </div>

          <div className="panel p-3 lg:hidden">
            <Health />
          </div>

          <div className={PANEL}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Title icon={ActivityIcon}>Response time</Title>
              <div className="flex gap-1 rounded-xl bg-foreground/[0.06] p-1">
                {RANGE_KEYS.map((key) => (
                  <span key={key} className="inline-flex h-7 items-center px-2.5 text-xs text-muted-foreground">
                    {key}
                  </span>
                ))}
              </div>
            </div>
            <ResponseChartSkeleton />
          </div>

          <div className="panel p-3 sm:p-4 lg:hidden">
            <Readings />
          </div>

          <div className={PANEL}>
            <Title icon={CalendarDaysIcon}>Last 90 days</Title>
            <div className="ecg-paper-fine h-12 rounded-2xl border" />
          </div>

          <div className={PANEL}>
            <Title icon={SirenIcon}>Incidents</Title>
            <div className="inset-surface grid gap-2 px-3.5 py-3">
              <div className={`h-4 w-56 max-w-full ${BAR}`} />
              <div className={`h-3 w-32 ${BAR}`} />
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="panel grid gap-4 p-3">
            <Health />
            <Readings />
            <div className="h-11 rounded-xl bg-foreground/[0.06]" />
            <div className="ecg-paper h-64 rounded-2xl border" />
          </div>
        </div>
      </div>
    </div>
  )
}
