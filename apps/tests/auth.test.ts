import { beforeAll, describe, expect, it } from "bun:test";
import jwt from "jsonwebtoken";
import { auth, testClient } from "./helpers";

const { http, signUp } = testClient();

describe("Sign-up", () => {
    it("rejects a body without a username and password", async () => {
        for (const body of [{}, { email: "a@b.c", password: "x" }, { username: "someone" }, { username: 1, password: 2 }]) {
            expect((await http.post("/user/signup", body)).status).toBe(403);
        }
    });

    it("rejects a username that is taken", async () => {
        const { username } = await signUp();
        expect((await http.post("/user/signup", { username, password: "another-password" })).status).toBe(403);
    });

    it("returns only the new user's id", async () => {
        const res = await http.post("/user/signup", { username: `test-${crypto.randomUUID()}`, password: "secret-123" });
        expect(res.status).toBe(200);
        expect(Object.keys(res.data)).toEqual(["id"]);
    });

    // Sign-ups count against the limit of 20 per address: use another one.
    const { http: rules } = testClient();

    it("says which rule a username or password breaks", async () => {
        const name = () => `test-${crypto.randomUUID()}`;
        const cases: [Record<string, string>, RegExp][] = [
            [{ username: "ab", password: "long-enough" }, /at least 3/],
            [{ username: "t".repeat(65), password: "long-enough" }, /at most 64/],
            [{ username: ` ${name()}`, password: "long-enough" }, /start or end with a space/],
            [{ username: "", password: "" }, /at least 3/],
            [{ username: name(), password: "1234567" }, /at least 8/],
            [{ username: name(), password: "p".repeat(129) }, /at most 128/],
        ];
        for (const [body, message] of cases) {
            const res = await rules.post("/user/signup", body);
            expect(res.status).toBe(403);
            expect(res.data.message).toMatch(message);
        }
    });

    it("accepts the longest username and the shortest and longest password", async () => {
        const longest = `test-${crypto.randomUUID()}`.padEnd(64, "x");
        expect((await rules.post("/user/signup", { username: longest, password: "12345678" })).status).toBe(200);
        expect((await rules.post("/user/signup", { username: `test-${crypto.randomUUID()}`, password: "p".repeat(128) })).status).toBe(200);
    });
});

describe("Sign-in", () => {
    let user: Awaited<ReturnType<typeof signUp>>;
    beforeAll(async () => {
        user = await signUp();
    });

    it("returns a token for the user", async () => {
        const res = await http.post("/user/signin", { username: user.username, password: user.password });
        expect(res.status).toBe(200);
        expect(Object.keys(res.data)).toEqual(["jwt"]);
        expect(jwt.decode(res.data.jwt)).toMatchObject({ sub: user.id });
    });

    it("answers a wrong password and an unknown user the same way", async () => {
        // Same answer, so sign-in can't be used to find out which usernames exist.
        const wrongPassword = await http.post("/user/signin", { username: user.username, password: "wrong" });
        const unknownUser = await http.post("/user/signin", { username: `test-${crypto.randomUUID()}`, password: "wrong" });
        expect(wrongPassword.status).toBe(403);
        expect([unknownUser.status, unknownUser.data]).toEqual([wrongPassword.status, wrongPassword.data]);
    });
});

describe("Signed-in routes", () => {
    const routes = ["/websites", "/fleet", "/regions", "/me/status-page"];
    let user: Awaited<ReturnType<typeof signUp>>;
    beforeAll(async () => {
        user = await signUp();
    });

    it("accept the token as the raw Authorization header", async () => {
        for (const route of routes) expect((await http.get(route, auth(user.jwt))).status).toBe(200);
    });

    it("get a token that expires", async () => {
        const claims = jwt.decode(user.jwt) as { iat: number; exp?: number };
        expect(claims.exp).toBeGreaterThan(claims.iat);
        expect(claims.exp! * 1000).toBeGreaterThan(Date.now());
    });

    it("reject a missing, broken or forged token", async () => {
        const forged = jwt.sign({ sub: user.id }, "not-the-server-secret");
        for (const route of routes) {
            expect((await http.get(route)).status).toBe(403);
            expect((await http.get(route, auth("not-a-token"))).status).toBe(403);
            expect((await http.get(route, auth(forged))).status).toBe(403);
            expect((await http.get(route, auth(`Bearer ${user.jwt}`))).status).toBe(403);
        }
    });
});

// Signing tokens needs the API's secret: JWT_SECRET, or the one in
// apps/api/.env when testing locally. Skipped when neither is there.
async function apiSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    const env = await Bun.file(new URL("../api/.env", import.meta.url)).text().catch(() => "");
    return env.match(/^JWT_SECRET=["']?(.*?)["']?\s*$/m)?.[1];
}
const secret = await apiSecret();

describe.skipIf(!secret)("Expired and non-expiring tokens", () => {
    let userId: string;
    beforeAll(async () => {
        userId = (await signUp()).id;
    });

    const sign = (claims: object) => jwt.sign({ sub: userId, ...claims }, secret!);
    const now = Math.floor(Date.now() / 1000);

    it("accept a token that is still valid", async () => {
        // Proves the secret matches, so the 403s below are about expiry.
        expect((await http.get("/websites", auth(sign({ exp: now + 60 })))).status).toBe(200);
    });

    it("reject an expired token", async () => {
        expect((await http.get("/websites", auth(sign({ exp: now - 60 })))).status).toBe(403);
    });

    it("reject a token without an expiry", async () => {
        // Tokens signed before tokens expired: they would otherwise work forever.
        expect((await http.get("/websites", auth(sign({})))).status).toBe(403);
    });
});

describe("Sign-in rate limit", () => {
    it("answers 429 with Retry-After once the limit is used up", async () => {
        // A client address of its own, so the rest of the suite isn't locked out.
        const { http: guesser } = testClient();
        const first = await guesser.post("/user/signin", { username: "nobody", password: "guess" });
        // RateLimit-Policy has one entry per limiter; the sign-in one is the 15-minute (900 s) window.
        const limit = Number(String(first.headers["ratelimit-policy"]).match(/q=(\d+); w=900/)?.[1]);
        expect(limit).toBeGreaterThan(0);

        for (let i = 1; i < limit; i++) {
            expect((await guesser.post("/user/signin", { username: "nobody", password: `guess-${i}` })).status).toBe(403);
        }
        const blocked = await guesser.post("/user/signin", { username: "nobody", password: "one-more" });
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
        expect(blocked.data.message).toMatch(/Wait 15 minutes/);

        // Sign-up shares the limit; other addresses don't.
        expect((await guesser.post("/user/signup", { username: "x", password: "y" })).status).toBe(429);
        expect((await http.post("/user/signin", { username: "nobody", password: "guess" })).status).toBe(403);
    });
});
