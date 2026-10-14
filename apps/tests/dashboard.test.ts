import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

let jwt: string;
let siteId: string | undefined;

beforeAll(async () => {
    ({ jwt } = await signUp());
});

afterAll(async () => {
    if (siteId) await http.delete(`/websites/${siteId}`, auth(jwt));
});

describe("Regions and the whole fleet", () => {
    it("lists the regions checks run from", async () => {
        const res = await http.get("/regions", auth(jwt));
        expect(res.status).toBe(200);
        expect(res.data.regions.length).toBeGreaterThan(0);
        for (const region of res.data.regions) expect(region).toEqual({ id: expect.any(String), name: expect.any(String) });
    });

    it("summarises an account without websites as empty", async () => {
        const res = await http.get("/fleet", auth(jwt));
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({
            range: "24h",
            stepSeconds: 600,
            health: { up: 0, down: 0, uptimePct: null },
            sites: [],
            flow: [],
            thresholds: { fastMs: expect.any(Number), slowMs: expect.any(Number) },
        });
        expect(res.data.series).toHaveLength(144);
        expect(Number.isInteger(res.data.checkIntervalSeconds) && res.data.checkIntervalSeconds > 0).toBe(true);
        expect(res.data.regions).toEqual((await http.get("/regions", auth(jwt))).data.regions);
    });

    it("covers the last hour in one-minute buckets", async () => {
        const res = await http.get("/fleet?range=1h", auth(jwt));
        expect(res.status).toBe(200);
        expect(res.data.stepSeconds).toBe(60);
        expect(res.data.series).toHaveLength(60);
    });

    it("refuses ranges longer than 24 hours", async () => {
        // Successful checks are kept 5 days, so longer ranges would be wrong.
        for (const range of ["7d", "30d", "90d"]) {
            const res = await http.get(`/fleet?range=${range}`, auth(jwt));
            expect(res.status).toBe(400);
            expect(res.data.message).toMatch(/1h|24h/);
        }
    });
});

describe("One website's charts", () => {
    const steps = { "1h": 60, "24h": 600, "7d": 3_600, "30d": 14_400, "90d": 43_200 };

    beforeAll(async () => {
        siteId = (await http.post("/website", { url: "https://example.com/dashboard" }, auth(jwt))).data.id;
        // Paused right away, so it stays without checks and every number is known.
        await http.patch(`/websites/${siteId}`, { paused: true }, auth(jwt));
    });

    it("reports the check interval and no data yet, for every range", async () => {
        const interval = (await http.get("/fleet", auth(jwt))).data.checkIntervalSeconds;
        for (const range of Object.keys(steps)) {
            const res = await http.get(`/websites/${siteId}/overview?range=${range}`, auth(jwt));
            expect(res.status).toBe(200);
            expect(res.data).toMatchObject({
                range,
                checkIntervalSeconds: interval,
                up: 0,
                down: 0,
                uptimePct: null,
                lastStatus: null,
                lastAt: null,
                regions: [],
                latency: { avgMs: null, p50Ms: null, p95Ms: null, maxMs: null },
            });
        }
    });

    it("splits each range into back-to-back buckets ending after now", async () => {
        for (const [range, step] of Object.entries(steps)) {
            const res = await http.get(`/websites/${siteId}/series?range=${range}`, auth(jwt));
            expect(res.data.stepSeconds).toBe(step);
            const times = res.data.points.map((p: { t: string }) => Date.parse(p.t));
            expect(times[0]).toBe(Date.parse(res.data.from));
            times.forEach((t: number, i: number) => expect(t).toBe(times[0] + i * step * 1000));
            expect(times.at(-1) + step * 1000).toBe(Date.parse(res.data.to));
            expect(Date.parse(res.data.to)).toBeGreaterThan(Date.now() - 5_000);
        }
    });

    it("has no incidents and 90 empty days", async () => {
        const incidents = await http.get(`/websites/${siteId}/incidents?range=90d`, auth(jwt));
        expect(incidents.data.incidents).toEqual([]);
        const daily = await http.get(`/websites/${siteId}/daily`, auth(jwt));
        expect(daily.data.items).toHaveLength(90);
        expect(daily.data.items.every((d: { up: number; down: number }) => d.up + d.down === 0)).toBe(true);
    });
});
