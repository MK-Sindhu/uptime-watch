import { ActivityIcon, ArrowRightIcon, CircleAlertIcon, GaugeIcon, RouteIcon } from "lucide-react"
import Link from "next/link"

import { AuthPanel } from "@/components/auth-panel"
import { Sparkline } from "@/components/glass/charts"
import { Legend, MetricTable, ToneDot } from "@/components/glass/indicators"
import { Eyebrow, Panel, PanelHeader } from "@/components/glass/panel"
import { TONE_VAR } from "@/components/glass/tone"
import { HeroTrace } from "@/components/pulse-trace"
import { SiteHeader } from "@/components/site-header"
import { cn } from "@/lib/utils"
import { formatInterval } from "@/lib/checks"

// Fades a label in once the hero trace has drawn itself (globals.css times
// the trace at ~2.4 s). Without motion the label is simply there.
const AFTER_TRACE =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 duration-500 [--tw-animation-delay:2.5s] [--tw-animation-fill-mode:backwards]"

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 px-3 pt-4 pb-16 sm:px-5 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_420px]">
        <Hero />

        {/* One column on the right on large screens; on a phone it follows
            the hero so the sign-in form is near the top. */}
        <aside
          aria-label="Account"
          className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <AuthPanel />
          <DashboardPreview />
        </aside>

        <HowItWorks />
      </main>
    </div>
  )
}

// ------------------------------------------------------------------- hero

function Hero() {
  return (
    <Panel className="relative overflow-hidden p-5 sm:p-8 lg:col-start-1 lg:row-start-1">
      <div className="flex items-center gap-2">
        <ToneDot tone="stable" className="glow-pulse" />
        <Eyebrow>Website uptime monitor</Eyebrow>
      </div>
      <h1 className="mt-4 max-w-3xl text-4xl leading-[1.04] font-semibold tracking-tight text-balance sm:text-5xl xl:text-6xl">
        Know the moment a site stops answering.
      </h1>
      <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
        Uptime Watch asks each of your sites for a response every 30 seconds, from more than
        one region, and times every answer. The first one that doesn&apos;t come back shows up
        in red.
      </p>

      <TraceMonitor className="mt-6 sm:mt-8" />

      <Link
        href="/status/demo"
        className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl border border-panel-border bg-foreground/[0.04] px-4 text-sm font-semibold outline-none transition-colors hover:bg-foreground/[0.08] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        See an example status page
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </Link>
    </Panel>
  )
}

// The product's own picture: a heartbeat for every answer, then a flatline.
// Sample data, labelled as such.
function TraceMonitor({ className }: { className?: string }) {
  return (
    <figure className={cn("inset-surface relative overflow-hidden p-3 sm:p-4", className)}>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <ActivityIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[13px] font-medium">shop.example.com</span>
          <PreviewTag />
        </span>
        <Legend
          items={[
            { label: "Answered", tone: "stable" },
            { label: "No answer", tone: "critical" },
          ]}
        />
      </figcaption>

      <div
        role="img"
        aria-label="Sample trace: eleven checks answered, then the site stopped answering and the line went flat."
        className="relative mt-3 h-44 sm:h-56"
      >
        {/* Warm light behind the beats, red bloom behind the flatline. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: `radial-gradient(40% 60% at 30% 55%, color-mix(in oklab, ${TONE_VAR.glow} 9%, transparent), transparent 70%), radial-gradient(30% 55% at 86% 62%, color-mix(in oklab, ${TONE_VAR.critical} 14%, transparent), transparent 70%)`,
          }}
        />
        {/* Dashed guides across, dotted guides down, like the chart cards. */}
        {[0.2, 0.4, 0.6, 0.8].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-grid-line"
            style={{ top: `${t * 100}%` }}
          />
        ))}
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute inset-y-0 border-l border-dotted border-grid-line"
            style={{ left: `${(i / 6) * 100}%` }}
          />
        ))}

        <HeroTrace className="absolute inset-0 size-full" />

        {/* Where it stopped: HeroTrace's flatline starts at 66% across. */}
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-[66%] border-l border-dashed border-critical/50", AFTER_TRACE)}
        />
        <span
          aria-hidden="true"
          className="cursor-blink glow absolute top-[60%] right-0 h-12 w-[3px] -translate-y-1/2 rounded-full bg-critical text-critical"
        />

        <span
          aria-hidden="true"
          className={cn(
            "absolute top-[4%] left-[23%] hidden items-center gap-1.5 rounded-lg border border-panel-border bg-panel-strong px-2 py-1 text-xs font-medium shadow-sm sm:inline-flex",
            AFTER_TRACE
          )}
        >
          <ToneDot tone="stable" />
          Answered in 184 ms
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-[6%] right-2 inline-flex items-center gap-1.5 rounded-lg border border-critical/30 bg-panel-strong px-2 py-1 text-xs font-semibold text-critical shadow-sm sm:top-[18%] sm:right-4",
            AFTER_TRACE
          )}
        >
          <CircleAlertIcon aria-hidden="true" className="size-3.5 glow-soft" />
          No answer · 10:42:10 UTC
        </span>
      </div>

      <div aria-hidden="true" className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>−2 min</span>
        <span>−1 min</span>
        <span>now</span>
      </div>
    </figure>
  )
}

function PreviewTag() {
  return (
    <span className="shrink-0 rounded-md border border-panel-border bg-foreground/[0.05] px-1.5 py-px text-[10px] font-semibold tracking-[0.12em] text-label uppercase">
      Preview
    </span>
  )
}

// ---------------------------------------------------------------- preview

// A small copy of the dashboard's health sidebar with made-up numbers.
const PREVIEW_UPTIME = [99.9, 99.95, 100, 99.8, 99.9, 100, 100, 99.7, 99.85, 100, 98.1, 97.4]

function DashboardPreview() {
  return (
    <Panel aria-labelledby="preview-heading">
      <PanelHeader
        icon={GaugeIcon}
        title={<span id="preview-heading">What you&apos;ll watch</span>}
        subtitle="Your dashboard's health panel, with sample data."
        action={<PreviewTag />}
      />

      {/* Same shape as the HealthScore card on the dashboard. */}
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-panel-border bg-panel-strong py-3 pr-4 pl-5">
        <span
          aria-hidden="true"
          className="glow absolute inset-y-2 left-0 w-[3px] rounded-r-full"
          style={{ background: TONE_VAR.warning, color: TONE_VAR.warning }}
        />
        <ActivityIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">Fleet uptime</span>
        <Sparkline values={PREVIEW_UPTIME} tone="warning" className="h-8 w-14 shrink-0 sm:w-24" />
        <span className="text-2xl font-semibold tracking-tight sm:text-3xl">99.1%</span>
      </div>

      <p className="mt-3 flex items-center gap-2.5 rounded-xl border border-critical/15 bg-critical/[0.07] px-3.5 py-2.5 text-sm font-medium text-critical">
        <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0 glow-soft" />
        <span className="min-w-0 sm:truncate">shop.example.com stopped answering · 2 min</span>
      </p>

      <MetricTable
        className="mt-2"
        rows={[
          { label: "api.example.com", value: "182 ms", tone: "stable", status: "Up" },
          { label: "shop.example.com", value: "—", tone: "critical", status: "Down", highlight: true },
          { label: "docs.example.com", value: "640 ms", tone: "warning", status: "Slow" },
          { label: "blog.example.com", value: "211 ms", tone: "stable", status: "Up" },
        ]}
      />
    </Panel>
  )
}

// ------------------------------------------------------------ how it works

const STEPS = [
  {
    title: "You add a URL",
    body: "Any page you want to keep an eye on: your site, an API, a status endpoint.",
    visual: (
      <span className="truncate rounded-lg border border-panel-border bg-foreground/[0.04] px-2 py-1 font-mono text-xs">
        https://shop.example.com
      </span>
    ),
  },
  {
    title: "A worker checks it",
    body: "Workers in each region request it on a schedule and time the response.",
    visual: (
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        {["USA", "India"].map((r) => (
          <span key={r} className="rounded-lg border border-panel-border bg-foreground/[0.04] px-2 py-1 font-medium">
            {r}
          </span>
        ))}
        <span className="text-muted-foreground">every {formatInterval()}</span>
      </span>
    ),
  },
  {
    title: "Every answer lands on the chart",
    body: "A beat when it answers, taller when it's slow. A red flatline when it doesn't.",
    visual: <MiniTrace />,
  },
]

function HowItWorks() {
  return (
    <Panel aria-labelledby="how-heading" className="lg:col-start-1 lg:row-start-2 lg:self-start">
      <PanelHeader icon={RouteIcon} title={<span id="how-heading">How a check happens</span>} />
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 rounded-2xl border border-panel-border bg-panel-strong/60 p-4"
          >
            <span className="flex h-7 items-center">{step.visual}</span>
            <div>
              <p className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
                <span className="text-xs font-semibold text-label tabular-nums">0{i + 1}</span>
                {step.title}
              </p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

// Two beats and a flatline, small enough for a step card.
function MiniTrace() {
  return (
    <svg viewBox="0 0 132 28" aria-hidden="true" className="h-7 w-[132px] overflow-visible">
      <path
        d="M0 18 H12 L15 20 L19 6 L23 23 L26 18 H40 L43 20 L48 2 L52 24 L55 18 H66"
        className="glow stroke-stable text-stable"
        strokeWidth={1.75}
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M66 18 H128" className="glow stroke-critical text-critical" strokeWidth={2.5} fill="none" />
      <path d="M130 10 V26" className="cursor-blink stroke-critical" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}
