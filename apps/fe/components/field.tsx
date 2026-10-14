import { cn } from "@/lib/utils"

export function Field({
  label,
  id,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground/90">
        {label}
      </label>
      <Input id={id} className={className} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

// A recessed glass well: slightly darker than the panel it sits on, with an
// inner shadow, so it reads as "type here" in both themes.
export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-panel-border bg-foreground/[0.04] px-3 text-base text-foreground shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)] outline-none transition-[border-color,box-shadow,background-color] dark:bg-foreground/[0.035] dark:shadow-[inset_0_1px_3px_rgb(0_0_0/0.35)]",
        "placeholder:text-muted-foreground/70 hover:border-foreground/15",
        "focus-visible:border-ring/70 focus-visible:bg-foreground/[0.02] focus-visible:ring-3 focus-visible:ring-ring/35",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-critical/60 aria-invalid:ring-critical/20 aria-invalid:focus-visible:ring-critical/30",
        // Browser autofill paints its own pale fill; keep the glass well instead.
        "autofill:shadow-[inset_0_0_0_100px_var(--inset-to)] autofill:[-webkit-text-fill-color:var(--foreground)]",
        className
      )}
      {...props}
    />
  )
}
