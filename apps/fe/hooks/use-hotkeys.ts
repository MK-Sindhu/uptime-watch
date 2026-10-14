"use client"

import { useEffect, useRef } from "react"

import { isTypingTarget } from "@/lib/keys"

type Handler = (event: KeyboardEvent) => void

// Keys: a character ("/", "n", "?", "1"), a named key ("Enter", "Escape"),
// or "mod+k" (Cmd on macOS, Ctrl elsewhere). Single-key shortcuts are
// ignored while typing in a field; "mod+..." and "Escape" always work.
export function useHotkeys(bindings: Record<string, Handler>, enabled = true) {
  const ref = useRef(bindings)
  useEffect(() => {
    ref.current = bindings
  })

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const name = mod ? `mod+${key}` : key
      const handler = ref.current[name] ?? (event.key === "?" ? ref.current["?"] : undefined)
      if (!handler) return
      if (!mod && name !== "Escape" && isTypingTarget(event.target)) return
      if (!mod && event.altKey) return
      handler(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
