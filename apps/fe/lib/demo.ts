// TEMP demo data, for showing the frontend without a backend (e.g. on Vercel).
//
// Signing in as demo / demo1234 when no API answers switches lib/api.ts to
// the functions below, and /status/demo falls back to them (lib/api-server.ts).
// When an API is running, the real demo account is used instead.
//
// Ten popular sites, checked every 30 s from two regions. Outages and
// response times come from a seeded hash of the site and the time, so every
// view (charts, incidents, daily bars, the status page) agrees, and a reload
// shows the same history. Nothing here is real monitoring data.
//
// Remove this file and its uses in lib/api.ts, lib/api-server.ts,
// components/auth-panel.tsx and components/dashboard/header.tsx when the
// demo is over.

import type {
  DailyUptime,
  DailyUptimeDay,
  Fleet,
  FleetPoint,
  FleetSite,
  FlowLink,
  Incident,
  IncidentList,
  Latency,
  Overview,
  PublicStatus,
  Region,
  RegionOverview,
  Series,
  SeriesPoint,
  StatusPageSettings,
  Tick,
  Website,
  WebsiteDetail,
  WebsitePatch,
} from "api-client"

export const DEMO_USERNAME = "demo"
export const DEMO_PASSWORD = "demo1234"
// Stored in place of a JWT while signed in to the demo.
export const DEMO_TOKEN = "demo-session"
export const DEMO_SLUG = "demo"
const DEMO_USER_ID = "demo-user"
const STATUS_TITLE = "Demo status"
const MAX_SITES = 20

type RangeKey = Overview["range"]
type Status = Tick["status"]

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const CHECK_INTERVAL_SECONDS = 30
const CHECK_MS = CHECK_INTERVAL_SECONDS * 1000
// Same bands as the API's check-flow diagram (packages/timeseries).
const FAST_MS = 300
const SLOW_MS = 1000

export const DEMO_REGIONS: Region[] = [
  { id: "region1", name: "region1" },
  { id: "region2", name: "region2" },
]
// Each region's check lands a few seconds into the 30 s round.
const REGION_OFFSET_MS = [2_000, 9_000]
const REGION_INDEXES = [0, 1]

// Same windows as the API's rangeWindow(): 1h/24h read every check,
// longer ranges an hourly summary.
const RANGES: Record<RangeKey, { seconds: number; step: number; raw: boolean }> = {
  "1h": { seconds: 3_600, step: 60, raw: true },
  "24h": { seconds: 86_400, step: 600, raw: true },
  "7d": { seconds: 7 * 86_400, step: 3_600, raw: false },
  "30d": { seconds: 30 * 86_400, step: 14_400, raw: false },
  "90d": { seconds: 90 * 86_400, step: 43_200, raw: false },
}

function rangeWindow(range: RangeKey, now: number) {
  const { seconds, step, raw } = RANGES[range]
  const stepMs = step * 1000
  const to = Math.floor(now / stepMs) * stepMs + stepMs
  return { from: to - seconds * 1000, to, stepMs, step, raw }
}

// ------------------------------------------------------------------ sites

export type DemoSite = {
  id: string
  url: string
  name: string | null
  paused: boolean
  public: boolean
  addedAt: number
  // Typical response time from region1 (ms); region2 is `far` times slower.
  ms: number
  far: number
  // Each window of `outageEveryHours` has an outage with this chance,
  // lasting between the two minute counts.
  outageEveryHours: number
  outageChance: number
  outageMinutes: [number, number]
}

const ADDED_AT = Date.UTC(2026, 5, 1)

function popular(
  id: string,
  url: string,
  name: string,
  ms: number,
  far: number,
  outageEveryHours: number,
  outageChance: number,
  outageMinutes: [number, number]
): DemoSite {
  return {
    id: `demo-${id}`,
    url,
    name,
    paused: false,
    public: true,
    addedAt: ADDED_AT,
    ms,
    far,
    outageEveryHours,
    outageChance,
    outageMinutes,
  }
}

function defaultSites(): DemoSite[] {
  return [
    popular("google", "https://www.google.com", "Google", 90, 1.5, 240, 0.4, [1, 3]),
    popular("youtube", "https://www.youtube.com", "YouTube", 170, 1.4, 200, 0.4, [1, 5]),
    popular("github", "https://github.com", "GitHub", 230, 1.6, 72, 0.5, [2, 18]),
    popular("wikipedia", "https://www.wikipedia.org", "Wikipedia", 140, 1.7, 168, 0.35, [1, 6]),
    popular("amazon", "https://www.amazon.com", "Amazon", 380, 1.3, 360, 0.5, [4, 40]),
    popular("netflix", "https://www.netflix.com", "Netflix", 290, 1.35, 240, 0.4, [2, 10]),
    popular("reddit", "https://www.reddit.com", "Reddit", 640, 1.3, 24, 0.4, [1, 12]),
    popular("stackoverflow", "https://stackoverflow.com", "Stack Overflow", 250, 1.5, 120, 0.4, [1, 8]),
    popular("cloudflare", "https://www.cloudflare.com", "Cloudflare", 65, 1.4, 480, 0.3, [1, 3]),
    popular("spotify", "https://open.spotify.com", "Spotify", 330, 1.45, 168, 0.4, [2, 9]),
  ]
}

// ------------------------------------------------------------- randomness

function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const seeds = new Map<string, number>()
function seedOf(site: DemoSite) {
  let seed = seeds.get(site.id)
  if (seed === undefined) {
    seed = hashString(site.id)
    seeds.set(site.id, seed)
  }
  return seed
}

// A number in [0, 1) that depends only on its inputs.
function rnd(seed: number, a: number, b = 0, c = 0) {
  let h = seed >>> 0
  for (const x of [a, b, c]) {
    h = Math.imul(h ^ (x >>> 0), 0x9e3779b1)
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return (h >>> 0) / 4294967296
}

// ---------------------------------------------------------------- outages

type Outage = { s: number; e: number; regions: number[] }

function outageInSlot(site: DemoSite, slot: number): Outage | null {
  const seed = seedOf(site)
  if (rnd(seed, slot, 1) >= site.outageChance) return null
  const slotMs = site.outageEveryHours * HOUR
  const [minM, maxM] = site.outageMinutes
  const minutes = minM + (maxM - minM) * rnd(seed, slot, 2)
  const len = Math.max(1, Math.round((minutes * MINUTE) / CHECK_MS)) * CHECK_MS
  const room = Math.max(0, slotMs - len)
  const s = slot * slotMs + Math.floor((room * rnd(seed, slot, 3)) / CHECK_MS) * CHECK_MS
  if (s < site.addedAt) return null
  // Most outages are seen everywhere; some only from one region.
  const pick = rnd(seed, slot, 4)
  const regions = pick < 0.55 ? [0, 1] : pick < 0.8 ? [0] : [1]
  return { s, e: s + len, regions }
}

// Outages overlapping [a, b), oldest first.
function outagesBetween(site: DemoSite, a: number, b: number): Outage[] {
  const slotMs = site.outageEveryHours * HOUR
  const out: Outage[] = []
  for (let slot = Math.floor(a / slotMs); slot <= Math.floor((b - 1) / slotMs); slot++) {
    const o = outageInSlot(site, slot)
    if (o && o.e > a && o.s < b) out.push(o)
  }
  return out
}

function isDownAt(site: DemoSite, r: number, t: number) {
  const o = outageInSlot(site, Math.floor(t / (site.outageEveryHours * HOUR)))
  return !!o && o.regions.includes(r) && t >= o.s && t < o.e
}

// ----------------------------------------------------------------- checks

const checkTime = (r: number, k: number) => k * CHECK_MS + REGION_OFFSET_MS[r]!
// First check index of region r at or after t.
const firstCheck = (r: number, t: number) => Math.ceil((t - REGION_OFFSET_MS[r]!) / CHECK_MS)

// Checks region r ran in [a, b).
function countChecks(r: number, a: number, b: number) {
  return b > a ? Math.max(0, firstCheck(r, b) - firstCheck(r, a)) : 0
}

// Checks only exist between the site being added and now.
function live(site: DemoSite, a: number, b: number, now: number): [number, number] {
  return [Math.max(a, site.addedAt), Math.min(b, now + 1)]
}

// Usual response time at t: a daily cycle and a slow drift.
function baseLatency(site: DemoSite, r: number, t: number) {
  const seed = seedOf(site)
  const phase = rnd(seed, 7) * Math.PI * 2
  const hours = t / HOUR
  const daily = 1 + 0.16 * Math.sin((Math.PI * 2 * hours) / 24 + phase)
  const drift = 1 + 0.08 * Math.sin(hours / 53 + phase * 2)
  return site.ms * daily * drift * (r === 1 ? site.far : 1)
}

// One check's response time: +-20% jitter and the odd slow answer.
function checkMs(site: DemoSite, r: number, k: number, base: number, down: boolean) {
  const seed = seedOf(site)
  if (down) return Math.round(10_000 * (0.4 + 0.6 * rnd(seed, k, r, 11)))
  let f = 0.8 + 0.4 * rnd(seed, k, r, 12)
  if (rnd(seed, k, r, 13) < 0.03) f *= 2 + 2 * rnd(seed, k, r, 14)
  return Math.round(base * f)
}

type Check = { r: number; k: number; t: number; status: Status; ms: number }

// Every check region r ran in [a, b), oldest first.
function eachCheck(site: DemoSite, r: number, a: number, b: number, now: number, fn: (c: Check) => void) {
  const [lo, hi] = live(site, a, b, now)
  if (hi <= lo) return
  const outages = outagesBetween(site, lo, hi).filter((o) => o.regions.includes(r))
  let oi = 0
  let baseAt = -Infinity
  let base = 0
  for (let k = firstCheck(r, lo); ; k++) {
    const t = checkTime(r, k)
    if (t >= hi) break
    while (oi < outages.length && outages[oi]!.e <= t) oi++
    const down = oi < outages.length && t >= outages[oi]!.s
    // The usual latency changes slowly: recompute it every 10 minutes.
    if (t - baseAt >= 10 * MINUTE) {
      baseAt = t
      base = baseLatency(site, r, t)
    }
    fn({ r, k, t, status: down ? "Down" : "Up", ms: checkMs(site, r, k, base, down) })
  }
}

function lastCheck(site: DemoSite, r: number, now: number): Check | null {
  const k = Math.floor((now - REGION_OFFSET_MS[r]!) / CHECK_MS)
  const t = checkTime(r, k)
  if (t < site.addedAt) return null
  const down = isDownAt(site, r, t)
  return { r, k, t, status: down ? "Down" : "Up", ms: checkMs(site, r, k, baseLatency(site, r, t), down) }
}

// Up and Down checks of region r in [a, b), without running them.
function counts(site: DemoSite, r: number, a: number, b: number, now: number, outages: Outage[]) {
  const [lo, hi] = live(site, a, b, now)
  const total = countChecks(r, lo, hi)
  let down = 0
  for (const o of outages) {
    if (o.regions.includes(r)) down += countChecks(r, Math.max(lo, o.s), Math.min(hi, o.e))
  }
  return { up: total - down, down }
}

// ---------------------------------------------------------------- latency

const NO_LATENCY: Latency = { avgMs: null, p50Ms: null, p95Ms: null, maxMs: null }
const uptimePct = (up: number, down: number) => (up + down === 0 ? null : (up / (up + down)) * 100)

function quantile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))]!
}

// From the Up checks' response times.
function latencyOf(values: number[]): Latency {
  if (values.length === 0) return NO_LATENCY
  const sorted = values.slice().sort((x, y) => x - y)
  const sum = sorted.reduce((n, v) => n + v, 0)
  return {
    avgMs: Math.round(sum / sorted.length),
    p50Ms: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1]!,
  }
}

// Long windows: estimated from the usual latency once an hour, like the
// API reads its hourly summary instead of every check.
function estimateLatency(site: DemoSite, regions: number[], a: number, b: number, now: number): Latency {
  const [lo, hi] = live(site, a, b, now)
  if (hi <= lo) return NO_LATENCY
  const samples: number[] = []
  for (const r of regions) {
    for (let t = lo + HOUR / 2; t < hi; t += HOUR) samples.push(baseLatency(site, r, t))
    if (hi - lo < HOUR) samples.push(baseLatency(site, r, (lo + hi) / 2))
  }
  const sorted = samples.sort((x, y) => x - y)
  const mean = sorted.reduce((n, v) => n + v, 0) / sorted.length
  return {
    avgMs: Math.round(mean * 1.06),
    p50Ms: Math.round(mean),
    p95Ms: Math.round(quantile(sorted, 0.95) * 1.19),
    maxMs: Math.round(sorted[sorted.length - 1]! * (3.2 + rnd(seedOf(site), Math.floor(lo / HOUR), 15))),
  }
}

// --------------------------------------------------------------- websites

function websiteFor(site: DemoSite, now: number): Website {
  const ticks: Tick[] = []
  for (const r of REGION_INDEXES) {
    const last = lastCheck(site, r, now)
    if (!last) continue
    for (let k = last.k; k > last.k - 30; k--) {
      const t = checkTime(r, k)
      if (t < site.addedAt) break
      const down = isDownAt(site, r, t)
      ticks.push({
        id: `${site.id}-${r}-${k}`,
        website_id: site.id,
        region_id: DEMO_REGIONS[r]!.id,
        status: down ? "Down" : "Up",
        response_time_ms: checkMs(site, r, k, baseLatency(site, r, t), down),
        createdAt: new Date(t).toISOString(),
      })
    }
  }
  ticks.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))

  let up = 0
  let down = 0
  const values: number[] = []
  for (const r of REGION_INDEXES) {
    eachCheck(site, r, now - DAY, now + 1, now, (c) => {
      if (c.status === "Up") {
        up++
        values.push(c.ms)
      } else down++
    })
  }
  return {
    ...detailFor(site),
    stats24h: { up, down, uptimePct: uptimePct(up, down), p50Ms: latencyOf(values).p50Ms },
    ticks: ticks.slice(0, 30),
  }
}

function detailFor(site: DemoSite): WebsiteDetail {
  return {
    id: site.id,
    url: site.url,
    user_id: DEMO_USER_ID,
    name: site.name,
    paused: site.paused,
    public: site.public,
    time_added: new Date(site.addedAt).toISOString(),
  }
}

// ----------------------------------------------------------------- charts

function overviewFor(site: DemoSite, range: RangeKey, now: number): Overview {
  const w = rangeWindow(range, now)
  const outages = w.raw ? [] : outagesBetween(site, w.from, w.to)
  const all: number[] = []
  const regions: RegionOverview[] = []
  let newest: Check | null = null
  let up = 0
  let down = 0

  for (const r of REGION_INDEXES) {
    let ru = 0
    let rd = 0
    let latency: Latency
    let last: Check | null = null
    if (w.raw) {
      const values: number[] = []
      eachCheck(site, r, w.from, w.to, now, (c) => {
        last = c
        if (c.status === "Up") {
          ru++
          values.push(c.ms)
        } else rd++
      })
      all.push(...values)
      latency = latencyOf(values)
    } else {
      ;({ up: ru, down: rd } = counts(site, r, w.from, w.to, now, outages))
      latency = ru > 0 ? estimateLatency(site, [r], w.from, w.to, now) : NO_LATENCY
      last = lastCheck(site, r, now)
    }
    if (ru + rd === 0) continue
    up += ru
    down += rd
    const l = last as Check | null
    if (l && (!newest || l.t > newest.t)) newest = l
    regions.push({
      regionId: DEMO_REGIONS[r]!.id,
      name: DEMO_REGIONS[r]!.name,
      up: ru,
      down: rd,
      uptimePct: uptimePct(ru, rd),
      latency,
      lastStatus: l?.status ?? null,
      lastMs: l?.ms ?? null,
      lastAt: l ? new Date(l.t).toISOString() : null,
    })
  }

  const n = newest as Check | null
  return {
    range,
    checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
    from: new Date(w.from).toISOString(),
    to: new Date(w.to).toISOString(),
    up,
    down,
    uptimePct: uptimePct(up, down),
    latency: w.raw ? latencyOf(all) : up > 0 ? estimateLatency(site, REGION_INDEXES, w.from, w.to, now) : NO_LATENCY,
    lastStatus: n?.status ?? null,
    lastAt: n ? new Date(n.t).toISOString() : null,
    regions,
  }
}

function seriesFor(site: DemoSite, range: RangeKey, region: string | null, now: number): Series {
  const w = rangeWindow(range, now)
  const regionIndex = region ? DEMO_REGIONS.findIndex((r) => r.id === region) : -1
  const regions = region ? (regionIndex >= 0 ? [regionIndex] : []) : REGION_INDEXES
  const buckets = Math.round((w.to - w.from) / w.stepMs)
  const points: SeriesPoint[] = []

  if (w.raw) {
    const up = new Array<number>(buckets).fill(0)
    const down = new Array<number>(buckets).fill(0)
    const values: number[][] = Array.from({ length: buckets }, () => [])
    for (const r of regions) {
      eachCheck(site, r, w.from, w.to, now, (c) => {
        const i = Math.floor((c.t - w.from) / w.stepMs)
        if (c.status === "Up") {
          up[i]!++
          values[i]!.push(c.ms)
        } else down[i]!++
      })
    }
    for (let i = 0; i < buckets; i++) {
      points.push({ t: new Date(w.from + i * w.stepMs).toISOString(), up: up[i]!, down: down[i]!, ...latencyOf(values[i]!) })
    }
  } else {
    const outages = outagesBetween(site, w.from, w.to)
    for (let i = 0; i < buckets; i++) {
      const a = w.from + i * w.stepMs
      const b = a + w.stepMs
      let up = 0
      let down = 0
      for (const r of regions) {
        const c = counts(site, r, a, b, now, outages)
        up += c.up
        down += c.down
      }
      points.push({
        t: new Date(a).toISOString(),
        up,
        down,
        ...(up > 0 ? estimateLatency(site, regions, a, b, now) : NO_LATENCY),
      })
    }
  }
  return { range, from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString(), stepSeconds: w.step, region, points }
}

function incidentsBetween(site: DemoSite, from: number, to: number, limit: number, now: number): Incident[] {
  const [lo, hi] = live(site, from, to, now)
  if (hi <= lo) return []
  const list: Incident[] = []
  for (const o of outagesBetween(site, lo, hi)) {
    let start = Infinity
    let end = 0
    let ongoing = false
    let checks = 0
    const seenBy: string[] = []
    for (const r of o.regions) {
      const n = countChecks(r, Math.max(lo, o.s), Math.min(hi, o.e))
      if (n === 0) continue
      checks += n
      seenBy.push(DEMO_REGIONS[r]!.id)
      start = Math.min(start, checkTime(r, firstCheck(r, Math.max(lo, o.s))))
      // Over at the first successful check after the outage.
      const recovered = checkTime(r, firstCheck(r, o.e))
      if (recovered > now) ongoing = true
      else end = Math.max(end, recovered)
    }
    if (checks === 0) continue
    list.push({
      id: String(start),
      startedAt: new Date(start).toISOString(),
      endedAt: ongoing ? null : new Date(end).toISOString(),
      durationMs: (ongoing ? now : end) - start,
      checks,
      regions: seenBy.sort(),
      ongoing,
    })
  }
  return list.sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt)).slice(0, limit)
}

function incidentsFor(site: DemoSite, range: RangeKey, limit: number, now: number): IncidentList {
  const w = rangeWindow(range, now)
  return {
    range,
    from: new Date(w.from).toISOString(),
    to: new Date(w.to).toISOString(),
    incidents: incidentsBetween(site, w.from, w.to, limit, now),
  }
}

const dayFormats = new Map<string, Intl.DateTimeFormat>()
// "YYYY-MM-DD" of `ms` in `tz`.
function dayIn(tz: string, ms: number) {
  let f = dayFormats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    dayFormats.set(tz, f)
  }
  return f.format(ms)
}

// The last `days` calendar days in `tz`, oldest first, ending today.
function dailyItems(site: DemoSite, days: number, tz: string, now: number): DailyUptimeDay[] {
  const wanted: string[] = []
  for (let i = 0; wanted.length < days && i < days + 3; i++) {
    const d = dayIn(tz, now - i * DAY)
    if (!wanted.includes(d)) wanted.unshift(d)
  }
  const byDay = new Map(wanted.map((d) => [d, { up: 0, down: 0 }]))
  const from = Math.floor((now - (days + 1) * DAY) / HOUR) * HOUR
  const outages = outagesBetween(site, from, now + 1)
  for (let h = from; h <= now; h += HOUR) {
    const day = byDay.get(dayIn(tz, h))
    if (!day) continue
    for (const r of REGION_INDEXES) {
      const c = counts(site, r, h, h + HOUR, now, outages)
      day.up += c.up
      day.down += c.down
    }
  }
  return wanted.map((day) => {
    const { up, down } = byDay.get(day)!
    return { day, up, down, uptimePct: uptimePct(up, down) }
  })
}

function fleetFor(sites: DemoSite[], range: "1h" | "24h", now: number): Fleet {
  const w = rangeWindow(range, now)
  const buckets = Math.round((w.to - w.from) / w.stepMs)
  const bucketUp = new Array<number>(buckets).fill(0)
  const bucketDown = new Array<number>(buckets).fill(0)
  const bucketValues: number[][] = Array.from({ length: buckets }, () => [])
  const allValues: number[] = []
  const flow = new Map<string, FlowLink>()
  const fleetSites: FleetSite[] = []
  let up = 0
  let down = 0

  for (const site of sites) {
    let su = 0
    let sd = 0
    const values: number[] = []
    for (const r of REGION_INDEXES) {
      eachCheck(site, r, w.from, w.to, now, (c) => {
        const i = Math.floor((c.t - w.from) / w.stepMs)
        let outcome: FlowLink["outcome"]
        if (c.status === "Up") {
          su++
          bucketUp[i]!++
          values.push(c.ms)
          bucketValues[i]!.push(c.ms)
          outcome = c.ms < FAST_MS ? "fast" : c.ms < SLOW_MS ? "normal" : "slow"
        } else {
          sd++
          bucketDown[i]!++
          outcome = "down"
        }
        const key = `${r}|${site.id}|${outcome}`
        const link = flow.get(key)
        if (link) link.checks++
        else flow.set(key, { regionId: DEMO_REGIONS[r]!.id, websiteId: site.id, outcome, checks: 1 })
      })
    }
    if (su + sd === 0) continue
    up += su
    down += sd
    allValues.push(...values)
    fleetSites.push({ websiteId: site.id, up: su, down: sd, uptimePct: uptimePct(su, sd), latency: latencyOf(values) })
  }

  const series: FleetPoint[] = []
  for (let i = 0; i < buckets; i++) {
    const l = latencyOf(bucketValues[i]!)
    series.push({
      t: new Date(w.from + i * w.stepMs).toISOString(),
      up: bucketUp[i]!,
      down: bucketDown[i]!,
      uptimePct: uptimePct(bucketUp[i]!, bucketDown[i]!),
      avgMs: l.avgMs,
      p95Ms: l.p95Ms,
    })
  }

  return {
    range,
    checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
    from: new Date(w.from).toISOString(),
    to: new Date(w.to).toISOString(),
    stepSeconds: w.step,
    health: { up, down, uptimePct: uptimePct(up, down), latency: latencyOf(allValues) },
    series,
    sites: fleetSites,
    flow: [...flow.values()],
    thresholds: { fastMs: FAST_MS, slowMs: SLOW_MS },
    regions: DEMO_REGIONS,
  }
}

// ------------------------------------------------------------ status page

export function demoStatusPageSettings(): StatusPageSettings {
  return { slug: DEMO_SLUG, title: STATUS_TITLE, url: `/status/${DEMO_SLUG}` }
}

// The public page always shows the ten default sites (it is rendered on the
// server, which can't see sites added in a viewer's browser).
export function demoPublicStatus(now = Date.now()): PublicStatus {
  const month = rangeWindow("30d", now)
  const sites = defaultSites()
    .filter((s) => s.public)
    .map((site) => {
      const day = overviewFor(site, "24h", now)
      const daily = dailyItems(site, 90, "UTC", now)
      const up90 = daily.reduce((n, d) => n + d.up, 0)
      const down90 = daily.reduce((n, d) => n + d.down, 0)
      return {
        id: site.id,
        name: site.name,
        url: site.url,
        paused: site.paused,
        status: site.paused ? null : day.lastStatus,
        checkedAt: day.lastAt,
        uptime24hPct: day.uptimePct,
        uptime90dPct: uptimePct(up90, down90),
        daily,
        incidents30d: incidentsBetween(site, month.from, month.to, 20, now),
      }
    })
  return {
    title: STATUS_TITLE,
    slug: DEMO_SLUG,
    generatedAt: new Date(now).toISOString(),
    regionCount: DEMO_REGIONS.length,
    checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
    allUp: sites.every((s) => s.paused || s.status !== "Down"),
    sites,
  }
}

// ---------------------------------------------------- signed-in demo state
// Sites added, renamed, paused or deleted in the demo live in this browser
// tab only (sessionStorage), and reset on sign-out.

const STORE_KEY = "uptime-watch.demo-sites"
let store: DemoSite[] | null = null

function sites(): DemoSite[] {
  if (!store) {
    try {
      const saved = sessionStorage.getItem(STORE_KEY)
      store = saved ? (JSON.parse(saved) as DemoSite[]) : null
    } catch {
      store = null
    }
    store ??= defaultSites()
  }
  return store
}

function save() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {}
}

export function resetDemo() {
  store = null
  try {
    sessionStorage.removeItem(STORE_KEY)
  } catch {}
}

export function isDemoLogin(username: string, password: string) {
  return username.trim() === DEMO_USERNAME && password === DEMO_PASSWORD
}

export const demoSiteCount = () => sites().length
export const findDemoSite = (id: string) => sites().find((s) => s.id === id) ?? null

export function demoWebsites(now = Date.now()) {
  return sites().map((s) => websiteFor(s, now))
}

export function demoWebsiteDetail(site: DemoSite) {
  return detailFor(site)
}

// A new site gets its own made-up speed and outage pattern from its URL.
export function addDemoSite(url: string, now = Date.now()): DemoSite {
  const h = hashString(url)
  const site: DemoSite = {
    id: `demo-${now.toString(36)}`,
    url,
    name: null,
    paused: false,
    public: false,
    addedAt: now,
    ms: Math.round(120 + 480 * rnd(h, 1)),
    far: 1.2 + 0.5 * rnd(h, 2),
    outageEveryHours: 96 + Math.round(144 * rnd(h, 3)),
    outageChance: 0.4,
    outageMinutes: [1, 8],
  }
  sites().push(site)
  save()
  return site
}

export function updateDemoSite(site: DemoSite, patch: WebsitePatch) {
  if (patch.name !== undefined) site.name = patch.name || null
  if (patch.paused !== undefined) site.paused = patch.paused
  if (patch.public !== undefined) site.public = patch.public
  save()
  return detailFor(site)
}

export function removeDemoSite(site: DemoSite) {
  store = sites().filter((s) => s.id !== site.id)
  save()
}

export const demoOverview = (site: DemoSite, range: RangeKey) => overviewFor(site, range, Date.now())
export const demoSeries = (site: DemoSite, range: RangeKey, region: string | null) =>
  seriesFor(site, range, region, Date.now())
export const demoIncidents = (site: DemoSite, range: RangeKey, limit: number) =>
  incidentsFor(site, range, limit, Date.now())
export const demoDaily = (site: DemoSite, days: number, tz: string): DailyUptime => ({
  days,
  tz,
  items: dailyItems(site, days, tz, Date.now()),
})
export const demoFleet = (range: "1h" | "24h") => fleetFor(sites(), range, Date.now())
export const DEMO_MAX_SITES = MAX_SITES
