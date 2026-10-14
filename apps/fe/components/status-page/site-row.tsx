import { StatusBadge } from "@/components/status-badge"
import { utcStamp } from "@/components/status-page/format"
import { UptimeBar } from "@/components/uptime-bar"
import type { PublicSite } from "@/lib/api"
import { formatPct } from "@/lib/format"
import { displayName, hostOf, type SiteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"

export function publicSiteStatus(site: PublicSite): SiteStatus {
  if (site.paused) return "Paused"
  return site.status ?? "Waiting"
}

// The latest thing we know about the site, as a phrase.
function latest(site: PublicSite, status: SiteStatus, generatedAt: string) {
  const ongoing = site.incidents30d.find((i) => i.ongoing)
  if (status === "Paused") return "checks paused"
  if (status === "Waiting") return "waiting for the first check"
  if (status === "Down" && ongoing) return `not answering since ${utcStamp(ongoing.startedAt, generatedAt)}`
  if (site.checkedAt) return `last check ${utcStamp(site.checkedAt, generatedAt)}`
  return null
}

// One glass row per site: status, name and host on the left, the two uptime
// figures on the right, the 90-day bar underneath.
export function SiteRow({ site, generatedAt }: { site: PublicSite; generatedAt: string }) {
  const status = publicSiteStatus(site)
  const paused = status === "Paused"
  // The host goes under the name only when the site has its own name;
  // otherwise the name already is the host.
  const host = site.name ? hostOf(site.url) : null
  const phrase = latest(site, status, generatedAt)

  return (
    <li className="rounded-2xl border border-panel-border bg-panel-strong/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <StatusBadge status={status} />
          <h3
            className={cn(
              "mt-1 truncate text-lg leading-snug font-semibold tracking-tight sm:text-xl",
              paused && "text-muted-foreground"
            )}
          >
            {displayName(site)}
          </h3>
          {(host || phrase) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {host && <span className="font-mono">{host}</span>}
              {host && phrase && " · "}
              {phrase && (host ? phrase : phrase.charAt(0).toUpperCase() + phrase.slice(1))}
            </p>
          )}
        </div>

        <dl className="flex items-end gap-6 sm:text-right">
          <div>
            <dt className="eyebrow">
              <span className="sr-only">Uptime, last </span>90 days
            </dt>
            <dd className="mt-1 text-2xl leading-none font-semibold tracking-tight sm:text-3xl">
              {formatPct(site.uptime90dPct)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">
              <span className="sr-only">Uptime, last </span>24 h
            </dt>
            <dd className="mt-1 text-base leading-none font-semibold tracking-tight sm:text-lg">
              {formatPct(site.uptime24hPct)}
            </dd>
          </div>
        </dl>
      </div>

      <UptimeBar days={site.daily} className="mt-4" />
    </li>
  )
}
