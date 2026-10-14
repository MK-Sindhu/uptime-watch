"use client"

import { useCallback, useMemo, useState } from "react"

import type { Website, WebsiteDetail } from "@/lib/api"

// Optimistic edits layered over the polled list. Each edit is stamped with
// the time it was made; once a poll that finished later arrives, the server
// data already includes the edit and the override is ignored (then pruned).
type Override = {
  // Infinity while the request is still in flight, so no poll can undo it
  at: number
  patch?: Partial<Website>
  deleted?: boolean
  added?: Website
}

function isLive(
  o: Override | undefined,
  updatedAt: number | null
): o is Override {
  return !!o && (updatedAt === null || o.at > updatedAt)
}

export function useSiteList(
  data: Website[] | undefined,
  updatedAt: number | null
) {
  const [overrides, setOverrides] = useState<Record<string, Override>>({})

  const sites = useMemo(() => {
    if (!data) return undefined
    const out: Website[] = []
    for (const site of data) {
      const o = overrides[site.id]
      if (!isLive(o, updatedAt)) out.push(site)
      else if (!o.deleted) out.push(o.patch ? { ...site, ...o.patch } : site)
    }
    // Just added: shown until the next poll lists it.
    for (const [id, o] of Object.entries(overrides)) {
      if (
        o.added &&
        !o.deleted &&
        isLive(o, updatedAt) &&
        !data.some((s) => s.id === id)
      ) {
        out.push(o.patch ? { ...o.added, ...o.patch } : o.added)
      }
    }
    return out
  }, [data, updatedAt, overrides])

  const write = useCallback(
    (id: string, at: number, change: Omit<Override, "at">) => {
      setOverrides((prev) => {
        const next: Record<string, Override> = {}
        for (const [key, o] of Object.entries(prev))
          if (isLive(o, updatedAt)) next[key] = o
        const old = next[id]
        next[id] = {
          ...old,
          ...change,
          patch: change.patch ? { ...old?.patch, ...change.patch } : old?.patch,
          at,
        }
        return next
      })
    },
    [updatedAt]
  )

  // `pending: true` before the request settles; call again with the
  // server's answer (or the old values on failure) to settle it.
  const patch = useCallback(
    (id: string, fields: Partial<Website>, { pending = false } = {}) =>
      write(id, pending ? Number.POSITIVE_INFINITY : Date.now(), {
        patch: fields,
      }),
    [write]
  )

  const applyDetail = useCallback(
    (updated: WebsiteDetail) =>
      write(updated.id, Date.now(), { patch: { ...updated } }),
    [write]
  )

  const remove = useCallback(
    (id: string) => write(id, Date.now(), { deleted: true }),
    [write]
  )

  const add = useCallback(
    (site: Website) => write(site.id, Date.now(), { added: site }),
    [write]
  )

  return { sites, patch, applyDetail, remove, add }
}

// A placeholder row for a site the API just accepted, until the next poll.
export function newSite(id: string, url: string): Website {
  return {
    id,
    url,
    name: null,
    paused: false,
    public: false,
    user_id: "",
    time_added: new Date().toISOString(),
    stats24h: { up: 0, down: 0, uptimePct: null, p50Ms: null },
    ticks: [],
  }
}
