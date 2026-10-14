// Times on the public status page. Everyone sees the same page, so times are
// in UTC and say so. A fixed locale keeps the server render predictable:
// "14:12 UTC", "12 Oct 03:10 UTC".

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

// Intl throws on an invalid date; show the raw value instead of failing the page.
function parse(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function utcTime(iso: string) {
  const date = parse(iso)
  return date ? `${TIME.format(date)} UTC` : iso
}

export function utcDateTime(iso: string) {
  const date = parse(iso)
  return date ? `${DAY.format(date)} ${TIME.format(date)} UTC` : iso
}

// Time only when it falls on the same UTC day as `ref` (the page's own
// timestamp), so a check from yesterday doesn't read as today.
export function utcStamp(iso: string, ref: string) {
  const date = parse(iso)
  const refDate = parse(ref)
  if (!date || !refDate) return utcDateTime(iso)
  const sameDay = date.toISOString().slice(0, 10) === refDate.toISOString().slice(0, 10)
  return sameDay ? utcTime(iso) : utcDateTime(iso)
}
