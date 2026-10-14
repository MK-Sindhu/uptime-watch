import type { Metadata } from "next"
import { IBM_Plex_Mono, Manrope } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// One geometric sans for text and numbers (tabular figures on), mono for
// URLs and timings.
const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
})

export const metadata: Metadata = {
  title: "Uptime Watch",
  description: "Watch your websites and see the moment one stops answering.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        sans.variable,
        mono.variable,
        "font-sans"
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
