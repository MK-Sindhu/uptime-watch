import { CircleAlertIcon, type LucideIcon } from "lucide-react"

import { TONE_BG, TONE_TEXT, TONE_WORD, type Tone } from "@/components/glass/tone"
import { cn } from "@/lib/utils"

// A small glowing status dot.
export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full glow-soft", TONE_BG[tone], TONE_TEXT[tone], className)}
    />
  )
}

// Square swatches with labels: "■ Stable ■ Warning ■ Critical".
export function Legend({
  items,
  className,
}: {
  items: { label: string; tone: Tone; dashed?: boolean }[]
  className?: string
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          {item.dashed ? (
            <span aria-hidden="true" className={cn("w-3 border-t-2 border-dashed", TONE_TEXT[item.tone])} style={{ borderColor: "currentColor" }} />
          ) : (
            <span aria-hidden="true" className={cn("inline-block size-2.5 rounded-[3px]", TONE_BG[item.tone])} />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export type MetricRow = {
  label: string
  value: React.ReactNode
  tone: Tone
  // word next to the dot; defaults to the tone's word ("Stable", "Critical")
  status?: string
  // light up the row, like the highlighted row in the references
  highlight?: boolean
  title?: string
}

// Label · value · ● status, one row each, hairline dividers.
export function MetricTable({ rows, className }: { rows: MetricRow[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border overflow-hidden rounded-xl", className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          title={row.title}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto_6.5rem] items-center gap-3 px-3 py-2.5 text-sm",
            row.highlight && "bg-foreground/[0.06]"
          )}
        >
          <dt className="truncate text-muted-foreground">{row.label}</dt>
          <dd className="font-semibold tabular-nums">{row.value}</dd>
          <dd className={cn("inline-flex items-center gap-1.5 justify-self-end text-xs font-semibold", TONE_TEXT[row.tone])}>
            <ToneDot tone={row.tone} />
            {row.status ?? TONE_WORD[row.tone]}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// "● Critical fault detected · …" pill. role=alert when critical.
export function AlertBanner({
  tone = "critical",
  icon: Icon = CircleAlertIcon,
  children,
  action,
  wrap = false,
  className,
}: {
  tone?: Tone
  icon?: LucideIcon
  children: React.ReactNode
  action?: React.ReactNode
  // let long text wrap instead of cutting it to one line
  wrap?: boolean
  className?: string
}) {
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={cn(
        // min-w-0: a cut-off line must not widen the grid column it sits in
        "flex min-w-0 items-center gap-2.5 rounded-xl border border-current/15 bg-current/[0.07] px-3.5 py-2.5 text-sm font-medium",
        TONE_TEXT[tone],
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 glow-soft" />
      <div className={cn("min-w-0 flex-1", !wrap && "truncate")}>{children}</div>
      {action}
    </div>
  )
}
