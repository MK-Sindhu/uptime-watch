// Dashboard view: search, filter and sort. Pure functions, so the page, the
// toolbar and the URL all agree on what is shown.
import type { Website } from "@/lib/api"
import { SEVERITY, displayName, siteStatus } from "@/lib/site"

export type Filter = "all" | "down" | "paused"
export type Sort = "status" | "name" | "latency" | "uptime"
export type View = { q: string; filter: Filter; sort: Sort }

export const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "down", label: "Down" },
  { value: "paused", label: "Paused" },
]

export const SORTS: { value: Sort; label: string; hint: string }[] = [
  { value: "status", label: "Status", hint: "down first" },
  { value: "name", label: "Name", hint: "A to Z" },
  { value: "latency", label: "Response time", hint: "slowest first" },
  { value: "uptime", label: "24 h uptime", hint: "lowest first" },
]

export function parseFilter(value: string | null): Filter {
  return FILTERS.some((f) => f.value === value) ? (value as Filter) : "all"
}

export function parseSort(value: string | null): Sort {
  return SORTS.some((s) => s.value === value) ? (value as Sort) : "status"
}

// Only non-default values go in the URL, so a plain /dashboard stays plain.
export function viewQuery(view: View) {
  const params = new URLSearchParams()
  if (view.q.trim()) params.set("q", view.q)
  if (view.filter !== "all") params.set("filter", view.filter)
  if (view.sort !== "status") params.set("sort", view.sort)
  return params.toString()
}

// Response time of the newest check, when it answered.
export function latestMs(site: Website) {
  const t = site.ticks[0]
  return t?.status === "Up" ? t.response_time_ms : null
}

function matchesFilter(site: Website, filter: Filter) {
  if (filter === "down") return siteStatus(site) === "Down"
  if (filter === "paused") return site.paused
  return true
}

function matchesQuery(site: Website, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return `${site.name ?? ""} ${site.url}`.toLowerCase().includes(needle)
}

const byName = (a: Website, b: Website) =>
  displayName(a).localeCompare(displayName(b), undefined, {
    numeric: true,
    sensitivity: "base",
  })

// Missing values (no checks yet) always sink to the bottom.
function nullsLast(a: number | null, b: number | null) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return null
}

const COMPARE: Record<Sort, (a: Website, b: Website) => number> = {
  status: (a, b) =>
    SEVERITY[siteStatus(a)] - SEVERITY[siteStatus(b)] || byName(a, b),
  name: byName,
  latency: (a, b) => {
    const x = latestMs(a)
    const y = latestMs(b)
    return nullsLast(x, y) ?? (y! - x! || byName(a, b))
  },
  uptime: (a, b) => {
    const x = a.stats24h.uptimePct
    const y = b.stats24h.uptimePct
    return nullsLast(x, y) ?? (x! - y! || byName(a, b))
  },
}

export function applyView(sites: Website[], view: View) {
  return sites
    .filter((s) => matchesFilter(s, view.filter) && matchesQuery(s, view.q))
    .sort(COMPARE[view.sort])
}

export function filterCounts(sites: Website[]): Record<Filter, number> {
  return {
    all: sites.length,
    down: sites.filter((s) => siteStatus(s) === "Down").length,
    paused: sites.filter((s) => s.paused).length,
  }
}
