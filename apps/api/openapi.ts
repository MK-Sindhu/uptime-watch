import { z } from "zod";
import { AuthInput, Range, SignupInput, StatusPagePatch, WebsiteInput, WebsitePatch } from "./types";

// OpenAPI 3.1 description of this API. Request bodies are the same zod schemas
// the routes validate with; response schemas mirror what the routes return.
// Served at GET /openapi.json, written to openapi.json by `bun run openapi`,
// and used to generate the typed client in packages/api-client.

const Tick = z.object({
    id: z.string(),
    website_id: z.string(),
    region_id: z.string(),
    status: z.enum(["Up", "Down", "Unknown"]),
    response_time_ms: z.int().nonnegative(),
    createdAt: z.iso.datetime(),
});

const Status = z.enum(["Up", "Down", "Unknown"]);

const Stats24h = z.object({
    up: z.int(),
    down: z.int(),
    uptimePct: z.number().nullable().describe("Up / (Up + Down) over the last 24 h; null without checks."),
    p50Ms: z.number().nullable(),
});

const Website = z.object({
    id: z.string(),
    url: z.string(),
    user_id: z.string(),
    name: z.string().nullable().describe("Display name; null means show the URL's host."),
    paused: z.boolean(),
    public: z.boolean().describe("Shown on the owner's public status page."),
    time_added: z.iso.datetime(),
    stats24h: Stats24h,
    ticks: z.array(Tick).describe("Latest checks, newest first (at most 30)."),
});

const WebsiteDetail = z.object({
    id: z.string(),
    url: z.string(),
    user_id: z.string(),
    name: z.string().nullable(),
    paused: z.boolean(),
    public: z.boolean(),
    time_added: z.iso.datetime(),
});

const Latency = z.object({
    avgMs: z.number().nullable(),
    p50Ms: z.number().nullable(),
    p95Ms: z.number().nullable(),
    maxMs: z.number().nullable(),
}).describe("Response times of the Up checks; null when there were none.");

const RegionOverview = z.object({
    regionId: z.string(),
    name: z.string(),
    up: z.int(),
    down: z.int(),
    uptimePct: z.number().nullable(),
    latency: Latency,
    lastStatus: Status.nullable(),
    lastMs: z.int().nullable(),
    lastAt: z.iso.datetime().nullable(),
});

const Overview = z.object({
    range: Range,
    checkIntervalSeconds: z.int().describe("How often each site is checked from each region."),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    up: z.int(),
    down: z.int(),
    uptimePct: z.number().nullable(),
    latency: Latency,
    lastStatus: Status.nullable(),
    lastAt: z.iso.datetime().nullable(),
    regions: z.array(RegionOverview),
});

const SeriesPoint = z.object({
    t: z.iso.datetime().describe("Bucket start."),
    up: z.int(),
    down: z.int(),
    avgMs: z.number().nullable(),
    p50Ms: z.number().nullable(),
    p95Ms: z.number().nullable(),
    maxMs: z.number().nullable(),
});

const Series = z.object({
    range: Range,
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    stepSeconds: z.int(),
    region: z.string().nullable(),
    points: z.array(SeriesPoint).describe("One point per bucket, oldest first; empty buckets have up = down = 0."),
});

const Incident = z.object({
    id: z.string(),
    startedAt: z.iso.datetime().describe("First failed check."),
    endedAt: z.iso.datetime().nullable().describe("First successful check after it; null while ongoing."),
    durationMs: z.int(),
    checks: z.int().describe("Failed checks across all regions."),
    regions: z.array(z.string()).describe("Region ids that saw it."),
    ongoing: z.boolean(),
});

const IncidentList = z.object({
    range: Range,
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    incidents: z.array(Incident).describe("Newest first."),
});

const DailyUptimeDay = z.object({
    day: z.string().describe("YYYY-MM-DD in the requested time zone."),
    up: z.int(),
    down: z.int(),
    uptimePct: z.number().nullable(),
});

const DailyUptime = z.object({ days: z.int(), tz: z.string(), items: z.array(DailyUptimeDay) });
const Region = z.object({ id: z.string(), name: z.string() });

const FleetPoint = z.object({
    t: z.iso.datetime(),
    up: z.int(),
    down: z.int(),
    uptimePct: z.number().nullable(),
    avgMs: z.number().nullable(),
    p95Ms: z.number().nullable(),
});
const FleetSite = z.object({ websiteId: z.string(), up: z.int(), down: z.int(), uptimePct: z.number().nullable(), latency: Latency });
const FlowLink = z.object({
    regionId: z.string(),
    websiteId: z.string(),
    outcome: z.enum(["fast", "normal", "slow", "down", "unknown"]),
    checks: z.int(),
});
const Fleet = z.object({
    range: z.enum(["1h", "24h"]),
    checkIntervalSeconds: z.int().describe("How often each site is checked from each region."),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    stepSeconds: z.int(),
    health: z.object({ up: z.int(), down: z.int(), uptimePct: z.number().nullable(), latency: Latency }),
    series: z.array(FleetPoint).describe("All sites together, one point per bucket."),
    sites: z.array(FleetSite).describe("Sites with at least one check in the range."),
    flow: z.array(FlowLink).describe("Checks per region, site and outcome."),
    thresholds: z.object({ fastMs: z.int(), slowMs: z.int() }).describe("fast < fastMs <= normal < slowMs <= slow"),
    regions: z.array(Region),
});
const RegionList = z.object({ regions: z.array(Region) });

const StatusPageSettings = z.object({
    slug: z.string().nullable(),
    title: z.string().nullable(),
    url: z.string().nullable().describe("Path of the public page, e.g. /status/acme."),
});

const PublicSite = z.object({
    id: z.string(),
    name: z.string().nullable(),
    url: z.string(),
    paused: z.boolean(),
    status: Status.nullable(),
    checkedAt: z.iso.datetime().nullable(),
    uptime24hPct: z.number().nullable(),
    uptime90dPct: z.number().nullable(),
    daily: z.array(DailyUptimeDay),
    incidents30d: z.array(Incident),
});

const PublicStatus = z.object({
    title: z.string(),
    slug: z.string(),
    generatedAt: z.iso.datetime(),
    regionCount: z.int().describe("How many regions check each site."),
    checkIntervalSeconds: z.int().describe("How often each site is checked from each region."),
    allUp: z.boolean(),
    sites: z.array(PublicSite),
});

const WebsiteSummary = z.object({ id: z.string(), url: z.string(), user_id: z.string() });
const WebsiteList = z.object({ websites: z.array(Website) });
const CreatedId = z.object({ id: z.string() });
const SignInResult = z.object({ jwt: z.string().describe("Send as the raw Authorization header.") });
const Health = z.object({ ok: z.boolean() });
const ErrorMessage = z.object({ message: z.string() });

const registry = z.registry<{ id: string; description?: string }>();
registry.add(AuthInput, { id: "AuthInput", description: "Username and password." });
registry.add(SignupInput, { id: "SignupInput", description: "Username (3-64 characters, no spaces at either end) and password (8-128 characters)." });
registry.add(WebsiteInput, { id: "WebsiteInput", description: "An http(s) URL to watch." });
registry.add(Tick, { id: "Tick", description: "One check of one website from one region." });
registry.add(Website, { id: "Website" });
registry.add(WebsiteSummary, { id: "WebsiteSummary" });
registry.add(WebsiteList, { id: "WebsiteList" });
registry.add(CreatedId, { id: "CreatedId" });
registry.add(SignInResult, { id: "SignInResult" });
registry.add(Health, { id: "Health" });
registry.add(ErrorMessage, { id: "ErrorMessage" });
registry.add(Stats24h, { id: "Stats24h", description: "Last 24 hours, all regions." });
registry.add(WebsiteDetail, { id: "WebsiteDetail" });
registry.add(WebsitePatch, { id: "WebsitePatch", description: "Any of name, paused, public." });
registry.add(Latency, { id: "Latency" });
registry.add(RegionOverview, { id: "RegionOverview" });
registry.add(Overview, { id: "Overview" });
registry.add(SeriesPoint, { id: "SeriesPoint" });
registry.add(Series, { id: "Series" });
registry.add(Incident, { id: "Incident", description: "A run of failed checks, merged across regions." });
registry.add(IncidentList, { id: "IncidentList" });
registry.add(DailyUptimeDay, { id: "DailyUptimeDay" });
registry.add(DailyUptime, { id: "DailyUptime" });
registry.add(Region, { id: "Region" });
registry.add(RegionList, { id: "RegionList" });
registry.add(FleetPoint, { id: "FleetPoint" });
registry.add(FleetSite, { id: "FleetSite" });
registry.add(FlowLink, { id: "FlowLink", description: "Checks from one region to one site with one outcome." });
registry.add(Fleet, { id: "Fleet", description: "All of the user's sites together." });
registry.add(StatusPageSettings, { id: "StatusPageSettings" });
registry.add(StatusPagePatch, { id: "StatusPagePatch" });
registry.add(PublicSite, { id: "PublicSite" });
registry.add(PublicStatus, { id: "PublicStatus" });

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string, description: string) => ({
    description,
    content: { "application/json": { schema: ref(id) } },
});
const noBody = (description: string) => ({ description });

const tooManyRequests = {
    ...json("ErrorMessage", "Rate limit hit. Wait for the time in the Retry-After header."),
    headers: {
        "Retry-After": { description: "Seconds until you may retry.", schema: { type: "integer" } },
        RateLimit: { description: "Remaining quota (IETF draft-8 format).", schema: { type: "string" } },
    },
};
const unauthorized = noBody("Missing, expired or invalid JWT.");
const auth = [{ jwt: [] }];
const notFound = json("ErrorMessage", "No such website for this user.");
const badRequest = json("ErrorMessage", "Invalid parameters.");
const websiteIdParam = { name: "websiteId", in: "path", required: true, schema: { type: "string" } };
const rangeParam = (fallback: string) => ({
    name: "range", in: "query", required: false,
    schema: { type: "string", enum: ["1h", "24h", "7d", "30d", "90d"], default: fallback },
});
const chartResponses = (id: string, description: string) => ({
    "200": json(id, description), "400": badRequest, "403": unauthorized, "404": notFound, "429": tooManyRequests,
});

export function buildOpenApiDocument() {
    const { schemas } = z.toJSONSchema(registry, {
        uri: (id) => `#/components/schemas/${id}`,
        unrepresentable: "any",
    });
    // Component schemas don't need their own $schema / $id.
    for (const s of Object.values(schemas)) {
        delete (s as Record<string, unknown>).$schema;
        delete (s as Record<string, unknown>).$id;
    }

    return {
        openapi: "3.1.0",
        info: {
            title: "Uptime Watch API",
            version: "1.0.0",
            description:
                "Sign up, add websites, and read their latest checks. " +
                "Every route is rate limited per client IP; sign-up, sign-in and adding websites have stricter limits.",
        },
        servers: [
            { url: "http://localhost:3000", description: "API, local" },
            { url: "/api", description: "Through the frontend proxy" },
        ],
        tags: [
            { name: "auth", description: "Accounts and tokens" },
            { name: "websites", description: "Watched websites and their checks" },
            { name: "charts", description: "Uptime, latency and incident data for one website" },
            { name: "status page", description: "Public status pages" },
            { name: "system", description: "Health and documentation" },
        ],
        paths: {
            "/user/signup": {
                post: {
                    operationId: "signUp",
                    security: [],
                    tags: ["auth"],
                    summary: "Create an account",
                    requestBody: { required: true, content: { "application/json": { schema: ref("SignupInput") } } },
                    responses: {
                        "200": json("CreatedId", "Account created."),
                        "403": { ...json("ErrorMessage", "The username or password breaks a rule; the message says which."), description: "A username or password that breaks a rule (with a message), or a taken username (no body)." },
                        "429": tooManyRequests,
                    },
                },
            },
            "/user/signin": {
                post: {
                    operationId: "signIn",
                    security: [],
                    tags: ["auth"],
                    summary: "Sign in and get a JWT",
                    description: "The JWT expires after JWT_EXPIRES_IN (7 days by default); then requests answer 403 and the user signs in again.",
                    requestBody: { required: true, content: { "application/json": { schema: ref("AuthInput") } } },
                    responses: {
                        "200": json("SignInResult", "Signed in."),
                        "403": noBody("Invalid body, or wrong username or password."),
                        "429": tooManyRequests,
                    },
                },
            },
            "/website": {
                post: {
                    operationId: "createWebsite",
                    tags: ["websites"],
                    summary: "Start watching a website",
                    security: auth,
                    requestBody: { required: true, content: { "application/json": { schema: ref("WebsiteInput") } } },
                    responses: {
                        "200": json("CreatedId", "Website added. Its first check arrives on the next round."),
                        "403": { ...json("ErrorMessage", "The account already watches the maximum number of websites."), description: "Missing or invalid JWT (no body), or the account already watches the maximum number of websites. Checked before the rate limit." },
                        "411": noBody("Missing or invalid URL (must be http or https, at most 2048 characters)."),
                        "429": tooManyRequests,
                    },
                },
            },
            "/websites": {
                get: {
                    operationId: "listWebsites",
                    tags: ["websites"],
                    summary: "List my websites with their latest checks",
                    security: auth,
                    responses: {
                        "200": json("WebsiteList", "The signed-in user's websites."),
                        "403": unauthorized,
                        "429": tooManyRequests,
                    },
                },
            },
            "/status/{websiteId}": {
                get: {
                    operationId: "getWebsite",
                    tags: ["websites"],
                    summary: "Get one of my websites",
                    security: auth,
                    parameters: [
                        { name: "websiteId", in: "path", required: true, schema: { type: "string" } },
                    ],
                    responses: {
                        "200": json("WebsiteSummary", "The website."),
                        "403": unauthorized,
                        "409": json("ErrorMessage", "No such website for this user."),
                        "429": tooManyRequests,
                    },
                },
            },
            "/websites/{websiteId}": {
                get: {
                    operationId: "getWebsiteDetail", tags: ["websites"], summary: "Get one of my websites with its settings",
                    security: auth, parameters: [websiteIdParam],
                    responses: { "200": json("WebsiteDetail", "The website."), "403": unauthorized, "404": notFound, "429": tooManyRequests },
                },
                patch: {
                    operationId: "updateWebsite", tags: ["websites"], summary: "Rename, pause/resume, or show/hide on the status page",
                    security: auth, parameters: [websiteIdParam],
                    requestBody: { required: true, content: { "application/json": { schema: ref("WebsitePatch") } } },
                    responses: { "200": json("WebsiteDetail", "Updated."), "400": badRequest, "403": unauthorized, "404": notFound, "429": tooManyRequests },
                },
                delete: {
                    operationId: "deleteWebsite", tags: ["websites"], summary: "Stop watching a website and delete it",
                    security: auth, parameters: [websiteIdParam],
                    responses: { "204": noBody("Deleted."), "403": unauthorized, "404": notFound, "429": tooManyRequests },
                },
            },
            "/websites/{websiteId}/overview": {
                get: {
                    operationId: "getWebsiteOverview", tags: ["charts"], summary: "Uptime, latency and per-region status for a range",
                    security: auth, parameters: [websiteIdParam, rangeParam("24h")],
                    responses: chartResponses("Overview", "Totals and one entry per region."),
                },
            },
            "/websites/{websiteId}/series": {
                get: {
                    operationId: "getWebsiteSeries", tags: ["charts"], summary: "Response time and failures over time, in buckets",
                    security: auth,
                    parameters: [websiteIdParam, rangeParam("24h"),
                        { name: "region", in: "query", required: false, description: "Region id, or omit/\"all\" for every region.", schema: { type: "string" } }],
                    responses: chartResponses("Series", "Buckets of 1 min (1h), 10 min (24h), 1 h (7d), 4 h (30d) or 12 h (90d)."),
                },
            },
            "/websites/{websiteId}/incidents": {
                get: {
                    operationId: "getWebsiteIncidents", tags: ["charts"], summary: "Outages: runs of failed checks",
                    security: auth,
                    parameters: [websiteIdParam, rangeParam("7d"),
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } }],
                    responses: chartResponses("IncidentList", "Newest first."),
                },
            },
            "/websites/{websiteId}/daily": {
                get: {
                    operationId: "getWebsiteDaily", tags: ["charts"], summary: "Uptime per calendar day",
                    security: auth,
                    parameters: [websiteIdParam,
                        { name: "days", in: "query", required: false, schema: { type: "integer", minimum: 7, maximum: 90, default: 90 } },
                        { name: "tz", in: "query", required: false, description: "IANA time zone for day boundaries.", schema: { type: "string", default: "UTC" } }],
                    responses: chartResponses("DailyUptime", "Exactly `days` entries, oldest first."),
                },
            },
            "/fleet": {
                get: {
                    operationId: "getFleet", tags: ["charts"], summary: "Health, trend and check flow across all my sites",
                    security: auth,
                    parameters: [{ name: "range", in: "query", required: false, description: "Up to 24 hours: the check flow needs individual checks, kept for 5 days.", schema: { type: "string", enum: ["1h", "24h"], default: "24h" } }],
                    responses: { "200": json("Fleet", "Totals, a time series, per-site stats and the check flow."), "400": badRequest, "403": unauthorized, "429": tooManyRequests },
                },
            },
            "/regions": {
                get: {
                    operationId: "listRegions", tags: ["charts"], summary: "Regions that check websites",
                    security: auth,
                    responses: { "200": json("RegionList", "All regions."), "403": unauthorized, "429": tooManyRequests },
                },
            },
            "/me/status-page": {
                get: {
                    operationId: "getStatusPageSettings", tags: ["status page"], summary: "My public status page settings",
                    security: auth,
                    responses: { "200": json("StatusPageSettings", "Current settings."), "403": unauthorized, "429": tooManyRequests },
                },
                patch: {
                    operationId: "updateStatusPage", tags: ["status page"], summary: "Set the status page address and title",
                    security: auth,
                    requestBody: { required: true, content: { "application/json": { schema: ref("StatusPagePatch") } } },
                    responses: {
                        "200": json("StatusPageSettings", "Updated."), "400": badRequest, "403": unauthorized,
                        "409": json("ErrorMessage", "That address is taken."), "429": tooManyRequests,
                    },
                },
            },
            "/public/status/{slug}": {
                get: {
                    operationId: "getPublicStatus", tags: ["status page"], summary: "A public status page (no sign-in)",
                    security: [],
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
                    responses: {
                        "200": json("PublicStatus", "The page. Cached for up to 30 s."),
                        "404": json("ErrorMessage", "No status page at this address."),
                        "429": tooManyRequests,
                    },
                },
            },
            "/health": {
                get: {
                    operationId: "getHealth",
                    security: [],
                    tags: ["system"],
                    summary: "Readiness: are Postgres and ClickHouse reachable?",
                    responses: {
                        "200": json("Health", "Both databases answer."),
                        "503": json("Health", "A database is unreachable."),
                    },
                },
            },
        },
        components: {
            schemas,
            securitySchemes: {
                jwt: {
                    type: "apiKey",
                    in: "header",
                    name: "Authorization",
                    description: "The JWT from POST /user/signin, sent as is (no `Bearer ` prefix).",
                },
            },
        },
    };
}

// Interactive docs at GET /docs (Scalar, loaded from a CDN). The spec URL is
// relative so the page also works behind the frontend proxy at /api/docs.
export const docsHtml = `<!doctype html>
<html>
  <head>
    <title>Uptime Watch API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
