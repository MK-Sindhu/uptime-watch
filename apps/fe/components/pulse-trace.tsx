import type { Tick } from "@/lib/api"
import { clockTime } from "@/lib/time"
import { cn } from "@/lib/utils"

// One check = one slot on the strip. A check that answered draws a heartbeat
// whose height follows its response time; a check that failed draws a flatline.

const W = 300
const H = 56
const BASELINE = 36
const MIN_BEAT = 6
const MAX_BEAT = BASELINE - 4
const SLOW_MS = 1500 // beats reach full height at this response time

// Square-root scale: 100 ms and 1 s look clearly different, and very slow
// answers still fit on the strip.
function beatHeight(ms: number) {
  const f = Math.sqrt(Math.min(ms, SLOW_MS) / SLOW_MS)
  return MIN_BEAT + f * (MAX_BEAT - MIN_BEAT)
}

function beat(x: number, w: number, h: number) {
  const y = BASELINE
  return [
    `M${x} ${y}`,
    `L${x + w * 0.25} ${y}`,
    `L${x + w * 0.35} ${y + 3}`,
    `L${x + w * 0.5} ${y - h}`,
    `L${x + w * 0.62} ${y + 6}`,
    `L${x + w * 0.72} ${y}`,
    `L${x + w} ${y}`,
  ].join(" ")
}

function flat(x: number, w: number) {
  return `M${x} ${BASELINE} L${x + w} ${BASELINE}`
}

export function PulseTrace({
  ticks,
  slots = 30,
  label,
  className,
}: {
  ticks: Tick[] // newest first, as the API returns them
  slots?: number
  label: string
  className?: string
}) {
  const shown = ticks.slice(0, slots).reverse() // oldest → newest, left → right
  const w = W / slots
  const start = slots - shown.length

  let up = ""
  let down = ""
  let unknown = ""
  shown.forEach((tick, i) => {
    const x = (start + i) * w
    if (tick.status === "Up") up += beat(x, w, beatHeight(tick.response_time_ms))
    else if (tick.status === "Down") down += flat(x, w)
    else unknown += flat(x, w)
  })

  const newest = shown[shown.length - 1]

  return (
    <div
      className={cn(
        "ecg-paper-fine relative h-14 overflow-hidden rounded-md border",
        className
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full"
      >
        {start > 0 && (
          <path
            d={`M0 ${BASELINE} L${start * w} ${BASELINE}`}
            className="stroke-pulse-wait/40"
            strokeWidth={1}
            strokeDasharray="2 4"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={up}
          className="glow stroke-stable text-stable"
          strokeWidth={1.5}
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={unknown}
          className="stroke-pulse-wait"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={down}
          className="glow stroke-critical text-critical"
          strokeWidth={2.5}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {newest && (
          <line
            x1={W - 0.5}
            x2={W - 0.5}
            y1={8}
            y2={H - 8}
            className={cn(
              "cursor-blink glow",
              newest.status === "Down"
                ? "stroke-critical text-critical"
                : newest.status === "Up"
                  ? "stroke-stable text-stable"
                  : "stroke-pulse-wait text-pulse-wait"
            )}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {shown.map((tick, i) => (
          <rect
            key={tick.id}
            x={(start + i) * w}
            y={0}
            width={w}
            height={H}
            fill="transparent"
          >
            <title>
              {tick.status === "Up"
                ? `Answered in ${tick.response_time_ms} ms`
                : tick.status === "Down"
                  ? `No answer (gave up after ${tick.response_time_ms} ms)`
                  : "Status unknown"}
              {` · ${clockTime(tick.createdAt)}`}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  )
}

// Decorative trace for the sign-in page: a steady pulse that flatlines.
export function HeroTrace({ className }: { className?: string }) {
  const HW = 1200
  const HH = 200
  const y = 120
  const heights = [52, 70, 48, 96, 58, 64, 44, 88, 60, 74, 50]
  const bw = 72
  let pulse = `M0 ${y}`
  heights.forEach((h, i) => {
    const x = i * bw
    pulse += ` L${x + bw * 0.3} ${y} L${x + bw * 0.38} ${y + 8} L${x + bw * 0.5} ${y - h} L${x + bw * 0.6} ${y + 18} L${x + bw * 0.7} ${y} L${x + bw} ${y}`
  })
  const flatStart = heights.length * bw

  return (
    <svg
      viewBox={`0 0 ${HW} ${HH}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={pulse}
        pathLength={1}
        className="trace-draw glow stroke-stable text-stable"
        strokeWidth={2.5}
        strokeLinejoin="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M${flatStart} ${y} L${HW} ${y}`}
        pathLength={1}
        className="trace-draw-late glow stroke-critical text-critical"
        strokeWidth={3.5}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
