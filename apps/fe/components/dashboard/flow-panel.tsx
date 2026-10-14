"use client"

import { WorkflowIcon } from "lucide-react"

import { siteLabel } from "@/components/dashboard/fleet"
import { regionLabel } from "@/components/dashboard/region-dots"
import { ErrorBanner } from "@/components/error-banner"
import { OUTCOME_LABEL, OUTCOME_TONE, outcomeHint, Sankey } from "@/components/flow/sankey"
import { Legend } from "@/components/glass/indicators"
import { Panel, PanelHeader } from "@/components/glass/panel"
import type { Fleet, Website } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { cn } from "@/lib/utils"

// Check flow over the last 24 hours: region → site → how fast it answered.
export function FlowPanel({
  fleet,
  sites,
  error,
  retryAt,
  onRetry,
  className,
}: {
  fleet: Fleet | undefined
  sites: Website[] | undefined
  error: unknown
  retryAt: number | null
  onRetry: () => void
  className?: string
}) {
  const total = fleet?.flow.reduce((n, l) => n + l.checks, 0) ?? 0
  const names = new Map(sites?.map((s) => [s.id, siteLabel(s)]))
  const regions = new Map(fleet?.regions.map((r) => [r.id, regionLabel(r.name)]))
  const thresholds = fleet?.thresholds
  const outcomes = (["fast", "normal", "slow", "down"] as const).map((o) => ({
    label: `${OUTCOME_LABEL[o]} · ${outcomeHint(o, thresholds?.fastMs, thresholds?.slowMs)}`,
    tone: OUTCOME_TONE[o],
  }))

  return (
    <Panel aria-label="Check flow, last 24 hours" className={cn("min-w-0", className)}>
      <PanelHeader
        icon={WorkflowIcon}
        title="Check flow · last 24 hours"
        subtitle="Where each check ran, which site it reached, and how fast the answer came back."
        action={
          fleet && total > 0 ? (
            <span className="rounded-full border border-panel-border bg-foreground/[0.05] px-2.5 py-1 text-xs font-semibold tabular-nums">
              {formatCount(total, "check", "checks")}
            </span>
          ) : undefined
        }
      />

      {error && !fleet ? (
        <ErrorBanner error={error} retryAt={retryAt} onRetry={onRetry} className="my-6" />
      ) : !fleet ? (
        <FlowSkeleton />
      ) : total === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-panel-border px-6 py-12 text-center">
          <div>
            <p className="text-lg font-semibold">No checks in the last 24 hours yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Once a site is checked, this shows which region checked it and whether it answered fast,
              slowly or not at all.
            </p>
          </div>
        </div>
      ) : (
        <>
          {error ? (
            <ErrorBanner error={error} retryAt={retryAt} onRetry={onRetry} stale className="mb-3" />
          ) : null}
          <Sankey
            links={fleet.flow}
            regionName={(id) => regions.get(id) ?? "Unknown region"}
            // Before the site list loads (or if it failed) there are no names yet.
            siteName={(id) => names.get(id) ?? (sites ? "Removed site" : `Site ${id.slice(0, 6)}`)}
            siteHref={(id) => `/sites/${id}`}
            thresholds={thresholds}
          />
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-panel-border pt-3">
        <Legend items={outcomes} />
        {total > 0 && (
          <p className="hidden text-xs text-muted-foreground md:block">
            Hover or tab to a node to trace its checks
          </p>
        )}
      </div>
    </Panel>
  )
}

// Three faint curved columns while the numbers load.
function FlowSkeleton() {
  return (
    <div aria-busy="true" className="relative h-[400px]">
      <p role="status" className="sr-only">
        Loading the check flow…
      </p>
      <div aria-hidden="true" className="absolute inset-0 grid grid-cols-3 gap-6 px-2 pt-8 pb-4 motion-safe:animate-pulse">
        {[3, 6, 3].map((n, col) => (
          <div key={col} className="flex flex-col justify-center gap-2.5">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex items-center gap-3" style={{ height: `${100 / (n + 1)}%` }}>
                <span className="h-full w-3 rounded-md bg-foreground/10" />
                <span className="h-3 w-20 rounded-sm bg-foreground/[0.07]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
