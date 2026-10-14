// Numbers the dashboard's health sidebar derives from getFleet("24h") and
// the polled site list. Pure functions; components only format them.
import { regionLabel } from "@/components/dashboard/region-dots"
import { toneOfLatency, toneOfUptime, type Tone } from "@/components/glass/tone"
import type { Fleet, FleetSite, FlowLink, Website } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { downSince, hostOf, siteStatus } from "@/lib/site"
import { toMillis } from "@/lib/time"

// "www.github.com" -> "github.com"; a site's own name wins.
export function siteLabel(site: Pick<Website, "name" | "url">) {
  return site.name || hostOf(site.url).replace(/^www\./, "")
}

// Short enough for a bar label: "www.cloudflare.com" -> "cloudflare".
export function shortLabel(site: Pick<Website, "name" | "url">) {
  if (site.name) return site.name
  const host = hostOf(site.url).replace(/^www\./, "")
  const parts = host.split(".")
  return parts.length > 1 ? parts.slice(0, -1).join(".") : host
}

// "down for 4 min"; "5+ min" when every check we have failed, so the outage
// began before the oldest one.
export function downFor(site: Website, now: number) {
  const since = downSince(site.ticks)
  const at = since && toMillis(since.at)
  if (!since || at === null) return null
  const duration = formatDuration(now - at)
  return since.complete ? duration : duration.replace(/(\d+)(?!.*\d)/, "$1+")
}

// The top of a chart axis: the first "nice" value above the data.
export function niceCeil(value: number, steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
  if (!(value > 0)) return 1
  const mag = 10 ** Math.floor(Math.log10(value))
  for (const s of steps) if (s * mag >= value) return s * mag
  return 10 * mag
}

export type RegionStats = {
  id: string
  name: string
  checks: number
  fast: number
  normal: number
  slow: number
  down: number
  unknown: number
}

export function regionStats(flow: FlowLink[], regions: Fleet["regions"]): RegionStats[] {
  const names = new Map(regions.map((r) => [r.id, regionLabel(r.name)]))
  const out = new Map<string, RegionStats>()
  for (const l of flow) {
    const r =
      out.get(l.regionId) ??
      {
        id: l.regionId,
        name: names.get(l.regionId) ?? "Unknown region",
        checks: 0,
        fast: 0,
        normal: 0,
        slow: 0,
        down: 0,
        unknown: 0,
      }
    r.checks += l.checks
    r[l.outcome] += l.checks
    out.set(l.regionId, r)
  }
  return [...out.values()].sort((a, b) => b.checks - a.checks || a.name.localeCompare(b.name))
}

// Tone of a region: any failed checks (1% or more) is critical; lots of
// slow ones high.
export function toneOfRegion(r: RegionStats): Tone {
  if (r.checks === 0) return "info"
  if (r.down / r.checks >= 0.01) return "critical"
  if ((r.slow + r.down) / r.checks >= 0.1) return "high"
  if (r.slow + r.down > 0) return "warning"
  return "stable"
}

// A site is slow when half its checks took a second or more.
export const SLOW_P50_MS = 1000

export type Joined = { site: Website; stats: FleetSite | undefined }

// Each listed site with its 24 h fleet numbers.
export function joinSites(sites: Website[], fleet: Fleet | undefined): Joined[] {
  const stats = new Map(fleet?.sites.map((s) => [s.websiteId, s]))
  return sites.map((site) => ({ site, stats: stats.get(site.id) }))
}

export function p50Of({ site, stats }: Joined) {
  return stats?.latency.p50Ms ?? site.stats24h.p50Ms
}

const SEVERITY: Record<Tone, number> = {
  critical: 0,
  high: 1,
  warning: 2,
  info: 3,
  glow: 3,
  stable: 4,
}

export function worstTone(tones: Tone[]): Tone {
  return tones.reduce<Tone>((w, t) => (SEVERITY[t] < SEVERITY[w] ? t : w), "stable")
}

export function isWorse(a: Tone, b: Tone) {
  return SEVERITY[a] < SEVERITY[b]
}

// Bar tone for a site's response time: a down or failing site is critical
// whatever its speed.
export function siteBarTone(j: Joined, fastMs: number, slowMs: number): Tone {
  if (siteStatus(j.site) === "Down") return "critical"
  const uptime = j.stats?.uptimePct ?? j.site.stats24h.uptimePct
  if (toneOfUptime(uptime) === "critical") return "critical"
  return toneOfLatency(p50Of(j), fastMs, slowMs)
}

// Where a 24 h series starts having data. A fleet that began watching an
// hour ago would otherwise draw one short stroke at the far right, so charts
// start at the current run of data: walking back from the newest point, a
// gap longer than `maxGap` buckets ends the run (a stray old check doesn't
// stretch the axis). At least `min` points are always shown.
export function dataStart(values: (number | null)[], { min = 12, maxGap = 18 } = {}) {
  let start = -1
  for (let i = values.length - 1, gap = 0; i >= 0; i--) {
    if (values[i] === null) {
      if (start !== -1 && ++gap > maxGap) break
      continue
    }
    start = i
    gap = 0
  }
  if (start === -1) return 0
  return Math.max(0, Math.min(start, values.length - min))
}

// "20 h", "40 min": a rounded span for chart titles.
export function roughSpan(ms: number) {
  const min = Math.round(ms / 60_000)
  return min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`
}
