import { HouseIcon } from "lucide-react"
import Link from "next/link"

import { SiteHeader } from "@/components/site-header"
import { ChartMessage, MESSAGE_BUTTON } from "@/components/status-page/chart-message"
import { buttonVariants } from "@/components/ui/button"

export default function StatusNotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-start justify-center px-3 pt-6 pb-16 sm:px-5 sm:pt-14">
        <ChartMessage
          code="404 · No status page"
          tone="warning"
          title="There's no status page at this address."
          actions={
            <Link href="/" className={buttonVariants({ size: "lg", className: MESSAGE_BUTTON })}>
              <HouseIcon aria-hidden="true" />
              Go to the home page
            </Link>
          }
        >
          <p>Check the link you were given. The owner may have changed the address or taken the page down.</p>
        </ChartMessage>
      </main>
    </div>
  )
}
