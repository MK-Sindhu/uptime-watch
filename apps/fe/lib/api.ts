// Thin layer over the generated API client (packages/api-client, generated
// from apps/api/openapi.json). Requests go to /api/*, which next.config.ts
// proxies to the API server. Components import from here, never from the
// client directly.

import {
  configureApiClient,
  createWebsite,
  deleteWebsite as deleteWebsiteRequest,
  getFleet as getFleetRequest,
  getStatusPageSettings as getStatusPageSettingsRequest,
  getWebsiteDaily,
  getWebsiteDetail,
  getWebsiteIncidents,
  getWebsiteOverview,
  getWebsiteSeries,
  listRegions as listRegionsRequest,
  listWebsites as listWebsitesRequest,
  signIn as signInRequest,
  signUp as signUpRequest,
  updateStatusPage as updateStatusPageRequest,
  updateWebsite as updateWebsiteRequest,
  type DailyUptime,
  type DailyUptimeDay,
  type Fleet,
  type FleetPoint,
  type FleetSite,
  type FlowLink,
  type Incident,
  type IncidentList,
  type Latency,
  type Overview,
  type PublicSite,
  type PublicStatus,
  type Region,
  type RegionOverview,
  type Series,
  type SeriesPoint,
  type Stats24h,
  type StatusPageSettings,
  type Tick,
  type Website,
  type WebsiteDetail,
  type WebsitePatch,
} from "api-client"

import * as demo from "./demo"

export type {
  DailyUptime,
  DailyUptimeDay,
  Fleet,
  FleetPoint,
  FleetSite,
  FlowLink,
  Incident,
  IncidentList,
  Latency,
  Overview,
  PublicSite,
  PublicStatus,
  Region,
  RegionOverview,
  Series,
  SeriesPoint,
  Stats24h,
  StatusPageSettings,
  Tick,
  Website,
  WebsiteDetail,
  WebsitePatch,
}
export type TickStatus = Tick["status"]
export type RangeKey = Overview["range"]

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // true when the API sent its own { message } (rate limits, site limit)
    public fromServer = false,
    // seconds from the Retry-After header on a 429
    public retryAfter?: number
  ) {
    super(message)
  }
}

const TOKEN_KEY = "uptime-watch.token"
const USERNAME_KEY = "uptime-watch.username"

// When the token runs out (ms since epoch), from its "exp" claim. null if the
// token can't be read; the API then decides.
function tokenExpiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload.exp === "number" ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function getSession(): { token: string; username: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    // An expired token would only get 403s: go straight to signing in.
    const expiresAt = tokenExpiresAt(token)
    if (expiresAt !== null && expiresAt <= Date.now()) return null
    return { token, username: localStorage.getItem(USERNAME_KEY) ?? "" }
  } catch {
    return null
  }
}

function saveSession(token: string, username: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USERNAME_KEY, username)
  } catch {
    // Storage blocked (private mode): the session lasts until reload.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
  } catch {}
  demo.resetDemo()
}

// TEMP demo: signed in to the sample-data demo (lib/demo.ts), not the API.
export function isDemoSession() {
  return getSession()?.token === demo.DEMO_TOKEN
}

function demoSite(websiteId: string) {
  const site = demo.findDemoSite(websiteId)
  if (!site) throw new ApiError(404, "No such website.", true)
  return site
}

configureApiClient({ baseUrl: "/api", getToken: () => getSession()?.token })

// Turn the generated client's { data, error, response } into data-or-throw.
async function call<T>(
  request: Promise<{ data?: T; error?: unknown; response?: Response }>
): Promise<T> {
  let result: Awaited<typeof request>
  try {
    result = await request
  } catch {
    throw new ApiError(0, "Can't reach the server.")
  }
  const { data, error, response } = result
  if (response?.ok) return data as T // 204 has no body
  const fromServer = !!error && typeof error === "object" && "message" in error
  const message = fromServer
    ? String((error as { message: unknown }).message)
    : (response?.statusText ?? "Request failed")
  const retryHeader = Number(response?.headers.get("Retry-After"))
  // The Next proxy answers 500 when the API itself is not running.
  throw new ApiError(
    response?.status ?? 0,
    message,
    fromServer,
    Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined
  )
}

// ---------------------------------------------------------------- account

export async function signIn(username: string, password: string) {
  try {
    const { jwt } = await call(signInRequest({ body: { username, password } }))
    saveSession(jwt, username)
  } catch (e) {
    // TEMP demo: no API answered (e.g. only the frontend is deployed), so
    // demo / demo1234 opens the sample-data demo instead. A real "wrong
    // password" (403) or rate limit (429) still shows as an error.
    const apiAnswered = e instanceof ApiError && (e.status === 403 || e.status === 429)
    if (!apiAnswered && demo.isDemoLogin(username, password)) {
      demo.resetDemo()
      saveSession(demo.DEMO_TOKEN, demo.DEMO_USERNAME)
      return
    }
    throw e
  }
}

export async function signUp(username: string, password: string) {
  await call(signUpRequest({ body: { username, password } }))
  await signIn(username, password)
}

// --------------------------------------------------------------- websites

export async function listWebsites() {
  if (isDemoSession()) return demo.demoWebsites()
  const { websites } = await call(listWebsitesRequest())
  return websites
}

export async function addWebsite(url: string) {
  if (isDemoSession()) {
    // Same rules as the API: http(s) only, at most 2048 characters.
    let valid = false
    try {
      valid = url.length <= 2048 && ["http:", "https:"].includes(new URL(url).protocol)
    } catch {}
    if (!valid) throw new ApiError(411, "Length Required")
    if (demo.demoSiteCount() >= demo.DEMO_MAX_SITES) {
      throw new ApiError(403, `You can watch at most ${demo.DEMO_MAX_SITES} websites.`, true)
    }
    return { id: demo.addDemoSite(url).id }
  }
  return call(createWebsite({ body: { url } }))
}

export async function getWebsite(websiteId: string) {
  if (isDemoSession()) return demo.demoWebsiteDetail(demoSite(websiteId))
  return call(getWebsiteDetail({ path: { websiteId } }))
}

export async function updateWebsite(websiteId: string, patch: WebsitePatch) {
  if (isDemoSession()) return demo.updateDemoSite(demoSite(websiteId), patch)
  return call(updateWebsiteRequest({ path: { websiteId }, body: patch }))
}

export async function deleteWebsite(websiteId: string) {
  if (isDemoSession()) return demo.removeDemoSite(demoSite(websiteId))
  await call(deleteWebsiteRequest({ path: { websiteId } }))
}

// ----------------------------------------------------------------- charts

export async function getOverview(websiteId: string, range: RangeKey) {
  if (isDemoSession()) return demo.demoOverview(demoSite(websiteId), range)
  return call(getWebsiteOverview({ path: { websiteId }, query: { range } }))
}

export async function getSeries(websiteId: string, range: RangeKey, region?: string | null) {
  if (isDemoSession()) {
    return demo.demoSeries(demoSite(websiteId), range, region && region !== "all" ? region : null)
  }
  return call(
    getWebsiteSeries({
      path: { websiteId },
      query: { range, ...(region && region !== "all" ? { region } : {}) },
    })
  )
}

export async function getIncidents(websiteId: string, range: RangeKey, limit = 50) {
  if (isDemoSession()) return demo.demoIncidents(demoSite(websiteId), range, limit)
  return call(getWebsiteIncidents({ path: { websiteId }, query: { range, limit } }))
}

// Day boundaries follow the viewer's time zone.
export async function getDaily(websiteId: string, days = 90) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  if (isDemoSession()) return demo.demoDaily(demoSite(websiteId), days, tz)
  return call(getWebsiteDaily({ path: { websiteId }, query: { days, tz } }))
}

// All of the user's sites together, for the dashboard's health panel and
// check-flow diagram.
// The check flow needs individual checks (kept 5 days), so up to 24 hours.
export async function getFleet(range: "1h" | "24h" = "24h") {
  if (isDemoSession()) return demo.demoFleet(range)
  return call(getFleetRequest({ query: { range } }))
}

export async function listRegions() {
  if (isDemoSession()) return demo.DEMO_REGIONS
  const { regions } = await call(listRegionsRequest())
  return regions
}

// ------------------------------------------------------------ status page

export async function getStatusPageSettings() {
  if (isDemoSession()) return demo.demoStatusPageSettings()
  return call(getStatusPageSettingsRequest())
}

export async function updateStatusPage(patch: { slug?: string | null; title?: string | null }) {
  if (isDemoSession()) {
    throw new ApiError(403, "The demo account's status page stays at /status/demo.", true)
  }
  return call(updateStatusPageRequest({ body: patch }))
}

// ------------------------------------------------------------------ errors

// The API answers 403 with no body for a missing, expired or invalid token.
// A 403 with a message (e.g. the website limit) is not a sign-in problem.
export function isAuthError(e: unknown) {
  return (
    e instanceof ApiError &&
    (e.status === 401 || e.status === 403) &&
    !e.fromServer
  )
}

export function isRateLimited(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 429
}

export function isNotFound(e: unknown) {
  return e instanceof ApiError && e.status === 404
}

// One sentence for an error banner.
export function describeError(e: unknown) {
  if (isRateLimited(e)) return e.message
  if (e instanceof ApiError && e.fromServer) return e.message
  if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
    return "Can't reach the server. Check that the API is running on port 3000."
  }
  return "Something went wrong. Try again."
}
