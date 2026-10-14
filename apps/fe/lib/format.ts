// Number and time formatting. Numbers go in mono with units: "312 ms",
// "99.97%", "4 min".

// Fixed locale for anything that can be rendered on the server (the public
// status page): server and browser must produce the same text, or React
// reports a hydration mismatch. en-GB gives "14 Oct" and "1,234".
const LOCALE = "en-GB"

export function formatMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—"
  if (ms >= 10_000) return `${(ms / 1000).toFixed(0)} s`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.round(ms)} ms`
}

// 100 stays "100%"; anything below keeps enough digits to show it isn't 100.
export function formatPct(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "—"
  if (pct >= 100) return "100%"
  if (pct >= 99.995) return "99.99%"
  if (pct >= 99) return `${(Math.floor(pct * 100) / 100).toFixed(2)}%`
  return `${pct.toFixed(1)}%`
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 24) return rest ? `${h} h ${rest} min` : `${h} h`
  const d = Math.floor(h / 24)
  const restH = h % 24
  return restH ? `${d} d ${restH} h` : `${d} d`
}

// "12 Oct" from "2026-10-12" (a calendar day, not an instant)
export function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

export function formatTime(iso: string, withDate = false) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    ...(withDate ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatCount(n: number, one: string, many: string) {
  return `${n.toLocaleString(LOCALE)} ${n === 1 ? one : many}`
}
