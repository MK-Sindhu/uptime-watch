"use client"

import { ActivityIcon, CalendarDaysIcon, GlobeIcon, SearchXIcon } from "lucide-react"
import Link from "next/link"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useId, useState } from "react"

import { ResponseChart, ResponseChartSkeleton } from "@/components/charts/response-chart"
import { ErrorBanner } from "@/components/error-banner"
import { Panel } from "@/components/glass/panel"
import type { Tone } from "@/components/glass/tone"
import { SiteHeader } from "@/components/site-header"
import { SiteHeading } from "@/components/site/heading"
import {
  HealthSummary,
  healthTrend,
  Readings,
  SLOW_MS,
  type ReadoutStats,
  type SiteAlert,
} from "@/components/site/health"
import { IncidentList } from "@/components/site/incident-list"
import { PanelBar } from "@/components/site/panel-bar"
import { RangeTabs } from "@/components/site/range-tabs"
import { RegionLeads } from "@/components/site/region-leads"
import { regionLabel } from "@/components/site/region-name"
import { RegionTabs } from "@/components/site/region-tabs"
import { SiteTabs } from "@/components/site/site-tabs"
import { SiteDetailSkeleton } from "@/components/site/skeleton"
import { usePause } from "@/components/site/use-pause"
import { Button } from "@/components/ui/button"
import { UptimeBar, UptimeLegend } from "@/components/uptime-bar"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { usePolling, type Polled } from "@/hooks/use-polling"
import { useRequireSession } from "@/hooks/use-session"
import {
  getDaily,
  getIncidents,
  getOverview,
  getSeries,
  getWebsite,
  isNotFound,
  listRegions,
  listWebsites,
  type DailyUptime,
  type IncidentList as IncidentListData,
  type Overview,
  type RangeKey,
  type Region,
  type Series,
  type Website,
  type WebsiteDetail,
} from "@/lib/api"
import { RANGE_KEYS, RANGE_LABEL, parseRange } from "@/lib/ranges"
import { displayName, downSince, hostOf, latestByRegion, type SiteStatus } from "@/lib/site"
import { formatInterval } from "@/lib/checks"

// Settings change only through this page's own actions, which hand back the
// updated site, so the detail itself is re-read rarely.
const DETAIL_MS = 5 * 60_000
const OVERVIEW_MS = 10_000
const CHART_MS = 60_000
const TICKS_MS = 10_000
const REGIONS_MS = 60 * 60_000
const INCIDENT_LIMIT = 50
const LIVE_RANGES: RangeKey[] = ["1h", "24h"]
// Region ids are short slugs; anything else in the URL is ignored.
const REGION_ID = /^[\w-]{1,64}$/
const INCIDENTS_ANCHOR = "incidents"

const NO_STATS: ReadoutStats = {
  uptimePct: null,
  latency: { avgMs: null, p50Ms: null, p95Ms: null, maxMs: null },
}

const STATUS_WORD: Record<SiteStatus, string> = {
  Up: "up",
  Down: "down",
  Unknown: "in an unknown state",
  Waiting: "waiting for its first check",
  Paused: "paused",
}

export default function SitePage() {
  const { id } = useParams<{ id: string }>()
  const { username, ready, signOut } = useRequireSession()

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
          Dashboard
        </Button>
        {username && (
          <span className="mx-2 hidden font-mono text-sm text-muted-foreground sm:inline">{username}</span>
        )}
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </SiteHeader>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-16 sm:px-5 sm:pt-6">
        {ready ? (
          // The detail reads ?range and ?region (useSearchParams), which
          // needs a Suspense boundary.
          <Suspense fallback={<SiteDetailSkeleton />}>
            <SiteDetail key={id} id={id} signOut={signOut} />
          </Suspense>
        ) : (
          <SiteDetailSkeleton />
        )}
      </main>
    </div>
  )
}

function SiteDetail({ id, signOut }: { id: string; signOut: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const range = parseRange(searchParams.get("range"))
  const regionParam = searchParams.get("region")

  const detail = usePolling(`detail:${id}`, () => getWebsite(id), DETAIL_MS, {
    onAuthError: signOut,
  })
  // Once the site is known to be gone, stop asking about it.
  const options = { onAuthError: signOut, enabled: !isNotFound(detail.error) }

  const regions = usePolling("regions", listRegions, REGIONS_MS, options)
  // An unknown region in the URL falls back to all of them.
  const region =
    regionParam &&
    REGION_ID.test(regionParam) &&
    (!regions.data || regions.data.some((r) => r.id === regionParam))
      ? regionParam
      : "all"

  const overview = usePolling(`overview:${id}:${range}`, () => getOverview(id, range), OVERVIEW_MS, options)
  const series = usePolling(
    `series:${id}:${range}:${region}`,
    () => getSeries(id, range, region),
    CHART_MS,
    options
  )
  const incidents = usePolling(
    `incidents:${id}:${range}`,
    () => getIncidents(id, range, INCIDENT_LIMIT),
    CHART_MS,
    options
  )
  const daily = usePolling(`daily:${id}`, () => getDaily(id, 90), CHART_MS, options)
  // The newest checks come with the site list.
  const websites = usePolling("websites", listWebsites, TICKS_MS, options)

  // The copy an action just saved wins until a newer fetch replaces it.
  const [saved, setSaved] = useState<{ site: WebsiteDetail; at: number } | null>(null)
  const site = saved && saved.at >= (detail.updatedAt ?? 0) ? saved.site : detail.data

  // Replace, not push: flipping through ranges shouldn't fill the history.
  function setQuery(next: { range?: RangeKey; region?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    const nextRange = next.range ?? range
    const nextRegion = next.region ?? region
    if (nextRange === "24h") params.delete("range")
    else params.set("range", nextRange)
    if (nextRegion === "all") params.delete("region")
    else params.set("region", nextRegion)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  useHotkeys(
    Object.fromEntries(RANGE_KEYS.map((key, i) => [String(i + 1), () => setQuery({ range: key })]))
  )

  function onChanged(updated: WebsiteDetail) {
    setSaved({ site: updated, at: Date.now() })
    websites.refresh()
  }

  const polls = [detail, overview, series, incidents, daily, websites]
  const notFound = polls.some((p) => isNotFound(p.error))
  const failing = polls.find((p) => p.error && !isNotFound(p.error))
  const retryAll = () => polls.forEach((p) => p.refresh())

  // The tab title names the site (a client page can't export metadata).
  const tabTitle = notFound ? "Site not found" : site ? displayName(site) : null
  useEffect(() => {
    if (!tabTitle) return
    const previous = document.title
    document.title = `${tabTitle} · Uptime Watch`
    return () => {
      document.title = previous
    }
  }, [tabTitle])

  if (notFound) return <NotOnChart />

  const errorBanner = failing && (
    <ErrorBanner
      error={failing.error}
      retryAt={failing.retryAt}
      onRetry={retryAll}
      stale={failing.data !== undefined}
    />
  )

  if (!site) {
    return (
      <div className="grid gap-4">
        {errorBanner}
        <SiteDetailSkeleton />
      </div>
    )
  }

  return (
    <SiteLayout
      site={site}
      range={range}
      region={region}
      regions={regions.data}
      overview={overview}
      series={series}
      incidents={incidents}
      daily={daily}
      websites={websites}
      errorBanner={errorBanner}
      setQuery={setQuery}
      onChanged={onChanged}
      onDeleted={() => router.push("/dashboard")}
    />
  )
}

type Polls = {
  overview: Polled<Overview>
  series: Polled<Series>
  incidents: Polled<IncidentListData>
  daily: Polled<DailyUptime>
  websites: Polled<Website[]>
}

// The loaded page: heading and charts on the left, the health sidebar on
// the right (lg+). Phones get one column in reading order: heading, health,
// chart, readings, 90 days, incidents, regions. The sidebar's pieces are
// rendered once per layout and hidden by breakpoint, so the reading and tab
// order always match what's on screen.
function SiteLayout({
  site,
  range,
  region,
  regions,
  overview,
  series,
  incidents,
  daily,
  websites,
  errorBanner,
  setQuery,
  onChanged,
  onDeleted,
}: Polls & {
  site: WebsiteDetail
  range: RangeKey
  region: string
  regions: Region[] | undefined
  errorBanner: React.ReactNode
  setQuery: (next: { range?: RangeKey; region?: string }) => void
  onChanged: (updated: WebsiteDetail) => void
  onDeleted: () => void
}) {
  const pause = usePause(site, onChanged)
  const chartId = useId()
  const dailyId = useId()
  const regionsId = useId()

  // Region names: the region list, plus any the overview knows that it doesn't.
  const names = new Map<string, string>()
  for (const r of regions ?? []) names.set(r.id, r.name)
  for (const r of overview.data?.regions ?? []) if (!names.has(r.regionId)) names.set(r.regionId, r.name)
  const nameOf = (regionId: string) => regionLabel(names.get(regionId) ?? regionId)
  const regionOptions = [...names.keys()]
    .map((rid) => ({ id: rid, label: nameOf(rid) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const ticks = websites.data?.find((w) => w.id === site.id)?.ticks ?? []
  const latest = latestByRegion(ticks)
  const ov = overview.data
  // at(0), not [0]: a new site has no checks yet, and the type should say so.
  const newest = ticks.at(0)
  const status: SiteStatus = site.paused ? "Paused" : (newest?.status ?? ov?.lastStatus ?? "Waiting")
  const lastCheckAt = newest?.createdAt ?? ov?.lastAt ?? null

  // Readings follow the region filter.
  const regionStats = region === "all" ? undefined : ov?.regions.find((r) => r.regionId === region)
  const stats: ReadoutStats | null = !ov ? null : region === "all" ? ov : (regionStats ?? NO_STATS)
  const scopedLastCheck =
    region === "all" ? lastCheckAt : (latest.get(region)?.createdAt ?? regionStats?.lastAt ?? null)

  const chart = series.data
  const chartScope = chart?.region ? ` from ${nameOf(chart.region)}` : ""
  const everChecked =
    ticks.length > 0 || !!ov?.lastAt || !!daily.data?.items.some((d) => d.up + d.down > 0)
  const emptyMessage = site.paused
    ? "Checks are paused."
    : !websites.data
      ? undefined
      : everChecked
        ? `No checks in the last ${RANGE_LABEL[chart?.range ?? range]}${chartScope}.`
        : `The first check arrives within ${formatInterval()}.`

  const p50 = stats?.latency.p50Ms ?? null
  // The line is about latency: it turns orange when the site is slow.
  // Failed checks have their own coral marks, whatever this is.
  const lineTone: Tone = p50 !== null && p50 >= SLOW_MS ? "high" : "stable"

  const ongoing = incidents.data?.incidents.find((i) => i.ongoing)
  let alert: SiteAlert
  if (site.paused) alert = { kind: "paused" }
  else if (status === "Down") {
    const downIds = [...latest.values()].filter((t) => t.status === "Down").map((t) => t.region_id)
    alert = {
      kind: "down",
      since: ongoing?.startedAt ?? downSince(ticks)?.at ?? null,
      regions: (downIds.length ? downIds : (ongoing?.regions ?? [])).map(nameOf).sort(),
    }
  } else if (status === "Unknown") alert = { kind: "unknown" }
  else if (status === "Waiting") alert = { kind: "waiting" }
  else if (p50 !== null && p50 >= SLOW_MS) alert = { kind: "slow", p50Ms: p50 }
  else alert = { kind: "ok", p50Ms: p50 }

  // Announced when the status changes or a new range/region has loaded.
  const announcement =
    `${displayName(site)} is ${STATUS_WORD[status]}.` +
    (chart ? ` Showing the last ${RANGE_LABEL[chart.range]}${chartScope}.` : "")

  const shownRange = ov?.range ?? range
  const scopeName = region === "all" ? null : nameOf(region)

  const health = (
    <HealthSummary
      uptimePct={stats?.uptimePct}
      range={shownRange}
      trend={healthTrend(chart?.points ?? [])}
      alert={alert}
      onResume={pause.toggle}
      resuming={pause.pending}
    />
  )
  const readings = (
    <Readings
      stats={stats}
      lastCheckAt={scopedLastCheck}
      paused={site.paused}
      range={shownRange}
      scope={scopeName}
      stale={overview.stale}
    />
  )
  const leads = (
    <RegionLeads
      regions={ov?.regions}
      ticks={ticks}
      paused={site.paused}
      selected={region}
      range={shownRange}
      nameOf={nameOf}
    />
  )

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
          <SiteHeading
            site={site}
            status={status}
            lastCheckAt={lastCheckAt}
            regionCount={latest.size || ov?.regions.length || 0}
            updatedAt={overview.updatedAt}
            pause={pause}
            onChanged={onChanged}
            onDeleted={onDeleted}
          />

          {errorBanner}

          <Panel className="p-3 sm:p-3 lg:hidden">{health}</Panel>

          <Panel aria-labelledby={chartId}>
            <PanelBar
              id={chartId}
              icon={ActivityIcon}
              title="Response time"
              subtitle={`Last ${RANGE_LABEL[chart?.range ?? range]} · ${chartScope ? chartScope.trim() : "every region"}`}
            >
              <RangeTabs value={range} onChange={(next) => setQuery({ range: next })} />
              {regionOptions.length > 1 && (
                <RegionTabs value={region} regions={regionOptions} onChange={(next) => setQuery({ region: next })} />
              )}
            </PanelBar>
            {chart ? (
              <ResponseChart
                series={chart}
                tone={lineTone}
                live={!site.paused && LIVE_RANGES.includes(chart.range)}
                stale={series.stale}
                emptyMessage={emptyMessage}
                scope={chartScope}
              />
            ) : (
              <ResponseChartSkeleton />
            )}
          </Panel>

          <Panel className="p-3 sm:p-4 lg:hidden">{readings}</Panel>

          <Panel aria-labelledby={dailyId}>
            <PanelBar
              id={dailyId}
              icon={CalendarDaysIcon}
              title="Last 90 days"
              subtitle="Share of checks answered each day"
            />
            {daily.data ? (
              <>
                <UptimeBar days={daily.data.items} />
                <UptimeLegend className="mt-3" />
              </>
            ) : (
              <div aria-hidden="true" className="ecg-paper-fine h-12 rounded-2xl border" />
            )}
          </Panel>

          <IncidentList
            id={INCIDENTS_ANCHOR}
            incidents={incidents.data?.incidents}
            range={incidents.data?.range ?? range}
            nameOf={nameOf}
            fileName={hostOf(site.url)}
            limit={INCIDENT_LIMIT}
          />

          <Panel aria-labelledby={regionsId} className="lg:hidden">
            <PanelBar id={regionsId} icon={GlobeIcon} title="Regions" subtitle={`Last ${RANGE_LABEL[shownRange]}`} />
            {leads}
          </Panel>
        </div>

        <aside aria-label="Site health" className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
          <Panel className="grid grid-cols-1 gap-4 p-3 sm:p-3">
            {health}
            {readings}
            <SiteTabs
              regions={ov?.regions}
              ticks={ticks}
              paused={site.paused}
              selected={region}
              range={shownRange}
              nameOf={nameOf}
              incidents={incidents.data?.incidents}
              incidentsHref={`#${INCIDENTS_ANCHOR}`}
            />
          </Panel>
        </aside>
      </div>
    </>
  )
}

function NotOnChart() {
  return (
    <Panel className="mx-auto mt-6 grid max-w-xl justify-items-center gap-3 px-6 py-12 text-center sm:px-10">
      <span className="grid size-12 place-items-center rounded-2xl border border-panel-border bg-panel-strong">
        <SearchXIcon aria-hidden="true" className="glow-soft size-5 text-critical" />
      </span>
      <svg aria-hidden="true" viewBox="0 0 200 20" preserveAspectRatio="none" className="glow h-4 w-40 text-critical">
        <path d="M0 10 L200 10" stroke="currentColor" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <h1 className="text-3xl font-semibold tracking-tight">This site isn&apos;t on your chart</h1>
      <p className="max-w-sm text-muted-foreground">
        It may have been deleted, or the link has a typo. Your sites are on the dashboard.
      </p>
      <Button className="mt-3" nativeButton={false} render={<Link href="/dashboard" />}>
        Back to the dashboard
      </Button>
    </Panel>
  )
}
