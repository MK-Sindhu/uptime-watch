import { cn } from "@/lib/utils"

// A short trace: two glowing beats, then a red flatline running off to the
// monitor's blinking cursor. Decorative, for the not-found and error pages.
const W = 1200
const H = 140
const BASELINE = 84
const BEAT_W = 90
const LEAD_IN = 60
const BEATS = [46, 62]

export function Flatline({ className }: { className?: string }) {
  let pulse = `M0 ${BASELINE}`
  BEATS.forEach((h, i) => {
    const x = LEAD_IN + i * BEAT_W
    const y = BASELINE
    pulse += ` L${x + BEAT_W * 0.3} ${y} L${x + BEAT_W * 0.38} ${y + 6} L${x + BEAT_W * 0.5} ${y - h} L${x + BEAT_W * 0.6} ${y + 14} L${x + BEAT_W * 0.7} ${y} L${x + BEAT_W} ${y}`
  })
  const flatStart = LEAD_IN + BEATS.length * BEAT_W

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("block overflow-visible", className)}
    >
      {/* Same draw-in animation as the landing hero, timed so the beats and
          the flatline read as one sweep. Reduced motion skips it (globals.css). */}
      <path
        d={pulse}
        pathLength={1}
        className="trace-draw glow stroke-stable text-stable"
        style={{ animationDuration: "0.8s", animationTimingFunction: "linear" }}
        strokeWidth={2.25}
        strokeLinejoin="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M${flatStart} ${BASELINE} L${W - 6} ${BASELINE}`}
        pathLength={1}
        className="trace-draw-late glow stroke-critical text-critical"
        style={{ animationDelay: "0.75s", animationDuration: "1.6s" }}
        strokeWidth={3}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={W - 3}
        x2={W - 3}
        y1={BASELINE - 26}
        y2={BASELINE + 26}
        className="cursor-blink glow stroke-critical text-critical"
        strokeWidth={3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
