export function toMillis(iso: string) {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

export function timeAgo(iso: string | undefined, now: number) {
  if (!iso) return null
  const then = toMillis(iso)
  if (then === null) return null
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 10) return "just now"
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

export function clockTime(iso: string) {
  const ms = toMillis(iso)
  if (ms === null) return iso
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
