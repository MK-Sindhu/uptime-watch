// Tests for retention and the queries behind the charts and incidents.
// The first two groups are pure; the rest need the local ClickHouse (see the
// README) and write synthetic checks for made-up website ids ("test-…"),
// which no user owns and which are deleted again at the end.
//
//   cd packages/timeseries && bun test
import { afterAll, describe, expect, it } from "bun:test";
import { client, HOURLY_TABLE, HOURLY_VIEW, TABLE, toClickHouseTime } from "./client";
import {
    CHECK_INTERVAL_SECONDS,
    dailyUptime,
    incidents,
    insertTicks,
    latestTicks,
    mergeIncidents,
    overview,
    RANGES,
    RAW_DAYS,
    RAW_TTL,
    rangeWindow,
    series,
    stats24h,
    type NewTick,
} from "./index";

const SECOND = 1000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const INTERVAL = CHECK_INTERVAL_SECONDS * SECOND;

// --------------------------------------------------------------- pure logic

describe("rangeWindow", () => {
    const now = Date.parse("2026-10-14T09:37:12.345Z");

    it("covers whole buckets and includes the current one", () => {
        for (const range of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
            const { from, to, stepSeconds } = rangeWindow(range, now);
            const stepMs = stepSeconds * SECOND;
            expect(to.getTime() % stepMs).toBe(0);
            expect(to.getTime()).toBeGreaterThan(now);
            expect(to.getTime() - stepMs).toBeLessThanOrEqual(now);
            expect(to.getTime() - from.getTime()).toBe(RANGES[range].seconds * SECOND);
        }
    });

    it("reads every check up to RAW_DAYS and the hourly summary beyond", () => {
        for (const [range, { seconds, step, source }] of Object.entries(RANGES)) {
            const fitsInRaw = seconds <= RAW_DAYS * 86_400;
            expect(`${range}:${source}`).toBe(`${range}:${fitsInRaw ? "raw" : "hourly"}`);
            // The hourly table can't be split into buckets smaller than an hour.
            if (source === "hourly") expect(step % 3_600).toBe(0);
            // Buckets line up with toStartOfInterval, which starts at midnight UTC.
            expect(86_400 % step).toBe(0);
        }
    });
});

describe("mergeIncidents", () => {
    const run = (region: string, start: number, end: number | null, checks = 3) => ({
        region_id: region,
        started_ms: String(start),
        last_seen_ms: String(end ?? start),
        checks,
        ended_ms: String(end ?? 0),
    });
    const t = Date.parse("2026-10-14T08:00:00Z");

    it("merges runs from different regions that overlap", () => {
        const [incident, ...rest] = mergeIncidents([run("usa", t, t + 90 * SECOND), run("india", t + 30 * SECOND, t + 120 * SECOND)]);
        expect(rest).toHaveLength(0);
        expect(incident).toMatchObject({
            startedAt: new Date(t).toISOString(),
            endedAt: new Date(t + 120 * SECOND).toISOString(),
            durationMs: 120 * SECOND,
            checks: 6,
            regions: ["india", "usa"],
            ongoing: false,
        });
    });

    it("keeps separate outages apart, newest first", () => {
        const list = mergeIncidents([run("usa", t, t + 60 * SECOND), run("usa", t + HOUR, t + HOUR + 60 * SECOND)]);
        expect(list.map((i) => i.startedAt)).toEqual([new Date(t + HOUR).toISOString(), new Date(t).toISOString()]);
    });

    it("stays ongoing while any region is still failing", () => {
        const now = t + 10 * 60 * SECOND;
        const [incident] = mergeIncidents([run("usa", t, t + 60 * SECOND), run("india", t + 30 * SECOND, null)], now);
        expect(incident).toMatchObject({ ongoing: true, endedAt: null, durationMs: now - t });
    });
});

// ------------------------------------------------------ ClickHouse retention

describe("retention", () => {
    it("has the hourly table, its materialized view and the conditional TTL", async () => {
        const result = await client.query({
            query: `SELECT name, engine, create_table_query FROM system.tables
                    WHERE database = currentDatabase() AND name IN ({names:Array(String)})`,
            query_params: { names: [TABLE, HOURLY_TABLE, HOURLY_VIEW] },
            format: "JSONEachRow",
        });
        const tables = new Map((await result.json<{ name: string; engine: string; create_table_query: string }>()).map((t) => [t.name, t]));
        expect(tables.get(HOURLY_TABLE)?.engine).toBe("AggregatingMergeTree");
        expect(tables.get(HOURLY_VIEW)?.engine).toBe("MaterializedView");
        // Without this, a database from before the retention change keeps
        // every check for 90 days (run scripts/migrate-retention.ts).
        expect(tables.get(TABLE)?.create_table_query).toMatch(/TTL .* WHERE status != 'Down'/);
    });

    it("deletes successful checks after 5 days and failed ones after 90", async () => {
        // A scratch table with the real TTL, so the live table isn't merged.
        const scratch = `ttl_test_${crypto.randomUUID().replaceAll("-", "")}`;
        await client.command({
            query: `CREATE TABLE ${scratch} (label String, status Enum8('Up' = 1, 'Down' = 2, 'Unknown' = 3), created_at DateTime64(3, 'UTC'))
                    ENGINE = MergeTree ORDER BY created_at TTL ${RAW_TTL}`,
        });
        try {
            const values = [1, 6, 91].flatMap((days) =>
                ["Up", "Down"].map((status) => ({ label: `${days}d ${status}`, status, created_at: toClickHouseTime(new Date(Date.now() - days * DAY)) })));
            await client.insert({ table: scratch, values, format: "JSONEachRow" });
            // TTL deletes happen when parts merge; force one.
            await client.command({ query: `OPTIMIZE TABLE ${scratch} FINAL` });
            const kept = await (await client.query({ query: `SELECT label FROM ${scratch} ORDER BY label`, format: "JSONEachRow" })).json<{ label: string }>();
            expect(kept.map((r) => r.label)).toEqual(["1d Down", "1d Up", "6d Down"]);
        } finally {
            await client.command({ query: `DROP TABLE IF EXISTS ${scratch}` });
        }
    });
});

// ------------------------------------------------- queries on synthetic data

const testIds: string[] = [];
function testSite() {
    const id = `test-${crypto.randomUUID()}`;
    testIds.push(id);
    return id;
}

// Checks for one site: [seconds after `start`, region, status, response ms]
async function insert(websiteId: string, start: number, checks: [number, string, "Up" | "Down", number?][]) {
    const ticks: NewTick[] = checks.map(([s, region, status, ms]) => ({
        website_id: websiteId,
        region_id: region,
        status,
        response_time_ms: ms ?? 0,
        created_at: new Date(start + s * SECOND),
    }));
    await insertTicks(ticks);
}

afterAll(async () => {
    if (testIds.length === 0) return;
    for (const table of [TABLE, HOURLY_TABLE]) {
        await client.command({
            query: `ALTER TABLE ${table} DELETE WHERE website_id IN {ids:Array(String)}`,
            query_params: { ids: testIds },
            clickhouse_settings: { mutations_sync: "2" },
        });
    }
    await client.close();
});

describe("hourly summary", () => {
    // Three hours ago, on the hour: the checks fall into one hourly bucket.
    const hour = Math.floor(Date.now() / HOUR) * HOUR - 3 * HOUR;
    const from = new Date(hour - HOUR), to = new Date(hour + 2 * HOUR);
    const site = testSite();

    it("matches the individual checks it was built from", async () => {
        await insert(site, hour + 10 * 60 * SECOND, [
            [0, "test-a", "Up", 100], [30, "test-a", "Up", 200], [60, "test-a", "Up", 300], [90, "test-a", "Down"],
            [0, "test-b", "Up", 400], [30, "test-b", "Down"], [60, "test-b", "Down"],
        ]);

        const raw = await overview(site, from, to, "raw");
        const hourly = await overview(site, from, to, "hourly");
        expect(raw.total).toMatchObject({ up: 4, down: 3, latency: { avgMs: 250, maxMs: 400 } });
        expect(hourly.total).toEqual(raw.total);
        expect(hourly.regions).toEqual(raw.regions);
        expect(hourly.regions.map((r) => [r.regionId, r.up, r.down])).toEqual([["test-a", 3, 1], ["test-b", 1, 2]]);
    });

    it("draws the same chart as the individual checks", async () => {
        const counts = (points: { t: string; up: number; down: number }[]) =>
            points.filter((p) => p.up + p.down > 0).map((p) => `${p.t} ${p.up}/${p.down}`);
        const raw = await series(site, from, to, 3_600, null, "raw");
        const hourly = await series(site, from, to, 3_600, null, "hourly");
        expect(counts(hourly)).toEqual([`${new Date(hour).toISOString()} 4/3`]);
        expect(counts(hourly)).toEqual(counts(raw));
        expect((await series(site, from, to, 3_600, "test-b", "hourly")).reduce((n, p) => n + p.down, 0)).toBe(2);
    });

    it("counts the checks on the right calendar day", async () => {
        const days = await dailyUptime(site, 7, "UTC");
        const day = days.find((d) => d.day === new Date(hour).toISOString().slice(0, 10));
        expect(day).toMatchObject({ up: 4, down: 3 });
        expect(days.reduce((n, d) => n + d.up + d.down, 0)).toBe(7);
    });
});

describe("dashboard queries", () => {
    it("returns the newest checks first, at most N per site", async () => {
        const site = testSite();
        const start = Date.now() - 10 * 60 * SECOND;
        await insert(site, start, [[0, "test-a", "Up", 10], [30, "test-a", "Up", 20], [60, "test-a", "Down"], [90, "test-a", "Up", 40]]);
        const ticks = await latestTicks([site], 3);
        expect(ticks.map((t) => t.response_time_ms)).toEqual([40, 0, 20]);
        expect(ticks.map((t) => t.status)).toEqual(["Up", "Down", "Up"]);

        const stats = (await stats24h([site])).get(site);
        expect(stats).toMatchObject({ up: 3, down: 1, uptimePct: 75, p50Ms: 20 });
    });
});

describe("incidents", () => {
    const start = Math.floor(Date.now() / HOUR) * HOUR - 2 * HOUR;
    const window = [new Date(start - HOUR), new Date(Date.now() + HOUR)] as const;
    const at = (s: number) => new Date(start + s * SECOND).toISOString();

    it("ends an outage at the next successful check", async () => {
        const site = testSite();
        await insert(site, start, [[0, "test-a", "Up", 50], [30, "test-a", "Down"], [60, "test-a", "Down"], [90, "test-a", "Down"], [120, "test-a", "Up", 50]]);
        expect(await incidents(site, ...window, 10)).toEqual([
            { id: String(start + 30 * SECOND), startedAt: at(30), endedAt: at(120), durationMs: 90 * SECOND, checks: 3, regions: ["test-a"], ongoing: false },
        ]);
    });

    it("splits failures with missing checks between them into separate outages", async () => {
        // After RAW_DAYS only failed checks are left: two failures 10 minutes
        // apart are two outages, each ending one interval after its last check.
        const site = testSite();
        await insert(site, start, [[0, "test-a", "Down"], [30, "test-a", "Down"], [600, "test-a", "Down"]]);
        const list = await incidents(site, ...window, 10);
        expect(list.map((i) => [i.startedAt, i.endedAt, i.checks])).toEqual([
            [at(600), new Date(start + 600 * SECOND + INTERVAL).toISOString(), 1],
            [at(0), new Date(start + 30 * SECOND + INTERVAL).toISOString(), 2],
        ]);
    });

    it("doesn't stretch an outage to a successful check long after it", async () => {
        const site = testSite();
        await insert(site, start, [[0, "test-a", "Down"], [30, "test-a", "Down"], [900, "test-a", "Up", 50]]);
        const [incident] = await incidents(site, ...window, 10);
        expect(incident?.endedAt).toBe(new Date(start + 30 * SECOND + INTERVAL).toISOString());
    });

    it("merges an outage seen from two regions", async () => {
        const site = testSite();
        await insert(site, start, [
            [0, "test-a", "Down"], [30, "test-a", "Down"], [60, "test-a", "Down"], [90, "test-a", "Up", 50],
            [30, "test-b", "Down"], [60, "test-b", "Down"], [90, "test-b", "Down"], [120, "test-b", "Up", 50],
        ]);
        const list = await incidents(site, ...window, 10);
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ startedAt: at(0), endedAt: at(120), checks: 6, regions: ["test-a", "test-b"] });
    });

    it("reports an outage that is still going on", async () => {
        const site = testSite();
        const now = Date.now();
        await insert(site, now, [[-60, "test-a", "Down"], [-30, "test-a", "Down"], [-1, "test-a", "Down"]]);
        const [incident] = await incidents(site, ...window, 10, now);
        expect(incident).toMatchObject({ ongoing: true, endedAt: null, checks: 3, durationMs: 60 * SECOND });
    });
});
