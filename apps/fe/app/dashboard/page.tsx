"use client"

import { ServerIcon } from "lucide-react"
import { Suspense, useState } from "react"

import { CommandPalette } from "@/components/command-palette"
import { ActionError } from "@/components/dashboard/action-error"
import { AddSiteForm, focusAddSite } from "@/components/dashboard/add-site-form"
import { EmptyChart, NoMatches } from "@/components/dashboard/empty-state"
import { FlowPanel } from "@/components/dashboard/flow-panel"
import { DashboardHeader } from "@/components/dashboard/header"
import { HealthPanel } from "@/components/dashboard/health-panel"
import { SiteList } from "@/components/dashboard/site-list"
import { rowLinkId } from "@/components/dashboard/site-row"
import { DashboardLoading, SkeletonRows } from "@/components/dashboard/skeleton-rows"
import { StatusPageDialog } from "@/components/dashboard/status-page-dialog"
import { Summary } from "@/components/dashboard/summary"
import { Toolbar } from "@/components/dashboard/toolbar"
import { TrendsPanel } from "@/components/dashboard/trends-panel"
import { useDashboardHotkeys } from "@/components/dashboard/use-dashboard-hotkeys"
import { newSite, useSiteList } from "@/components/dashboard/use-site-list"
import { useNow, useView } from "@/components/dashboard/use-view"
import { applyView, filterCounts } from "@/components/dashboard/view"
import { ErrorBanner } from "@/components/error-banner"
import { Panel, PanelHeader } from "@/components/glass/panel"
import { ShortcutsHelp } from "@/components/shortcuts-help"
import { usePolling } from "@/hooks/use-polling"
import { useRequireSession } from "@/hooks/use-session"
import {
  describeError,
  getFleet,
  isAuthError,
  listRegions,
  listWebsites,
  updateWebsite,
  type Website,
  type WebsiteDetail,
} from "@/lib/api"
import { displayName, siteStatus } from "@/lib/site"

const REFRESH_MS = 10_000
// The 24 h aggregates move slowly; no need to ask as often as the list.
const FLEET_MS = 30_000
const REGIONS_MS = 10 * 60_000

type Overlay = "palette" | "help" | "status" | null

const fetchFleet = () => getFleet("24h")

export default function DashboardPage() {
  // useView reads useSearchParams, which must sit under Suspense or
  // `next build` fails. The fallback is the same page, still loading.
  return (
    <Suspense fallback={<DashboardLoading />}>
      <Dashboard />
    </Suspense>
  )
}

function Dashboard() {
  const { username, ready, signOut } = useRequireSession()
  const polling = { enabled: ready, onAuthError: signOut }
  const polled = usePolling("websites", listWebsites, REFRESH_MS, polling)
  const regions = usePolling("regions", listRegions, REGIONS_MS, polling)
  const fleet = usePolling("fleet-24h", fetchFleet, FLEET_MS, polling)
  const list = useSiteList(polled.data, polled.updatedAt)
  const [view, setView] = useView()
  const now = useNow(5_000)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sites = list.sites
  const shown = sites && applyView(sites, view)
  const highlighted = shown?.some((s) => s.id === activeId) ? activeId : null
  // Unfiltered, worst first: for the palette and the status page dialog.
  const everySite = sites ? applyView(sites, { q: "", filter: "all", sort: "status" }) : []
  const regionNames = new Map(regions.data?.map((r) => [r.id, r.name]))
  const overlayProps = (name: Exclude<Overlay, null>) => ({
    open: overlay === name,
    onOpenChange: (open: boolean) => setOverlay(open ? name : null),
  })

  useDashboardHotkeys({
    shown,
    highlighted,
    onHighlight: setActiveId,
    query: view.q,
    onClearSearch: () => setView({ q: "" }),
    onHelp: () => setOverlay("help"),
    onPalette: () => setOverlay("palette"),
  })

  // The list updates at once; the refresh then brings the server's view.
  function onChanged(updated: WebsiteDetail) {
    list.applyDetail(updated)
    polled.refresh()
  }

  async function resume(site: Website) {
    setActionError(null)
    list.patch(site.id, { paused: false }, { pending: true })
    try {
      onChanged(await updateWebsite(site.id, { paused: false }))
    } catch (err) {
      list.patch(site.id, { paused: true })
      if (isAuthError(err)) signOut()
      else setActionError(`Couldn't resume ${displayName(site)}. ${describeError(err)}`)
    }
  }

  // From the alert: show only the sites that are down, and put the
  // keyboard on the first one.
  function showDown() {
    const first = everySite.find((s) => siteStatus(s) === "Down")
    setView({ filter: "down", q: "" })
    if (!first) return
    setActiveId(first.id)
    setTimeout(() => document.getElementById(rowLinkId(first.id))?.focus(), 60)
  }

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader username={username} onStatusPage={() => setOverlay("status")} onSignOut={signOut} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-16 sm:px-5 sm:pt-6">
        <h1 className="sr-only">Dashboard</h1>

        {/* Phones: health, flow, sites, then the charts. From lg: the flow
            and sites on the left, a sticky health sidebar on the right. */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
            <FlowPanel
              className="order-2 lg:order-none"
              fleet={fleet.data}
              sites={sites}
              error={fleet.error}
              retryAt={fleet.retryAt}
              onRetry={fleet.refresh}
            />

            <Panel id="sites" aria-label="Sites" className="@container order-3 min-w-0 lg:order-none">
              {/* side by side only when the panel itself is wide enough */}
              <div className="grid gap-5 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] @2xl:items-end">
                <div className="min-w-0">
                  <PanelHeader icon={ServerIcon} title="Sites" className="mb-2" />
                  <Summary sites={sites} failed={!!polled.error} updatedAt={polled.updatedAt} now={now} />
                </div>
                <AddSiteForm
                  onAdded={({ id, url }) => {
                    list.add(newSite(id, url))
                    polled.refresh()
                    fleet.refresh()
                  }}
                  onAuthError={signOut}
                />
              </div>

              <ErrorBanner
                className="mt-4"
                error={polled.error}
                retryAt={polled.retryAt}
                onRetry={polled.refresh}
                stale={!!sites}
              />
              <ActionError className="mt-4" message={actionError} onDismiss={() => setActionError(null)} />

              {sites && sites.length > 0 && (
                <div className="sticky top-2 z-10 -mx-2 mt-4 mb-2 rounded-2xl border border-panel-border bg-panel-strong/85 px-2 py-2 shadow-sm backdrop-blur-xl sm:-mx-3 sm:px-3">
                  <Toolbar
                    view={view}
                    counts={filterCounts(sites)}
                    onChange={setView}
                    onHelp={() => setOverlay("help")}
                  />
                </div>
              )}

              {!sites ? (
                !polled.error && <SkeletonRows className="mt-4" />
              ) : sites.length === 0 ? (
                <EmptyChart onAdd={focusAddSite} />
              ) : !shown?.length ? (
                <NoMatches
                  q={view.q}
                  filter={view.filter}
                  onClearSearch={() => setView({ q: "" })}
                  onShowAll={() => setView({ filter: "all" })}
                />
              ) : (
                <SiteList
                  sites={shown}
                  now={now}
                  regionNames={regionNames}
                  activeId={highlighted}
                  onFocusRow={setActiveId}
                  onChanged={onChanged}
                  onDeleted={(id) => {
                    list.remove(id)
                    polled.refresh()
                    fleet.refresh()
                  }}
                  onResume={resume}
                  onError={setActionError}
                />
              )}
            </Panel>
          </div>

          <div className="contents lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4 lg:self-start">
            <HealthPanel
              className="order-1 lg:order-none"
              fleet={fleet.data}
              sites={sites}
              now={now}
              failed={!!fleet.error}
              onShowDown={showDown}
            />
            <TrendsPanel
              className="order-4 lg:order-none"
              fleet={fleet.data}
              sites={sites}
              failed={!!fleet.error}
              now={now}
            />
          </div>
        </div>
      </main>

      <CommandPalette
        {...overlayProps("palette")}
        sites={everySite}
        onAddSite={focusAddSite}
        onStatusPage={() => setOverlay("status")}
        onShortcuts={() => setOverlay("help")}
        onSignOut={signOut}
      />
      <ShortcutsHelp {...overlayProps("help")} />
      <StatusPageDialog
        {...overlayProps("status")}
        sites={everySite}
        onPatch={list.patch}
        onChanged={onChanged}
        onAuthError={signOut}
      />
    </div>
  )
}
