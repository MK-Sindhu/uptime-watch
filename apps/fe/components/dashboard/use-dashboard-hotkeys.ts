"use client"

import { useRouter } from "next/navigation"

import {
  ADD_INPUT_ID,
  focusAddSite,
} from "@/components/dashboard/add-site-form"
import { rowLinkId } from "@/components/dashboard/site-row"
import { SEARCH_INPUT_ID, focusSearch } from "@/components/dashboard/toolbar"
import { useHotkeys } from "@/hooks/use-hotkeys"
import type { Website } from "@/lib/api"

// A row menu, a rename or delete dialog, or one of the dashboard's own
// dialogs has the keyboard; single-key shortcuts wait until it closes.
const overlayOpen = () =>
  !!document.querySelector(
    '[role="dialog"], [role="alertdialog"], [role="menu"]'
  )

// / search · n add · j/k move · Enter open · ? help · Esc clear · mod+k palette
export function useDashboardHotkeys({
  shown,
  highlighted,
  onHighlight,
  query,
  onClearSearch,
  onHelp,
  onPalette,
}: {
  // the rows on screen, in order
  shown: Website[] | undefined
  highlighted: string | null
  onHighlight: (id: string | null) => void
  query: string
  onClearSearch: () => void
  onHelp: () => void
  onPalette: () => void
}) {
  const router = useRouter()

  // Move the highlight and put focus on that row's link (roving focus).
  function step(by: number) {
    if (!shown?.length) return
    const i = shown.findIndex((s) => s.id === highlighted)
    const last = shown.length - 1
    const to =
      i === -1 ? (by > 0 ? 0 : last) : Math.min(last, Math.max(0, i + by))
    const id = shown[to]!.id
    onHighlight(id)
    document.getElementById(rowLinkId(id))?.focus()
  }

  const free = (fn: (e: KeyboardEvent) => void) => (e: KeyboardEvent) => {
    if (!overlayOpen()) fn(e)
  }

  useHotkeys({
    "/": free((e) => {
      e.preventDefault()
      focusSearch()
    }),
    n: free((e) => {
      e.preventDefault()
      focusAddSite()
    }),
    j: free(() => step(1)),
    k: free(() => step(-1)),
    // A focused link or button handles Enter itself.
    Enter: free((e) => {
      const onControl =
        e.target instanceof Element && e.target.closest("a, button")
      if (highlighted && !onControl) router.push(`/sites/${highlighted}`)
    }),
    "?": free(onHelp),
    Escape: free((e) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target?.id === SEARCH_INPUT_ID && query) onClearSearch()
      else if (target?.id === SEARCH_INPUT_ID || target?.id === ADD_INPUT_ID)
        target.blur()
      else onHighlight(null)
    }),
    // Always on; the palette closes itself on a second press.
    "mod+k": (e) => {
      e.preventDefault()
      if (!overlayOpen()) onPalette()
    },
  })
}
