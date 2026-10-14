import { ClockIcon, HistoryIcon, ServerIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { Eyebrow, Panel, PanelHeader } from "@/components/glass/panel"
import { ThemeToggle } from "@/components/site-header"
import { utcTime } from "@/components/status-page/format"
import { IncidentList } from "@/components/status-page/incident-list"
import { OverallBanner, OverallMetrics } from "@/components/status-page/overall-banner"
import { SiteRow } from "@/components/status-page/site-row"
import { UptimeLegend } from "@/components/uptime-bar"
import { fetchPublicStatus } from "@/lib/api-server"
import { formatCount } from "@/lib/format"
import { displayName } from "@/lib/site"

import { Refresher } from "./refresher"
import { formatInterval } from "@/lib/checks"

// The pusher queues every site once per round (apps/pusher).

// generateMetadata and the page both need the status: one API call per render.
const getStatus = cache(fetchPublicStatus)

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // If the API fails, the page itself throws the same (cached) error and
  // error.tsx explains it; the title only needs to be sensible.
  const status = await getStatus(slug).catch(() => undefined)
  if (status === undefined) return { title: "Status · Uptime Watch" }
  if (status === null) return { title: "No status page here · Uptime Watch" }

  const names = status.sites.map(displayName)
  const listed =
    names.length === 0
      ? "this page"
      : names.length <= 3
        ? names.join(", ")
        : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
  return {
    title: `${status.title} · Status`,
    description: `Live uptime for ${listed}: the last 90 days, day by day, and every incident from the last 30.`,
  }
}

export default async function StatusPage({ params }: Props) {
  const { slug } = await params
  const status = await getStatus(slug)
  if (!status) notFound()

  // A stable order across refreshes; the API returns sites in database order.
  const sites = [...status.sites].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), "en")
  )

  return (
    <div className="flex min-h-svh flex-col">
      <Refresher />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-3 pt-3 pb-10 sm:px-5 sm:pt-6">
        <Panel aria-labelledby="status-title" className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>Status page</Eyebrow>
            <ThemeToggle />
          </div>
          <h1
            id="status-title"
            className="mt-2 text-4xl leading-[1.05] font-semibold tracking-tight text-balance wrap-anywhere sm:text-5xl"
          >
            {status.title}
          </h1>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <ClockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Updated <time dateTime={status.generatedAt}>{utcTime(status.generatedAt)}</time>
              {` · checked every ${formatInterval(status.checkIntervalSeconds)}${status.regionCount > 1 ? ` from ${status.regionCount} regions` : ""} · refreshes every minute`}
            </span>
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <OverallBanner status={status} />
            <OverallMetrics status={status} className="grid h-full" />
          </div>
        </Panel>

        <Panel aria-labelledby="systems-heading">
          <PanelHeader
            icon={ServerIcon}
            title={<span id="systems-heading">Systems</span>}
            subtitle="Uptime per day over the last 90 days. Point at a day, or focus a bar and use the arrow keys, to read it."
            action={
              sites.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {formatCount(sites.length, "system", "systems")}
                </span>
              )
            }
          />
          {sites.length === 0 ? (
            <p className="ecg-paper-fine rounded-2xl border px-4 py-10 text-center text-muted-foreground">
              No sites are listed on this page yet.
            </p>
          ) : (
            <>
              <UptimeLegend className="mb-4" />
              <ul className="flex flex-col gap-3">
                {sites.map((site) => (
                  <SiteRow key={site.id} site={site} generatedAt={status.generatedAt} />
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel aria-labelledby="incidents-heading">
          <PanelHeader
            icon={HistoryIcon}
            title={<span id="incidents-heading">Past incidents (30 days)</span>}
            subtitle="Newest first. A run of failed checks counts as one incident."
          />
          <IncidentList sites={sites} />
        </Panel>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pb-8 text-sm text-muted-foreground sm:px-8">
        <p>Times are in UTC.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Powered by
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="glow size-4 text-stable"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 13h4l2-6 4 12 3-9 2 3h5" />
            </svg>
            Uptime Watch
          </span>
        </Link>
      </footer>
    </div>
  )
}
