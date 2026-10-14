// End to end: a new website goes pusher -> Redis stream -> a worker in every
// region -> ClickHouse -> the API. Needs the pusher and one worker per region
// running (./start.sh does that). Takes about a minute and a half; skip it
// with SKIP_SLOW=1.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient, waitFor } from "./helpers";

const { http, signUp } = testClient();

type Tick = { region_id: string; status: string; response_time_ms: number; createdAt: string };

describe.skipIf(process.env.SKIP_SLOW === "1")("Check pipeline", () => {
    let jwt: string;
    let siteId: string;
    let regions: { id: string; name: string }[];
    let interval: number;

    const get = async (path: string) => (await http.get(path, auth(jwt))).data;
    const checksSoFar = async () => {
        const overview = await get(`/websites/${siteId}/overview?range=1h`);
        return overview.up + overview.down;
    };

    beforeAll(async () => {
        ({ jwt } = await signUp());
        regions = (await get("/regions")).regions;
        interval = (await get("/fleet?range=1h")).checkIntervalSeconds;
        siteId = (await http.post("/website", { url: "https://example.com/pipeline" }, auth(jwt))).data.id;
    });

    afterAll(async () => {
        if (siteId) await http.delete(`/websites/${siteId}`, auth(jwt));
    });

    it("checks a new website from every region", async () => {
        const names = regions.map((r) => r.name).join(", ");
        const ticks = await waitFor(`a check from every region (${names}); are the pusher and the workers running?`, async () => {
            const site = (await get("/websites")).websites.find((w: { id: string }) => w.id === siteId);
            const seen = new Set(site.ticks.map((t: Tick) => t.region_id));
            return regions.every((r) => seen.has(r.id)) ? (site.ticks as Tick[]) : undefined;
        }, (2 * interval + 30) * 1000);

        for (const tick of ticks) {
            expect(["Up", "Down"]).toContain(tick.status);
            expect(tick.response_time_ms).toBeGreaterThanOrEqual(0);
            expect(Date.now() - Date.parse(tick.createdAt)).toBeLessThan((3 * interval + 30) * 1000);
        }
    }, 120_000);

    it("adds the checks to every chart, including the hourly summary", async () => {
        // Read the raw count first: later reads can only see more checks.
        const raw = await get(`/websites/${siteId}/overview?range=24h`);
        const n = raw.up + raw.down;
        expect(n).toBeGreaterThanOrEqual(regions.length);
        expect(raw.lastStatus).not.toBeNull();
        expect(raw.regions.map((r: { regionId: string }) => r.regionId).sort()).toEqual(regions.map((r) => r.id).sort());

        // 7d reads website_ticks_hourly, which only the materialized view fills.
        const hourly = await get(`/websites/${siteId}/overview?range=7d`);
        expect(hourly.up + hourly.down).toBeGreaterThanOrEqual(n);
        expect(hourly.lastAt).not.toBeNull();

        const series = await get(`/websites/${siteId}/series?range=1h`);
        expect(series.points.reduce((sum: number, p: { up: number; down: number }) => sum + p.up + p.down, 0)).toBeGreaterThanOrEqual(n);

        const today = new Date().toISOString().slice(0, 10);
        const daily = await get(`/websites/${siteId}/daily?days=7&tz=UTC`);
        const day = daily.items.find((d: { day: string }) => d.day === today);
        expect(day.up + day.down).toBeGreaterThanOrEqual(n);

        const fleet = await get("/fleet?range=1h");
        const mine = fleet.sites.find((s: { websiteId: string }) => s.websiteId === siteId);
        expect(mine.up + mine.down).toBeGreaterThanOrEqual(n);
        const flowRegions = new Set(fleet.flow.filter((l: { websiteId: string }) => l.websiteId === siteId).map((l: { regionId: string }) => l.regionId));
        expect([...flowRegions].sort()).toEqual(regions.map((r) => r.id).sort());
    });

    it("stops checking a paused website", async () => {
        await http.patch(`/websites/${siteId}`, { paused: true }, auth(jwt));
        // Checks queued just before the pause may still finish (10 s timeout).
        await Bun.sleep(15_000);
        const before = await checksSoFar();
        await Bun.sleep((interval + 10) * 1000);
        expect(await checksSoFar()).toBe(before);
    }, 120_000);
});
