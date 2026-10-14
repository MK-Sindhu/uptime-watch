"use client"

import {
  ChartColumnIcon,
  ChartSplineIcon,
  CircleCheckIcon,
  HistoryIcon,
  MapPinIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import {
  dataStart,
  downFor,
  joinSites,
  niceCeil,
  p50Of,
  regionStats,
  roughSpan,
  shortLabel,
  siteBarTone,
  siteLabel,
  toneOfRegion,
  type RegionStats,
} from "@/components/dashboard/fleet"
import { GlowBarChart, GlowLineChart, type Bar } from "@/components/glass/charts"
import { Legend, MetricTable, ToneDot, type MetricRow } from "@/components/glass/indicators"
import { Inset, Panel } from "@/components/glass/panel"
import { Segmented } from "@/components/glass/segmented"
import { toneOfLatency, toneOfUptime, TONE_TEXT, type Tone } from "@/components/glass/tone"
import type { Fleet, Website } from "@/lib/api"
import { formatCount, formatMs, formatPct } from "@/lib/format"
import { siteStatus } from "@/lib/site"
import { clockTime, timeAgo } from "@/lib/time"
import { cn } from "@/lib/utils"

type Tab = "health" | "regions" | "events"

const TABS: { value: Tab; label: string }[] = [
  { value: "health", label: "Health" },
  { value: "regions", label: "Regions" },
  { value: "events", label: "Events" },
]

const pct = (share: number) => `${(share * 100).toFixed(share > 0 && share < 0.01 ? 2 : 1)}%`

// Response times, regions and recent problems, one tab at a time.
export function TrendsPanel({
  fleet,
  sites,
  failed,
  now,
  className,
}: {
  fleet: Fleet | undefined
  sites: Website[] | undefined
  // the fleet request failed and nothing has loaded yet
  failed: boolean
  now: number
  className?: string
}) {
  const [tab, setTab] = useState<Tab>("health")

  return (
    <Panel aria-label="Fleet details" className={cn("flex flex-col gap-3 p-3 sm:p-4", className)}>
      <Segmented value={tab} onValueChange={setTab} options={TABS} label="Fleet details" />
      <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)!.label} className="flex flex-col gap-3">
        {!fleet && failed ? (
          <ChartCard icon={ChartColumnIcon} title="The last 24 hours didn't load">
            <Empty>Retrying on its own. The check flow panel says what went wrong.</Empty>
          </ChartCard>
        ) : !fleet || !sites ? (
          <ChartCard icon={ChartColumnIcon} title="Loading the last 24 hours…">
            <div aria-busy="true" className="h-44 rounded-lg bg-foreground/[0.04] motion-safe:animate-pulse" />
          </ChartCard>
        ) : tab === "health" ? (
          <HealthTab fleet={fleet} sites={sites} />
        ) : tab === "regions" ? (
          <RegionsTab fleet={fleet} />
        ) : (
          <EventsTab fleet={fleet} sites={sites} now={now} />
        )}
      </div>
    </Panel>
  )
}

// A dark card with a title and the recessed chart surface, like the
// reference's chart cards.
function ChartCard({
  icon: Icon,
  title,
  legend,
  children,
}: {
  icon: LucideIcon
  title: React.ReactNode
  legend?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-panel-border bg-panel-strong/70 p-3">
      <h3 className="mb-2.5 flex items-center gap-2 px-0.5 text-sm font-semibold tracking-tight sm:text-base">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {title}
      </h3>
      <Inset className="p-3 sm:p-3.5">
        {legend && <div className="mb-3 flex justify-end">{legend}</div>}
        {children}
      </Inset>
    </section>
  )
}

// ------------------------------------------------------------------ health

function HealthTab({ fleet, sites }: { fleet: Fleet; sites: Website[] }) {
  const { fastMs, slowMs } = fleet.thresholds
  const joined = joinSites(sites, fleet)
    .filter((j) => p50Of(j) !== null || siteStatus(j.site) === "Down")
    .sort((a, b) => shortLabel(a.site).localeCompare(shortLabel(b.site)))
  const slowestP50 = Math.max(0, ...joined.map((j) => p50Of(j) ?? 0))
  const barTop = niceCeil(Math.max(slowestP50 * 1.1, fastMs), [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10])
  const bars: Bar[] = joined.map((j) => {
    const p50 = p50Of(j)
    const down = siteStatus(j.site) === "Down"
    const failed = j.stats?.down ?? j.site.stats24h.down
    return {
      key: j.site.id,
      label: shortLabel(j.site),
      value: p50 === null ? 1 : p50 / barTop,
      tone: siteBarTone(j, fastMs, slowMs),
      title:
        `${siteLabel(j.site)}: ` +
        (p50 === null ? "no answers" : `half its checks answered within ${formatMs(p50)}`) +
        (down ? ", not answering now" : failed > 0 ? `, ${formatCount(failed, "failed check", "failed checks")}` : ""),
      href: `/sites/${j.site.id}`,
    }
  })

  // Start where the data starts (a new fleet has only the last hour).
  const start = dataStart(fleet.series.map((p) => p.avgMs))
  const series = fleet.series.slice(start)
  const span = start === 0 ? "24 h" : `last ${roughSpan(series.length * fleet.stepSeconds * 1000)}`
  const peak = Math.max(0, ...series.map((p) => Math.max(p.avgMs ?? 0, p.p95Ms ?? 0)))
  const top = niceCeil(Math.max(peak * 1.05, 400), [1, 2, 4, 5, 8, 10])
  const yTicks = [top, top / 2, top / 4, 0].map((v) => ({ value: v, label: v === 0 ? "0" : formatMs(v) }))
  // About five labels whatever the span: every 6 h over a full day.
  const step = Math.max(1, Math.ceil(series.length / 4))
  const xLabels = series
    .map((p, i) => ({ index: i, label: hhmm(p.t) }))
    .filter((l, i) => i % step === 0 || i === series.length - 1)
    // drop a label that would crowd the last one
    .filter((l, i, all) => i === all.length - 1 || series.length - 1 - l.index >= step * 0.75)
  const lineTone = toneOfLatency(fleet.health.latency.avgMs, fastMs, slowMs)
  const answered = series.filter((p) => p.avgMs !== null).length

  return (
    <>
      <ChartCard
        icon={ChartColumnIcon}
        title="Response time by site"
        legend={
          <Legend
            items={[
              { label: "Fast", tone: "stable" },
              { label: "Normal", tone: "warning" },
              { label: "Slow", tone: "high" },
              { label: "Failing", tone: "critical" },
            ]}
          />
        }
      >
        {bars.length ? (
          <GlowBarChart
            bars={bars}
            yTicks={[formatMs(barTop), formatMs(barTop / 2), "0"]}
            label={`Median response time per site over the last 24 hours. Slowest: ${formatMs(slowestP50)}.`}
            height="h-36"
          />
        ) : (
          <Empty>No answered checks in the last 24 hours.</Empty>
        )}
      </ChartCard>

      <ChartCard
        icon={ChartSplineIcon}
        title={`Response time · ${span}`}
        legend={
          <Legend
            items={[
              { label: "Average", tone: lineTone },
              { label: "p95", tone: lineTone, dashed: true },
            ]}
          />
        }
      >
        {answered ? (
          <GlowLineChart
            values={series.map((p) => p.avgMs)}
            secondary={series.map((p) => p.p95Ms)}
            tone={lineTone}
            max={top}
            yTicks={yTicks}
            xLabels={xLabels}
            label={
              `Average response time across all sites, every ${Math.round(fleet.stepSeconds / 60)} minutes, ` +
              `${span === "24 h" ? "over the last 24 hours" : span}. Average ${formatMs(fleet.health.latency.avgMs)}, ` +
              `p95 ${formatMs(fleet.health.latency.p95Ms)}. Use the arrow keys to read each point.`
            }
            formatValue={formatMs}
            pointLabel={(i) => (series[i] ? hhmm(series[i]!.t) : "")}
            height="h-36"
          />
        ) : (
          <Empty>No answered checks in the last 24 hours.</Empty>
        )}
      </ChartCard>
    </>
  )
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

// ----------------------------------------------------------------- regions

function RegionsTab({ fleet }: { fleet: Fleet }) {
  const regions = regionStats(fleet.flow, fleet.regions)
  if (!regions.length) {
    return (
      <ChartCard icon={MapPinIcon} title="Regions">
        <Empty>No checks from any region in the last 24 hours.</Empty>
      </ChartCard>
    )
  }
  const share = (r: RegionStats) => (r.slow + r.down) / r.checks
  const top = niceCeil(Math.max(0.05, ...regions.map((r) => share(r) * 1.1)), [1, 2, 2.5, 5, 10])

  return (
    <>
      <ChartCard
        icon={MapPinIcon}
        title="Slow or failed checks by region"
        legend={
          <Legend
            items={[
              { label: "Clean", tone: "stable" },
              { label: "Some slow", tone: "warning" },
              { label: "10%+ slow", tone: "high" },
              { label: "Failing", tone: "critical" },
            ]}
          />
        }
      >
        <GlowBarChart
          bars={regions.map((r) => ({
            key: r.id,
            label: r.name,
            value: share(r) / top,
            tone: toneOfRegion(r),
            title: `${r.name}: ${pct(share(r))} of ${formatCount(r.checks, "check", "checks")} slow or failed`,
          }))}
          yTicks={[pct(top), pct(top / 2), "0%"]}
          label={`Share of slow or failed checks per region over the last 24 hours.`}
          height="h-32"
        />
      </ChartCard>

      {regions.map((r) => (
        <section key={r.id} className="rounded-2xl border border-panel-border bg-panel-strong/70 p-3">
          <h3 className="mb-1.5 flex items-center gap-2 px-1 text-sm font-semibold">
            <ToneDot tone={toneOfRegion(r)} />
            {r.name}
            <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
              {formatCount(r.checks, "check", "checks")}
            </span>
          </h3>
          <MetricTable rows={regionRows(r, fleet.thresholds)} />
        </section>
      ))}
    </>
  )
}

function regionRows(r: RegionStats, { fastMs, slowMs }: Fleet["thresholds"]): MetricRow[] {
  const part = (n: number) => (
    <>
      {n.toLocaleString("en-GB")}
      <span className="ml-1 font-normal text-muted-foreground">({pct(n / r.checks)})</span>
    </>
  )
  const rows: MetricRow[] = [
    {
      label: "Failed",
      value: part(r.down),
      tone: r.down > 0 ? "critical" : "stable",
      status: r.down > 0 ? "Critical" : "None",
      title: "Checks that got no answer",
    },
    {
      label: `Slow · ${formatMs(slowMs)}+`,
      value: part(r.slow),
      tone: r.slow > 0 ? "high" : "stable",
      status: r.slow > 0 ? "High" : "None",
      title: `Checks that took ${formatMs(slowMs)} or more`,
    },
    {
      label: `Fast · under ${formatMs(fastMs)}`,
      value: part(r.fast),
      tone: "stable",
      status: "Stable",
      title: `Checks that answered in under ${formatMs(fastMs)}`,
    },
  ]
  const at = rows.findIndex((row) => row.tone === "critical" || row.tone === "high")
  return rows.map((row, i) => (i === at ? { ...row, highlight: true } : row))
}

// ------------------------------------------------------------------ events

type Event = {
  key: string
  tone: Tone
  site: Website
  text: string
  when?: string
  whenTitle?: string
}

function EventsTab({ fleet, sites, now }: { fleet: Fleet; sites: Website[]; now: number }) {
  const events: Event[] = []
  for (const site of sites) {
    if (siteStatus(site) !== "Down") continue
    const since = downFor(site, now)
    events.push({
      key: `down-${site.id}`,
      tone: "critical",
      site,
      text: since ? `Not answering · down for ${since}` : "Not answering",
      when: "now",
    })
  }
  const listed = new Map(sites.map((s) => [s.id, s]))
  const failing = fleet.sites
    .filter((s) => s.down > 0 && listed.has(s.websiteId))
    .sort((a, b) => b.down - a.down)
  for (const stats of failing) {
    const site = listed.get(stats.websiteId)!
    if (siteStatus(site) === "Down") continue
    const lastFailed = site.ticks.find((t) => t.status === "Down")
    const tone = toneOfUptime(stats.uptimePct)
    events.push({
      key: `failed-${site.id}`,
      tone: tone === "stable" ? "warning" : tone,
      site,
      text: `${formatCount(stats.down, "failed check", "failed checks")} in 24 h · ${formatPct(stats.uptimePct)} uptime`,
      when: lastFailed ? (timeAgo(lastFailed.createdAt, now) ?? undefined) : undefined,
      whenTitle: lastFailed ? `Last failed check: ${clockTime(lastFailed.createdAt)}` : undefined,
    })
  }

  return (
    <ChartCard icon={HistoryIcon} title="Recent problems · 24 h">
      {events.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <CircleCheckIcon aria-hidden="true" className="size-4 text-stable glow-soft" />
          No failed checks in the last 24 hours.
        </p>
      ) : (
        <ul className="-my-1 divide-y divide-border">
          {events.map((e) => (
            <li key={e.key}>
              <Link
                href={`/sites/${e.site.id}`}
                className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2.5 outline-none hover:bg-foreground/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ToneDot tone={e.tone} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{siteLabel(e.site)}</span>
                  <span className={cn("block truncate text-xs", TONE_TEXT[e.tone])}>{e.text}</span>
                </span>
                {e.when && (
                  <span title={e.whenTitle} className="text-xs text-muted-foreground tabular-nums">
                    {e.when}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="grid h-28 place-items-center text-center text-sm text-muted-foreground">{children}</p>
}
