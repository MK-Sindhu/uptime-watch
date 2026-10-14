import { CircleCheckIcon } from "lucide-react"

import { StatusMark } from "@/components/status-badge"
import { utcDateTime } from "@/components/status-page/format"
import type { Incident, PublicSite } from "@/lib/api"
import { formatCount, formatDuration } from "@/lib/format"
import { displayName } from "@/lib/site"
import { cn } from "@/lib/utils"

// The API sends up to 20 incidents per site; past this many the page lists
// only the newest.
const MAX_SHOWN = 50

type Row = { key: string; site: string; incident: Incident }

// Every site's incidents from the last 30 days, newest first.
export function IncidentList({ sites }: { sites: PublicSite[] }) {
  const rows: Row[] = sites
    .flatMap((site) =>
      site.incidents30d.map((incident) => ({
        key: `${site.id}:${incident.id}`,
        site: displayName(site),
        incident,
      }))
    )
    .sort(
      (a, b) => (Date.parse(b.incident.startedAt) || 0) - (Date.parse(a.incident.startedAt) || 0)
    )

  if (rows.length === 0) {
    return (
      <p className="inset-surface flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
        <CircleCheckIcon aria-hidden="true" className="glow-soft size-5 shrink-0 text-stable" />
        No incidents in the last 30 days.
      </p>
    )
  }

  const shown = rows.slice(0, MAX_SHOWN)

  return (
    <>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[10.5rem_minmax(0,1fr)_6.5rem_5.5rem] gap-x-4 px-4 pb-2 sm:grid"
      >
        <span className="eyebrow">Started</span>
        <span className="eyebrow">System</span>
        <span className="eyebrow">Lasted</span>
        <span className="eyebrow">Seen from</span>
      </div>
      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-panel-border bg-panel-strong/50">
        {shown.map(({ key, site, incident }) => (
          // Two rows on a phone (site + duration, then time + regions); one
          // row of four columns from sm up. DOM order is the reading order.
          <li
            key={key}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-4 py-3 text-sm sm:grid-cols-[10.5rem_minmax(0,1fr)_6.5rem_5.5rem] sm:items-baseline",
              incident.ongoing && "bg-critical/[0.07]"
            )}
          >
            <time
              dateTime={incident.startedAt}
              className="col-start-1 row-start-2 text-muted-foreground tabular-nums sm:row-start-1"
            >
              {utcDateTime(incident.startedAt)}
            </time>
            <span className="col-start-1 row-start-1 truncate font-semibold sm:col-start-2">{site}</span>
            <span className="col-start-2 row-start-1 text-right tabular-nums sm:col-start-3 sm:text-left">
              {incident.ongoing ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-critical">
                  <StatusMark status="Down" className="size-2" />
                  Ongoing
                </span>
              ) : (
                formatDuration(incident.durationMs)
              )}
            </span>
            <span
              className="col-start-2 row-start-2 text-right text-muted-foreground sm:col-start-4 sm:row-start-1 sm:text-left"
              title={incident.regions.join(", ") || undefined}
            >
              {formatCount(incident.regions.length, "region", "regions")}
            </span>
          </li>
        ))}
      </ol>
      {rows.length > shown.length && (
        <p className="mt-3 text-sm text-muted-foreground">
          Showing the {MAX_SHOWN} most recent of {rows.length}.
        </p>
      )}
    </>
  )
}
