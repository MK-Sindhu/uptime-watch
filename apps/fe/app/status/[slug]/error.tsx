"use client" // Error boundaries must be Client Components

import { HouseIcon, RotateCwIcon } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { SiteHeader } from "@/components/site-header"
import { ChartMessage, MESSAGE_BUTTON } from "@/components/status-page/chart-message"
import { Button, buttonVariants } from "@/components/ui/button"

const RETRY_MS = 60_000

// The status page refreshes itself every minute, so one failed request (the
// API restarting, a rate limit) lands an open tab here. Keep trying on the
// same schedule so the tab recovers without anyone touching it.
export default function StatusError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") retry()
    }, RETRY_MS)
    return () => clearInterval(timer)
  }, [retry])

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-start justify-center px-3 pt-6 pb-16 sm:px-5 sm:pt-14">
        <ChartMessage
          code="Status page · No answer"
          signal="Retrying every minute"
          title="This status page didn't load."
          actions={
            <>
              <Button size="lg" className={MESSAGE_BUTTON} onClick={() => retry()}>
                <RotateCwIcon aria-hidden="true" />
                Try again
              </Button>
              <Link
                href="/"
                className={buttonVariants({ variant: "outline", size: "lg", className: MESSAGE_BUTTON })}
              >
                <HouseIcon aria-hidden="true" />
                Go to the home page
              </Link>
            </>
          }
        >
          <p>We couldn&apos;t get the latest checks just now. This page tries again every minute.</p>
          {error.digest && (
            <p className="font-mono text-xs">Reference {error.digest}</p>
          )}
        </ChartMessage>
      </main>
    </div>
  )
}
