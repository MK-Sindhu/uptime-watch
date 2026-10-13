import type { Metadata } from "next"
import {
  Atkinson_Hyperlegible_Next,
  IBM_Plex_Mono,
  Sofia_Sans_Extra_Condensed,
} from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const display = Sofia_Sans_Extra_Condensed({
  subsets: ["latin"],
  variable: "--font-condensed",
})

const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-atkinson",
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
        display.variable,
        body.variable,
        mono.variable,
        "font-sans"
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
