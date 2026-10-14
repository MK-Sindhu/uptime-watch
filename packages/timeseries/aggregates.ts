// Aggregates for the site detail page, the dashboard and public status pages.
// Every query filters on website_id first and then on a time range, so it
// reads one small slice of the table's sort order.
//
// Where the numbers come from:
//   raw    website_ticks: every check for RAW_DAYS (5), failed checks for 90
//   hourly website_ticks_hourly: counts and latency per site, region, hour
// Ranges inside RAW_DAYS read raw checks; longer ones read the hourly table.
import { CHECK_INTERVAL_SECONDS, client, HOURLY_TABLE, RAW_DAYS, TABLE, toClickHouseTime } from "./client";

export type Source = "raw" | "hourly";

export const RANGES = {
    "1h": { seconds: 3_600, step: 60, source: "raw" },
    "24h": { seconds: 86_400, step: 600, source: "raw" },
    "7d": { seconds: 7 * 86_400, step: 3_600, source: "hourly" },
    "30d": { seconds: 30 * 86_400, step: 14_400, source: "hourly" },
    "90d": { seconds: 90 * 86_400, step: 43_200, source: "hourly" },
} as const satisfies Record<string, { seconds: number; step: number; source: Source }>;
export type RangeKey = keyof typeof RANGES;

// The window for a range, aligned to whole buckets so repeated polls ask
// identical questions. `to` is exclusive and includes the current bucket.
// Every step divides a day, so buckets line up with ClickHouse's
// toStartOfInterval (which aligns to the start of the UTC day).
export function rangeWindow(range: RangeKey, now = Date.now()) {
    const { seconds, step, source } = RANGES[range];
    const stepMs = step * 1000;
    const to = Math.floor(now / stepMs) * stepMs + stepMs;
    return { from: new Date(to - seconds * 1000), to: new Date(to), stepSeconds: step, source: source as Source };
}

export type Latency = {
    avgMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    maxMs: number | null;
};

const num = (v: unknown) => (v === null || v === undefined || v === "nan" ? null : Number(v));
const uptimePct = (up: number, down: number) => (up + down === 0 ? null : (up / (up + down)) * 100);
const round = (v: number | null) => (v === null ? null : Math.round(v));

// Shared SQL for "how did the Up checks perform". Zero Up checks -> NULLs.
const LATENCY_SQL = `
    countIf(status = 'Up')   AS up,
    countIf(status = 'Down') AS down,
    if(up = 0, NULL, avgIf(response_time_ms, status = 'Up')) AS avg_ms,
    quantilesIf(0.5, 0.95)(response_time_ms, status = 'Up') AS q,
    if(up = 0, NULL, q[1]) AS p50_ms,
    if(up = 0, NULL, q[2]) AS p95_ms,
    if(up = 0, NULL, maxIf(response_time_ms, status = 'Up')) AS max_ms`;

// The same, over the hourly table: sums of counts and latency sums, merged
// quantile states, max of maxes. (n_up/n_down: an alias can't shadow the
// column it sums.)
const HOURLY_LATENCY_SQL = `
    sum(up)   AS n_up,
    sum(down) AS n_down,
    if(n_up = 0, NULL, sum(latency_sum) / n_up) AS avg_ms,
    quantilesIfMerge(0.5, 0.95)(latency_q) AS q,
    if(n_up = 0, NULL, q[1]) AS p50_ms,
    if(n_up = 0, NULL, q[2]) AS p95_ms,
    if(n_up = 0, NULL, max(latency_max)) AS max_ms`;

type LatencyRow = { up: string | number; down: string | number; avg_ms: unknown; p50_ms: unknown; p95_ms: unknown; max_ms: unknown };
type HourlyRow = Omit<LatencyRow, "up" | "down"> & { n_up: string | number; n_down: string | number };
const fromHourly = <T extends HourlyRow>({ n_up, n_down, ...rest }: T) => ({ ...rest, up: n_up, down: n_down });
function toLatency(r: LatencyRow): Latency {
    return { avgMs: round(num(r.avg_ms)), p50Ms: round(num(r.p50_ms)), p95Ms: round(num(r.p95_ms)), maxMs: round(num(r.max_ms)) };
}

async function rows<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
    const result = await client.query({ query, query_params: params, format: "JSONEachRow" });
    return result.json<T>();
}

const window = (websiteId: string, from: Date, to: Date) => ({
    id: websiteId,
    from: toClickHouseTime(from),
    to: toClickHouseTime(to),
});

// ---------------------------------------------------------------- overview

export type RegionStats = {
    regionId: string;
    up: number;
    down: number;
    uptimePct: number | null;
    latency: Latency;
    lastStatus: "Up" | "Down" | "Unknown" | null;
    lastMs: number | null;
    lastAt: string | null;
};

type LastRow = { region_id: string; last_status: string; last_ms: number; last_at_ms: string };

// Totals plus one row per region, in one pass (GROUPING SETS).
export async function overview(websiteId: string, from: Date, to: Date, source: Source = "raw") {
    const result = source === "raw"
        ? await rows<LatencyRow & LastRow>(`
            SELECT region_id, ${LATENCY_SQL},
                argMax(status, created_at) AS last_status,
                argMax(response_time_ms, created_at) AS last_ms,
                toUnixTimestamp64Milli(max(created_at)) AS last_at_ms
            FROM ${TABLE}
            WHERE website_id = {id:String} AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
            GROUP BY GROUPING SETS ((region_id), ())
            ORDER BY region_id`, window(websiteId, from, to))
        : await overviewFromHourly(websiteId, from, to);

    const toStats = (r: (typeof result)[number]): RegionStats => {
        const up = Number(r.up), down = Number(r.down);
        const any = up + down > 0;
        return {
            regionId: r.region_id,
            up, down,
            uptimePct: uptimePct(up, down),
            latency: toLatency(r),
            lastStatus: any && r.last_status ? (r.last_status as RegionStats["lastStatus"]) : null,
            lastMs: any && r.last_status ? Number(r.last_ms) : null,
            lastAt: any && Number(r.last_at_ms) > 0 ? new Date(Number(r.last_at_ms)).toISOString() : null,
        };
    };
    // The grand total row has an empty region_id. With no rows at all,
    // ClickHouse returns nothing, so fall back to an empty total.
    const totalRow = result.find((r) => r.region_id === "");
    const total = totalRow
        ? toStats(totalRow)
        : { regionId: "", up: 0, down: 0, uptimePct: null, latency: { avgMs: null, p50Ms: null, p95Ms: null, maxMs: null }, lastStatus: null, lastMs: null, lastAt: null };
    return { total, regions: result.filter((r) => r.region_id !== "").map(toStats) };
}

// Long ranges: counts and latency from the hourly table; the latest check
// (which the hourly table can't tell) from the raw checks.
async function overviewFromHourly(websiteId: string, from: Date, to: Date) {
    const [summary, latest] = await Promise.all([
        rows<HourlyRow & { region_id: string }>(`
            SELECT region_id, ${HOURLY_LATENCY_SQL}
            FROM ${HOURLY_TABLE}
            WHERE website_id = {id:String} AND hour >= {from:DateTime64(3)} AND hour < {to:DateTime64(3)}
            GROUP BY GROUPING SETS ((region_id), ())
            ORDER BY region_id`, window(websiteId, from, to)),
        rows<LastRow>(`
            SELECT region_id,
                argMax(status, created_at) AS last_status,
                argMax(response_time_ms, created_at) AS last_ms,
                toUnixTimestamp64Milli(max(created_at)) AS last_at_ms
            FROM ${TABLE}
            WHERE website_id = {id:String} AND created_at >= now64(3) - INTERVAL {days:UInt32} DAY
            GROUP BY GROUPING SETS ((region_id), ())`, { id: websiteId, days: RAW_DAYS }),
    ]);
    const lastByRegion = new Map(latest.map((r) => [r.region_id, r]));
    return summary.map((r) => {
        const last = lastByRegion.get(r.region_id);
        return {
            ...fromHourly(r),
            region_id: r.region_id,
            last_status: last?.last_status ?? "",
            last_ms: last?.last_ms ?? 0,
            last_at_ms: last?.last_at_ms ?? "0",
        };
    });
}

// ------------------------------------------------------------------ series

export type SeriesPoint = Latency & { t: string; up: number; down: number };

export async function series(websiteId: string, from: Date, to: Date, stepSeconds: number, regionId: string | null, source: Source = "raw") {
    const params = { ...window(websiteId, from, to), step: stepSeconds, region: regionId ?? "" };
    const result = source === "raw"
        ? await rows<LatencyRow & { t: string | number }>(`
            SELECT toUnixTimestamp(toStartOfInterval(created_at, toIntervalSecond({step:UInt32}))) AS t, ${LATENCY_SQL}
            FROM ${TABLE}
            WHERE website_id = {id:String} AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
              AND ({region:String} = '' OR region_id = {region:String})
            GROUP BY t
            ORDER BY t`, params)
        : (await rows<HourlyRow & { t: string | number }>(`
            SELECT toUnixTimestamp(toStartOfInterval(hour, toIntervalSecond({step:UInt32}))) AS t, ${HOURLY_LATENCY_SQL}
            FROM ${HOURLY_TABLE}
            WHERE website_id = {id:String} AND hour >= {from:DateTime64(3)} AND hour < {to:DateTime64(3)}
              AND ({region:String} = '' OR region_id = {region:String})
            GROUP BY t
            ORDER BY t`, params)).map(fromHourly);

    // One point per bucket; buckets without checks are empty (drawn as "no data").
    const byT = new Map(result.map((r) => [Number(r.t) * 1000, r]));
    const points: SeriesPoint[] = [];
    for (let t = from.getTime(); t < to.getTime(); t += stepSeconds * 1000) {
        const r = byT.get(t);
        points.push(r
            ? { t: new Date(t).toISOString(), up: Number(r.up), down: Number(r.down), ...toLatency(r) }
            : { t: new Date(t).toISOString(), up: 0, down: 0, avgMs: null, p50Ms: null, p95Ms: null, maxMs: null });
    }
    return points;
}

// --------------------------------------------------------------- incidents

export type Incident = {
    id: string;
    startedAt: string;
    endedAt: string | null; // null = still down
    durationMs: number;
    checks: number;
    regions: string[];
    ongoing: boolean;
};

type DownRun = { region_id: string; started_ms: string; last_seen_ms: string; checks: string | number; ended_ms: string };

// Checks closer together than this belong to the same run; a bigger gap
// means checks are missing (successful ones deleted after RAW_DAYS, or the
// workers were down), so a new run starts.
const GAP_MS = Math.max(3 * CHECK_INTERVAL_SECONDS, 90) * 1000;

// An incident is a run of failed checks in one region ("gaps and islands"):
// it starts with the first failure and ends with the next successful check.
// Successful checks older than RAW_DAYS are deleted, so an old incident ends
// one check interval after its last failure instead. Runs from different
// regions that overlap in time merge into one incident.
export async function incidents(websiteId: string, from: Date, to: Date, limit: number, now = Date.now()): Promise<Incident[]> {
    const runs = await rows<DownRun>(`
        WITH
          ordered AS (
            SELECT region_id, toString(status) AS s, created_at,
              lagInFrame(toString(status), 1, '') OVER w AS prev_s,
              lagInFrame(created_at, 1, created_at) OVER w AS prev_t
            FROM ${TABLE}
            WHERE website_id = {id:String} AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
            WINDOW w AS (PARTITION BY region_id ORDER BY created_at ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)
          ),
          runs AS (
            SELECT region_id, s, created_at,
              sum(s != prev_s OR dateDiff('millisecond', prev_t, created_at) > {gap:UInt64})
                OVER (PARTITION BY region_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS run_no
            FROM ordered
          ),
          grouped AS (
            SELECT region_id, s, run_no, min(created_at) AS started_at, max(created_at) AS last_seen_at, count() AS checks
            FROM runs
            GROUP BY region_id, s, run_no
          ),
          bounded AS (
            SELECT region_id, s, started_at, last_seen_at, checks,
              leadInFrame(started_at, 1, toDateTime64(0, 3, 'UTC')) OVER w2 AS next_start,
              leadInFrame(s, 1, '') OVER w2 AS next_s
            FROM grouped
            WINDOW w2 AS (PARTITION BY region_id ORDER BY started_at ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING)
          )
        SELECT region_id,
          toUnixTimestamp64Milli(started_at)   AS started_ms,
          toUnixTimestamp64Milli(last_seen_at) AS last_seen_ms,
          checks,
          -- 0 = still failing
          multiIf(
            next_s = 'Up' AND dateDiff('millisecond', last_seen_at, next_start) <= {gap:UInt64},
              toUnixTimestamp64Milli(next_start),
            last_seen_at < {stale:DateTime64(3)},
              toUnixTimestamp64Milli(last_seen_at) + {interval:UInt64},
            0) AS ended_ms
        FROM bounded
        WHERE s = 'Down'
        ORDER BY started_ms DESC
        LIMIT {limit:UInt32}`, {
            ...window(websiteId, from, to),
            limit: limit * 4,
            gap: GAP_MS,
            interval: CHECK_INTERVAL_SECONDS * 1000,
            stale: toClickHouseTime(new Date(now - GAP_MS)),
        });

    return mergeIncidents(runs, now).slice(0, limit);
}

export function mergeIncidents(runs: DownRun[], now = Date.now()): Incident[] {
    const spans = runs
        .map((r) => {
            const end = Number(r.ended_ms);
            return { region: r.region_id, start: Number(r.started_ms), end: end === 0 ? null : end, checks: Number(r.checks) };
        })
        .sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number | null; checks: number; regions: Set<string> }[] = [];
    for (const s of spans) {
        const last = merged[merged.length - 1];
        const lastEnd = last ? (last.end ?? Infinity) : -Infinity;
        if (last && s.start <= lastEnd) {
            last.end = last.end === null || s.end === null ? null : Math.max(last.end, s.end);
            last.checks += s.checks;
            last.regions.add(s.region);
        } else {
            merged.push({ start: s.start, end: s.end, checks: s.checks, regions: new Set([s.region]) });
        }
    }

    return merged
        .map((m) => ({
            id: String(m.start),
            startedAt: new Date(m.start).toISOString(),
            endedAt: m.end === null ? null : new Date(m.end).toISOString(),
            durationMs: (m.end ?? now) - m.start,
            checks: m.checks,
            regions: [...m.regions].sort(),
            ongoing: m.end === null,
        }))
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

// ------------------------------------------------------------ daily uptime

export type DailyUptimeDay = { day: string; up: number; down: number; uptimePct: number | null };

// "YYYY-MM-DD" of `ms` in `tz`.
function dayIn(tz: string, ms: number) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

// The last `days` calendar days in `tz`, oldest first, ending today.
export async function dailyUptime(websiteId: string, days: number, tz: string, now = Date.now()): Promise<DailyUptimeDay[]> {
    const wanted: string[] = [];
    for (let i = 0; wanted.length < days && i < days + 3; i++) {
        const d = dayIn(tz, now - i * 86_400_000);
        if (!wanted.includes(d)) wanted.unshift(d);
    }
    const from = new Date(now - (days + 1) * 86_400_000);
    // From the hourly table, so it covers 90 days. Day boundaries follow `tz`
    // to the hour (half-hour zones like India's are off by 30 minutes).
    const result = await rows<{ day: string; n_up: string | number; n_down: string | number }>(`
        SELECT toString(toDate(hour, {tz:String})) AS day, sum(up) AS n_up, sum(down) AS n_down
        FROM ${HOURLY_TABLE}
        WHERE website_id = {id:String} AND hour >= {from:DateTime64(3)}
        GROUP BY day
        ORDER BY day`, { id: websiteId, from: toClickHouseTime(from), tz });

    const byDay = new Map(result.map((r) => [r.day, r]));
    return wanted.map((day) => {
        const r = byDay.get(day);
        const up = r ? Number(r.n_up) : 0, down = r ? Number(r.n_down) : 0;
        return { day, up, down, uptimePct: uptimePct(up, down) };
    });
}

// ---------------------------------------------------------- dashboard 24 h

export type Stats24h = { up: number; down: number; uptimePct: number | null; p50Ms: number | null };

export async function stats24h(websiteIds: string[], now = Date.now()): Promise<Map<string, Stats24h>> {
    const out = new Map<string, Stats24h>();
    if (websiteIds.length === 0) return out;
    const result = await rows<{ website_id: string; up: string | number; down: string | number; p50_ms: unknown }>(`
        SELECT website_id,
               countIf(status = 'Up') AS up, countIf(status = 'Down') AS down,
               if(up = 0, NULL, quantileIf(0.5)(response_time_ms, status = 'Up')) AS p50_ms
        FROM ${TABLE}
        WHERE website_id IN {ids:Array(String)} AND created_at >= {from:DateTime64(3)}
        GROUP BY website_id`, { ids: websiteIds, from: toClickHouseTime(new Date(now - 86_400_000)) });
    for (const r of result) {
        const up = Number(r.up), down = Number(r.down);
        out.set(r.website_id, { up, down, uptimePct: uptimePct(up, down), p50Ms: round(num(r.p50_ms)) });
    }
    return out;
}

export const emptyStats24h: Stats24h = { up: 0, down: 0, uptimePct: null, p50Ms: null };

// ------------------------------------------------------------------- fleet
// Everything for one user's sites at once, for the dashboard's health panel
// and check-flow diagram.

export type FleetSiteStats = { websiteId: string; up: number; down: number; uptimePct: number | null; latency: Latency };

// Per site, plus the total over all of them (website_id = '').
export async function fleetStats(websiteIds: string[], from: Date, to: Date) {
    const empty = { websiteId: "", up: 0, down: 0, uptimePct: null, latency: { avgMs: null, p50Ms: null, p95Ms: null, maxMs: null } };
    if (websiteIds.length === 0) return { total: empty, sites: [] as FleetSiteStats[] };
    const result = await rows<LatencyRow & { website_id: string }>(`
        SELECT website_id, ${LATENCY_SQL}
        FROM ${TABLE}
        WHERE website_id IN {ids:Array(String)} AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
        GROUP BY GROUPING SETS ((website_id), ())`,
        { ids: websiteIds, from: toClickHouseTime(from), to: toClickHouseTime(to) });
    const toStats = (r: (typeof result)[number]): FleetSiteStats => {
        const up = Number(r.up), down = Number(r.down);
        return { websiteId: r.website_id, up, down, uptimePct: uptimePct(up, down), latency: toLatency(r) };
    };
    const totalRow = result.find((r) => r.website_id === "");
    return {
        total: totalRow ? toStats(totalRow) : empty,
        sites: result.filter((r) => r.website_id !== "").map(toStats),
    };
}

export type FleetPoint = { t: string; up: number; down: number; uptimePct: number | null; avgMs: number | null; p95Ms: number | null };

// All sites together, bucketed like series().
export async function fleetSeries(websiteIds: string[], from: Date, to: Date, stepSeconds: number): Promise<FleetPoint[]> {
    const result = websiteIds.length === 0 ? [] : await rows<LatencyRow & { t: string | number }>(`
        SELECT toUnixTimestamp(toStartOfInterval(created_at, toIntervalSecond({step:UInt32}))) AS t, ${LATENCY_SQL}
        FROM ${TABLE}
        WHERE website_id IN {ids:Array(String)} AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
        GROUP BY t
        ORDER BY t`,
        { ids: websiteIds, from: toClickHouseTime(from), to: toClickHouseTime(to), step: stepSeconds });
    const byT = new Map(result.map((r) => [Number(r.t) * 1000, r]));
    const points: FleetPoint[] = [];
    for (let t = from.getTime(); t < to.getTime(); t += stepSeconds * 1000) {
        const r = byT.get(t);
        const up = r ? Number(r.up) : 0, down = r ? Number(r.down) : 0;
        const lat = r ? toLatency(r) : null;
        points.push({ t: new Date(t).toISOString(), up, down, uptimePct: uptimePct(up, down), avgMs: lat?.avgMs ?? null, p95Ms: lat?.p95Ms ?? null });
    }
    return points;
}

// Speed bands for the check-flow diagram.
export const FAST_MS = 300;
export const SLOW_MS = 1000;
export type FlowOutcome = "fast" | "normal" | "slow" | "down" | "unknown";
export type FlowLink = { regionId: string; websiteId: string; outcome: FlowOutcome; checks: number };

// How many checks went region -> site -> outcome.
export async function fleetFlow(websiteIds: string[], from: Date, to: Date): Promise<FlowLink[]> {
    if (websiteIds.length === 0) return [];
    const result = await rows<{ region_id: string; website_id: string; outcome: FlowOutcome; checks: string | number }>(`
        SELECT region_id, website_id,
            multiIf(status = 'Down', 'down', status != 'Up', 'unknown',
                    response_time_ms < {fast:UInt32}, 'fast', response_time_ms < {slow:UInt32}, 'normal', 'slow') AS outcome,
            count() AS checks
        FROM ${TABLE}
        WHERE website_id IN {ids:Array(String)} AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
        GROUP BY region_id, website_id, outcome`,
        { ids: websiteIds, from: toClickHouseTime(from), to: toClickHouseTime(to), fast: FAST_MS, slow: SLOW_MS });
    return result.map((r) => ({ regionId: r.region_id, websiteId: r.website_id, outcome: r.outcome, checks: Number(r.checks) }));
}
