"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { useSessionUsername } from "@/hooks/use-session"
import { cn } from "@/lib/utils"

// Home is the dashboard once signed in, the sign-in page otherwise.
export function Wordmark() {
  const username = useSessionUsername()
  return (
    <Link
      href={username ? "/dashboard" : "/"}
      className="inline-flex items-center gap-2 rounded-md text-base font-bold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-lg border border-panel-border bg-panel-strong"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 text-stable glow"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 13h4l2-6 4 12 3-9 2 3h5" />
        </svg>
      </span>
      Uptime Watch
    </Link>
  )
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // false during server render, true once hydrated in the browser
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const dark = mounted && resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title="Toggle theme (D)"
    >
      {mounted ? (dark ? "Light" : "Dark") : "Theme"}
    </Button>
  )
}

// `menu`, when given, replaces the actions below the sm breakpoint so a
// phone-width header holds just the wordmark and one menu button.
export function SiteHeader({
  children,
  menu,
}: {
  children?: React.ReactNode
  menu?: React.ReactNode
}) {
  return (
    // Same container as the pages' <main> (max-w-7xl px-3 sm:px-5), so the
    // header's edges line up with the panels below it.
    <header className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="flex items-center justify-between gap-4 panel rounded-2xl px-3 py-2 sm:px-4">
        <Wordmark />
        <div
          className={cn("flex items-center gap-1", menu && "hidden sm:flex")}
        >
          {children}
          <ThemeToggle />
        </div>
        {menu && <div className="sm:hidden">{menu}</div>}
      </div>
    </header>
  )
}
