// Status tones shared by every glass component. Each tone is a CSS colour
// token (see app/globals.css); classes are spelled out in full so Tailwind
// can see them.
import type { SiteStatus } from "@/lib/site"

export type Tone = "stable" | "warning" | "high" | "critical" | "info" | "glow"

export const TONE_TEXT: Record<Tone, string> = {
  stable: "text-stable",
  warning: "text-warning",
  high: "text-high",
  critical: "text-critical",
  info: "text-info",
  glow: "text-glow",
}

export const TONE_BG: Record<Tone, string> = {
  stable: "bg-stable",
  warning: "bg-warning",
  high: "bg-high",
  critical: "bg-critical",
  info: "bg-info",
  glow: "bg-glow",
}

export const TONE_BORDER: Record<Tone, string> = {
  stable: "border-stable",
  warning: "border-warning",
  high: "border-high",
  critical: "border-critical",
  info: "border-info",
  glow: "border-glow",
}

// The CSS variable behind a tone, for inline gradients and SVG.
export const TONE_VAR: Record<Tone, string> = {
  stable: "var(--stable)",
  warning: "var(--warning)",
  high: "var(--high)",
  critical: "var(--critical)",
  info: "var(--info)",
  glow: "var(--glow)",
}

export const TONE_WORD: Record<Tone, string> = {
  stable: "Stable",
  warning: "Warning",
  high: "High",
  critical: "Critical",
  info: "Info",
  glow: "Active",
}

export function toneOfStatus(status: SiteStatus): Tone {
  switch (status) {
    case "Up":
      return "stable"
    case "Down":
      return "critical"
    default:
      return "info"
  }
}

// Uptime % -> tone: 100 stable, 99+ warning, below that critical.
export function toneOfUptime(pct: number | null | undefined): Tone {
  if (pct === null || pct === undefined) return "info"
  if (pct >= 99.9) return "stable"
  if (pct >= 99) return "warning"
  return "critical"
}

// Response time -> tone, using the same bands as the check-flow diagram.
export function toneOfLatency(ms: number | null | undefined, fastMs = 300, slowMs = 1000): Tone {
  if (ms === null || ms === undefined) return "info"
  if (ms < fastMs) return "stable"
  if (ms < slowMs) return "warning"
  return "high"
}
