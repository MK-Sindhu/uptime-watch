import jwt from "jsonwebtoken"
import type { SignOptions } from "jsonwebtoken"
import express from "express";
import type { NextFunction, Request, Response } from "express";
const app = express();

import { db } from "store";
// import { AuthInput } from "./types";
// import { AuthInput, WebsiteInput } from "./types";
import { AuthInput, SignupInput, WebsiteInput } from "./types";
import { authMiddleware } from "./middleware";
// Check results (ticks) are stored in ClickHouse.
// import { closeTimeseries, ensureSchema, latestTicks, pingTimeseries } from "timeseries";
import { closeTimeseries, emptyStats24h, ensureSchema, latestTicks, pingTimeseries, stats24h } from "timeseries";
// Site detail, rename/pause/delete, charts and status-page routes.
import { websitesRouter } from "./websites";
import { buildOpenApiDocument, docsHtml } from "./openapi";
import {
    MAX_WEBSITES_PER_USER,
    authLimiter,
    closeRateLimitStore,
    createWebsiteLimiter,
    globalLimiter,
} from "./rate-limit";

// How long a sign-in lasts: "7d", "12h", or a number of seconds. A string
// without a unit would mean milliseconds to jsonwebtoken, so plain numbers
// become seconds. Signing a throwaway token here makes a typo stop the API at
// start-up instead of failing every sign-in.
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
const JWT_EXPIRES_IN = (/^\d+$/.test(jwtExpiresIn) ? Number(jwtExpiresIn) : jwtExpiresIn) as SignOptions["expiresIn"];
jwt.sign({}, "start-up check", { expiresIn: JWT_EXPIRES_IN });


await db.connect();
await ensureSchema();

// Rate limits are per client IP, so req.ip must be the real client, not the
// proxy in front of us. Trust only proxies on loopback/private networks (the
// Next.js server, the Kubernetes ingress), so clients can't fake their IP with
// an X-Forwarded-For header. Override with TRUST_PROXY if your setup differs.
app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal");

// app.use(express.json());
// Reject bodies over 10 kB (413) before parsing: every request body here is tiny.
app.use(express.json({ limit: "10kb" }));
 
// Kubernetes liveness/readiness probe: 200 only when Postgres and ClickHouse answer.
app.get("/health", async (req, res) => {
    try {
        await db.orm.public.region.select("id").first();
        if (!(await pingTimeseries())) throw new Error("ClickHouse ping failed");
        res.json({ ok: true });
    } catch (e) {
        console.error("health check failed:", e);
        res.status(503).json({ ok: false });
    }
});

// Every route registered below this line is rate limited per client IP.
// /health stays above it so Kubernetes probes are never refused.
app.use(globalLimiter);

// OpenAPI spec and interactive docs.
const openApiDocument = buildOpenApiDocument();
app.get("/openapi.json", (req, res) => {
    res.json(openApiDocument);
});
app.get("/docs", (req, res) => {
    res.type("html").send(docsHtml);
});

app.use(websitesRouter);

// app.post("/website",authMiddleware, async (req, res) => {
//     if (!req.body.url) {
//         res.status(411).json({});
//         return
//     }
// A user who already watches the maximum is told so straight away, before the
// add-website rate limit can answer "wait a minute" first.
async function belowWebsiteCap(req: Request, res: Response, next: NextFunction) {
    const existing = await db.orm.public.website.where({ user_id: req.userId! }).select("id").all();
    if (existing.length >= MAX_WEBSITES_PER_USER) {
        res.status(403).json({
            message: `You can watch at most ${MAX_WEBSITES_PER_USER} websites.`
        });
        return
    }
    next()
}

// app.post("/website", authMiddleware, createWebsiteLimiter, async (req, res) => {
app.post("/website", authMiddleware, belowWebsiteCap, createWebsiteLimiter, async (req, res) => {
    // Only http(s) URLs, at most 2048 characters (see WebsiteInput).
    const input = WebsiteInput.safeParse(req.body);
    if (!input.success) {
        res.status(411).json({});
        return
    }
    // const existing = await db.orm.public.website.where({ user_id: req.userId! }).select("id").all();
    // if (existing.length >= MAX_WEBSITES_PER_USER) {
    //     res.status(403).json({
    //         message: `You can watch at most ${MAX_WEBSITES_PER_USER} websites.`
    //     });
    //     return
    // }
    // (moved to belowWebsiteCap, which runs before the rate limit)
    const website = await db.orm.public.website.create({
        // url: req.body.url,
        url: input.data.url,
        time_added: Temporal.Now.instant(),
        user_id: req.userId!
    });
    res.json({
        id: website.id
    })
});

app.get("/status/:websiteId", authMiddleware, async (req, res) => {
    const website = await db.orm.public.website
        .where({ 
            id: req.params.websiteId as string,
            user_id: req.userId! 
        })
        // Ticks now live in ClickHouse, and this route doesn't return them.
        // .include("ticks", (ticks) =>
        //     ticks
        //         .orderBy((t) => t.createdAt.desc())
        //         .limit(10),
        // )
        .first();

    if (!website) {
        res.status(409).json({
            message:"Not Found"
        })
        return;
    }
     res.json({
        url: website.url,
        id: website.id,
        user_id: website.user_id
     })
});

// app.get("/websites", authMiddleware, async (req, res) => {
//     const websites = await db.orm.public.website
//         .where({ user_id: req.userId! })
//         .include("ticks", (ticks) =>
//             ticks
//                 .orderBy((t) => t.createdAt.desc())
//                 .limit(30),
//         )
//         .all();
//
//     res.json({
//         websites
//     })
// });
// Websites come from Postgres, their latest 30 checks from ClickHouse.
// The response shape is unchanged: each website has `ticks`, newest first.
app.get("/websites", authMiddleware, async (req, res) => {
    const websites = await db.orm.public.website
        .where({ user_id: req.userId! })
        .all();

    // const ticks = await latestTicks(websites.map((w) => w.id), 30);
    // Latest checks for the trace, plus 24 h uptime and median latency.
    const [ticks, stats] = await Promise.all([
        latestTicks(websites.map((w) => w.id), 30),
        stats24h(websites.map((w) => w.id)),
    ]);
    const ticksBySite = Map.groupBy(ticks, (t) => t.website_id);

    res.json({
        // websites: websites.map((w) => ({ ...w, ticks: ticksBySite.get(w.id) ?? [] }))
        websites: websites.map((w) => ({
            ...w,
            ticks: ticksBySite.get(w.id) ?? [],
            stats24h: stats.get(w.id) ?? emptyStats24h,
        }))
    })
});

// app.post("/user/signup", async (req, res) => {
app.post("/user/signup", authLimiter, async (req, res) => {
    // const data = AuthInput.safeParse(req.body);
    // if (!data.success) {
    //     res.status(403).send("");
    //     return;
    // }
    // Usernames 3-64 characters, passwords 8-128 (see SignupInput). The
    // message says which rule failed, so the sign-up form can show it.
    const data = SignupInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).json({ message: data.error.issues[0]?.message ?? "Invalid username or password." });
        return;
    }
    try {
        let user = await db.orm.public.user.create({
            username: data.data.username,
            // password: data.data.password
            // Store a salted hash (argon2id by default), never the password itself.
            password: await Bun.password.hash(data.data.password)
        })
        res.json({
            id: user.id
        })

    } catch(e) {
        console.error("signup failed:", e);
        res.status(403).send("");
        return;
    }

})

// app.post("/user/signin", async (req, res) => {
app.post("/user/signin", authLimiter, async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).send("");
        return;
    }
    let user = await db.orm.public.user.where({ username: data.data.username }).first()
    // if (!user || user.password !== data.data.password) {
    if (!user || !(await passwordMatches(data.data.password, user.password))) {
        res.status(403).send("");
        return;
    }
    // let token = jwt.sign({
    //     sub: user.id
    // }, process.env.JWT_SECRET!)
    // The token expires (JWT_EXPIRES_IN, 7 days by default), so a leaked one
    // stops working. authMiddleware's jwt.verify rejects expired tokens.
    let token = jwt.sign({
        sub: user.id
    }, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN })

    res.json({
        jwt: token
    })
})

// Bun.password.verify throws if the stored value isn't a hash (e.g. an old
// plain-text row), which should mean "wrong password", not a 500.
async function passwordMatches(plain: string, hash: string) {
    try {
        return await Bun.password.verify(plain, hash);
    } catch {
        return false;
    }
}

// app.listen(process.env.PORT || 3000);
const server = app.listen(process.env.PORT || 3000);
// Slow-client (slowloris) protection: a client must send all its headers
// within 10 s and the whole request within 15 s, or the connection is closed.
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;

// Kubernetes sends SIGTERM before stopping a pod: stop taking new requests,
// let in-flight ones finish, then exit.
async function shutdown() {
    server.close(async () => {
        await db.close();
        await closeTimeseries();
        await closeRateLimitStore();
        process.exit(0);
    });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);