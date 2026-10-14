import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
const sites = { shown: "", hidden: "", paused: "" };
const slug = `test-${Date.now().toString(36)}`;

beforeAll(async () => {
    alice = await signUp();
    bob = await signUp();
    for (const key of Object.keys(sites) as (keyof typeof sites)[]) {
        sites[key] = (await http.post("/website", { url: `https://example.com/${key}` }, auth(alice.jwt))).data.id;
    }
    await http.patch(`/websites/${sites.shown}`, { public: true }, auth(alice.jwt));
    await http.patch(`/websites/${sites.paused}`, { public: true, paused: true }, auth(alice.jwt));
});

afterAll(async () => {
    for (const id of Object.values(sites)) await http.delete(`/websites/${id}`, auth(alice.jwt));
});

describe("Status page settings", () => {
    it("start empty", async () => {
        const res = await http.get("/me/status-page", auth(alice.jwt));
        expect(res.data).toEqual({ slug: null, title: null, url: null });
    });

    it("only take 3-40 lowercase letters, digits or dashes as the address", async () => {
        for (const bad of ["ab", "-abc", "abc-", "Has-Caps", "has space", "a".repeat(41), "café"]) {
            const res = await http.patch("/me/status-page", { slug: bad }, auth(alice.jwt));
            expect(`${bad} ${res.status}`).toBe(`${bad} 400`);
        }
        expect((await http.patch("/me/status-page", {}, auth(alice.jwt))).status).toBe(400);
    });

    it("give an address to one account only", async () => {
        const mine = await http.patch("/me/status-page", { slug, title: "Alice's services" }, auth(alice.jwt));
        expect(mine.data).toEqual({ slug, title: "Alice's services", url: `/status/${slug}` });
        const taken = await http.patch("/me/status-page", { slug }, auth(bob.jwt));
        expect(taken.status).toBe(409);
        expect(taken.data.message).toMatch(/taken/);
    });
});

describe("Public status page", () => {
    it("shows only the websites marked public, without signing in", async () => {
        const res = await http.get(`/public/status/${slug}`);
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({ title: "Alice's services", slug, allUp: expect.any(Boolean) });
        expect(res.data.sites.map((s: { id: string }) => s.id).sort()).toEqual([sites.shown, sites.paused].sort());
        expect(res.data.regionCount).toBeGreaterThan(0);
        expect(Number.isInteger(res.data.checkIntervalSeconds) && res.data.checkIntervalSeconds > 0).toBe(true);
        for (const site of res.data.sites) {
            expect(site.daily).toHaveLength(90);
            expect(site.incidents30d).toEqual(expect.any(Array));
        }
        const paused = res.data.sites.find((s: { id: string }) => s.id === sites.paused);
        expect(paused).toMatchObject({ paused: true, status: null });
    });

    it("doesn't reveal who owns it", async () => {
        const body = JSON.stringify((await http.get(`/public/status/${slug}`)).data);
        expect(body).not.toContain(alice.id);
        expect(body).not.toContain("user_id");
        expect(body).not.toContain(sites.hidden);
    });

    it("finds the address in any letter case", async () => {
        expect((await http.get(`/public/status/${slug.toUpperCase()}`)).status).toBe(200);
    });

    it("goes away when the address is cleared", async () => {
        const address = `${slug}-bob`;
        await http.patch("/me/status-page", { slug: address }, auth(bob.jwt));
        const cleared = await http.patch("/me/status-page", { slug: null }, auth(bob.jwt));
        expect(cleared.data).toMatchObject({ slug: null, url: null });
        expect((await http.get(`/public/status/${address}`)).status).toBe(404);
    });
});
