"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { describeError, isRateLimited } from "@/lib/api"
import { cn } from "@/lib/utils"

// One line saying what went wrong and what happens next. On a 429 it counts
// down to the automatic retry (`retryAt` from usePolling).
export function ErrorBanner({
  error,
  retryAt,
  onRetry,
  stale,
  className,
}: {
  error: unknown
  retryAt?: number | null
  onRetry?: () => void
  // the page still shows older data
  stale?: boolean
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!retryAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [retryAt])

  if (!error) return null
  const limited = isRateLimited(error)
  const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null
  const message = limited
    ? `Too many requests. ${seconds ? `Retrying in ${seconds} s.` : "Retrying now."}`
    : describeError(error)

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-down/30 bg-pulse-down/8 px-4 py-3 text-sm text-pulse-down",
        className
      )}
    >
      <span>
        {message}
        {stale && " Showing the last data that loaded."}
      </span>
      {onRetry && !limited && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
