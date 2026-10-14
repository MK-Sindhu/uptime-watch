"use client"

import { GlobeIcon, LogOutIcon, MenuIcon, SunMoonIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Desktop: username, Status page, theme, Sign out in a row.
// Phone: the same actions in one menu next to the wordmark.
export function DashboardHeader({
  username,
  onStatusPage,
  onSignOut,
}: {
  username: string
  onStatusPage: () => void
  onSignOut: () => void
}) {
  return (
    <SiteHeader
      menu={
        <MobileMenu
          username={username}
          onStatusPage={onStatusPage}
          onSignOut={onSignOut}
        />
      }
    >
      {username && (
        <span className="mr-2 text-sm font-medium text-muted-foreground">
          {username}
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={onStatusPage}>
        Status page
      </Button>
      <Button variant="ghost" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    </SiteHeader>
  )
}

function MobileMenu({
  username,
  onStatusPage,
  onSignOut,
}: {
  username: string
  onStatusPage: () => void
  onSignOut: () => void
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Menu" />}
      >
        <MenuIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {username && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Signed in as <span className="font-semibold text-foreground">{username}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={onStatusPage}>
          <GlobeIcon />
          Status page
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(dark ? "light" : "dark")}>
          <SunMoonIcon />
          {dark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
