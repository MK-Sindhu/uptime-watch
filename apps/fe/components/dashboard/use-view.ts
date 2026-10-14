"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  parseFilter,
  parseSort,
  viewQuery,
  type View,
} from "@/components/dashboard/view"

// Search, filter and sort, kept in ?q=&filter=&sort= so a reload or a shared
// link shows the same list. Reads useSearchParams, so the caller must sit
// inside <Suspense>.
//
// The URL is the starting point; typing updates local state at once and the
// URL a moment later, so the field never lags behind a router round trip.
export function useView() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [view, setViewState] = useState<View>(() => ({
    q: params.get("q") ?? "",
    filter: parseFilter(params.get("filter")),
    sort: parseSort(params.get("sort")),
  }))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // A pending URL write must not fire after leaving the page.
  useEffect(() => {
    const pending = timer
    return () => clearTimeout(pending.current)
  }, [])

  const setView = useCallback(
    (patch: Partial<View>) => {
      const next = { ...view, ...patch }
      setViewState(next)
      clearTimeout(timer.current)
      const query = viewQuery(next)
      timer.current = setTimeout(
        () =>
          router.replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
          }),
        patch.q !== undefined ? 300 : 0
      )
    },
    [view, router, pathname]
  )

  return [view, setView] as const
}

// A clock for relative times ("checked 12s ago"), ticking every `ms`.
export function useNow(ms = 5_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
