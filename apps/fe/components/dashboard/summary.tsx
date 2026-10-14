import type { Website } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { siteStatus } from "@/lib/site"
import { clockTime, timeAgo, toMillis } from "@/lib/time"

function headline(sites: Website[] | undefined, failed: boolean) {
  if (!sites) return failed ? "No reading yet" : "Reading your sites…"
  if (sites.length === 0) return "Nothing on watch yet"
  const active = sites.filter((s) => !s.paused)
  if (active.length === 0) {
    return sites.length === 1 ? "Your only site is paused" : `All ${sites.length} sites paused`
  }
  const up = active.filter((s) => siteStatus(s) === "Up").length
  return `${up} of ${active.length} answering`
}

// "7 of 8 answering" plus what's wrong and how fresh the numbers are. Only
// the headline and the outage count are announced; the clocks tick every few
// seconds and would make a screen reader chatter.
export function Summary({
  sites,
  failed,
  updatedAt,
  now,
}: {
  sites: Website[] | undefined
  // the first load failed (the error banner explains)
  failed: boolean
  updatedAt: number | null
  now: number
}) {
  const down = sites?.filter((s) => siteStatus(s) === "Down").length ?? 0
  const paused = sites?.filter((s) => s.paused).length ?? 0
  const latestCheck = sites
    ?.map((s) => s.ticks[0]?.createdAt)
    .filter((t): t is string => !!t)
    .sort((a, b) => (toMillis(b) ?? 0) - (toMillis(a) ?? 0))[0]
  const updatedIso = updatedAt ? new Date(updatedAt).toISOString() : undefined

  return (
    <div className="min-w-0">
      <div aria-live="polite" aria-atomic="true">
        <p className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {headline(sites, failed)}
        </p>
        {down > 0 && (
          <p className="sr-only">{formatCount(down, "site is", "sites are")} not answering.</p>
        )}
      </div>
      {/* Sentence case whichever part comes first. */}
      <p className="mt-1.5 text-sm text-muted-foreground first-letter:uppercase">
        {down > 0 && (
          <span aria-hidden="true" className="font-semibold text-critical">
            {down} not answering ·{" "}
          </span>
        )}
        {paused > 0 && sites!.length > paused && <span>{paused} paused · </span>}
        <span title={latestCheck ? clockTime(latestCheck) : undefined}>
          {latestCheck
            ? `latest check ${timeAgo(latestCheck, now)}`
            : sites?.length
              ? "waiting for the first checks"
              : sites
                ? "add a URL to start"
                : "loading your sites"}
        </span>
        {updatedIso && (
          <span title={clockTime(updatedIso)}> · updated {timeAgo(updatedIso, now)}</span>
        )}
      </p>
    </div>
  )
}
