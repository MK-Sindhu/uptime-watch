"use client"

import {
  CornerDownLeftIcon,
  GlobeIcon,
  KeyboardIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  SunMoonIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Fragment, useId, useRef, useState } from "react"

import { Kbd } from "@/components/shortcuts-help"
import { StatusMark } from "@/components/status-badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Website } from "@/lib/api"
import { displayName, hostOf, siteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"

type Command = {
  id: string
  group: "Sites" | "Actions"
  label: string
  // extra words the search matches, e.g. the site's address
  keywords?: string
  icon: React.ReactNode
  hint?: React.ReactNode
  // the action puts focus somewhere itself (a field, another dialog), so the
  // palette must not hand focus back to where it was opened from
  movesFocus?: boolean
  run: () => void
}

// Cmd/Ctrl+K: jump to a site or run an action by typing a few letters.
// Callbacks that aren't passed leave their command out.
export function CommandPalette({
  open,
  onOpenChange,
  sites = [],
  onAddSite,
  onStatusPage,
  onShortcuts,
  onSignOut,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites?: Website[]
  onAddSite?: () => void
  onStatusPage?: () => void
  onShortcuts?: () => void
  onSignOut?: () => void
}) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  // Actions run once the dialog has finished closing, so the focus they set
  // isn't undone by the dialog returning focus on its way out.
  const pending = useRef<Command | null>(null)
  const keepFocus = useRef(false)

  const commands: Command[] = sites.map((site) => ({
    id: `site-${site.id}`,
    group: "Sites",
    label: `Go to ${displayName(site)}`,
    keywords: site.url,
    icon: <StatusMark status={siteStatus(site)} className="mx-[3px]" />,
    hint: site.name ? (
      <span className="font-mono">{hostOf(site.url)}</span>
    ) : undefined,
    run: () => router.push(`/sites/${site.id}`),
  }))
  if (onAddSite) {
    commands.push({
      id: "add",
      group: "Actions",
      label: "Add a site",
      icon: <PlusIcon />,
      hint: <Kbd>N</Kbd>,
      movesFocus: true,
      run: onAddSite,
    })
  }
  if (onStatusPage) {
    commands.push({
      id: "status",
      group: "Actions",
      label: "Status page settings",
      keywords: "public share",
      icon: <GlobeIcon />,
      movesFocus: true,
      run: onStatusPage,
    })
  }
  commands.push({
    id: "theme",
    group: "Actions",
    label: "Toggle dark mode",
    keywords: "theme light night",
    icon: <SunMoonIcon />,
    hint: <Kbd>D</Kbd>,
    run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  })
  if (onShortcuts) {
    commands.push({
      id: "shortcuts",
      group: "Actions",
      label: "Keyboard shortcuts",
      keywords: "help keys",
      icon: <KeyboardIcon />,
      hint: <Kbd>?</Kbd>,
      movesFocus: true,
      run: onShortcuts,
    })
  }
  if (onSignOut) {
    commands.push({
      id: "signout",
      group: "Actions",
      label: "Sign out",
      keywords: "log out",
      icon: <LogOutIcon />,
      run: onSignOut,
    })
  }

  function choose(command: Command) {
    pending.current = command
    keepFocus.current = !!command.movesFocus
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) {
          keepFocus.current = false
          return
        }
        const command = pending.current
        pending.current = null
        command?.run()
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={inputRef}
        finalFocus={() => !keepFocus.current}
        className="top-[12svh] translate-y-0 gap-0 overflow-hidden rounded-2xl border border-panel-border bg-panel-strong p-0 ring-0 shadow-2xl backdrop-blur-xl sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter. Up and down arrows move, Enter runs the highlighted
          command.
        </DialogDescription>
        <PaletteBody
          commands={commands}
          inputRef={inputRef}
          onChoose={choose}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// Mounted only while the dialog is open, so every open starts with an empty
// query and the first command highlighted.
function PaletteBody({
  commands,
  inputRef,
  onChoose,
  onClose,
}: {
  commands: Command[]
  inputRef: React.RefObject<HTMLInputElement | null>
  onChoose: (command: Command) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = (i: number) => `${listId}-option-${i}`

  // Every word must appear somewhere in the label or keywords.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = commands.filter((c) => {
    const haystack = `${c.label} ${c.keywords ?? ""}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
  const current = shown.length ? Math.min(active, shown.length - 1) : -1

  function move(to: number) {
    if (!shown.length) return
    const i = (to + shown.length) % shown.length
    setActive(i)
    document.getElementById(optionId(i))?.scrollIntoView({ block: "nearest" })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") move(current + 1)
    else if (e.key === "ArrowUp") move(current - 1)
    else if (e.key === "Enter" && shown[current]) onChoose(shown[current])
    // Cmd/Ctrl+K again closes, like it opened.
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") onClose()
    else return
    e.preventDefault()
  }

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-panel-border px-4">
        <SearchIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          aria-label="Search sites and actions"
          placeholder="Go to a site or run an action…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground/80"
        />
      </div>

      {shown.length === 0 && (
        <p
          role="status"
          className="px-3 py-8 text-center text-sm text-muted-foreground"
        >
          Nothing matches “{query.trim()}”.
        </p>
      )}
      <div
        id={listId}
        role="listbox"
        aria-label="Commands"
        className="max-h-[min(24rem,55svh)] overflow-y-auto p-2 empty:hidden"
      >
        {shown.map((command, i) => (
          <Fragment key={command.id}>
            {shown[i - 1]?.group !== command.group && (
              <div
                role="presentation"
                className="eyebrow px-2.5 pt-2.5 pb-1.5"
              >
                {command.group}
              </div>
            )}
            <div
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              // mousemove, not mouseenter: a list scrolled under a resting
              // pointer shouldn't steal the highlight from the keyboard
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => onChoose(command)}
              className={cn(
                "relative flex cursor-default items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm select-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                i === current && "bg-foreground/[0.07] text-foreground"
              )}
            >
              {i === current && (
                <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-glow text-glow glow" />
              )}
              {command.icon}
              <span className="min-w-0 flex-1 truncate">{command.label}</span>
              {command.hint && (
                <span className="truncate text-xs text-muted-foreground">
                  {command.hint}
                </span>
              )}
              {i === current && <CornerDownLeftIcon aria-hidden="true" />}
            </div>
          </Fragment>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-panel-border bg-foreground/[0.03] px-4 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> run
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </>
  )
}
