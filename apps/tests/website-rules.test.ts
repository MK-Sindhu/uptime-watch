import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

let owner: Awaited<ReturnType<typeof signUp>>;
let other: Awaited<ReturnType<typeof signUp>>;
const created: string[] = [];

async function addSite(url: string) {
    const res = await http.post("/website", { url }, auth(owner.jwt));
    expect(res.status).toBe(200);
    created.push(res.data.id);
    return res.data.id as string;
}

beforeAll(async () => {
    owner = await signUp();
    other = await signUp();
});

// The workers check every website every round, so don't leave any behind.
afterAll(async () => {
    for (const id of created) await http.delete(`/websites/${id}`, auth(owner.jwt));
});

describe("Adding a website", () => {
    it("accepts http and https addresses up to 2048 characters", async () => {
        await addSite("https://example.com");
        await addSite("http://example.com");
        const longest = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length);
        await addSite(longest);
    });

    it("rejects other schemes, bare host names and longer addresses", async () => {
        // Its own user: every attempt counts against the 10-a-minute limit.
        const { jwt } = await signUp();
        const bad = [
            "ftp://example.com",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "example.com",
            "",
            "https://example.com/" + "a".repeat(2029),
            42,
        ];
        for (const url of bad) expect((await http.post("/website", { url }, auth(jwt))).status).toBe(411);
    });

    it("needs a token", async () => {
        expect((await http.post("/website", { url: "https://example.com" })).status).toBe(403);
    });

    it("answers 429 when websites are added too fast", async () => {
        const { jwt } = await signUp();
        // Invalid addresses count too, so nothing gets created here.
        let res = await http.post("/website", { url: "" }, auth(jwt));
        let attempts = 1;
        while (res.status === 411 && attempts < 100) {
            res = await http.post("/website", { url: "" }, auth(jwt));
            attempts++;
        }
        expect(res.status).toBe(429);
        expect(res.data.message).toMatch(/adding websites too fast/);
        expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
        expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(60);
        // The limit is per user.
        expect((await http.post("/website", { url: "" }, auth(other.jwt))).status).toBe(411);
    });
});

describe("Seeing websites", () => {
    let siteId: string;
    beforeAll(async () => {
        siteId = await addSite("https://example.com/listed");
    });

    it("lists only your own websites", async () => {
        const mine = await http.get("/websites", auth(owner.jwt));
        const theirs = await http.get("/websites", auth(other.jwt));
        const site = mine.data.websites.find((w: { id: string }) => w.id === siteId);
        expect(site).toMatchObject({ url: "https://example.com/listed", user_id: owner.id, ticks: expect.any(Array) });
        expect(theirs.data.websites.map((w: { id: string }) => w.id)).not.toContain(siteId);
    });

    it("doesn't show another user's website on /status", async () => {
        expect((await http.get(`/status/${siteId}`, auth(owner.jwt))).data.user_id).toBe(owner.id);
        const res = await http.get(`/status/${siteId}`, auth(other.jwt));
        expect(res.status).toBe(409);
        expect(res.data).not.toHaveProperty("url");
    });

    it("answers 404 for a website that doesn't exist", async () => {
        for (const id of ["does-not-exist", crypto.randomUUID()]) {
            expect((await http.get(`/websites/${id}`, auth(owner.jwt))).status).toBe(404);
            expect((await http.get(`/websites/${id}/overview`, auth(owner.jwt))).status).toBe(404);
            expect((await http.patch(`/websites/${id}`, { name: "x" }, auth(owner.jwt))).status).toBe(404);
            expect((await http.delete(`/websites/${id}`, auth(owner.jwt))).status).toBe(404);
        }
    });
});

describe("Changing a website", () => {
    let siteId: string;
    beforeAll(async () => {
        siteId = await addSite("https://example.com/changed");
    });

    const patch = (body: unknown) => http.patch(`/websites/${siteId}`, body, auth(owner.jwt));

    it("clears the name with an empty, blank or null name", async () => {
        expect((await patch({ name: "  Docs  " })).data.name).toBe("Docs");
        for (const name of ["", "   ", null]) {
            expect((await patch({ name: "Docs" })).data.name).toBe("Docs");
            expect((await patch({ name })).data.name).toBeNull();
        }
    });

    it("pauses and resumes", async () => {
        expect((await patch({ paused: true })).data.paused).toBe(true);
        expect((await patch({ paused: false })).data.paused).toBe(false);
    });

    it("can't move a website to another user or change its address", async () => {
        const res = await patch({ name: "Mine", user_id: other.id, url: "https://evil.example" });
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({ user_id: owner.id, url: "https://example.com/changed" });
        // Only unknown fields: nothing to change.
        expect((await patch({ user_id: other.id })).status).toBe(400);
    });

    it("rejects values of the wrong type", async () => {
        for (const body of [{ paused: "yes" }, { public: 1 }, { name: 42 }]) {
            expect((await patch(body)).status).toBe(400);
        }
    });
});

describe("Chart parameters", () => {
    let siteId: string;
    beforeAll(async () => {
        siteId = await addSite("https://example.com/charts");
    });

    const get = (path: string) => http.get(`/websites/${siteId}${path}`, auth(owner.jwt));

    it("rejects values outside the allowed range", async () => {
        for (const path of [
            "/overview?range=1y",
            "/series?range=5m",
            `/series?region=${"r".repeat(65)}`,
            "/incidents?limit=0",
            "/incidents?limit=201",
            "/incidents?limit=many",
            "/daily?days=6",
            "/daily?days=91",
            `/daily?tz=${"x".repeat(65)}`,
        ]) {
            const res = await get(path);
            expect(`${path} ${res.status}`).toBe(`${path} 400`);
            expect(res.data.message).toEqual(expect.any(String));
        }
    });

    it("accepts the edges of each range", async () => {
        expect((await get("/incidents?limit=1")).status).toBe(200);
        expect((await get("/incidents?limit=200")).status).toBe(200);
        expect((await get("/daily?days=7")).data.items).toHaveLength(7);
        expect((await get("/daily?days=90")).data.items).toHaveLength(90);
        expect((await get("/series?region=all")).data.region).toBeNull();
    });
});
