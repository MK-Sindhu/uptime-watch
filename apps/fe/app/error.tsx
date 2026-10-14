"use client" // Error boundaries must be Client Components

import { HouseIcon, RotateCwIcon } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { SiteHeader } from "@/components/site-header"
import { ChartMessage, MESSAGE_BUTTON } from "@/components/status-page/chart-message"
import { Button, buttonVariants } from "@/components/ui/button"

// Any render error below the root layout. `retry` re-fetches and re-renders
// the segment (Next 16.3+); `reset` would only re-render what's already here.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-start justify-center px-3 pt-6 pb-16 sm:px-5 sm:pt-14">
        <ChartMessage
          code="Error · Page stopped"
          signal="Flatline"
          title="Something went wrong on this page."
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
          <p>It may be a blip. Try again, and if it keeps happening, come back in a few minutes.</p>
          {error.digest && <p className="font-mono text-xs">Reference {error.digest}</p>}
        </ChartMessage>
      </main>
    </div>
  )
}
