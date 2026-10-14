import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// A frosted glass panel: the main container on every page.
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("panel p-4 sm:p-5", className)} {...props} />
}

// Icon + title on the left, optional controls on the right.
export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  as: Heading = "h2",
}: {
  icon?: LucideIcon
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
  as?: "h1" | "h2" | "h3"
}) {
  return (
    // Controls wrap under the title on narrow screens instead of overflowing.
    <header className={cn("mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <Heading className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </Heading>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}

// The recessed surface charts and tables sit on inside a panel.
export function Inset({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("inset-surface p-3 sm:p-4", className)} {...props} />
}

// Uppercase section label ("ROOT CAUSE CATEGORY" in the references).
export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("eyebrow", className)} {...props} />
}
