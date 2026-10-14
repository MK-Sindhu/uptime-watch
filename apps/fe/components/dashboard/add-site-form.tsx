"use client"

import { useState } from "react"

import { Input } from "@/components/field"
import { Button } from "@/components/ui/button"
import { ApiError, addWebsite, isAuthError, isRateLimited } from "@/lib/api"
import { BAD_URL_MESSAGE, hostOf, normalizeUrl } from "@/lib/site"
import { cn } from "@/lib/utils"
import { formatInterval } from "@/lib/checks"

// The `n` shortcut and the command palette focus this field by id.
export const ADD_INPUT_ID = "new-site"

export function focusAddSite() {
  document.getElementById(ADD_INPUT_ID)?.focus()
}

function addError(err: unknown) {
  if (err instanceof ApiError && err.status === 411) return BAD_URL_MESSAGE
  if (isRateLimited(err) && !err.fromServer) {
    return err.retryAfter
      ? `Too many sites added at once. Try again in ${err.retryAfter} s.`
      : "Too many sites added at once. Wait a moment and try again."
  }
  // The site limit (403) and rate limits come with the API's own sentence.
  if (err instanceof ApiError && err.fromServer) return err.message
  return "Couldn't add that site. Check that the API is running and try again."
}

export function AddSiteForm({
  onAdded,
  onAuthError,
}: {
  onAdded: (site: { id: string; url: string }) => void
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
      setError(BAD_URL_MESSAGE)
      return
    }
    setPending(true)
    try {
      const { id } = await addWebsite(url)
      setValue("")
      setNotice(
        `Watching ${hostOf(url)}. Its first check arrives within ${formatInterval()}.`
      )
      onAdded({ id, url })
    } catch (err) {
      if (isAuthError(err)) onAuthError()
      else setError(addError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor={ADD_INPUT_ID} className="text-sm font-semibold">
        Add a site
      </label>
      <div className="flex gap-2">
        <Input
          id={ADD_INPUT_ID}
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={!!error}
          aria-describedby="new-site-status"
          className="rounded-xl border-panel-border bg-foreground/[0.04] font-mono text-sm"
        />
        <Button
          type="submit"
          size="lg"
          className="h-10 rounded-xl px-4"
          disabled={pending}
        >
          {pending ? "Adding…" : "Watch site"}
        </Button>
      </div>
      <p
        id="new-site-status"
        aria-live="polite"
        className={cn(
          "min-h-5 text-sm",
          error ? "text-critical" : "text-muted-foreground"
        )}
      >
        {error ?? notice}
      </p>
    </form>
  )
}
