"use client"

import { ArrowDownUpIcon, KeyboardIcon, SearchIcon, XIcon } from "lucide-react"

import {
  FILTERS,
  SORTS,
  type Filter,
  type Sort,
  type View,
} from "@/components/dashboard/view"
import { Input } from "@/components/field"
import { Kbd } from "@/components/shortcuts-help"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

// The `/` shortcut focuses this field by id.
export const SEARCH_INPUT_ID = "site-search"

export function focusSearch() {
  const input = document.getElementById(SEARCH_INPUT_ID)
  if (input instanceof HTMLInputElement) {
    input.focus()
    input.select()
  }
}

export function Toolbar({
  view,
  counts,
  onChange,
  onHelp,
}: {
  view: View
  counts: Record<Filter, number>
  onChange: (patch: Partial<View>) => void
  onHelp: () => void
}) {
  const sortLabel = SORTS.find((s) => s.value === view.sort)?.label

  return (
    <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:gap-3">
      <div role="search" className="relative @2xl:w-64">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={SEARCH_INPUT_ID}
          type="search"
          aria-label="Search sites by name or address"
          placeholder="Search sites"
          autoComplete="off"
          spellCheck={false}
          value={view.q}
          onChange={(e) => onChange({ q: e.target.value })}
          className="h-9 rounded-xl border-panel-border bg-foreground/[0.04] pr-9 pl-9 text-sm [&::-webkit-search-cancel-button]:appearance-none"
        />
        <span className="absolute top-1/2 right-2 -translate-y-1/2">
          {view.q ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => {
                onChange({ q: "" })
                focusSearch()
              }}
            >
              <XIcon />
            </Button>
          ) : (
            <Kbd className="pointer-events-none hidden sm:inline-flex">/</Kbd>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 @2xl:flex-1">
        <ToggleGroup
          aria-label="Filter sites"
          variant="outline"
          size="sm"
          spacing={1}
          value={[view.filter]}
          // Pressing the chip that's already on keeps it on.
          onValueChange={(next) =>
            next[0] && onChange({ filter: next[0] as Filter })
          }
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem
              key={f.value}
              value={f.value}
              className="h-8 rounded-full border-panel-border bg-foreground/[0.03] px-3 aria-pressed:border-transparent aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/85"
            >
              {f.label}
              <span className="text-[0.7rem] font-semibold tabular-nums opacity-70">
                {counts[f.value]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="rounded-full" />}>
              <ArrowDownUpIcon />
              <span className="text-muted-foreground">Sort:</span> {sortLabel}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sort sites by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={view.sort}
                  onValueChange={(value) => onChange({ sort: value as Sort })}
                >
                  {SORTS.map((s) => (
                    <DropdownMenuRadioItem key={s.value} value={s.value}>
                      {s.label}
                      <span className="ml-auto pl-3 text-xs text-muted-foreground">
                        {s.hint}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={onHelp}
          >
            <KeyboardIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
