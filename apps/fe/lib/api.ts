// Client for the Express API in apps/api. Requests go to /api/*, which
// next.config.ts proxies to the API server.

export type TickStatus = "Up" | "Down" | "Unknown"

export type Tick = {
  id: string
  status: TickStatus
  response_time_ms: number
  createdAt: string
  region_id: string
}

export type Website = {
  id: string
  url: string
  time_added: string
  ticks: Tick[] // newest first
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

const TOKEN_KEY = "uptime-watch.token"
const USERNAME_KEY = "uptime-watch.username"

export function getSession(): { token: string; username: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
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
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSession()?.token
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // The API's authMiddleware reads the raw JWT, without "Bearer ".
        ...(token ? { Authorization: token } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(0, "Can't reach the server.")
  }
  if (!res.ok) {
    // The Next proxy answers 500 when the API itself is not running.
    throw new ApiError(res.status, res.statusText)
  }
  return res.json() as Promise<T>
}

export async function signIn(username: string, password: string) {
  const { jwt } = await request<{ jwt: string }>("/user/signin", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
  saveSession(jwt, username)
}

export async function signUp(username: string, password: string) {
  await request<{ id: string }>("/user/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
  await signIn(username, password)
}

export async function listWebsites() {
  const { websites } = await request<{ websites: Website[] }>("/websites")
  return websites
}

export async function addWebsite(url: string) {
  return request<{ id: string }>("/website", {
    method: "POST",
    body: JSON.stringify({ url }),
  })
}

// The API answers 403 for a missing, expired or invalid token.
export function isAuthError(e: unknown) {
  return e instanceof ApiError && (e.status === 401 || e.status === 403)
}
