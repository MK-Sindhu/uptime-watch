// One-off upgrade of a ClickHouse database created before the retention
// change. New clusters don't need it: ensureSchema() creates everything.
//
//   1. create the hourly table
//   2. point the materialized view at checks created from a boundary B
//      (about a minute ahead) and clear any partial hourly data
//   3. once B has passed, fill the hourly table with every check before B
//   4. switch the checks table to the new TTL (every check 5 days, failed 90)
//
// Splitting at B counts every check exactly once — the view takes checks
// created at or after B, the backfill everything before — so workers can keep
// running while it works. Run it before step 4's TTL removes old checks.
//
//   cd packages/timeseries && bun scripts/migrate-retention.ts
//   bun scripts/migrate-retention.ts --rebuild   # redo the hourly table
//
// Re-running without --rebuild skips finished steps.
import { client, HOURLY_TABLE, HOURLY_VIEW, TABLE, toClickHouseTime } from "../client";
import { HOURLY_SELECT_SQL, HOURLY_TABLE_SQL, RAW_TTL } from "../index";

async function scalar(query: string, params: Record<string, unknown> = {}) {
    const result = await client.query({ query, query_params: params, format: "JSONEachRow" });
    const rows = await result.json<Record<string, string | number>>();
    return rows[0] ? Object.values(rows[0])[0] : undefined;
}

const tableExists = async (name: string) =>
    Number(await scalar("SELECT count() FROM system.tables WHERE database = currentDatabase() AND name = {name:String}", { name })) > 0;

const rebuild = process.argv.includes("--rebuild");

if ((await tableExists(HOURLY_VIEW)) && !rebuild) {
    console.log(`✓ ${HOURLY_VIEW} already exists, skipping (use --rebuild to refill the hourly table)`);
} else {
    // Next whole minute at least a minute away: time to switch the view and
    // clear the table before any check after B arrives.
    const boundary = new Date(Math.ceil((Date.now() + 60_000) / 60_000) * 60_000);
    const b = toClickHouseTime(boundary);

    await client.command({ query: HOURLY_TABLE_SQL });
    await client.command({ query: `DROP VIEW IF EXISTS ${HOURLY_VIEW}` });
    await client.command({
        query: `
            CREATE MATERIALIZED VIEW ${HOURLY_VIEW} TO ${HOURLY_TABLE} AS
            ${HOURLY_SELECT_SQL}
            WHERE created_at >= toDateTime64('${b}', 3, 'UTC')
            GROUP BY website_id, region_id, hour`,
    });
    await client.command({ query: `TRUNCATE TABLE ${HOURLY_TABLE}` });
    console.log(`▸ view now summarises checks from ${boundary.toISOString()}; waiting for that time to pass…`);

    // Past B, plus time for checks created just before B to be inserted.
    const wait = boundary.getTime() + 30_000 - Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, wait)));

    await client.command({
        query: `
            INSERT INTO ${HOURLY_TABLE}
            ${HOURLY_SELECT_SQL}
            WHERE created_at < toDateTime64('${b}', 3, 'UTC')
            GROUP BY website_id, region_id, hour`,
    });
    console.log(`✓ backfilled ${HOURLY_TABLE} with every check before ${boundary.toISOString()}`);
}

const engine = String(await scalar(
    "SELECT engine_full FROM system.tables WHERE database = currentDatabase() AND name = {name:String}",
    { name: TABLE }
));
if (/DELETE WHERE|WHERE status/i.test(engine)) {
    console.log(`✓ ${TABLE} already has the new TTL`);
} else {
    // Applying a TTL rewrites old parts in the background; old successful
    // checks disappear over the next minutes.
    await client.command({ query: `ALTER TABLE ${TABLE} MODIFY TTL ${RAW_TTL}` });
    console.log(`✓ ${TABLE}: every check kept 5 days, failed checks 90 days`);
}

const [raw, hourly] = await Promise.all([
    scalar(`SELECT count() FROM ${TABLE}`),
    scalar(`SELECT sum(up) + sum(down) FROM ${HOURLY_TABLE}`),
]);
console.log(`checks stored: ${raw} · checks summarised hourly: ${hourly}`);
await client.close();
