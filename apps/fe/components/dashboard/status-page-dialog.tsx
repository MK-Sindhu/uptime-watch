"use client"

import { ArrowUpRightIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { ErrorBanner } from "@/components/error-banner"
import { Input } from "@/components/field"
import { StatusMark } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  ApiError,
  describeError,
  getStatusPageSettings,
  isAuthError,
  updateStatusPage,
  updateWebsite,
  type StatusPageSettings,
  type Website,
  type WebsiteDetail,
} from "@/lib/api"
import { displayName, siteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"

// Mirrors StatusPagePatch in apps/api/types.ts.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
const SLUG_RULE =
  "Use 3–40 lowercase letters, digits or dashes, starting and ending with a letter or digit."

const TAKEN = "That address is taken. Pick another one."

// "My Shop" -> "my-shop" as you type; anything else that can't be in an
// address is dropped.
function toSlug(raw: string) {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export function StatusPageDialog({
  open,
  onOpenChange,
  sites,
  onPatch,
  onChanged,
  onAuthError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: Website[]
  // optimistic edit: apply now (pending), settle with the server's answer
  onPatch: (
    id: string,
    fields: Partial<Website>,
    options?: { pending?: boolean }
  ) => void
  onChanged: (updated: WebsiteDetail) => void
  onAuthError: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-2xl border border-panel-border bg-panel-strong ring-0 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:p-5">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Status page
          </DialogTitle>
          <DialogDescription>
            A public page anyone can open without signing in. It shows only the
            sites you switch on below.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so each open loads fresh settings. */}
        <StatusPageForm onAuthError={onAuthError} />
        <SiteSwitches
          sites={sites}
          onPatch={onPatch}
          onChanged={onChanged}
          onAuthError={onAuthError}
        />
        <DialogFooter showCloseButton className="rounded-b-2xl border-panel-border bg-foreground/[0.03] sm:-mx-5 sm:-mb-5" />
      </DialogContent>
    </Dialog>
  )
}

function StatusPageForm({ onAuthError }: { onAuthError: () => void }) {
  const [settings, setSettings] = useState<StatusPageSettings | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [slug, setSlug] = useState("")
  const [title, setTitle] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getStatusPageSettings().then(
      (s) => {
        if (cancelled) return
        setSettings(s)
        setSlug(s.slug ?? "")
        setTitle(s.title ?? "")
      },
      (e) => {
        if (cancelled) return
        if (isAuthError(e)) onAuthError()
        else setLoadError(e)
      }
    )
    return () => {
      cancelled = true
    }
  }, [attempt, onAuthError])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const nextSlug = slug.replace(/^-+|-+$/g, "")
    if (nextSlug && !SLUG_RE.test(nextSlug)) {
      setError(SLUG_RULE)
      return
    }
    setPending(true)
    try {
      const saved = await updateStatusPage({
        slug: nextSlug || null,
        title: title.trim() || null,
      })
      setSettings(saved)
      setSlug(saved.slug ?? "")
      setTitle(saved.title ?? "")
      setNotice(
        saved.slug
          ? "Saved. Your status page is live."
          : "Saved. Your status page is off."
      )
    } catch (err) {
      if (isAuthError(err)) onAuthError()
      else if (err instanceof ApiError && err.status === 409) setError(TAKEN)
      else if (err instanceof ApiError && err.status === 400)
        setError(SLUG_RULE)
      else setError(describeError(err))
    } finally {
      setPending(false)
    }
  }

  if (loadError) {
    return (
      <ErrorBanner
        error={loadError}
        onRetry={() => {
          setLoadError(null)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  const loading = settings === null
  const slugInvalid = error === SLUG_RULE || error === TAKEN
  return (
    <form onSubmit={onSubmit} className="grid gap-4" aria-busy={loading}>
      <div className="grid gap-1.5">
        <label htmlFor="status-slug" className="text-sm font-semibold">
          Address
        </label>
        <div className="flex h-10 items-center rounded-xl border border-input bg-foreground/[0.04] transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 has-aria-invalid:border-destructive">
          <span
            aria-hidden="true"
            className="pl-3 font-mono text-sm text-muted-foreground"
          >
            /status/
          </span>
          <input
            id="status-slug"
            value={slug}
            maxLength={40}
            placeholder={loading ? "" : "your-name"}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={slugInvalid || undefined}
            aria-describedby="status-slug-hint status-form-message"
            onChange={(e) => setSlug(toSlug(e.target.value))}
            className="h-full w-full min-w-0 bg-transparent pr-3 font-mono text-sm outline-none disabled:opacity-60"
          />
        </div>
        <p id="status-slug-hint" className="text-xs text-muted-foreground">
          The page lives at /status/ plus this address: 3–40 lowercase letters,
          digits or dashes. Leave it empty to turn the page off.
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="status-title" className="text-sm font-semibold">
          Title
        </label>
        <Input
          id="status-title"
          value={title}
          maxLength={80}
          placeholder={loading ? "" : "Shown at the top of the page"}
          disabled={loading}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl bg-foreground/[0.04]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={loading || pending}>
          {pending ? "Saving…" : "Save page"}
        </Button>
        {settings?.url && (
          <a
            href={settings.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium underline underline-offset-3 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Open status page
            <ArrowUpRightIcon aria-hidden="true" className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      <p
        id="status-form-message"
        aria-live="polite"
        className={cn(
          "-mt-2 min-h-5 text-sm",
          error ? "text-critical" : "text-muted-foreground"
        )}
      >
        {loading ? "Loading your status page…" : (error ?? notice)}
      </p>
    </form>
  )
}

function SiteSwitches({
  sites,
  onPatch,
  onChanged,
  onAuthError,
}: {
  sites: Website[]
  onPatch: (
    id: string,
    fields: Partial<Website>,
    options?: { pending?: boolean }
  ) => void
  onChanged: (updated: WebsiteDetail) => void
  onAuthError: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  // Optimistic: the switch moves at once and moves back if the save fails.
  async function setPublic(site: Website, value: boolean) {
    setError(null)
    onPatch(site.id, { public: value }, { pending: true })
    try {
      onChanged(await updateWebsite(site.id, { public: value }))
    } catch (err) {
      onPatch(site.id, { public: !value })
      if (isAuthError(err)) onAuthError()
      else
        setError(`Couldn't update ${displayName(site)}. ${describeError(err)}`)
    }
  }

  const shown = sites.filter((s) => s.public).length
  return (
    <section
      aria-labelledby="status-sites"
      className="grid gap-2 border-t pt-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="status-sites" className="text-sm font-semibold">
          Show on status page
        </h3>
        {sites.length > 0 && (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {shown} of {sites.length}
          </span>
        )}
      </div>
      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a site first, then choose which ones the page shows.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border border-panel-border bg-foreground/[0.02]">
          {sites.map((site) => (
            <li key={site.id}>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <StatusMark status={siteStatus(site)} />
                  <span
                    className={cn(
                      "truncate text-sm",
                      !site.name && "font-mono"
                    )}
                  >
                    {displayName(site)}
                  </span>
                </span>
                <Switch
                  aria-label={`Show ${displayName(site)} on the status page`}
                  checked={site.public}
                  onCheckedChange={(value) => setPublic(site, value)}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Switches save right away.</p>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </section>
  )
}
