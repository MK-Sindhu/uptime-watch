"use client"

import { ArrowUpRightIcon, ChevronRightIcon, PauseIcon, PencilIcon, PlayIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ConfirmDeleteDialog, RenameDialog } from "@/components/site-actions"
import { GLASS_BUTTON } from "@/components/site/panel-bar"
import { RelativeTime } from "@/components/site/relative-time"
import type { PauseControl } from "@/components/site/use-pause"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import type { WebsiteDetail } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { displayName, hostOf, type SiteStatus } from "@/lib/site"
import { cn } from "@/lib/utils"
import { formatInterval } from "@/lib/checks"

const LINK =
  "rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"

// Breadcrumb, status, name, host link, actions and the "checked … ago" line.
// Not a panel: the page title sits straight on the ambient light.
export function SiteHeading({
  site,
  status,
  lastCheckAt,
  regionCount,
  updatedAt,
  pause,
  onChanged,
  onDeleted,
}: {
  site: WebsiteDetail
  status: SiteStatus
  lastCheckAt: string | null
  regionCount: number
  // when the numbers last refreshed (ms epoch)
  updatedAt: number | null
  pause: PauseControl
  onChanged: (updated: WebsiteDetail) => void
  onDeleted: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const name = displayName(site)
  const host = hostOf(site.url)

  return (
    <section aria-labelledby="site-name" className="grid grid-cols-1 gap-3 px-1 pt-1 pb-2">
      <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-muted-foreground">
        <ol className="flex min-w-0 items-center gap-1.5">
          <li className="shrink-0">
            <Link href="/dashboard" className={LINK}>
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRightIcon className="size-3.5" />
          </li>
          <li aria-current="page" className="min-w-0 truncate text-foreground">
            {name}
          </li>
        </ol>
      </nav>

      <span className="inline-flex items-center justify-self-start rounded-full border border-panel-border bg-panel px-2.5 py-1 shadow-sm backdrop-blur-md">
        <StatusBadge status={status} className="text-xs font-semibold" />
      </span>

      {/* Wraps rather than squeezing: the buttons drop under a long name. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1
          id="site-name"
          className="min-w-0 text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl"
        >
          {name}
        </h1>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" className={GLASS_BUTTON} onClick={pause.toggle} disabled={pause.pending}>
            {site.paused ? <PlayIcon /> : <PauseIcon />}
            {site.paused ? "Resume checks" : "Pause checks"}
          </Button>
          <Button variant="ghost" size="sm" className={GLASS_BUTTON} onClick={() => setRenaming(true)}>
            <PencilIcon />
            Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(GLASS_BUTTON, "text-critical hover:text-critical")}
            onClick={() => setDeleting(true)}
          >
            <Trash2Icon />
            Delete site
          </Button>
        </div>
      </div>

      <p className="flex min-w-0 flex-col items-start gap-x-2 gap-y-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
        <a
          href={site.url}
          target="_blank"
          rel="noreferrer"
          title={site.url}
          className={cn("inline-flex max-w-full min-w-0 items-center gap-1 text-foreground/85", LINK)}
        >
          <span className={cn("truncate", site.name && "font-mono")}>{site.name ? host : "Open site"}</span>
          <ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <span aria-hidden="true" className="hidden sm:inline">
          ·
        </span>
        <CheckedLine
          paused={site.paused}
          lastCheckAt={lastCheckAt}
          regionCount={regionCount}
          updatedAt={updatedAt}
        />
      </p>

      {pause.error && (
        <p role="alert" className="text-sm text-critical">
          {pause.error}
        </p>
      )}

      <RenameDialog site={site} open={renaming} onOpenChange={setRenaming} onRenamed={onChanged} />
      <ConfirmDeleteDialog site={site} open={deleting} onOpenChange={setDeleting} onDeleted={onDeleted} />
    </section>
  )
}

function CheckedLine({
  paused,
  lastCheckAt,
  regionCount,
  updatedAt,
}: {
  paused: boolean
  lastCheckAt: string | null
  regionCount: number
  updatedAt: number | null
}) {
  return (
    <span>
      {paused ? (
        <>
          Paused
          {lastCheckAt && (
            <>
              {" · last check "}
              <RelativeTime iso={lastCheckAt} />
            </>
          )}
        </>
      ) : lastCheckAt ? (
        <>
          {"Checked "}
          <RelativeTime iso={lastCheckAt} />
          {regionCount > 0 && ` from ${formatCount(regionCount, "region", "regions")}`}
          {` · every ${formatInterval()}`}
        </>
      ) : (
        `Waiting for the first check · every ${formatInterval()}`
      )}
      {updatedAt && (
        <span className="hidden sm:inline">
          {" · updated "}
          <RelativeTime iso={new Date(updatedAt).toISOString()} />
        </span>
      )}
    </span>
  )
}
