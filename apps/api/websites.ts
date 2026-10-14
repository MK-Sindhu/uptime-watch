// Site detail, management and status-page routes. Mounted in index.ts after
// the global rate limiter. Every /websites/:websiteId route checks that the
// site belongs to the signed-in user and answers 404 otherwise.
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "store";
import {
    CHECK_INTERVAL_SECONDS,
    FAST_MS,
    SLOW_MS,
    dailyUptime,
    fleetFlow,
    fleetSeries,
    fleetStats,
    incidents,
    overview,
    rangeWindow,
    series,
} from "timeseries";
import { authMiddleware } from "./middleware";
import { aggregateLimiter, publicStatusLimiter, websiteWriteLimiter } from "./rate-limit";
import { DailyQuery, IncidentsQuery, OverviewQuery, SeriesQuery, StatusPagePatch, WebsitePatch } from "./types";

// The fleet's check flow needs individual checks, which are kept for 5 days,
// so it covers up to 24 hours.
const FleetQuery = z.object({ range: z.enum(["1h", "24h"]).default("24h") });

export const websitesRouter = Router();

// ------------------------------------------------------------------ helpers

function badRequest(res: Response, error: { issues: { message: string }[] }) {
    res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request." });
}

async function ownedWebsite(req: Request) {
    return db.orm.public.website
        .where({ id: req.params.websiteId as string, user_id: req.userId! })
        .first();
}

type WebsiteRow = NonNullable<Awaited<ReturnType<typeof ownedWebsite>>>;

function detail(w: WebsiteRow) {
    return {
        id: w.id,
        url: w.url,
        user_id: w.user_id,
        name: w.name ?? null,
        paused: w.paused,
        public: w.public,
        time_added: w.time_added.toString(),
    };
}

const notFound = (res: Response) => res.status(404).json({ message: "No such website." });

// Region id -> name, refreshed at most once a minute per pod.
let regionCache: { at: number; names: Map<string, string> } | null = null;
async function regionNames() {
    if (!regionCache || Date.now() - regionCache.at > 60_000) {
        const regions = await db.orm.public.region.select("id", "name").all();
        regionCache = { at: Date.now(), names: new Map(regions.map((r) => [r.id, r.name])) };
    }
    return regionCache.names;
}

// Accepts aliases too (Asia/Kolkata and Asia/Calcutta), which
// Intl.supportedValuesOf("timeZone") would not list.
function isValidTimeZone(tz: string) {
    try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

// ------------------------------------------------------------- site detail

websitesRouter.get("/websites/:websiteId", authMiddleware, async (req, res) => {
    const website = await ownedWebsite(req);
    if (!website) return notFound(res);
    res.json(detail(website));
});

websitesRouter.patch("/websites/:websiteId", authMiddleware, websiteWriteLimiter, async (req, res) => {
    const input = WebsitePatch.safeParse(req.body);
    if (!input.success) return badRequest(res, input.error);
    const { name, ...rest } = input.data;
    const changes = { ...rest, ...(name !== undefined ? { name: name || null } : {}) };

    const updated = await db.orm.public.website
        .where({ id: req.params.websiteId as string, user_id: req.userId! })
        .update(changes);
    if (!updated) return notFound(res);
    res.json(detail(updated));
});

websitesRouter.delete("/websites/:websiteId", authMiddleware, websiteWriteLimiter, async (req, res) => {
    const website = await ownedWebsite(req);
    if (!website) return notFound(res);
    // Old Postgres checks reference the site (foreign key), so remove them
    // first. Its ClickHouse checks are never read again and expire by TTL.
    await db.orm.public.website_tick.where({ website_id: website.id }).deleteAll();
    await db.orm.public.website.where({ id: website.id, user_id: req.userId! }).delete();
    res.status(204).end();
});

// ----------------------------------------------------------------- charts

websitesRouter.get("/websites/:websiteId/overview", authMiddleware, aggregateLimiter, async (req, res) => {
    const query = OverviewQuery.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const website = await ownedWebsite(req);
    if (!website) return notFound(res);

    const { from, to, source } = rangeWindow(query.data.range);
    const [{ total, regions }, names] = await Promise.all([overview(website.id, from, to, source), regionNames()]);
    res.json({
        range: query.data.range,
        checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
        from: from.toISOString(),
        to: to.toISOString(),
        up: total.up,
        down: total.down,
        uptimePct: total.uptimePct,
        latency: total.latency,
        lastStatus: total.lastStatus,
        lastAt: total.lastAt,
        regions: regions.map((r) => ({ ...r, name: names.get(r.regionId) ?? r.regionId })),
    });
});

websitesRouter.get("/websites/:websiteId/series", authMiddleware, aggregateLimiter, async (req, res) => {
    const query = SeriesQuery.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const website = await ownedWebsite(req);
    if (!website) return notFound(res);

    const region = query.data.region && query.data.region !== "all" ? query.data.region : null;
    const { from, to, stepSeconds, source } = rangeWindow(query.data.range);
    const points = await series(website.id, from, to, stepSeconds, region, source);
    res.json({ range: query.data.range, from: from.toISOString(), to: to.toISOString(), stepSeconds, region, points });
});

websitesRouter.get("/websites/:websiteId/incidents", authMiddleware, aggregateLimiter, async (req, res) => {
    const query = IncidentsQuery.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const website = await ownedWebsite(req);
    if (!website) return notFound(res);

    const { from, to } = rangeWindow(query.data.range);
    const list = await incidents(website.id, from, to, query.data.limit);
    res.json({ range: query.data.range, from: from.toISOString(), to: to.toISOString(), incidents: list });
});

websitesRouter.get("/websites/:websiteId/daily", authMiddleware, aggregateLimiter, async (req, res) => {
    const query = DailyQuery.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    if (!isValidTimeZone(query.data.tz)) return res.status(400).json({ message: "Unknown time zone." });
    const website = await ownedWebsite(req);
    if (!website) return notFound(res);

    const items = await dailyUptime(website.id, query.data.days, query.data.tz);
    res.json({ days: query.data.days, tz: query.data.tz, items });
});

// All of the user's sites together: health, a time series, per-site stats
// and how checks split region -> site -> outcome (fast/normal/slow/down).
websitesRouter.get("/fleet", authMiddleware, aggregateLimiter, async (req, res) => {
    const query = FleetQuery.safeParse(req.query);
    if (!query.success) return badRequest(res, query.error);
    const websites = await db.orm.public.website.where({ user_id: req.userId! }).select("id").all();
    const ids = websites.map((w) => w.id);
    const { from, to, stepSeconds } = rangeWindow(query.data.range);
    const [stats, points, flow, names] = await Promise.all([
        fleetStats(ids, from, to),
        fleetSeries(ids, from, to, stepSeconds),
        fleetFlow(ids, from, to),
        regionNames(),
    ]);
    res.json({
        range: query.data.range,
        from: from.toISOString(),
        to: to.toISOString(),
        stepSeconds,
        checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
        health: { up: stats.total.up, down: stats.total.down, uptimePct: stats.total.uptimePct, latency: stats.total.latency },
        series: points,
        sites: stats.sites,
        flow,
        thresholds: { fastMs: FAST_MS, slowMs: SLOW_MS },
        regions: [...names].map(([id, name]) => ({ id, name })),
    });
});

websitesRouter.get("/regions", authMiddleware, async (req, res) => {
    const names = await regionNames();
    res.json({ regions: [...names].map(([id, name]) => ({ id, name })) });
});

// ------------------------------------------------------------ status page

function statusPageSettings(user: { status_slug: string | null; status_title: string | null }) {
    return {
        slug: user.status_slug ?? null,
        title: user.status_title ?? null,
        url: user.status_slug ? `/status/${user.status_slug}` : null,
    };
}

websitesRouter.get("/me/status-page", authMiddleware, async (req, res) => {
    const user = await db.orm.public.user.where({ id: req.userId! }).first();
    if (!user) return res.status(403).send("");
    res.json(statusPageSettings(user));
});

websitesRouter.patch("/me/status-page", authMiddleware, websiteWriteLimiter, async (req, res) => {
    const input = StatusPagePatch.safeParse(req.body);
    if (!input.success) return badRequest(res, input.error);
    const changes = {
        ...(input.data.slug !== undefined ? { status_slug: input.data.slug } : {}),
        ...(input.data.title !== undefined ? { status_title: input.data.title || null } : {}),
    };
    try {
        const user = await db.orm.public.user.where({ id: req.userId! }).update(changes);
        if (!user) return res.status(403).send("");
        res.json(statusPageSettings(user));
    } catch (e) {
        // Unique violation on status_slug
        if (String((e as Error)?.message ?? e).match(/unique|duplicate|status_slug/i)) {
            return res.status(409).json({ message: "That address is taken. Pick another one." });
        }
        throw e;
    }
});

// Public page: no sign-in. Cached per pod for 30 s so a busy status page
// doesn't turn every visit into dozens of ClickHouse queries.
const publicCache = new Map<string, { at: number; body: unknown }>();

websitesRouter.get("/public/status/:slug", publicStatusLimiter, async (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    const cached = publicCache.get(slug);
    if (cached && Date.now() - cached.at < 30_000) return res.json(cached.body);

    const owner = await db.orm.public.user.where({ status_slug: slug }).first();
    if (!owner) return res.status(404).json({ message: "No status page at this address." });

    const sites = await db.orm.public.website.where({ user_id: owner.id, public: true }).all();
    const day24 = rangeWindow("24h");
    const month = rangeWindow("30d");
    const rows = await Promise.all(sites.map(async (w) => {
        const [day, daily, recent] = await Promise.all([
            overview(w.id, day24.from, day24.to),
            dailyUptime(w.id, 90, "UTC"),
            incidents(w.id, month.from, month.to, 20),
        ]);
        const up90 = daily.reduce((n, d) => n + d.up, 0);
        const down90 = daily.reduce((n, d) => n + d.down, 0);
        return {
            id: w.id,
            name: w.name ?? null,
            url: w.url,
            paused: w.paused,
            status: w.paused ? null : day.total.lastStatus,
            checkedAt: day.total.lastAt,
            uptime24hPct: day.total.uptimePct,
            uptime90dPct: up90 + down90 === 0 ? null : (up90 / (up90 + down90)) * 100,
            daily,
            incidents30d: recent,
        };
    }));

    const body = {
        title: owner.status_title ?? `${owner.username} status`,
        slug,
        generatedAt: new Date().toISOString(),
        regionCount: (await regionNames()).size,
        checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
        allUp: rows.every((r) => r.paused || r.status !== "Down"),
        sites: rows,
    };
    if (publicCache.size > 500) publicCache.clear();
    publicCache.set(slug, { at: Date.now(), body });
    res.json(body);
});

// Errors from the routes above: log, answer JSON instead of an HTML page.
websitesRouter.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error(`${req.method} ${req.path} failed:`, err);
    if (res.headersSent) return next(err);
    res.status(500).json({ message: "Something went wrong on our side. Try again in a moment." });
});
