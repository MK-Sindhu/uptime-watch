"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Re-renders the server page every `everyMs` while the tab is visible. A tab
// that comes back after being hidden longer than that refreshes right away.
// The API caches each status page for 30 s, so faster than a minute buys
// nothing.
export function Refresher({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    let last = Date.now()
    const refresh = () => {
      last = Date.now()
      router.refresh()
    }
    const visible = () => document.visibilityState === "visible"

    const timer = setInterval(() => {
      if (visible()) refresh()
    }, everyMs)
    const onVisibility = () => {
      if (visible() && Date.now() - last >= everyMs) refresh()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router, everyMs])

  return null
}
