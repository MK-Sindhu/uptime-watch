import { HouseIcon, LayoutDashboardIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { SiteHeader } from "@/components/site-header"
import { ChartMessage, MESSAGE_BUTTON } from "@/components/status-page/chart-message"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Not found · Uptime Watch",
}

// Any URL the app doesn't have, and any notFound() without a nearer not-found.
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-start justify-center px-3 pt-6 pb-16 sm:px-5 sm:pt-14">
        <ChartMessage
          code="404 · Not found"
          tone="warning"
          title="This page isn't on the chart."
          actions={
            <>
              <Link href="/dashboard" className={buttonVariants({ size: "lg", className: MESSAGE_BUTTON })}>
                <LayoutDashboardIcon aria-hidden="true" />
                Go to the dashboard
              </Link>
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
          <p>The address may be mistyped, or the page may have moved.</p>
        </ChartMessage>
      </main>
    </div>
  )
}
