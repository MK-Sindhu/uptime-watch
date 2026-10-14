"use client"

import { useState } from "react"

import { togglePaused } from "@/components/site-actions"
import { describeError, type WebsiteDetail } from "@/lib/api"

export type PauseControl = {
  toggle: () => void
  pending: boolean
  error: string | null
}

// Pause/resume, shared by the heading's button and the sidebar's "Checks are
// paused" banner so both show the same pending state and error.
export function usePause(site: WebsiteDetail, onChanged: (updated: WebsiteDetail) => void): PauseControl {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setPending(true)
    setError(null)
    try {
      onChanged(await togglePaused(site))
    } catch (err) {
      setError(`Couldn't ${site.paused ? "resume" : "pause"} checks. ${describeError(err)}`)
    } finally {
      setPending(false)
    }
  }

  return { toggle: () => void toggle(), pending, error }
}
