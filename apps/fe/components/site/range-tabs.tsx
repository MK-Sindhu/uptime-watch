"use client"

import { Segmented } from "@/components/glass/segmented"
import type { RangeKey } from "@/lib/api"
import { RANGE_KEYS, RANGE_LABEL } from "@/lib/ranges"
import { cn } from "@/lib/utils"

// Keys 1–5 pick these in order (bound by the page).
export function RangeTabs({
  value,
  onChange,
  className,
}: {
  value: RangeKey
  onChange: (range: RangeKey) => void
  className?: string
}) {
  return (
    <Segmented
      label="Time range"
      size="sm"
      value={value}
      onValueChange={onChange}
      className={cn("w-full sm:w-auto", className)}
      options={RANGE_KEYS.map((key, i) => ({
        value: key,
        label: (
          <span title={`Last ${RANGE_LABEL[key]} (press ${i + 1})`} className="px-0.5">
            {key}
          </span>
        ),
      }))}
    />
  )
}
