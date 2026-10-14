"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useSyncExternalStore } from "react"

import { clearSession, getSession } from "@/lib/api"

// Re-read when another tab signs in or out.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  return () => window.removeEventListener("storage", onChange)
}

// Signed-in username, "" when signed out, null during server render.
export function useSessionUsername(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const s = getSession()
      return s ? s.username || " " : ""
    },
    () => null
  )
}

// For signed-in pages: redirects to "/" without a session, and returns a
// signOut() that clears it and goes home.
export function useRequireSession() {
  const router = useRouter()
  const username = useSessionUsername()

  useEffect(() => {
    if (username === "") router.replace("/")
  }, [username, router])

  const signOut = useCallback(() => {
    clearSession()
    router.replace("/")
  }, [router])

  return { username: username?.trim() ?? "", ready: username !== null && username !== "", signOut }
}
