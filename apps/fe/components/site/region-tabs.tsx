"use client"

import { Segmented } from "@/components/glass/segmented"
import { cn } from "@/lib/utils"

// "All" plus one option per region; the selected region scopes the readings
// and the response chart.
export function RegionTabs({
  value,
  regions,
  onChange,
  className,
}: {
  value: string
  regions: { id: string; label: string }[]
  onChange: (region: string) => void
  className?: string
}) {
  return (
    <Segmented
      label="Region"
      size="sm"
      value={value}
      onValueChange={onChange}
      className={cn("w-full sm:w-auto", className)}
      options={[
        { value: "all", label: <span title="Every region together">All</span> },
        ...regions.map((r) => ({
          value: r.id,
          label: <span title={`Only checks from ${r.label}`}>{r.label}</span>,
        })),
      ]}
    />
  )
}
