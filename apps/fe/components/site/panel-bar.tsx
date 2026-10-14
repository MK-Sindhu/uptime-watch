import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// A panel's title row, like the glass kit's PanelHeader, but its controls
// wrap under the title on a narrow screen instead of pushing the page wider.
export function PanelBar({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: {
  // for the panel's aria-labelledby
  id?: string
  icon?: LucideIcon
  title: React.ReactNode
  subtitle?: React.ReactNode
  // controls on the right
  children?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

// Small frosted buttons for panel and page actions (pair with variant="ghost").
export const GLASS_BUTTON =
  "h-8 gap-1.5 rounded-xl border border-panel-border bg-panel px-3 text-xs font-medium shadow-sm backdrop-blur-md hover:bg-panel-strong dark:hover:bg-panel-strong"
