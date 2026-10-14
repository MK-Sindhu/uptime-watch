"use client"

import { GaugeIcon, GlobeIcon, HistoryIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/glass/segmented"
import { RecentEvents } from "@/components/site/incident-list"
import { RegionLatency } from "@/components/site/region-latency"
import { RegionLeads } from "@/components/site/region-leads"
import type { Incident, RangeKey, RegionOverview, Tick } from "@/lib/api"
import { RANGE_LABEL } from "@/lib/ranges"

type TabKey = "latency" | "regions" | "events"

const TABS: { value: TabKey; label: string; title: string; icon: LucideIcon }[] = [
  { value: "latency", label: "Latency", title: "Latency by region", icon: GaugeIcon },
  { value: "regions", label: "Regions", title: "Regions", icon: GlobeIcon },
  { value: "events", label: "Events", title: "Latest incidents", icon: HistoryIcon },
]

// The sidebar's lower half: segmented tabs over one chart card.
export function SiteTabs({
  regions,
  ticks,
  paused,
  selected,
  range,
  nameOf,
  incidents,
  incidentsHref,
}: {
  regions: RegionOverview[] | undefined
  ticks: Tick[]
  paused: boolean
  selected: string
  range: RangeKey
  nameOf: (regionId: string) => string
  incidents: Incident[] | undefined
  incidentsHref: string
}) {
  const [tab, setTab] = useState<TabKey>("latency")
  const current = TABS.find((t) => t.value === tab)!
  const Icon = current.icon

  return (
    <div className="grid grid-cols-1 gap-3">
      <Segmented
        label="Site details"
        value={tab}
        onValueChange={setTab}
        options={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />
      <div
        role="tabpanel"
        aria-label={current.title}
        className="rounded-2xl border border-panel-border bg-panel-strong p-3 sm:p-4"
      >
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {current.title}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{RANGE_LABEL[range]}</span>
        </h2>
        {tab === "latency" && <RegionLatency regions={regions} range={range} nameOf={nameOf} />}
        {tab === "regions" && (
          <RegionLeads
            regions={regions}
            ticks={ticks}
            paused={paused}
            selected={selected}
            range={range}
            nameOf={nameOf}
          />
        )}
        {tab === "events" && <RecentEvents incidents={incidents} range={range} allHref={incidentsHref} />}
      </div>
    </div>
  )
}
