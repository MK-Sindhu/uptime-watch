"use client"

import { ROW_GRID, SiteRow, TRACE_SLOTS } from "@/components/dashboard/site-row"
import type { Website, WebsiteDetail } from "@/lib/api"
import { cn } from "@/lib/utils"

export function SiteList({
  sites,
  now,
  regionNames,
  activeId,
  onFocusRow,
  onChanged,
  onDeleted,
  onResume,
  onError,
}: {
  sites: Website[]
  now: number
  regionNames: Map<string, string>
  activeId: string | null
  onFocusRow: (id: string) => void
  onChanged: (updated: WebsiteDetail) => void
  onDeleted: (id: string) => void
  onResume: (site: Website) => void
  onError: (message: string) => void
}) {
  return (
    <div>
      {/* Column labels. Rows carry their own words, so screen readers skip this. */}
      <div aria-hidden="true" className={cn(ROW_GRID, "hidden border-b border-panel-border pt-1 pb-2.5 @2xl:grid")}>
        <span className="eyebrow">Site</span>
        <span className="eyebrow">Last {TRACE_SLOTS} checks</span>
        <span className="eyebrow text-right">Latest</span>
      </div>
      <ul aria-label="Sites">
        {sites.map((site) => (
          <SiteRow
            key={site.id}
            site={site}
            now={now}
            regionNames={regionNames}
            active={site.id === activeId}
            onFocus={onFocusRow}
            onChanged={onChanged}
            onDeleted={onDeleted}
            onResume={onResume}
            onError={onError}
          />
        ))}
      </ul>
    </div>
  )
}
