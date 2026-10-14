"use client"

import {
  CircleHelpIcon,
  GaugeIcon,
  MapPinIcon,
  OctagonXIcon,
  SnailIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import {
  layoutFlow,
  nodeKey,
  OUTCOMES,
  spreadLabels,
  threadKey,
  threadsThrough,
  type Col,
  type FlowLayout,
  type FlowNode,
  type Outcome,
  type Thread,
} from "@/components/flow/layout"
import { TONE_TEXT, TONE_VAR, type Tone } from "@/components/glass/tone"
import type { FlowLink } from "@/lib/api"
import { formatMs } from "@/lib/format"
import { cn } from "@/lib/utils"

// ------------------------------------------------------------ vocabulary

export const OUTCOME_TONE: Record<Outcome, Tone> = {
  fast: "stable",
  normal: "warning",
  slow: "high",
  down: "critical",
  unknown: "info",
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  fast: "Fast",
  normal: "Normal",
  slow: "Slow",
  down: "Down",
  unknown: "Unknown",
}

const OUTCOME_ICON: Record<Outcome, LucideIcon> = {
  fast: ZapIcon,
  normal: GaugeIcon,
  slow: SnailIcon,
  down: OctagonXIcon,
  unknown: CircleHelpIcon,
}

export function outcomeHint(o: Outcome, fastMs = 300, slowMs = 1000) {
  switch (o) {
    case "fast":
      return `under ${formatMs(fastMs)}`
    case "normal":
      return `${formatMs(fastMs)} to ${formatMs(slowMs)}`
    case "slow":
      return `${formatMs(slowMs)} or more`
    case "down":
      return "no answer"
    case "unknown":
      return "no result"
  }
}

const nf = new Intl.NumberFormat("en-GB")
const count = (n: number) => nf.format(n)
const pct = (share: number) =>
  `${(share * 100).toFixed(share > 0 && share < 0.001 ? 2 : 1)}%`
const checksWord = (n: number) => `${count(n)} ${n === 1 ? "check" : "checks"}`

// ---------------------------------------------------------------- geometry

const MIN_W = 560
const NODE_W = 14
// how far the ends of each column lean right of its middle (px)
const BEND = 18
const HEAD = 34
const FOOT = 10
// room for the outcome labels right of the last column
const RIGHT = 118

type Geometry = {
  width: number
  height: number
  x: [number, number, number]
  top: number
  bottom: number
  bend: (y: number) => number
}

function geometry(width: number, height: number): Geometry {
  const top = HEAD
  const bottom = height - FOOT
  const mid = (top + bottom) / 2
  const half = (bottom - top) / 2 || 1
  const x0 = 2
  const x2 = width - RIGHT - BEND - NODE_W
  return {
    width,
    height,
    x: [x0, Math.round((x0 + x2) / 2), x2],
    top,
    bottom,
    // Columns curve like the reference's tilted bars: "(" shaped.
    bend: (y) => BEND * Math.min(1, ((y - mid) / half) ** 2),
  }
}

const f = (n: number) => n.toFixed(1)

function left(g: Geometry, col: Col, y: number) {
  return g.x[col] + g.bend(y)
}
function right(g: Geometry, col: Col, y: number) {
  return g.x[col] + NODE_W + g.bend(y)
}

// A band from [a0,a1] on one column to [b0,b1] on the next.
function ribbon(g: Geometry, src: Col, [a0, a1]: number[], [b0, b1]: number[]) {
  const dst = (src + 1) as Col
  const sx0 = right(g, src, a0)
  const sx1 = right(g, src, a1)
  const tx0 = left(g, dst, b0)
  const tx1 = left(g, dst, b1)
  const m0 = (sx0 + tx0) / 2
  const m1 = (sx1 + tx1) / 2
  return (
    `M${f(sx0)} ${f(a0)} C${f(m0)} ${f(a0)} ${f(m0)} ${f(b0)} ${f(tx0)} ${f(b0)} ` +
    `L${f(tx1)} ${f(b1)} C${f(m1)} ${f(b1)} ${f(m1)} ${f(a1)} ${f(sx1)} ${f(a1)} Z`
  )
}

// A node bar following the column's curve, with rounded corners.
function bar(g: Geometry, col: Col, y0: number, y1: number) {
  const r = Math.min(4, (y1 - y0) / 2)
  const steps = 6
  const ys = Array.from({ length: steps + 1 }, (_, i) => y0 + r + ((y1 - y0 - 2 * r) * i) / steps)
  const L = (y: number) => left(g, col, y)
  const R = (y: number) => right(g, col, y)
  let d = `M${f(L(y0) + r)} ${f(y0)} L${f(R(y0) - r)} ${f(y0)} Q${f(R(y0))} ${f(y0)} ${f(R(y0 + r))} ${f(y0 + r)} `
  for (const y of ys) d += `L${f(R(y))} ${f(y)} `
  d += `Q${f(R(y1))} ${f(y1)} ${f(R(y1) - r)} ${f(y1)} L${f(L(y1) + r)} ${f(y1)} Q${f(L(y1))} ${f(y1)} ${f(L(y1 - r))} ${f(y1 - r)} `
  for (const y of [...ys].reverse()) d += `L${f(L(y))} ${f(y)} `
  d += `Q${f(L(y0))} ${f(y0)} ${f(L(y0) + r)} ${f(y0)} Z`
  return d
}

// ------------------------------------------------------------ width hook

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

// ------------------------------------------------------------ the diagram

type Active = { type: "node" | "thread"; key: string }
type Tip = { x: number; y: number; label?: "above" | "below" }

// A readout for a label: below it in the top half, above it lower down.
function labelTip(at: { x: number; y: number }, g: Geometry): Tip {
  const above = at.y > g.height / 2
  return { x: at.x, y: above ? at.y - 24 : at.y + 24, label: above ? "above" : "below" }
}

export type SankeyProps = {
  links: FlowLink[]
  regionName: (id: string) => string
  siteName: (id: string) => string
  siteHref: (id: string) => string
  thresholds?: { fastMs: number; slowMs: number }
  className?: string
}

export function Sankey(props: SankeyProps) {
  const { links, regionName, siteName, thresholds, className } = props
  const [boxRef, measured] = useWidth()

  const nameOf = (key: string) => {
    const id = key.slice(2)
    if (key.startsWith("r:")) return regionName(id)
    if (key.startsWith("s:")) return siteName(id)
    return OUTCOME_LABEL[id as Outcome] ?? id
  }

  // Sizes: wide enough to read (scrolls inside its panel on phones), tall
  // enough that every label in the fullest column has room.
  const columnsMax = Math.max(
    new Set(links.map((l) => l.regionId)).size,
    new Set(links.map((l) => l.websiteId)).size,
    new Set(links.map((l) => l.outcome)).size
  )
  const height = Math.max(400, columnsMax * 46 + HEAD + FOOT + 24)
  const width = Math.max(MIN_W, measured)
  const g = geometry(width, height)
  const layout = layoutFlow(links, { top: g.top, bottom: g.bottom, nameOf })

  return (
    <div className={cn("-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1", className)}>
      <div ref={boxRef} className="relative" style={{ minWidth: MIN_W, height }}>
        {measured > 0 && layout.total > 0 && (
          <Diagram {...props} g={g} layout={layout} nameOf={nameOf} thresholds={thresholds} />
        )}
      </div>
    </div>
  )
}

function Diagram({
  g,
  layout,
  nameOf,
  siteHref,
  thresholds,
}: SankeyProps & {
  g: Geometry
  layout: FlowLayout
  nameOf: (key: string) => string
}) {
  const rawId = useId()
  const id = `sk${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`
  const [hover, setHover] = useState<Active | null>(null)
  const [focus, setFocus] = useState<Active | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  // where the readout goes: at the pointer, or beside a label (`label`)
  const [tip, setTip] = useState<Tip | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // A pinned node that vanished (site deleted) no longer applies.
  const pin = pinned && layout.byKey.has(pinned) ? ({ type: "node", key: pinned } as Active) : null
  const live = (a: Active | null) =>
    a && (a.type === "node" ? layout.byKey.has(a.key) : layout.threads.some((t) => t.key === a.key))
      ? a
      : null
  const active = live(hover) ?? live(focus) ?? pin

  const lit = useMemo(() => {
    if (!active) return null
    const list =
      active.type === "node"
        ? threadsThrough(layout, active.key)
        : layout.threads.filter((t) => t.key === active.key)
    return new Set(list.map((t) => t.key))
  }, [active, layout])

  const litNodes = useMemo(() => {
    if (!lit) return null
    const out = new Set<string>()
    for (const t of layout.threads) {
      if (!lit.has(t.key)) continue
      out.add(nodeKey.region(t.regionId))
      out.add(nodeKey.site(t.websiteId))
      out.add(nodeKey.outcome(t.outcome))
    }
    return out
  }, [lit, layout])

  // Paths depend only on the layout and size, not on hover.
  const paths = useMemo(() => {
    const bands = layout.bands.map((b) => ({
      ...b,
      d: ribbon(g, b.stage === 1 ? 0 : 1, b.src, b.dst),
    }))
    const threads = layout.threads.map((t) => ({
      ...t,
      d1: ribbon(g, 0, t.a, t.b),
      d2: ribbon(g, 1, t.c, t.d),
    }))
    const nodes = layout.nodes.map((n) => ({ ...n, d: bar(g, n.col, n.y0, n.y1) }))
    return { bands, threads, nodes }
  }, [layout, g])

  // Labels: centred on their node, nudged apart where nodes are thin.
  const labels = useMemo(() => {
    const out = new Map<string, { x: number; y: number; compact: boolean }>()
    for (const col of [0, 1, 2] as Col[]) {
      const nodes = layout.nodes.filter((n) => n.col === col)
      const roomPer = (g.bottom - g.top) / Math.max(1, nodes.length)
      const compact = roomPer < 44
      const size = compact ? 22 : 44
      const ys = spreadLabels(
        nodes.map((n) => (n.y0 + n.y1) / 2),
        size,
        g.top - 4,
        g.height - 2
      )
      nodes.forEach((n, i) => {
        const y = ys[i]!
        out.set(n.key, { x: right(g, col, (n.y0 + n.y1) / 2) + 8, y, compact })
      })
    }
    return out
  }, [layout, g])

  const total = layout.total
  const fastMs = thresholds?.fastMs ?? 300
  const slowMs = thresholds?.slowMs ?? 1000

  function pointAt(e: React.PointerEvent): Tip | null {
    const box = boxRef.current?.getBoundingClientRect()
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : null
  }

  function onSvgPointer(e: React.PointerEvent<SVGGElement>) {
    const target = e.target as SVGElement
    const thread = target.dataset?.thread
    const node = target.dataset?.node
    const next: Active | null = thread
      ? { type: "thread", key: thread }
      : node
        ? { type: "node", key: node }
        : null
    if (!next) return
    if (next.type !== hover?.type || next.key !== hover?.key) setHover(next)
    setTip(pointAt(e))
  }

  function clearHover(e: React.PointerEvent) {
    if (e.pointerType === "touch") return
    setHover(null)
    setTip(null)
  }

  // ---------------------------------------------------------- tooltip text
  const threadOf = (key: string) => layout.threads.find((t) => t.key === key)
  const tipFor = (a: Active): { title: React.ReactNode; detail?: React.ReactNode } | null => {
    if (a.type === "thread") {
      const t = threadOf(a.key)
      if (!t) return null
      return {
        title: (
          <>
            {nameOf(nodeKey.region(t.regionId))} → {nameOf(nodeKey.site(t.websiteId))} →{" "}
            <span
              aria-hidden="true"
              className="mr-1 inline-block size-2 rounded-[3px] align-middle"
              style={{ background: TONE_VAR[OUTCOME_TONE[t.outcome]] }}
            />
            {OUTCOME_LABEL[t.outcome]}:{" "}
            {checksWord(t.checks)}
          </>
        ),
        detail: `${pct(t.checks / total)} of all checks · ${OUTCOME_LABEL[t.outcome].toLowerCase()} means ${outcomeHint(t.outcome, fastMs, slowMs)}`,
      }
    }
    const node = layout.byKey.get(a.key)
    if (!node) return null
    const through = threadsThrough(layout, node.key)
    const parts =
      node.col === 2
        ? // outcome: which sites it came from, busiest first
          topBy(through, (t) => nameOf(nodeKey.site(t.websiteId)))
        : // region or site: how its checks ended
          OUTCOMES.map((o) => [OUTCOME_LABEL[o], sumOf(through.filter((t) => t.outcome === o))] as const).filter(
            ([, n]) => n > 0
          )
    return {
      title: (
        <>
          {nameOf(node.key)}
          {node.col === 2 && (
            <span className="font-normal text-muted-foreground"> ({outcomeHint(node.id as Outcome, fastMs, slowMs)})</span>
          )}
          : {checksWord(node.checks)} ({pct(node.share)})
        </>
      ),
      detail: (
        <>
          {parts.map(([label, n]) => `${label} ${count(n)}`).join(" · ")}
          {node.col === 1 && <span className="mt-0.5 block text-muted-foreground/80">Click or press Enter to open</span>}
        </>
      ),
    }
  }

  const shownTip = active && (hover ? tip : null)
  const tipContent = active ? tipFor(active) : null
  // Keyboard focus: anchor the readout under the focused label.
  const focusAnchor =
    !hover && focus && focus.type === "node" ? labels.get(focus.key) : undefined
  const tipPos = shownTip ?? (focusAnchor ? labelTip(focusAnchor, g) : null)

  const dim = !!lit

  const stage = (s: 1 | 2): [number, number] =>
    s === 1 ? [g.x[0] + NODE_W, g.x[1]] : [g.x[1] + NODE_W, g.x[2]]

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 [--rib-mid:var(--high)] [--hot:0.8] [--hot-mid:var(--glow)] [--rib:1.25] [--sheen:#e8679b] dark:[--rib-mid:#e9dccb] dark:[--hot:1] dark:[--hot-mid:var(--high)] dark:[--rib:1] dark:[--sheen:#ff8cc4]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && pinned) {
          setPinned(null)
          e.stopPropagation()
        }
      }}
    >
      <svg
        width={g.width}
        height={g.height}
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="img"
        aria-label={summaryText(layout, nameOf)}
        className="absolute inset-0 overflow-visible"
      >
        <defs>
          {([1, 2] as const).map((s) => {
            const [x1, x2] = stage(s)
            return (
              <g key={s}>
                <Grad
                  id={`${id}-base-${s}`}
                  x1={x1}
                  x2={x2}
                  stops={[
                    [0, "var(--glow)", 0.36],
                    [0.2, "var(--rib-mid)", 0.18],
                    [0.55, "var(--rib-mid)", 0.15],
                    [0.73, "var(--sheen)", 0.24],
                    [0.88, "var(--high)", 0.2],
                    [1, "var(--glow)", 0.34],
                  ]}
                />
                <Grad
                  id={`${id}-hot-${s}`}
                  x1={x1}
                  x2={x2}
                  scale="--hot"
                  stops={[
                    [0, "var(--glow)", 0.95],
                    [0.3, "var(--hot-mid)", 0.78],
                    [0.62, "var(--sheen)", 0.72],
                    [0.85, "var(--hot-mid)", 0.8],
                    [1, "var(--glow)", 0.95],
                  ]}
                />
                <Grad
                  id={`${id}-down-${s}`}
                  x1={x1}
                  x2={x2}
                  scale={false}
                  stops={
                    s === 1
                      ? [
                          [0, "var(--critical)", 0.3],
                          [1, "var(--critical)", 0.6],
                        ]
                      : [
                          [0, "var(--critical)", 0.55],
                          [1, "var(--critical)", 0.9],
                        ]
                  }
                />
                <Grad
                  id={`${id}-slow-${s}`}
                  x1={x1}
                  x2={x2}
                  stops={
                    s === 1
                      ? [
                          [0, "var(--high)", 0.18],
                          [1, "var(--high)", 0.34],
                        ]
                      : [
                          [0, "var(--high)", 0.3],
                          [1, "var(--high)", 0.55],
                        ]
                  }
                />
              </g>
            )
          })}
          <linearGradient id={`${id}-node`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "var(--foreground)", stopOpacity: 0.42 }} />
            <stop offset="1" style={{ stopColor: "var(--foreground)", stopOpacity: 0.18 }} />
          </linearGradient>
        </defs>

        {/* faint guides behind everything, like chart paper */}
        <g aria-hidden="true" className="stroke-grid-line">
          {[0.25, 0.5, 0.75].map((p) => {
            const y = g.top + (g.bottom - g.top) * p
            return <line key={p} x1={0} x2={g.width} y1={y} y2={y} strokeDasharray="2 5" />
          })}
        </g>

        {/* base ribbons */}
        <g className="transition-opacity duration-300 motion-reduce:transition-none" opacity={dim ? 0.38 : 1}>
          {paths.bands.map((b) => (
            <path key={b.key} d={b.d} fill={`url(#${id}-base-${b.stage})`} />
          ))}
        </g>

        {/* problem paths glow by default: failed checks red, slow ones orange */}
        <g className="transition-opacity duration-300 motion-reduce:transition-none" opacity={dim ? 0.3 : 1}>
          {paths.threads
            .filter((t) => t.outcome === "slow")
            .map((t) => (
              <path key={`s1${t.key}`} d={t.d1} fill={`url(#${id}-slow-1)`} />
            ))}
          {paths.bands
            .filter((b) => b.outcome === "slow")
            .map((b) => (
              <path key={`s2${b.key}`} d={b.d} fill={`url(#${id}-slow-2)`} className="text-high glow-soft" />
            ))}
          {paths.threads
            .filter((t) => t.outcome === "down")
            .map((t) => (
              <path
                key={`d1${t.key}`}
                d={t.d1}
                fill={`url(#${id}-down-1)`}
                stroke="var(--critical)"
                strokeOpacity={0.55}
                strokeWidth={1}
                className="text-critical glow-soft"
              />
            ))}
          {paths.bands
            .filter((b) => b.outcome === "down")
            .map((b) => (
              <path
                key={`d2${b.key}`}
                d={b.d}
                fill={`url(#${id}-down-2)`}
                stroke="var(--critical)"
                strokeOpacity={0.8}
                strokeWidth={1.25}
                className="text-critical glow"
              />
            ))}
        </g>

        {/* the hovered or focused flow: a soft bloom, then the bright band */}
        {lit && (
          <>
            <g aria-hidden="true" style={{ filter: "blur(9px)" }} opacity={0.6}>
              {paths.threads
                .filter((t) => lit.has(t.key))
                .map((t) => (
                  <g key={t.key}>
                    <path d={t.d1} fill={`url(#${id}-${t.outcome === "down" ? "down" : "hot"}-1)`} />
                    <path d={t.d2} fill={`url(#${id}-${t.outcome === "down" ? "down" : "hot"}-2)`} />
                  </g>
                ))}
            </g>
            <g>
              {paths.threads
                .filter((t) => lit.has(t.key))
                .map((t) => (
                  <g key={t.key}>
                    <path d={t.d1} fill={`url(#${id}-${t.outcome === "down" ? "down" : "hot"}-1)`} />
                    <path d={t.d2} fill={`url(#${id}-${t.outcome === "down" ? "down" : "hot"}-2)`} />
                  </g>
                ))}
            </g>
          </>
        )}

        {/* nodes */}
        <g>
          {paths.nodes.map((n) => {
            const on = litNodes?.has(n.key)
            const tone = n.col === 2 ? OUTCOME_TONE[n.id as Outcome] : null
            return (
              <path
                key={n.key}
                d={n.d}
                className={cn(
                  "transition-opacity duration-300 motion-reduce:transition-none",
                  on ? "glow text-glow" : tone ? cn("glow-soft", TONE_TEXT[tone]) : "stroke-foreground/25"
                )}
                fill={on ? "var(--glow)" : tone ? TONE_VAR[tone] : `url(#${id}-node)`}
                stroke={on ? "var(--foreground)" : undefined}
                strokeOpacity={on ? 0.55 : undefined}
                strokeDasharray={on ? "3 2.5" : undefined}
                strokeWidth={1}
                opacity={dim && !on ? 0.4 : tone && !on ? 0.92 : 1}
              />
            )
          })}
        </g>

        {/* hit areas: every thread in both stages, and the node bars */}
        <g
          onPointerMove={onSvgPointer}
          onPointerDown={onSvgPointer}
          onPointerLeave={clearHover}
          fill="transparent"
          stroke="transparent"
          strokeWidth={4}
        >
          {paths.threads.map((t) => (
            <g key={t.key}>
              <path d={t.d1} data-thread={t.key} />
              <path d={t.d2} data-thread={t.key} />
            </g>
          ))}
          {paths.nodes.map((n) => (
            <path key={n.key} d={n.d} data-node={n.key} strokeWidth={10} />
          ))}
        </g>
      </svg>

      {/* column titles */}
      {(["Region", "Site", "Outcome"] as const).map((title, col) => (
        <p
          key={title}
          aria-hidden="true"
          className="eyebrow absolute top-1"
          style={{ left: g.x[col] + BEND * 0.6 }}
        >
          {title}
        </p>
      ))}

      {/* labels: the keyboard way in (links for sites, toggles otherwise) */}
      {layout.nodes.map((n) => {
        const at = labels.get(n.key)!
        const on = litNodes?.has(n.key)
        const isPinned = pinned === n.key
        const tone = n.col === 2 ? OUTCOME_TONE[n.id as Outcome] : null
        const Icon = n.col === 0 ? MapPinIcon : n.col === 2 ? OUTCOME_ICON[n.id as Outcome] : null
        const maxW = n.col === 2 ? RIGHT : g.x[(n.col + 1) as Col] - g.x[n.col] - 56
        const name = nameOf(n.key)
        const aria =
          `${name}${n.col === 2 ? ` (${outcomeHint(n.id as Outcome, fastMs, slowMs)})` : ""}: ` +
          `${checksWord(n.checks)}, ${pct(n.share)} of all.`
        const handlers = {
          onPointerEnter: () => {
            setHover({ type: "node", key: n.key })
            setTip(labelTip(at, g))
          },
          onPointerLeave: clearHover,
          onFocus: () => setFocus({ type: "node", key: n.key }),
          onBlur: () => setFocus(null),
        }
        const body = (
          <>
            <span className={cn("flex min-w-0 items-center gap-1.5 leading-none", at.compact ? "text-xs" : "text-[13px]")}>
              {Icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-[18px] shrink-0 place-items-center rounded-md border border-panel-border bg-panel-strong/70",
                    tone ? TONE_TEXT[tone] : "text-foreground/80"
                  )}
                >
                  <Icon className="size-3" />
                </span>
              )}
              <span className="truncate font-semibold">{name}</span>
            </span>
            <span
              className={cn(
                "inline-flex w-fit shrink-0 items-baseline gap-1 rounded-md border border-panel-border bg-panel-strong/75 px-1.5 py-px text-[11px] leading-4 backdrop-blur-sm",
                at.compact ? "" : "mt-1"
              )}
            >
              <span className="font-semibold">{count(n.checks)}</span>
              <span className="text-muted-foreground">({pct(n.share)})</span>
            </span>
          </>
        )
        const cls = cn(
          "absolute flex max-w-full -translate-y-1/2 rounded-md text-left text-foreground outline-none transition-opacity duration-300 motion-reduce:transition-none",
          "[text-shadow:0_1px_2px_rgb(255_255_255/0.7)] dark:[text-shadow:0_1px_3px_rgb(0_0_0/0.75)]",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          at.compact ? "flex-row items-center gap-1.5" : "flex-col items-start",
          dim && !on && "opacity-45"
        )
        const style = { left: at.x, top: at.y, maxWidth: maxW }
        return n.col === 1 ? (
          <Link
            key={n.key}
            href={siteHref(n.id)}
            aria-label={`${aria} Open site.`}
            className={cn(cls, "hover:[&_.font-semibold]:underline")}
            style={style}
            {...handlers}
            // Enter is the link's own; keep the dashboard's row shortcut out of it.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.stopPropagation()
            }}
          >
            {body}
          </Link>
        ) : (
          <button
            key={n.key}
            type="button"
            aria-label={`${aria} ${isPinned ? "Stop highlighting" : "Highlight"} its flow.`}
            aria-pressed={isPinned}
            className={cn(cls, "cursor-pointer", isPinned && "ring-1 ring-glow/60")}
            style={style}
            onClick={() => setPinned(isPinned ? null : n.key)}
            {...handlers}
          >
            {body}
          </button>
        )
      })}

      {/* readout */}
      {tipPos && tipContent && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max max-w-[22rem] rounded-xl border border-panel-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
          style={{
            left: tipPos.x,
            top: tipPos.y,
            transform: tipPos.label
              ? // above or below the label, never over it
                `translate(${tipPos.x > g.width - 370 ? `calc(-100% + ${Math.max(0, Math.min(90, g.width - tipPos.x - 4))}px)` : "0"}, ${tipPos.label === "above" ? "-100%" : "0"})`
              : `translate(${tipPos.x > g.width - 370 ? "calc(-100% - 12px)" : "12px"}, ${tipPos.y > g.height - 80 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <p className="font-semibold text-foreground">{tipContent.title}</p>
          {tipContent.detail && <p className="mt-0.5 text-muted-foreground">{tipContent.detail}</p>}
        </div>
      )}

      <FlowTable layout={layout} nameOf={nameOf} />
    </div>
  )
}

// --------------------------------------------------------------- helpers

function sumOf(threads: Thread[]) {
  return threads.reduce((n, t) => n + t.checks, 0)
}

// The three biggest groups, then "others".
function topBy(threads: Thread[], name: (t: Thread) => string) {
  const totals = new Map<string, number>()
  for (const t of threads) totals.set(name(t), (totals.get(name(t)) ?? 0) + t.checks)
  const sorted = [...totals].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 3)
  const rest = sorted.slice(3).reduce((n, [, c]) => n + c, 0)
  return rest > 0 ? [...top, ["others", rest] as [string, number]] : top
}

function summaryText(layout: FlowLayout, nameOf: (key: string) => string) {
  const regions = layout.nodes.filter((n) => n.col === 0)
  const sites = layout.nodes.filter((n) => n.col === 1)
  const outcomes = layout.nodes
    .filter((n) => n.col === 2)
    .map((n) => `${nameOf(n.key).toLowerCase()} ${count(n.checks)} (${pct(n.share)})`)
    .join(", ")
  return (
    `Check flow over the last 24 hours: ${checksWord(layout.total)} from ` +
    `${regions.length} ${regions.length === 1 ? "region" : "regions"} to ` +
    `${sites.length} ${sites.length === 1 ? "site" : "sites"}. Outcomes: ${outcomes}.`
  )
}

function Grad({
  id,
  x1,
  x2,
  stops,
  scale = true,
}: {
  id: string
  x1: number
  x2: number
  stops: [number, string, number][]
  // multiply by a theme strength variable (--rib by default)
  scale?: boolean | `--${string}`
}) {
  const factor = scale === true ? "--rib" : scale
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} x2={x2} y1={0} y2={0}>
      {stops.map(([offset, color, opacity]) => (
        <stop
          key={offset}
          offset={offset}
          style={{
            stopColor: color,
            stopOpacity: factor ? `calc(${opacity} * var(${factor}))` : opacity,
          }}
        />
      ))}
    </linearGradient>
  )
}

// The same data as a table, for screen readers. sr-only goes on the
// wrapper: a table ignores the 1px box and would stretch the page.
function FlowTable({ layout, nameOf }: { layout: FlowLayout; nameOf: (key: string) => string }) {
  const rows = [...layout.threads].sort((a, b) => b.checks - a.checks)
  return (
    <div className="sr-only">
      <table>
        <caption>Checks in the last 24 hours by region, site and outcome</caption>
        <thead>
          <tr>
            <th scope="col">Region</th>
            <th scope="col">Site</th>
            <th scope="col">Outcome</th>
            <th scope="col">Checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={threadKey(t)}>
              <td>{nameOf(nodeKey.region(t.regionId))}</td>
              <td>{nameOf(nodeKey.site(t.websiteId))}</td>
              <td>{OUTCOME_LABEL[t.outcome]}</td>
              <td>{count(t.checks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type { FlowNode }
