// Server-side API calls (Next.js server components only). The browser goes
// through the /api proxy; the server talks to the API directly.
import { createServerApiClient, getPublicStatus, type PublicStatus } from "api-client"
import { headers } from "next/headers"

import { DEMO_SLUG, demoPublicStatus } from "./demo"

const serverClient = createServerApiClient(process.env.API_URL ?? "http://localhost:3000")

// null = no status page at this address.
export async function fetchPublicStatus(slug: string): Promise<PublicStatus | null> {
  // TEMP demo: /status/demo shows sample data (lib/demo.ts) when the API
  // isn't reachable or has no page there, e.g. the frontend alone on Vercel.
  if (slug === DEMO_SLUG) {
    const real = await fetchFromApi(slug).catch(() => null)
    return real ?? demoPublicStatus()
  }
  return fetchFromApi(slug)
}

async function fetchFromApi(slug: string): Promise<PublicStatus | null> {
  // Pass the visitor's address on. Without it every visitor reaches the API
  // from this server's IP and they all share one rate-limit bucket. The API
  // only trusts this header from private-network proxies (like this server).
  const forwardedFor = (await headers()).get("x-forwarded-for")
  const { data, response } = await getPublicStatus({
    client: serverClient,
    path: { slug },
    cache: "no-store",
    ...(forwardedFor ? { headers: { "X-Forwarded-For": forwardedFor } } : {}),
  })
  if (response?.status === 404) return null
  if (!response?.ok || !data) {
    throw new Error(`Status page request failed with ${response?.status ?? "no response"}`)
  }
  return data
}
