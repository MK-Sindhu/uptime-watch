"use client"

import {
  ArrowUpRightIcon,
  CopyIcon,
  EllipsisIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Input } from "@/components/field"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  deleteWebsite,
  describeError,
  updateWebsite,
  type WebsiteDetail,
} from "@/lib/api"
import { displayName, hostOf } from "@/lib/site"
import { cn } from "@/lib/utils"

type SiteLike = Pick<WebsiteDetail, "id" | "url" | "name" | "paused">

// ----------------------------------------------------------------- rename

export function RenameDialog({
  site,
  open,
  onOpenChange,
  onRenamed,
}: {
  site: SiteLike
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenamed: (updated: WebsiteDetail) => void
}) {
  const [value, setValue] = useState(site.name ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const updated = await updateWebsite(site.id, { name: value.trim() || null })
      onRenamed(updated)
      onOpenChange(false)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(site.name ?? "")
          setError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold">Rename site</DialogTitle>
            <DialogDescription>
              A short name for <span className="font-mono">{hostOf(site.url)}</span>. Leave it
              empty to show the address instead.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor={`rename-${site.id}`} className="text-sm font-semibold">
              Name
            </label>
            <Input
              id={`rename-${site.id}`}
              value={value}
              maxLength={80}
              placeholder={hostOf(site.url)}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-pulse-down">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ----------------------------------------------------------------- delete

export function ConfirmDeleteDialog({
  site,
  open,
  onOpenChange,
  onDeleted,
}: {
  site: SiteLike
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDelete() {
    setPending(true)
    setError(null)
    try {
      await deleteWebsite(site.id)
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl font-extrabold">
            Delete {displayName(site)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Checks stop and the site leaves your chart. Its history can&apos;t be brought back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-pulse-down">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button variant="destructive" onClick={onDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete site"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ------------------------------------------------------------- pause/resume

export async function togglePaused(site: SiteLike) {
  return updateWebsite(site.id, { paused: !site.paused })
}

// -------------------------------------------------------------------- menu

// The "⋯" menu on a site: open, rename, pause/resume, copy address, delete.
export function SiteActionsMenu({
  site,
  onChanged,
  onDeleted,
  onError,
  showOpen = true,
  className,
}: {
  site: SiteLike
  onChanged: (updated: WebsiteDetail) => void
  onDeleted: () => void
  onError?: (message: string) => void
  showOpen?: boolean
  className?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const name = displayName(site)

  async function onTogglePause() {
    try {
      onChanged(await togglePaused(site))
    } catch (err) {
      onError?.(describeError(err))
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(site.url)
    } catch {
      onError?.("Couldn't copy the address. Copy it from the link instead.")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${name}`}
              className={cn("text-muted-foreground", className)}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {showOpen && (
            <DropdownMenuItem render={<Link href={`/sites/${site.id}`} />}>
              <ArrowUpRightIcon />
              Open details
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilIcon />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePause}>
            {site.paused ? <PlayIcon /> : <PauseIcon />}
            {site.paused ? "Resume checks" : "Pause checks"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopy}>
            <CopyIcon />
            Copy address
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2Icon />
            Delete site…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog site={site} open={renaming} onOpenChange={setRenaming} onRenamed={onChanged} />
      <ConfirmDeleteDialog site={site} open={deleting} onOpenChange={setDeleting} onDeleted={onDeleted} />
    </>
  )
}
