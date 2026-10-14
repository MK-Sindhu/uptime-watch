// Site-level helpers shared by the dashboard, the detail page and the
// command palette.
import type { Tick, TickStatus, Website, WebsiteDetail } from "@/lib/api"

export type SiteStatus = TickStatus | "Waiting" | "Paused"

// Lower = more urgent; the dashboard sorts by this first.
export const SEVERITY: Record<SiteStatus, number> = {
  Down: 0,
  Unknown: 1,
  Waiting: 2,
  Up: 3,
  Paused: 4,
}

export function siteStatus(site: Pick<Website, "paused" | "ticks">): SiteStatus {
  if (site.paused) return "Paused"
  return site.ticks[0]?.status ?? "Waiting"
}

export function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// What to call a site: its name, else its host + path ("example.com/shop").
export function displayName(site: Pick<WebsiteDetail, "name" | "url">) {
  if (site.name) return site.name
  return site.url.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

export const BAD_URL_MESSAGE =
  "Enter a full http:// or https:// address, like https://example.com."

// "example.com" -> "https://example.com/". Addresses with any other scheme
// (ftp:, file:, javascript:) are rejected, not given an https:// prefix.
export function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^:/]+:\d/.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return url.hostname ? url.toString() : null
  } catch {
    return null
  }
}

// When the current run of failed checks began, from the newest-first ticks.
// `complete` is false when every tick we have is Down (it began even earlier).
export function downSince(ticks: Tick[]): { at: string; complete: boolean } | null {
  if (ticks[0]?.status !== "Down") return null
  let i = 0
  while (i + 1 < ticks.length && ticks[i + 1]!.status === "Down") i++
  return { at: ticks[i]!.createdAt, complete: i + 1 < ticks.length }
}

// Newest tick per region, from newest-first ticks.
export function latestByRegion(ticks: Tick[]) {
  const out = new Map<string, Tick>()
  for (const t of ticks) if (!out.has(t.region_id)) out.set(t.region_id, t)
  return out
}
