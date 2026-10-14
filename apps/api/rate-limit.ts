import { rateLimit, type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";

// Rate limits are counted in Redis, so every API pod shares the same counters.
// With in-memory counters, N replicas would allow N times the limit.
const redis = await createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" })
    .on("error", (err) => console.log("Rate-limit Redis error", err))
    .connect();

function store(name: string) {
    return new RedisStore({
        prefix: `uptime-watch:rate-limit:${name}:`,
        sendCommand: (...args: string[]) => redis.sendCommand(args),
    });
}

function envNumber(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

const shared: Partial<Options> = {
    // RateLimit + RateLimit-Policy headers (IETF draft-8) and Retry-After on 429.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // If Redis is unreachable, let requests through instead of failing every
    // request: the API stays up, it is just unlimited until Redis is back.
    passOnStoreError: true,
};

// Every route except /health, per client IP.
export const globalLimiter = rateLimit({
    ...shared,
    windowMs: 60_000,
    limit: envNumber("RATE_LIMIT_PER_MINUTE", 120),
    store: store("global"),
    message: { message: "Too many requests. Wait a minute, then try again." },
});

// Sign-up and sign-in, per client IP: slows password guessing and mass sign-ups.
export const authLimiter = rateLimit({
    ...shared,
    windowMs: 15 * 60_000,
    limit: envNumber("RATE_LIMIT_AUTH_PER_15_MIN", 20),
    store: store("auth"),
    message: { message: "Too many sign-in attempts. Wait 15 minutes, then try again." },
});

// Adding websites, per signed-in user (runs after authMiddleware). Every
// website is checked from every region every round, so adding sites is the
// most expensive thing a user can do.
export const createWebsiteLimiter = rateLimit({
    ...shared,
    windowMs: 60_000,
    limit: envNumber("RATE_LIMIT_WEBSITES_PER_MINUTE", 10),
    keyGenerator: (req) => req.userId!,
    store: store("create-website"),
    message: { message: "You're adding websites too fast. Wait a minute, then try again." },
});

// Charts and stats on the site detail page, per signed-in user. One open
// detail page makes about 9 requests a minute.
export const aggregateLimiter = rateLimit({
    ...shared,
    windowMs: 60_000,
    limit: envNumber("RATE_LIMIT_AGGREGATES_PER_MINUTE", 120),
    keyGenerator: (req) => req.userId!,
    store: store("aggregates"),
    message: { message: "Too many chart requests. Wait a minute, then try again." },
});

// Rename, pause/resume, delete, status-page settings, per signed-in user.
export const websiteWriteLimiter = rateLimit({
    ...shared,
    windowMs: 60_000,
    limit: envNumber("RATE_LIMIT_WEBSITE_WRITES_PER_MINUTE", 30),
    keyGenerator: (req) => req.userId!,
    store: store("website-writes"),
    message: { message: "Too many changes at once. Wait a minute, then try again." },
});

// Public status pages, per client IP (no sign-in needed to read them).
export const publicStatusLimiter = rateLimit({
    ...shared,
    windowMs: 60_000,
    limit: envNumber("RATE_LIMIT_PUBLIC_STATUS_PER_MINUTE", 30),
    store: store("public-status"),
    message: { message: "Too many requests. Wait a minute, then try again." },
});

// Hard cap on websites per account, so one account can't make the workers
// hammer a third-party site (or flood our own queue) with thousands of entries.
export const MAX_WEBSITES_PER_USER = envNumber("MAX_WEBSITES_PER_USER", 20);

export async function closeRateLimitStore() {
    await redis.close();
}
