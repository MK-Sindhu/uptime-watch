// Pure layout for the check-flow Sankey: region → site → outcome.
//
// The unit of flow is a "thread": the checks one region ran against one site
// that ended in one outcome. Threads are stacked inside the aggregate bands
// (region→site, site→outcome) in a consistent order, so a hovered node or
// ribbon can light up its exact path through both stages.
import type { FlowLink } from "@/lib/api"

export type Outcome = FlowLink["outcome"]

// Top to bottom in the outcome column: good to bad.
export const OUTCOMES: Outcome[] = ["fast", "normal", "slow", "down", "unknown"]

export type Col = 0 | 1 | 2

export type FlowNode = {
  // "r:<regionId>", "s:<websiteId>", "o:<outcome>"
  key: string
  col: Col
  id: string
  checks: number
  // 0..1 of all checks
  share: number
  y0: number
  y1: number
  // where the bands attach (proportional part, centred in the bar)
  inner0: number
}

type Span = [number, number]

export type Thread = {
  key: string
  regionId: string
  websiteId: string
  outcome: Outcome
  checks: number
  // stage 1: at the region (source) and site (target)
  a: Span
  b: Span
  // stage 2: at the site (source) and outcome (target)
  c: Span
  d: Span
}

export type Band = {
  key: string
  stage: 1 | 2
  from: string
  to: string
  checks: number
  src: Span
  dst: Span
  // stage 2 only: the outcome it ends in
  outcome?: Outcome
}

export type FlowLayout = {
  total: number
  nodes: FlowNode[]
  byKey: Map<string, FlowNode>
  bands: Band[]
  threads: Thread[]
}

export const nodeKey = {
  region: (id: string) => `r:${id}`,
  site: (id: string) => `s:${id}`,
  outcome: (o: Outcome) => `o:${o}`,
}

export const threadKey = (l: Pick<FlowLink, "regionId" | "websiteId" | "outcome">) =>
  `${l.regionId}|${l.websiteId}|${l.outcome}`

function sum<T>(items: T[], f: (t: T) => number) {
  return items.reduce((n, t) => n + f(t), 0)
}

function group<T>(items: T[], key: (t: T) => string) {
  const out = new Map<string, T[]>()
  for (const t of items) {
    const k = key(t)
    const list = out.get(k)
    if (list) list.push(t)
    else out.set(k, [t])
  }
  return out
}

export function layoutFlow(
  links: FlowLink[],
  {
    top,
    bottom,
    gap = 10,
    minNode = 8,
    nameOf,
  }: {
    // vertical room for the nodes, in px
    top: number
    bottom: number
    gap?: number
    // thin nodes still get a visible bar
    minNode?: number
    // tie-breaker for ordering (display name of a region or site)
    nameOf: (key: string) => string
  }
): FlowLayout {
  // Merge duplicates, drop empty links.
  const merged = new Map<string, FlowLink>()
  for (const l of links) {
    if (!(l.checks > 0)) continue
    const k = threadKey(l)
    const prev = merged.get(k)
    merged.set(k, prev ? { ...prev, checks: prev.checks + l.checks } : { ...l })
  }
  const flow = [...merged.values()]
  const total = sum(flow, (l) => l.checks)
  if (total === 0) {
    return { total: 0, nodes: [], byKey: new Map(), bands: [], threads: [] }
  }

  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b))
  const outcomeIndex = (o: Outcome) => OUTCOMES.indexOf(o)

  // Regions: busiest first.
  const regionGroups = group(flow, (l) => l.regionId)
  const regions = [...regionGroups.keys()].sort(
    (a, b) =>
      sum(regionGroups.get(b)!, (l) => l.checks) -
        sum(regionGroups.get(a)!, (l) => l.checks) ||
      byName(nodeKey.region(a), nodeKey.region(b))
  )

  // Sites: by the average outcome of their checks, so fast sites sit near
  // "Fast" and slow ones near "Slow" (fewer crossing ribbons).
  const siteGroups = group(flow, (l) => l.websiteId)
  const centre = (id: string) => {
    const list = siteGroups.get(id)!
    return sum(list, (l) => outcomeIndex(l.outcome) * l.checks) / sum(list, (l) => l.checks)
  }
  const sites = [...siteGroups.keys()].sort(
    (a, b) => centre(a) - centre(b) || byName(nodeKey.site(a), nodeKey.site(b))
  )

  const outcomeGroups = group(flow, (l) => l.outcome)
  const outcomes = OUTCOMES.filter((o) => outcomeGroups.has(o))

  const columns: { col: Col; keys: string[]; checks: number[] }[] = [
    {
      col: 0,
      keys: regions.map(nodeKey.region),
      checks: regions.map((id) => sum(regionGroups.get(id)!, (l) => l.checks)),
    },
    {
      col: 1,
      keys: sites.map(nodeKey.site),
      checks: sites.map((id) => sum(siteGroups.get(id)!, (l) => l.checks)),
    },
    {
      col: 2,
      keys: outcomes.map(nodeKey.outcome),
      checks: outcomes.map((o) => sum(outcomeGroups.get(o)!, (l) => l.checks)),
    },
  ]

  // One scale (px per check) for every column, so a band is equally wide
  // at both ends. Shrink it until the fullest column fits with minimum bars.
  const room = bottom - top
  let k = Math.min(
    ...columns.map((c) => (room - gap * (c.keys.length - 1)) / total)
  )
  const heightOf = (checks: number) => Math.max(minNode, checks * k)
  for (let i = 0; i < 12; i++) {
    const worst = Math.max(
      ...columns.map(
        (c) => sum(c.checks, heightOf) + gap * (c.keys.length - 1)
      )
    )
    if (worst <= room + 0.5) break
    k *= room / worst
  }
  k = Math.max(k, 0)

  const nodes: FlowNode[] = []
  for (const c of columns) {
    const colHeight = sum(c.checks, heightOf) + gap * (c.keys.length - 1)
    let y = top + Math.max(0, (room - colHeight) / 2)
    c.keys.forEach((key, i) => {
      const checks = c.checks[i]!
      const h = heightOf(checks)
      nodes.push({
        key,
        col: c.col,
        id: key.slice(2),
        checks,
        share: checks / total,
        y0: y,
        y1: y + h,
        inner0: y + (h - checks * k) / 2,
      })
      y += h + gap
    })
  }
  const byKey = new Map(nodes.map((n) => [n.key, n]))

  const regionRank = new Map(regions.map((id, i) => [id, i]))
  const siteRank = new Map(sites.map((id, i) => [id, i]))

  // Stack threads along one side of each node in the given order.
  function stack(
    nodeOf: (l: FlowLink) => string,
    order: (a: FlowLink, b: FlowLink) => number
  ) {
    const spans = new Map<string, Span>()
    for (const [key, list] of group(flow, nodeOf)) {
      let y = byKey.get(key)!.inner0
      for (const l of [...list].sort(order)) {
        const h = l.checks * k
        spans.set(threadKey(l), [y, y + h])
        y += h
      }
    }
    return spans
  }
  const bySite = (a: FlowLink, b: FlowLink) =>
    siteRank.get(a.websiteId)! - siteRank.get(b.websiteId)!
  const byRegion = (a: FlowLink, b: FlowLink) =>
    regionRank.get(a.regionId)! - regionRank.get(b.regionId)!
  const byOutcome = (a: FlowLink, b: FlowLink) =>
    outcomeIndex(a.outcome) - outcomeIndex(b.outcome)

  const atRegion = stack((l) => nodeKey.region(l.regionId), (a, b) => bySite(a, b) || byOutcome(a, b))
  const intoSite = stack((l) => nodeKey.site(l.websiteId), (a, b) => byRegion(a, b) || byOutcome(a, b))
  const outOfSite = stack((l) => nodeKey.site(l.websiteId), (a, b) => byOutcome(a, b) || byRegion(a, b))
  const atOutcome = stack((l) => nodeKey.outcome(l.outcome), (a, b) => bySite(a, b) || byRegion(a, b))

  const threads: Thread[] = flow.map((l) => {
    const key = threadKey(l)
    return {
      key,
      regionId: l.regionId,
      websiteId: l.websiteId,
      outcome: l.outcome,
      checks: l.checks,
      a: atRegion.get(key)!,
      b: intoSite.get(key)!,
      c: outOfSite.get(key)!,
      d: atOutcome.get(key)!,
    }
  })

  // Aggregate bands: the union of their threads' spans (contiguous by
  // construction of the orders above).
  function bands(
    stage: 1 | 2,
    pick: (t: Thread) => [string, string],
    srcOf: (t: Thread) => Span,
    dstOf: (t: Thread) => Span
  ): Band[] {
    return [...group(threads, (t) => pick(t).join(">"))].map(([key, list]) => {
      const [from, to] = pick(list[0]!)
      return {
        key: `${stage}:${key}`,
        stage,
        from,
        to,
        checks: sum(list, (t) => t.checks),
        src: [Math.min(...list.map((t) => srcOf(t)[0])), Math.max(...list.map((t) => srcOf(t)[1]))],
        dst: [Math.min(...list.map((t) => dstOf(t)[0])), Math.max(...list.map((t) => dstOf(t)[1]))],
        outcome: stage === 2 ? list[0]!.outcome : undefined,
      }
    })
  }

  return {
    total,
    nodes,
    byKey,
    bands: [
      ...bands(1, (t) => [nodeKey.region(t.regionId), nodeKey.site(t.websiteId)], (t) => t.a, (t) => t.b),
      ...bands(2, (t) => [nodeKey.site(t.websiteId), nodeKey.outcome(t.outcome)], (t) => t.c, (t) => t.d),
    ],
    threads,
  }
}

// Threads that pass through a node.
export function threadsThrough(layout: FlowLayout, key: string) {
  const [kind, id] = [key.slice(0, 1), key.slice(2)]
  return layout.threads.filter((t) =>
    kind === "r" ? t.regionId === id : kind === "s" ? t.websiteId === id : t.outcome === id
  )
}

// Label positions: start at each node's centre, then push apart so labels
// of `size` px never overlap, staying within [min, max].
export function spreadLabels(centres: number[], size: number, min: number, max: number) {
  const out = centres.map((c) => Math.min(max - size / 2, Math.max(min + size / 2, c)))
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i]!, out[i - 1]! + size)
  // Overflowed at the bottom: pull back up.
  if (out.length && out[out.length - 1]! > max - size / 2) {
    out[out.length - 1] = max - size / 2
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i]!, out[i + 1]! - size)
  }
  return out
}
