import { AuthPanel } from "@/components/auth-panel"
import { HeroTrace } from "@/components/pulse-trace"
import { SiteHeader } from "@/components/site-header"

const steps = [
  {
    title: "You add a URL",
    body: "Any page you want to keep an eye on: your site, an API, a status endpoint.",
  },
  {
    title: "A worker checks it",
    body: "Workers in each region request it on a schedule and time the response.",
  },
  {
    title: "Every answer lands on the chart",
    body: "A beat when it answers, taller when it's slow. A red flatline when it doesn't.",
  },
]

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="ecg-paper border-y">
          <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
            <h1 className="font-display max-w-4xl text-5xl leading-[0.92] font-extrabold tracking-tight text-balance sm:text-7xl lg:text-8xl">
              Know the moment a site stops answering.
            </h1>
          </div>
          <HeroTrace className="mt-6 h-36 w-full sm:h-48" />
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_24rem] md:py-16">
          <div>
            <h2 className="font-display text-sm font-bold tracking-[0.2em] text-muted-foreground uppercase">
              How a check happens
            </h2>
            <ol className="mt-6 flex flex-col gap-6">
              {steps.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-x-3">
                  <span className="font-display text-3xl leading-none font-extrabold text-pulse-down tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-lg font-bold">{step.title}</p>
                    <p className="mt-1 max-w-md text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="order-first md:order-none">
            <AuthPanel />
          </div>
        </section>
      </main>
    </div>
  )
}
