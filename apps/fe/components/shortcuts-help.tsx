"use client"

import { useSyncExternalStore } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { isMac } from "@/lib/keys"
import { cn } from "@/lib/utils"

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-b-2 border-panel-border bg-foreground/[0.06] px-1 font-sans text-[0.7rem] font-semibold text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  )
}

// "⌘" on macOS, "Ctrl" elsewhere. "Ctrl" during server render, then the
// real value once hydrated.
export function useModKey() {
  return useSyncExternalStore(
    () => () => {},
    () => (isMac() ? "⌘" : "Ctrl"),
    () => "Ctrl"
  )
}

type Shortcut = {
  keys: string[]
  // how the keys combine: "+" pressed together, "/" either one, "–" a range
  join?: "+" | "/" | "–"
  label: string
}

function groups(mod: string): { title: string; items: Shortcut[] }[] {
  return [
    {
      title: "Anywhere",
      items: [
        { keys: [mod, "K"], join: "+", label: "Open the command palette" },
        { keys: ["?"], label: "Show these shortcuts" },
        { keys: ["D"], label: "Switch between light and dark" },
        { keys: ["Esc"], label: "Close a dialog or menu" },
      ],
    },
    {
      title: "Dashboard",
      items: [
        { keys: ["/"], label: "Search sites" },
        { keys: ["N"], label: "Add a site" },
        {
          keys: ["J", "K"],
          join: "/",
          label: "Highlight the next or previous site",
        },
        { keys: ["Enter"], label: "Open the highlighted site" },
        { keys: ["Esc"], label: "Clear the search" },
      ],
    },
    {
      title: "Site page",
      items: [
        {
          keys: ["1", "5"],
          join: "–",
          label: "Range: 1 h, 24 h, 7 d, 30 d, 90 d",
        },
      ],
    },
  ]
}

function Keys({ keys, join }: Pick<Shortcut, "keys" | "join">) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {keys.map((key, i) => (
        <span key={key} className="inline-flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">{join}</span>}
          <Kbd>{key}</Kbd>
        </span>
      ))}
    </span>
  )
}

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mod = useModKey()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-2xl border border-panel-border bg-panel-strong ring-0 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:p-5">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Single keys work whenever you aren&apos;t typing in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {groups(mod).map((group) => (
            <section key={group.title}>
              <h3 className="eyebrow px-1 pb-1.5">{group.title}</h3>
              <dl className="divide-y divide-border rounded-xl border border-panel-border bg-foreground/[0.025] px-3">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <dt className="text-sm">{item.label}</dt>
                    <dd className="shrink-0">
                      <Keys keys={item.keys} join={item.join} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
