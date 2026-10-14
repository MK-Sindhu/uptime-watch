import { StatusMark } from "@/components/status-badge"
import type { Tick } from "@/lib/api"
import { formatMs } from "@/lib/format"
import { latestByRegion } from "@/lib/site"
import { timeAgo } from "@/lib/time"

// "usa" -> "USA", "india" -> "India"
export function regionLabel(name: string) {
  return name.length <= 3
    ? name.toUpperCase()
    : name.charAt(0).toUpperCase() + name.slice(1)
}

function describeTick(tick: Tick) {
  if (tick.status === "Up") return `up, ${formatMs(tick.response_time_ms)}`
  if (tick.status === "Down") return "no answer"
  return "status unknown"
}

// The newest check from each region: a status mark (shape, not just colour)
// and the region's short name. Details are in the title and for screen readers.
export function RegionDots({
  ticks,
  regionNames,
  now,
}: {
  ticks: Tick[]
  regionNames: Map<string, string>
  now: number
}) {
  const latest = [...latestByRegion(ticks)]
    .map(([id, tick]) => ({
      id,
      tick,
      name: regionNames.get(id) ?? id.slice(0, 8),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (latest.length === 0) return null

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {latest.map(({ id, tick, name }) => {
        const state = describeTick(tick)
        const when = timeAgo(tick.createdAt, now)
        return (
          <span
            key={id}
            title={`${regionLabel(name)}: ${state}${when ? ` · ${when}` : ""}`}
            className="inline-flex items-center gap-1 text-xs font-medium"
          >
            <StatusMark status={tick.status} className="size-2" />
            {regionLabel(name)}
            <span className="sr-only">: {state}</span>
          </span>
        )
      })}
    </span>
  )
}
