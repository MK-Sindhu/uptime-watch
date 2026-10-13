"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"

export function Wordmark() {
  return (
    <Link
      href="/"
      className="font-display text-xl font-extrabold tracking-[0.12em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
    >
      Uptime<span className="text-pulse-down">·</span>Watch
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

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Wordmark />
      <div className="flex items-center gap-1">
        {children}
        <ThemeToggle />
      </div>
    </header>
  )
}
