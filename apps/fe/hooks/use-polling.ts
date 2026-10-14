"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { isAuthError, isRateLimited } from "@/lib/api"

type State<T> = {
  dataKey: string // which key `data` belongs to
  data: T | undefined
  errorKey: string // which key `error` belongs to
  error: unknown
  updatedAt: number | null
  retryAt: number | null
}

export type Polled<T> = {
  data: T | undefined
  // true while the first response for the current key is pending
  loading: boolean
  // data belongs to a previous key (e.g. the old range) while the new one loads
  stale: boolean
  error: unknown
  updatedAt: number | null
  // when a 429 lifts (ms epoch), for a countdown
  retryAt: number | null
  refresh: () => void
}

// Fetch now, then every `intervalMs` while the tab is visible. A new `key`
// (e.g. a different range) fetches immediately. On error the last good data
// stays; on 429 the next attempt waits for Retry-After; on an auth error
// `onAuthError` runs (usually: sign out).
export function usePolling<T>(
  key: string,
  fetcher: () => Promise<T>,
  intervalMs: number,
  options: { enabled?: boolean; onAuthError?: () => void } = {}
): Polled<T> {
  const { enabled = true, onAuthError } = options
  const [state, setState] = useState<State<T>>({
    dataKey: "",
    data: undefined,
    errorKey: "",
    error: null,
    updatedAt: null,
    retryAt: null,
  })
  const fetcherRef = useRef(fetcher)
  const authRef = useRef(onAuthError)
  useEffect(() => {
    fetcherRef.current = fetcher
    authRef.current = onAuthError
  })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = () => {
      clearTimeout(timer)
      if (document.visibilityState !== "visible") return
      fetcherRef.current().then(
        (data) => {
          if (cancelled) return
          setState({ dataKey: key, data, errorKey: key, error: null, updatedAt: Date.now(), retryAt: null })
          timer = setTimeout(run, intervalMs)
        },
        (error) => {
          if (cancelled) return
          if (isAuthError(error)) {
            authRef.current?.()
            return
          }
          const wait = isRateLimited(error) && error.retryAfter ? error.retryAfter * 1000 : intervalMs
          // Keep the last good data (still tagged with its own key).
          setState((prev) => ({
            ...prev,
            errorKey: key,
            error,
            retryAt: isRateLimited(error) ? Date.now() + wait : null,
          }))
          timer = setTimeout(run, wait)
        }
      )
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") run()
    }
    run()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [key, intervalMs, enabled, tick])

  const errorNow = state.errorKey === key ? state.error : null
  return {
    data: state.data,
    loading: state.data === undefined && !errorNow,
    stale: state.data !== undefined && state.dataKey !== key,
    error: errorNow,
    updatedAt: state.updatedAt,
    retryAt: errorNow ? state.retryAt : null,
    refresh,
  }
}
