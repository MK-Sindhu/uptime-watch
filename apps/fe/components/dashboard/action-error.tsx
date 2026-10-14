import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A failed row action (resume, pause, copy…). The list itself is fine, so
// this stays until dismissed instead of replacing anything.
export function ActionError({
  message,
  onDismiss,
  className,
}: {
  message: string | null
  onDismiss: () => void
  className?: string
}) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-critical/25 bg-critical/[0.07] px-4 py-2.5 text-sm font-medium text-critical",
        className
      )}
    >
      {message}
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  )
}
