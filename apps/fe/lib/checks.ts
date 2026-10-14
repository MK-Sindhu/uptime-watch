// How often each site is checked. Matches CHECK_INTERVAL_SECONDS in the
// pusher and API (default 30); API responses also carry the live value as
// `checkIntervalSeconds`.
export const CHECK_INTERVAL_SECONDS = 30

// "30 s", "3 min"
export function formatInterval(seconds = CHECK_INTERVAL_SECONDS) {
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
}

// A last check older than this means checks have stopped arriving.
export function staleAfterMs(seconds = CHECK_INTERVAL_SECONDS) {
  return Math.max(60_000, seconds * 2.5 * 1000)
}
