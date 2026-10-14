// Incidents as CSV, built and downloaded in the browser.
import type { Incident } from "@/lib/api"

const COLUMNS = ["started_at", "ended_at", "duration_seconds", "failed_checks", "regions"]

function cell(value: string | number) {
  let s = String(value)
  // A leading = + - @ makes spreadsheets run the cell as a formula.
  if (typeof value === "string" && /^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function incidentsCsv(incidents: Incident[]) {
  const rows = incidents.map((i) => [
    i.startedAt,
    i.endedAt ?? "",
    Math.round(i.durationMs / 1000),
    i.checks,
    i.regions.join(";"),
  ])
  return [COLUMNS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before freeing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// "api.example.com" -> "api-example-com", safe in a file name.
export function fileSlug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site"
}
