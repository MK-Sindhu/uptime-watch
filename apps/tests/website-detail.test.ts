import { beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

describe("Website detail, settings and charts", () => {
    let owner: string, stranger: string, websiteId: string;

    beforeAll(async () => {
        owner = (await signUp()).jwt;
        stranger = (await signUp()).jwt;
        const res = await http.post("/website", { url: "https://example.com" }, auth(owner));
        websiteId = res.data.id;
    });

    it("Returns the website with its settings", async () => {
        const res = await http.get(`/websites/${websiteId}`, auth(owner));
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({ id: websiteId, url: "https://example.com", name: null, paused: false, public: false });
    });

    it("Renames and pauses a website", async () => {
        const renamed = await http.patch(`/websites/${websiteId}`, { name: "Example" }, auth(owner));
        expect(renamed.status).toBe(200);
        expect(renamed.data.name).toBe("Example");

        const paused = await http.patch(`/websites/${websiteId}`, { paused: true }, auth(owner));
        expect(paused.status).toBe(200);
        expect(paused.data.paused).toBe(true);
    });

    it("Rejects an empty or invalid change", async () => {
        expect((await http.patch(`/websites/${websiteId}`, {}, auth(owner))).status).toBe(400);
        expect((await http.patch(`/websites/${websiteId}`, { name: "x".repeat(81) }, auth(owner))).status).toBe(400);
    });

    it("Lists websites with 24 h stats", async () => {
        const res = await http.get("/websites", auth(owner));
        const site = res.data.websites.find((w: { id: string }) => w.id === websiteId);
        expect(site.stats24h).toMatchObject({ up: expect.any(Number), down: expect.any(Number) });
    });

    it("Returns chart data with one point per bucket", async () => {
        const buckets: Record<string, number> = { "1h": 60, "24h": 144, "7d": 168, "30d": 180, "90d": 180 };
        for (const [range, points] of Object.entries(buckets)) {
            const res = await http.get(`/websites/${websiteId}/series?range=${range}`, auth(owner));
            expect(res.status).toBe(200);
            expect(res.data.points.length).toBe(points);
        }
        const overview = await http.get(`/websites/${websiteId}/overview?range=7d`, auth(owner));
        expect(overview.status).toBe(200);
        expect(Array.isArray(overview.data.regions)).toBe(true);
        const incidents = await http.get(`/websites/${websiteId}/incidents?range=7d`, auth(owner));
        expect(incidents.status).toBe(200);
        const daily = await http.get(`/websites/${websiteId}/daily?days=90&tz=Asia/Kolkata`, auth(owner));
        expect(daily.status).toBe(200);
        expect(daily.data.items.length).toBe(90);
    });

    it("Rejects bad chart parameters", async () => {
        expect((await http.get(`/websites/${websiteId}/series?range=2y`, auth(owner))).status).toBe(400);
        expect((await http.get(`/websites/${websiteId}/daily?tz=Mars/Base`, auth(owner))).status).toBe(400);
    });

    it("Hides one user's website from another user", async () => {
        for (const path of ["", "/overview", "/series", "/incidents", "/daily"]) {
            expect((await http.get(`/websites/${websiteId}${path}`, auth(stranger))).status).toBe(404);
        }
        expect((await http.patch(`/websites/${websiteId}`, { name: "x" }, auth(stranger))).status).toBe(404);
        expect((await http.delete(`/websites/${websiteId}`, auth(stranger))).status).toBe(404);
    });

    it("Deletes a website", async () => {
        expect((await http.delete(`/websites/${websiteId}`, auth(owner))).status).toBe(204);
        expect((await http.get(`/websites/${websiteId}`, auth(owner))).status).toBe(404);
    });
});

describe("Public status page", () => {
    it("Answers 404 for an unknown address", async () => {
        const res = await http.get(`/public/status/no-such-page-${Date.now()}`);
        expect(res.status).toBe(404);
    });

    it("Publishes the websites marked public", async () => {
        const { jwt } = await signUp();
        const slug = `test-${Date.now()}`;
        const site = await http.post("/website", { url: "https://example.org" }, auth(jwt));
        await http.patch(`/websites/${site.data.id}`, { public: true }, auth(jwt));
        const settings = await http.patch("/me/status-page", { slug, title: "Test status" }, auth(jwt));
        expect(settings.data.url).toBe(`/status/${slug}`);

        const page = await http.get(`/public/status/${slug}`);
        expect(page.status).toBe(200);
        expect(page.data.title).toBe("Test status");
        expect(page.data.sites.length).toBe(1);
        expect(page.data.sites[0].daily.length).toBe(90);

        expect((await http.delete(`/websites/${site.data.id}`, auth(jwt))).status).toBe(204);
    });
});
