import { createClient } from "@clickhouse/client";

// Connection settings come from the environment (in Kubernetes, a ConfigMap
// or Secret). The defaults match the local Docker container in the README.
export const client = createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "uptime",
    password: process.env.CLICKHOUSE_PASSWORD ?? "uptime",
    database: process.env.CLICKHOUSE_DB ?? "uptime",
    clickhouse_settings: {
        // Workers insert a few rows per batch. Async inserts let ClickHouse
        // buffer them into bigger parts instead of one part per tiny insert.
        async_insert: 1,
        wait_for_async_insert: 1,
        // avg/quantile over zero rows is NaN, which JSON can't carry unquoted.
        output_format_json_quote_denormals: 1,
    },
});

export const TABLE = "website_ticks";
// Hourly roll-up of TABLE, filled by a materialized view (see ensureSchema).
export const HOURLY_TABLE = "website_ticks_hourly";
export const HOURLY_VIEW = "website_ticks_hourly_mv";

// How often the pusher queues each site. Must match CHECK_INTERVAL_SECONDS
// in apps/pusher (same env var, same default).
export const CHECK_INTERVAL_SECONDS = Number(process.env.CHECK_INTERVAL_SECONDS) || 30;

// Retention. Every check is kept RAW_DAYS; failed checks DOWN_DAYS (they are
// what incidents are made of); the hourly roll-up HOURLY_DAYS.
export const RAW_DAYS = 5;
export const DOWN_DAYS = 90;
export const HOURLY_DAYS = 90;

// "2026-10-14T09:30:00.123Z" -> "2026-10-14 09:30:00.123" (columns are UTC)
export function toClickHouseTime(d: Date) {
    return d.toISOString().replace("T", " ").replace("Z", "");
}
