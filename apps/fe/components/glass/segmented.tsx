"use client"

import { useRef } from "react"

import { cn } from "@/lib/utils"

// Segmented tabs ("Electricity Health | Signal Path | Events"). Arrow keys
// move between tabs; the selected one is the only tab stop.
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T
  onValueChange: (value: T) => void
  // title: tooltip; shortcut: aria-keyshortcuts (e.g. "1")
  options: { value: T; label: React.ReactNode; title?: string; shortcut?: string }[]
  label: string
  className?: string
  size?: "sm" | "md"
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = options.length - 1
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null
    if (next === null) return
    e.preventDefault()
    onValueChange(options[next]!.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "grid gap-1 rounded-xl bg-foreground/[0.06] p-1",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, i) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-keyshortcuts={option.shortcut}
            title={option.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "truncate rounded-lg font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
              selected
                ? "bg-panel-strong text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
