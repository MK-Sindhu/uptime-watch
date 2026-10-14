import type { SiteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"

// Status is never colour alone: each one has its own shape and a word.
//   Up: filled dot · Down: blinking square · Unknown: diamond
//   Waiting: hollow ring · Paused: two bars
const STYLE: Record<SiteStatus, { label: string; text: string }> = {
  Up: { label: "Up", text: "text-pulse-up" },
  Down: { label: "Down", text: "text-pulse-down" },
  Unknown: { label: "Unknown", text: "text-muted-foreground" },
  Waiting: { label: "Waiting", text: "text-muted-foreground" },
  Paused: { label: "Paused", text: "text-muted-foreground" },
}

export function StatusMark({ status, className }: { status: SiteStatus; className?: string }) {
  const base = "inline-block shrink-0"
  switch (status) {
    case "Up":
      return <span aria-hidden="true" className={cn(base, "size-2.5 rounded-full bg-pulse-up", className)} />
    case "Down":
      return <span aria-hidden="true" className={cn(base, "cursor-blink size-2.5 rounded-[2px] bg-pulse-down", className)} />
    case "Unknown":
      return <span aria-hidden="true" className={cn(base, "size-2 rotate-45 bg-pulse-wait", className)} />
    case "Waiting":
      return <span aria-hidden="true" className={cn(base, "size-2.5 rounded-full border-2 border-pulse-wait", className)} />
    case "Paused":
      return (
        <span aria-hidden="true" className={cn(base, "flex h-2.5 w-2.5 justify-between", className)}>
          <span className="w-[3px] rounded-[1px] bg-pulse-wait" />
          <span className="w-[3px] rounded-[1px] bg-pulse-wait" />
        </span>
      )
  }
}

export function StatusBadge({
  status,
  className,
  size = "sm",
}: {
  status: SiteStatus
  className?: string
  size?: "sm" | "lg"
}) {
  const style = STYLE[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-bold",
        size === "lg" ? "text-base" : "text-sm",
        style.text,
        className
      )}
    >
      <StatusMark status={status} className={size === "lg" ? "scale-125" : undefined} />
      {style.label}
    </span>
  )
}
