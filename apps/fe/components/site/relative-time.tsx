"use client"

import { useEffect, useState } from "react"

import { clockTime, timeAgo } from "@/lib/time"

// The current time, refreshed every `intervalMs` so relative times stay true.
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// "15s ago", with the absolute time on hover. It keeps its own clock so
// only this text re-renders every few seconds, not the whole page.
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const now = useNow()
  return (
    <time dateTime={iso} title={clockTime(iso)} className={className}>
      {timeAgo(iso, now) ?? "—"}
    </time>
  )
}
