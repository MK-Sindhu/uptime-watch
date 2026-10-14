import { ActivityIcon, ServerIcon, WorkflowIcon } from "lucide-react"

import { Baseline } from "@/components/dashboard/baseline"
import { Panel, PanelHeader } from "@/components/glass/panel"
import { SiteHeader } from "@/components/site-header"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const NAME_WIDTHS = ["w-44", "w-60", "w-36", "w-52"]

// Grey bars where the text will be; the pulse stops under reduced motion.
function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn("rounded-md bg-foreground/[0.07] motion-reduce:animate-none", className)} />
}

// Loading: a dotted baseline per site, no spinner.
export function SkeletonRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn("@container", className)}>
      <p role="status" className="sr-only">
        Loading your sites…
      </p>
      <ul aria-hidden="true" className="divide-y divide-border">
        {Array.from({ length: count }, (_, i) => (
          <li
            key={i}
            className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-5 gap-y-3 py-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(9rem,15rem)_6.5rem]"
          >
            <div className="flex min-w-0 flex-col gap-2">
              <Bar className={cn("h-4 max-w-full", NAME_WIDTHS[i % NAME_WIDTHS.length])} />
              <Bar className="h-3 w-64 max-w-full" />
            </div>
            <Baseline variant="dotted" className="h-12" />
            <Bar className="hidden h-8 w-20 justify-self-end @2xl:block" />
          </li>
        ))}
      </ul>
    </div>
  )
}

// The whole dashboard before it can read the URL (the Suspense fallback).
export function DashboardLoading() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-16 sm:px-5 sm:pt-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <PanelHeader icon={WorkflowIcon} title="Check flow · last 24 hours" />
              <div className="h-[400px] rounded-2xl bg-foreground/[0.03] motion-safe:animate-pulse" />
            </Panel>
            <Panel>
              <PanelHeader icon={ServerIcon} title="Sites" />
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">Reading your sites…</p>
              <SkeletonRows className="mt-4" />
            </Panel>
          </div>
          <Panel className="hidden lg:block">
            <PanelHeader icon={ActivityIcon} title="Fleet health" />
            <div className="h-72 rounded-2xl bg-foreground/[0.03] motion-safe:animate-pulse" />
          </Panel>
        </div>
      </main>
    </div>
  )
}
