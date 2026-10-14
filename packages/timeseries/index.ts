// Website check results ("ticks") live in ClickHouse. Users and websites stay
// in Postgres (packages/store).
import {
    client,
    DOWN_DAYS,
    HOURLY_DAYS,
    HOURLY_TABLE,
    HOURLY_VIEW,
    RAW_DAYS,
    TABLE,
    toClickHouseTime,
} from "./client";

export { CHECK_INTERVAL_SECONDS, DOWN_DAYS, HOURLY_DAYS, RAW_DAYS } from "./client";

export * from "./aggregates";

export type TickStatus = "Up" | "Down" | "Unknown";

export type NewTick = {
    website_id: string;
    region_id: string;
    status: TickStatus;
    response_time_ms: number;
    created_at: Date;
};

// Same shape the API has always returned for a tick.
export type Tick = {
    id: string;
    website_id: string;
    region_id: string;
    status: TickStatus;
    response_time_ms: number;
    createdAt: string; // ISO 8601, UTC
};

// The tables, created on a fresh cluster. Safe to call on every start-up and
// from several pods at once (everything is IF NOT EXISTS). An existing
// cluster from before the retention change is upgraded once with
// scripts/migrate-retention.ts.
export async function ensureSchema() {
    // One row per check, sorted by (website_id, created_at) so "this site's
    // checks between A and B" reads one small range. Successful checks are
    // deleted after RAW_DAYS, failed ones after DOWN_DAYS.
    await client.command({
        query: `
            CREATE TABLE IF NOT EXISTS ${TABLE} (
                id               UUID,
                website_id       String,
                region_id        LowCardinality(String),
                status           Enum8('Up' = 1, 'Down' = 2, 'Unknown' = 3),
                response_time_ms UInt32,
                created_at       DateTime64(3, 'UTC')
            )
            ENGINE = MergeTree
            PARTITION BY toYYYYMM(created_at)
            ORDER BY (website_id, created_at)
            TTL ${RAW_TTL}
        `,
    });
    await client.command({ query: HOURLY_TABLE_SQL });
    await client.command({ query: HOURLY_VIEW_SQL });
}

export const RAW_TTL = `toDateTime(created_at) + INTERVAL ${RAW_DAYS} DAY DELETE WHERE status != 'Down',
                toDateTime(created_at) + INTERVAL ${DOWN_DAYS} DAY DELETE`;

// One row per site, region and hour: how many checks answered or failed, and
// the response times of the answered ones (sum and max, plus a quantile state
// for p50/p95). Rows for the same key are merged in the background, so
// queries always aggregate (sum, max, quantilesIfMerge).
export const HOURLY_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS ${HOURLY_TABLE} (
        website_id  String,
        region_id   LowCardinality(String),
        hour        DateTime('UTC'),
        up          SimpleAggregateFunction(sum, UInt64),
        down        SimpleAggregateFunction(sum, UInt64),
        latency_sum SimpleAggregateFunction(sum, UInt64),
        latency_max SimpleAggregateFunction(max, UInt32),
        latency_q   AggregateFunction(quantilesIf(0.5, 0.95), UInt32, UInt8)
    )
    ENGINE = AggregatingMergeTree
    PARTITION BY toYYYYMM(hour)
    ORDER BY (website_id, hour, region_id)
    TTL hour + INTERVAL ${HOURLY_DAYS} DAY DELETE`;

// What one batch of checks adds to the hourly table. Shared by the
// materialized view (every insert) and the one-off backfill.
export const HOURLY_SELECT_SQL = `
    SELECT
        website_id,
        region_id,
        toStartOfHour(toDateTime(created_at)) AS hour,
        countIf(status = 'Up') AS up,
        countIf(status = 'Down') AS down,
        sumIf(toUInt64(response_time_ms), status = 'Up') AS latency_sum,
        maxIf(response_time_ms, status = 'Up') AS latency_max,
        quantilesIfState(0.5, 0.95)(response_time_ms, status = 'Up') AS latency_q
    FROM ${TABLE}`;

// Fills the hourly table as checks arrive (it sees every insert, before the
// raw table's TTL removes anything).
export const HOURLY_VIEW_SQL = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${HOURLY_VIEW} TO ${HOURLY_TABLE} AS
    ${HOURLY_SELECT_SQL}
    GROUP BY website_id, region_id, hour`;

export async function insertTicks(ticks: NewTick[]) {
    if (ticks.length === 0) return;
    await client.insert({
        table: TABLE,
        format: "JSONEachRow",
        values: ticks.map((t) => ({
            id: crypto.randomUUID(),
            website_id: t.website_id,
            region_id: t.region_id,
            status: t.status,
            response_time_ms: Math.max(0, Math.round(t.response_time_ms)),
            created_at: toClickHouseTime(t.created_at),
        })),
    });
}

// The newest `perSite` ticks for each website, newest first.
export async function latestTicks(websiteIds: string[], perSite: number): Promise<Tick[]> {
    if (websiteIds.length === 0) return [];
    const result = await client.query({
        query: `
            SELECT
                toString(id) AS id,
                website_id,
                region_id,
                status,
                response_time_ms,
                toUnixTimestamp64Milli(created_at) AS created_ms
            FROM ${TABLE}
            WHERE website_id IN {ids:Array(String)}
            ORDER BY website_id, created_at DESC
            LIMIT {perSite:UInt32} BY website_id
        `,
        query_params: { ids: websiteIds, perSite },
        format: "JSONEachRow",
    });
    const rows = await result.json<{
        id: string;
        website_id: string;
        region_id: string;
        status: TickStatus;
        response_time_ms: number;
        created_ms: string | number; // 64-bit ints arrive as strings
    }>();
    return rows.map(({ created_ms, ...row }) => ({
        ...row,
        createdAt: new Date(Number(created_ms)).toISOString(),
    }));
}

// For readiness probes.
export async function pingTimeseries() {
    const res = await client.ping();
    return res.success;
}

export async function closeTimeseries() {
    await client.close();
}
