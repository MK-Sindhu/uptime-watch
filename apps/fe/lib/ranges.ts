// Detail-page time ranges. Mirrors RANGES in packages/timeseries/aggregates.ts.
import type { RangeKey } from "@/lib/api"

export const RANGE_KEYS: RangeKey[] = ["1h", "24h", "7d", "30d", "90d"]

export const RANGE_LABEL: Record<RangeKey, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
}

// Bucket size per range, for chart captions ("each beat = 10 min").
export const RANGE_STEP_LABEL: Record<RangeKey, string> = {
  "1h": "1 min",
  "24h": "10 min",
  "7d": "1 hour",
  "30d": "4 hours",
  "90d": "12 hours",
}

export function parseRange(value: string | null | undefined, fallback: RangeKey = "24h"): RangeKey {
  return RANGE_KEYS.includes(value as RangeKey) ? (value as RangeKey) : fallback
}
