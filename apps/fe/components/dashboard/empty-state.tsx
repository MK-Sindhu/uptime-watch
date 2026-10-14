import { PlusIcon } from "lucide-react"

import type { Filter } from "@/components/dashboard/view"
import { Button } from "@/components/ui/button"
import { formatInterval } from "@/lib/checks"

const STEPS = [
  {
    title: "Add a URL",
    body: "Your site, an API, a status endpoint: any address that should answer.",
  },
  {
    title: `First check within ${formatInterval().replace(" ", "\u00a0")}`,
    body: "Workers in each region request it and time the answer.",
  },
  {
    title: "Open the site",
    body: "Click its name for response-time history, daily uptime and incidents.",
  },
]

// No sites yet: an empty instrument and how to start.
export function EmptyChart({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="ecg-paper mt-2 rounded-2xl border border-panel-border px-5 py-10 sm:px-8">
      <p className="text-2xl font-semibold tracking-tight">Start with one address.</p>
      <p className="mt-1 text-sm text-muted-foreground">Three steps, and the first numbers arrive.</p>
      <ol className="mt-6 grid gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-2">
            <span className="text-3xl leading-none font-semibold text-glow tabular-nums glow-soft">{i + 1}</span>
            <div>
              <p className="font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button className="mt-8 rounded-full px-4" onClick={onAdd}>
        <PlusIcon />
        Add your first site
      </Button>
    </div>
  )
}

const FILTER_EMPTY: Record<Filter, string> = {
  all: "No sites yet.",
  down: "Nothing is down right now.",
  paused: "No sites are paused.",
}

// Sites exist, but the search or filter hides all of them.
export function NoMatches({
  q,
  filter,
  onClearSearch,
  onShowAll,
}: {
  q: string
  filter: Filter
  onClearSearch: () => void
  onShowAll: () => void
}) {
  const query = q.trim()
  const scope = filter === "all" ? "sites" : `${filter} sites`
  return (
    <div className="mt-2 rounded-2xl border border-dashed border-panel-border px-6 py-10 text-center">
      <p className="text-xl font-semibold tracking-tight">
        {query ? `No ${scope} match “${query}”.` : FILTER_EMPTY[filter]}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {query && (
          <Button variant="outline" className="rounded-full" onClick={onClearSearch}>
            Clear search
          </Button>
        )}
        {filter !== "all" && (
          <Button variant={query ? "ghost" : "outline"} className="rounded-full" onClick={onShowAll}>
            Show all sites
          </Button>
        )}
      </div>
    </div>
  )
}
