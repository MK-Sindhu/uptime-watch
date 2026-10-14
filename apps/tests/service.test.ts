import { beforeAll, describe, expect, it } from "bun:test";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

describe("Health check", () => {
    it("answers 200 when Postgres and ClickHouse are up", async () => {
        const res = await http.get("/health");
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ ok: true });
    });

    it("is never rate limited", async () => {
        // Kubernetes probes it every few seconds from the same address.
        const res = await http.get("/health");
        expect(res.headers["ratelimit"]).toBeUndefined();
        expect((await http.get("/regions")).headers["ratelimit"]).toBeDefined();
    });
});

describe("API spec and docs", () => {
    it("serves an OpenAPI 3.1 spec with every route", async () => {
        const res = await http.get("/openapi.json");
        expect(res.status).toBe(200);
        expect(res.data.openapi).toMatch(/^3\.1\./);
        expect(Object.keys(res.data.paths).sort()).toEqual([
            "/fleet",
            "/health",
            "/me/status-page",
            "/public/status/{slug}",
            "/regions",
            "/status/{websiteId}",
            "/user/signin",
            "/user/signup",
            "/website",
            "/websites",
            "/websites/{websiteId}",
            "/websites/{websiteId}/daily",
            "/websites/{websiteId}/incidents",
            "/websites/{websiteId}/overview",
            "/websites/{websiteId}/series",
        ]);
    });

    it("documents the same limits the API enforces", async () => {
        const spec = (await http.get("/openapi.json")).data;
        const fleetRange = spec.paths["/fleet"].get.parameters.find((p: { name: string }) => p.name === "range");
        expect(fleetRange.schema.enum).toEqual(["1h", "24h"]);
    });

    it("serves the interactive reference at /docs", async () => {
        const res = await http.get("/docs");
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/html/);
    });
});

describe("Bad requests", () => {
    let jwt: string;
    beforeAll(async () => {
        ({ jwt } = await signUp());
    });

    it("rejects a body over 10 kB", async () => {
        const res = await http.post("/website", { url: "https://example.com/" + "a".repeat(11_000) }, auth(jwt));
        expect(res.status).toBe(413);
    });

    it("rejects malformed JSON", async () => {
        const res = await http.post("/website", "{\"url\": ", { headers: { Authorization: jwt, "Content-Type": "application/json" } });
        expect(res.status).toBe(400);
    });

    it("answers 404 for an unknown route", async () => {
        expect((await http.get("/no-such-route")).status).toBe(404);
    });
});
