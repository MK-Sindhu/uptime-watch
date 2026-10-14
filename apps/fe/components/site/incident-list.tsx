"use client"

import { CircleCheckIcon, DownloadIcon, SirenIcon } from "lucide-react"
import { useId, useState } from "react"

import { Panel } from "@/components/glass/panel"
import { downloadText, fileSlug, incidentsCsv } from "@/components/site/csv"
import { GLASS_BUTTON, PanelBar } from "@/components/site/panel-bar"
import { useNow } from "@/components/site/relative-time"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { Incident, RangeKey } from "@/lib/api"
import { formatCount, formatDuration, formatTime } from "@/lib/format"
import { RANGE_LABEL } from "@/lib/ranges"
import { clockTime } from "@/lib/time"
import { cn } from "@/lib/utils"

const SHORT_MS = 30_000
const FIRST_PAGE = 10

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

// Ongoing first, then newest first.
function sortIncidents(incidents: Incident[]) {
  return [...incidents].sort(
    (a, b) => Number(b.ongoing) - Number(a.ongoing) || Date.parse(b.startedAt) - Date.parse(a.startedAt)
  )
}

// An ongoing outage keeps growing between refreshes.
function durationOf(incident: Incident, now: number) {
  return incident.ongoing
    ? Math.max(incident.durationMs, now - Date.parse(incident.startedAt))
    : incident.durationMs
}

function Time({ iso, withDate }: { iso: string; withDate: boolean }) {
  return (
    <time dateTime={iso} title={clockTime(iso)}>
      {formatTime(iso, withDate)}
    </time>
  )
}

// The glowing coral mark at the start of each row: pulses while ongoing,
// fainter for a blip under 30 s.
function Mark({ incident }: { incident: Incident }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "glow-soft w-[3px] self-stretch rounded-full bg-critical text-critical",
        incident.ongoing && "glow-pulse w-1",
        !incident.ongoing && incident.durationMs < SHORT_MS && "opacity-50"
      )}
    />
  )
}

function NoOutages({ children }: { children: React.ReactNode }) {
  return (
    <p className="inset-surface flex items-center gap-2.5 px-3.5 py-3 text-sm text-muted-foreground">
      <CircleCheckIcon aria-hidden="true" className="glow-soft size-4 shrink-0 text-stable" />
      {children}
    </p>
  )
}

export function IncidentList({
  id,
  incidents,
  range,
  nameOf,
  fileName,
  limit,
  className,
}: {
  // anchor for "see all" links
  id?: string
  // undefined while loading
  incidents: Incident[] | undefined
  range: RangeKey
  nameOf: (regionId: string) => string
  // used for the CSV file, e.g. the site's host
  fileName: string
  // the most the API returns; at the limit there may be older ones
  limit: number
  className?: string
}) {
  const [hideShort, setHideShort] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const now = useNow(30_000)
  const headingId = useId()
  const rangeLabel = RANGE_LABEL[range]

  const all = incidents ? sortIncidents(incidents) : []
  const listed = hideShort ? all.filter((i) => i.ongoing || i.durationMs >= SHORT_MS) : all
  const hidden = all.length - listed.length
  const shown = expanded ? listed : listed.slice(0, FIRST_PAGE)
  const downMs = all.reduce((sum, i) => sum + durationOf(i, now), 0)

  function onExport() {
    if (!incidents) return
    const day = new Date().toISOString().slice(0, 10)
    downloadText(`${fileSlug(fileName)}-incidents-${range}-${day}.csv`, incidentsCsv(incidents))
  }

  return (
    <Panel id={id} aria-labelledby={headingId} className={cn("scroll-mt-4", className)}>
      <PanelBar
        id={headingId}
        icon={SirenIcon}
        title={`Incidents · last ${rangeLabel}`}
        subtitle={
          all.length > 0
            ? `${formatCount(all.length, "outage", "outages")} · ${formatDuration(downMs)} without an answer`
            : "Outages seen by any region"
        }
      >
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <Switch checked={hideShort} onCheckedChange={(checked) => setHideShort(checked)} />
          Hide incidents under 30 s
        </label>
        <Button
          variant="ghost"
          size="sm"
          className={GLASS_BUTTON}
          onClick={onExport}
          disabled={!incidents || incidents.length === 0}
        >
          <DownloadIcon />
          Export CSV
        </Button>
      </PanelBar>

      {!incidents ? (
        <ul aria-hidden="true" className="inset-surface divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <li key={i} className="grid gap-2 px-3.5 py-3">
              <div className="h-4 w-56 max-w-full rounded-full bg-foreground/[0.06] motion-safe:animate-pulse" />
              <div className="h-3 w-32 rounded-full bg-foreground/[0.06] motion-safe:animate-pulse" />
            </li>
          ))}
        </ul>
      ) : listed.length === 0 ? (
        <NoOutages>
          {hidden > 0
            ? `No outages of 30 s or longer in the last ${rangeLabel}. ${formatCount(hidden, "shorter one is", "shorter ones are")} hidden.`
            : `No outages in the last ${rangeLabel}.`}
        </NoOutages>
      ) : (
        <>
          <ul className="inset-surface divide-y divide-border overflow-hidden">
            {shown.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} now={now} nameOf={nameOf} />
            ))}
          </ul>
          {(listed.length > FIRST_PAGE || hidden > 0 || incidents.length >= limit) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {listed.length > FIRST_PAGE && (
                <Button variant="ghost" size="sm" className={GLASS_BUTTON} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Show fewer" : `Show all ${listed.length}`}
                </Button>
              )}
              {hidden > 0 && <span>{formatCount(hidden, "shorter incident", "shorter incidents")} hidden.</span>}
              {incidents.length >= limit && (
                <span>Showing the latest {limit}. Pick a shorter range to see every one.</span>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

function IncidentRow({
  incident,
  now,
  nameOf,
}: {
  incident: Incident
  now: number
  nameOf: (regionId: string) => string
}) {
  const start = Date.parse(incident.startedAt)
  const end = incident.endedAt ? Date.parse(incident.endedAt) : null
  const duration = durationOf(incident, now)

  return (
    <li className={cn("flex gap-3 px-3.5 py-3", incident.ongoing && "bg-critical/[0.06]")}>
      <Mark incident={incident} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {incident.ongoing ? (
            <>
              <span className="font-semibold text-critical">Ongoing</span>
              <span>
                {"· since "}
                <Time iso={incident.startedAt} withDate={!sameDay(start, now)} />
              </span>
            </>
          ) : (
            <>
              <span className="sr-only">Ended outage:</span>
              <span className="font-medium">
                <Time iso={incident.startedAt} withDate={!sameDay(start, now)} />
                <span aria-hidden="true" className="text-muted-foreground">
                  {" → "}
                </span>
                <span className="sr-only"> to </span>
                {incident.endedAt && end !== null && (
                  <Time iso={incident.endedAt} withDate={!sameDay(end, now) && !sameDay(end, start)} />
                )}
              </span>
            </>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">Seen from</span>
          {incident.regions.map((id) => (
            <span
              key={id}
              className="rounded-md border border-panel-border bg-foreground/[0.05] px-1.5 text-[11px] leading-5 font-medium text-foreground"
            >
              {nameOf(id)}
            </span>
          ))}
          <span>· {formatCount(incident.checks, "failed check", "failed checks")}</span>
        </p>
      </div>
      <p
        className={cn(
          "shrink-0 self-center text-right text-base font-semibold tracking-tight tabular-nums",
          incident.ongoing && "text-critical"
        )}
      >
        <span className="sr-only">Lasted </span>
        {formatDuration(duration)}
      </p>
    </li>
  )
}

// The sidebar's "Events" tab: the newest few incidents, start and duration.
export function RecentEvents({
  incidents,
  range,
  max = 6,
  allHref,
}: {
  incidents: Incident[] | undefined
  range: RangeKey
  max?: number
  // link to the full incident list
  allHref: string
}) {
  const now = useNow(30_000)
  if (!incidents) {
    return <div aria-hidden="true" className="ecg-paper h-40 rounded-xl border" />
  }
  if (incidents.length === 0) return <NoOutages>No outages in the last {RANGE_LABEL[range]}.</NoOutages>

  const sorted = sortIncidents(incidents)
  return (
    <div className="grid grid-cols-1 gap-2">
      <ul className="inset-surface divide-y divide-border overflow-hidden">
        {sorted.slice(0, max).map((incident) => {
          const start = Date.parse(incident.startedAt)
          return (
            <li key={incident.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Mark incident={incident} />
              <span className="min-w-0 flex-1 truncate">
                {incident.ongoing && <span className="font-semibold text-critical">Ongoing · </span>}
                {!incident.ongoing && <span className="sr-only">Outage at </span>}
                <Time iso={incident.startedAt} withDate={!sameDay(start, now)} />
              </span>
              <span
                className={cn(
                  "shrink-0 font-semibold tabular-nums",
                  incident.ongoing ? "text-critical" : "text-foreground"
                )}
              >
                {formatDuration(durationOf(incident, now))}
              </span>
            </li>
          )
        })}
      </ul>
      <a
        href={allHref}
        className="justify-self-end rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {incidents.length > max ? `All ${incidents.length} incidents` : "Incident details"}
      </a>
    </div>
  )
}
