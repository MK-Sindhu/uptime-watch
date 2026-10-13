"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import { Input } from "@/components/field"
import { PulseTrace } from "@/components/pulse-trace"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  addWebsite,
  clearSession,
  getSession,
  isAuthError,
  listWebsites,
  type TickStatus,
  type Website,
} from "@/lib/api"
import { timeAgo, toMillis } from "@/lib/time"
import { cn } from "@/lib/utils"

const REFRESH_MS = 30_000
const TRACE_SLOTS = 30

type SiteStatus = TickStatus | "Waiting"

const SEVERITY: Record<SiteStatus, number> = { Down: 0, Unknown: 1, Waiting: 2, Up: 3 }

function siteStatus(site: Website): SiteStatus {
  return site.ticks[0]?.status ?? "Waiting"
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withScheme).toString()
  } catch {
    return null
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export default function DashboardPage() {
  const router = useRouter()
  // Read from localStorage after hydration; empty on the server.
  const username = useSyncExternalStore(
    () => () => {},
    () => getSession()?.username ?? "",
    () => ""
  )
  const [sites, setSites] = useState<Website[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const signOut = useCallback(() => {
    clearSession()
    router.replace("/")
  }, [router])

  // State is only set once the request settles.
  const load = useCallback(
    () =>
      listWebsites().then(
        (data) => {
          setSites(data)
          setLoadError(false)
          setNow(Date.now())
        },
        (e) => {
          if (isAuthError(e)) signOut()
          else setLoadError(true)
        }
      ),
    [signOut]
  )

  useEffect(() => {
    if (!getSession()) {
      router.replace("/")
      return
    }
    load()

    const refresh = setInterval(load, REFRESH_MS)
    const clock = setInterval(() => setNow(Date.now()), 15_000)
    const onVisible = () => document.visibilityState === "visible" && load()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(refresh)
      clearInterval(clock)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [load, router])

  const sorted = sites
    ? [...sites].sort(
        (a, b) =>
          SEVERITY[siteStatus(a)] - SEVERITY[siteStatus(b)] || a.url.localeCompare(b.url)
      )
    : null
  const upCount = sites?.filter((s) => siteStatus(s) === "Up").length ?? 0
  const downCount = sites?.filter((s) => siteStatus(s) === "Down").length ?? 0
  const latestCheck = sites
    ?.map((s) => s.ticks[0]?.createdAt)
    .filter((t): t is string => !!t)
    .sort((a, b) => (toMillis(b) ?? 0) - (toMillis(a) ?? 0))[0]

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader>
        {username && (
          <span className="mr-2 hidden font-mono text-sm text-muted-foreground sm:inline">
            {username}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </SiteHeader>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6">
        <section className="grid gap-8 border-b pt-6 pb-8 md:grid-cols-[minmax(0,1fr)_26rem] md:items-end">
          <div aria-live="polite">
            <h1 className="font-display text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">
              {sites === null
                ? "Reading the chart…"
                : sites.length === 0
                  ? "Nothing on watch yet"
                  : `${upCount} of ${sites.length} answering`}
            </h1>
            <p className="mt-3 font-mono text-sm text-muted-foreground">
              {downCount > 0 && (
                <span className="font-medium text-pulse-down">
                  {downCount} not answering ·{" "}
                </span>
              )}
              {latestCheck
                ? `Latest check ${timeAgo(latestCheck, now)}`
                : sites?.length
                  ? "Waiting for the first checks"
                  : "Add a URL to start"}
              {" · refreshes every 30 s"}
            </p>
          </div>

          <AddSiteForm onAdded={load} onAuthError={signOut} />
        </section>

        {loadError && (
          <div
            role="alert"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-down/30 bg-pulse-down/8 px-4 py-3 text-sm text-pulse-down"
          >
            Can&apos;t reach the server. Check that the API is running on port 3000.
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {sorted && sorted.length === 0 && (
          <div className="ecg-paper mt-8 rounded-xl border px-6 py-14 text-center">
            <p className="font-display text-2xl font-bold">A flat chart, for now.</p>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
              Add the first URL above. Its first check shows up here on the next round.
            </p>
          </div>
        )}

        {sorted && sorted.length > 0 && (
          <ul className="divide-y">
            {sorted.map((site) => (
              <SiteRow key={site.id} site={site} now={now} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function AddSiteForm({
  onAdded,
  onAuthError,
}: {
  onAdded: () => Promise<void>
  onAuthError: () => void
}) {
  const [value, setValue] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const url = normalizeUrl(value)
    if (!url) {
      setError("Enter a full address, like https://example.com.")
      return
    }
    setPending(true)
    try {
      await addWebsite(url)
      setValue("")
      setNotice(`Watching ${hostOf(url)}. Its first check arrives on the next round.`)
      await onAdded()
    } catch (err) {
      if (isAuthError(err)) onAuthError()
      else if (err instanceof ApiError && err.status === 411)
        setError("Enter a URL to watch.")
      else setError("Couldn't add that site. Check that the API is running and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor="new-site" className="text-sm font-semibold">
        Add a site
      </label>
      <div className="flex gap-2">
        <Input
          id="new-site"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby="new-site-status"
          className="font-mono text-sm"
        />
        <Button type="submit" size="lg" className="h-10 px-4" disabled={pending}>
          {pending ? "Adding…" : "Watch site"}
        </Button>
      </div>
      <p
        id="new-site-status"
        aria-live="polite"
        className={cn("min-h-5 text-sm", error ? "text-pulse-down" : "text-muted-foreground")}
      >
        {error ?? notice}
      </p>
    </form>
  )
}

const STATUS_STYLE: Record<SiteStatus, { label: string; dot: string; text: string }> = {
  Up: { label: "Up", dot: "bg-pulse-up", text: "text-pulse-up" },
  Down: { label: "Down", dot: "bg-pulse-down cursor-blink", text: "text-pulse-down" },
  Unknown: { label: "Unknown", dot: "bg-pulse-wait", text: "text-muted-foreground" },
  Waiting: {
    label: "Waiting",
    dot: "border border-pulse-wait bg-transparent",
    text: "text-muted-foreground",
  },
}

function SiteRow({ site, now }: { site: Website; now: number }) {
  const status = siteStatus(site)
  const style = STATUS_STYLE[status]
  const latest = site.ticks[0]
  const recent = site.ticks.slice(0, TRACE_SLOTS)
  const answered = recent.filter((t) => t.status === "Up").length
  const failed = recent.filter((t) => t.status === "Down").length
  const uptime = recent.length ? Math.round((answered / recent.length) * 100) : null

  const traceLabel = recent.length
    ? `Last ${recent.length} checks: ${answered} answered, ${failed} did not.`
    : "No checks yet."

  return (
    <li className="flex flex-col gap-3 py-6 md:grid md:grid-cols-[6.5rem_minmax(0,1fr)_minmax(14rem,22rem)_7.5rem] md:items-center md:gap-6">
      <div className={cn("flex items-center gap-2 text-sm font-bold", style.text)}>
        <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", style.dot)} />
        {style.label}
      </div>

      <div className="min-w-0">
        <a
          href={site.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate rounded-sm font-mono text-base font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          title={site.url}
        >
          {site.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
        <p className="mt-1 text-sm text-muted-foreground">
          {latest
            ? `Checked ${timeAgo(latest.createdAt, now)}`
            : `Added ${timeAgo(site.time_added, now) ?? "recently"} · first check pending`}
          {uptime !== null && ` · ${uptime}% of the last ${recent.length} checks answered`}
        </p>
      </div>

      <PulseTrace ticks={site.ticks} slots={TRACE_SLOTS} label={traceLabel} />

      <div className="flex items-baseline justify-between gap-2 md:block md:text-right">
        <span className="text-sm text-muted-foreground md:hidden">Latest response</span>
        {latest?.status === "Up" ? (
          <p className="font-display text-4xl leading-none font-extrabold tabular-nums">
            {latest.response_time_ms}
            <span className="ml-1 font-sans text-sm font-semibold text-muted-foreground">ms</span>
          </p>
        ) : latest?.status === "Down" ? (
          <p className="font-display text-2xl leading-none font-extrabold text-pulse-down uppercase">
            No answer
          </p>
        ) : (
          <p className="font-display text-4xl leading-none font-extrabold text-muted-foreground">
            —
          </p>
        )}
      </div>
    </li>
  )
}
