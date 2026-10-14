// Geometry for the response-time strip on the site page. The SVG uses a
// fixed viewBox stretched over its box (preserveAspectRatio="none", strokes
// with vector-effect="non-scaling-stroke"), so x and y here are viewBox
// units. Text never goes in the stretched SVG: callers place it in HTML at
// the same position as a percentage (x / VIEW_W, y / VIEW_H).
import type { RangeKey, SeriesPoint } from "@/lib/api"

export const VIEW_W = 1000
export const VIEW_H = 100
// Headroom so the slowest beat isn't cut off at the top edge.
const TOP_PAD = 6

// --------------------------------------------------------------- y scale

// The scale tops out at the first of these above the slowest p95, so one
// 20 s outlier doesn't flatten a normal day into the baseline.
const DOMAIN_STEPS = [1000, 2000, 5000, 10_000, 30_000, 60_000]

// Guide lines on the latency axis.
const CALIBRATION_MS = [100, 500, 1000, 5000, 10_000, 30_000]
// Marks closer than this (viewBox units) to the one above, or to the
// baseline, are dropped so their labels don't overlap.
const MIN_MARK_GAP = 9

export function latencyDomain(points: SeriesPoint[]) {
  let max = 0
  for (const p of points) max = Math.max(max, p.p95Ms ?? 0, p.avgMs ?? 0)
  return DOMAIN_STEPS.find((d) => d >= max) ?? Math.ceil(max / 10_000) * 10_000
}

// Square-root scale, as on the dashboard traces: 100 ms and 1 s look
// clearly different and a slow answer still fits.
export function yFor(ms: number, domainMs: number) {
  const f = Math.sqrt(Math.min(Math.max(ms, 0), domainMs) / domainMs)
  return VIEW_H - f * (VIEW_H - TOP_PAD)
}

export function formatMark(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${ms / 1000} s`
}

// A linear axis for a few latencies side by side (the per-region bars): the
// first round number at or above the slowest, with a label at the top, the
// middle and zero.
const NICE_TOPS_MS = [100, 200, 300, 500, 1000, 2000, 3000, 5000, 10_000, 20_000, 30_000, 60_000]

export function latencyScale(maxMs: number) {
  const top = NICE_TOPS_MS.find((t) => t >= maxMs) ?? Math.ceil(maxMs / 60_000) * 60_000
  return { top, ticks: [formatMark(top), formatMark(top / 2), "0"] }
}

export function calibrationMarks(domainMs: number) {
  const wanted = CALIBRATION_MS.filter((ms) => ms < domainMs)
  wanted.push(domainMs) // the top of the scale is always labelled
  const marks: { ms: number; y: number; label: string }[] = []
  // From the top down, so the larger (more telling) marks win a tie.
  for (const ms of wanted.reverse()) {
    const y = yFor(ms, domainMs)
    const above = marks[marks.length - 1]
    if (above && y - above.y < MIN_MARK_GAP) continue
    if (VIEW_H - y < MIN_MARK_GAP) continue
    marks.push({ ms, y, label: formatMark(ms) })
  }
  return marks
}

// --------------------------------------------------------------- x scale

const r = (n: number) => Math.round(n * 100) / 100

export function bucketCenter(i: number, n: number) {
  return ((i + 0.5) / n) * VIEW_W
}

// Which bucket a horizontal position (0..1 across the strip) falls in.
export function bucketAt(fraction: number, n: number) {
  return Math.min(n - 1, Math.max(0, Math.floor(fraction * n)))
}

// Runs of consecutive buckets that pass `test`, as [start, end) index pairs.
export function runs(n: number, test: (i: number) => boolean) {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= n; i++) {
    const on = i < n && test(i)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  return out
}

// Flat segments at height `y` covering whole buckets.
export function flatPath(spans: [number, number][], n: number, y: number) {
  const w = VIEW_W / n
  return spans.map(([a, b]) => `M${r(a * w)} ${r(y)} L${r(b * w)} ${r(y)}`).join(" ")
}

// A trace through bucket centres, broken where a bucket has no value. Each
// run reaches out to its buckets' outer edges, so a lone bucket still draws.
export function tracePath(values: (number | null)[], domainMs: number) {
  const n = values.length
  const w = VIEW_W / n
  const parts: string[] = []
  values.forEach((v, i) => {
    if (v === null) return
    const y = r(yFor(v, domainMs))
    const startsRun = i === 0 || values[i - 1] === null
    const endsRun = i === n - 1 || values[i + 1] === null
    if (startsRun) parts.push(`M${r(i * w)} ${y}`)
    parts.push(`L${r((i + 0.5) * w)} ${y}`)
    if (endsRun) parts.push(`L${r((i + 1) * w)} ${y}`)
  })
  return parts.join(" ")
}

// The same runs as tracePath, closed down to the baseline: the soft fill
// under the average line.
export function areaPath(values: (number | null)[], domainMs: number) {
  const n = values.length
  const w = VIEW_W / n
  const parts: string[] = []
  let start = 0
  values.forEach((v, i) => {
    if (v === null) return
    const y = r(yFor(v, domainMs))
    const startsRun = i === 0 || values[i - 1] === null
    const endsRun = i === n - 1 || values[i + 1] === null
    if (startsRun) {
      start = i
      parts.push(`M${r(i * w)} ${VIEW_H} L${r(i * w)} ${y}`)
    }
    parts.push(`L${r((i + 0.5) * w)} ${y}`)
    if (endsRun) parts.push(`L${r((i + 1) * w)} ${y} L${r((i + 1) * w)} ${VIEW_H} L${r(start * w)} ${VIEW_H} Z`)
  })
  return parts.join(" ")
}

// Buckets with a value but none on either side: a lone reading that would
// only be a short dash on a long strip, so the chart also marks it with a dot.
export function loneBuckets(values: (number | null)[]) {
  return values.flatMap((v, i) =>
    v !== null && (values[i - 1] ?? null) === null && (values[i + 1] ?? null) === null ? [i] : []
  )
}

// ------------------------------------------------------------- time axis

export type TimeTick = {
  t: number
  // 0..1 across the strip
  x: number
  label: string
  // left out on narrow screens
  minor: boolean
}

const hourMinute = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
const dayMonth = (d: Date) =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "short" })

// Ticks on round local times: every 10 min (1h), 3 h (24h), day (7d), 5th
// day of the month (30d) or 1st and 15th (90d). Ticks too close to an edge
// to centre their label are dropped.
export function timeTicks(fromMs: number, toMs: number, range: RangeKey): TimeTick[] {
  const span = toMs - fromMs
  const ticks: TimeTick[] = []
  const push = (d: Date, label: string, minor: boolean) => {
    const x = (d.getTime() - fromMs) / span
    if (x >= 0.04 && x <= 0.96) ticks.push({ t: d.getTime(), x, label, minor })
  }

  if (range === "1h" || range === "24h") {
    const stepMin = range === "1h" ? 10 : 180
    const majorMin = stepMin * 2
    const d = new Date(fromMs)
    const minutes = d.getHours() * 60 + d.getMinutes()
    d.setHours(0, Math.ceil(minutes / stepMin) * stepMin, 0, 0)
    for (; d.getTime() < toMs; d.setMinutes(d.getMinutes() + stepMin)) {
      const m = d.getHours() * 60 + d.getMinutes()
      // Midnight on the 24 h strip shows the date it starts.
      const label = range === "24h" && m === 0 ? dayMonth(d) : hourMinute(d)
      push(new Date(d), label, m % majorMin !== 0)
    }
    return ticks
  }

  const d = new Date(fromMs)
  d.setHours(24, 0, 0, 0) // next local midnight
  let i = 0
  for (; d.getTime() < toMs; d.setDate(d.getDate() + 1)) {
    const date = d.getDate()
    if (range === "7d") push(new Date(d), dayMonth(d), i++ % 2 === 1)
    else if (range === "30d" && date % 5 === 1 && date < 31) push(new Date(d), dayMonth(d), date % 10 === 6)
    else if (range === "90d" && (date === 1 || date === 15)) push(new Date(d), dayMonth(d), date === 15)
  }
  return ticks
}

// "14:00–14:10", or "12 Oct 08:00–12:00" when the bucket isn't on the same
// day as the end of the strip (today, for a live range).
export function bucketSpan(startIso: string, stepSeconds: number, stripEndMs: number) {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + stepSeconds * 1000)
  const today = new Date(stripEndMs - 1).toDateString()
  const date = start.toDateString() === today ? "" : `${dayMonth(start)} `
  return `${date}${hourMinute(start)}–${hourMinute(end)}`
}

// ---------------------------------------------------------------- reading

export type BucketKind = "empty" | "down" | "partial" | "up"

export function bucketKind(p: Pick<SeriesPoint, "up" | "down">): BucketKind {
  if (p.up + p.down === 0) return "empty"
  if (p.up === 0) return "down"
  return p.down > 0 ? "partial" : "up"
}
