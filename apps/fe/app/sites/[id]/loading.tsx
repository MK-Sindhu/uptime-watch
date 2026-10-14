import { SiteHeader } from "@/components/site-header"
import { SiteDetailSkeleton } from "@/components/site/skeleton"

// Shown instantly while the site page loads.
export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-16 sm:px-5 sm:pt-6">
        <SiteDetailSkeleton />
      </main>
    </div>
  )
}
