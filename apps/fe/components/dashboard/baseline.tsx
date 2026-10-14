import { cn } from "@/lib/utils"

// A strip of chart paper with only the baseline drawn, the same size as
// PulseTrace: dotted while waiting for data, dashed while checks are paused.
export function Baseline({
  variant,
  text,
  label,
  className,
}: {
  variant: "dotted" | "dashed"
  // short caption on the strip ("Paused")
  text?: string
  // accessible name; without it the strip is decorative
  label?: string
  className?: string
}) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "relative h-14 overflow-hidden rounded-xl border border-panel-border ecg-paper-fine",
        className
      )}
    >
      <svg
        viewBox="0 0 300 56"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 size-full"
      >
        <path
          d="M0 36 L300 36"
          className={
            variant === "dashed" ? "stroke-pulse-wait" : "stroke-pulse-wait/50"
          }
          strokeWidth={variant === "dashed" ? 2 : 1}
          strokeDasharray={variant === "dashed" ? "8 6" : "2 4"}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {text && (
        <span className="eyebrow absolute top-1.5 left-2.5">
          {text}
        </span>
      )}
    </div>
  )
}
