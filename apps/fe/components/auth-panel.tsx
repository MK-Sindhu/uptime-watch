"use client"

import { CircleAlertIcon, KeyRoundIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Field } from "@/components/field"
import { Panel, PanelHeader } from "@/components/glass/panel"
import { Segmented } from "@/components/glass/segmented"
import { Button } from "@/components/ui/button"
import { ApiError, getSession, signIn, signUp } from "@/lib/api"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup"

const MODES: { value: Mode; label: string }[] = [
  { value: "signin", label: "Sign in" },
  { value: "signup", label: "Create account" },
]

function errorMessage(e: unknown, mode: Mode) {
  if (e instanceof ApiError) {
    if (e.status === 429) return e.message
    if (e.status === 0 || e.status >= 500) {
      return "Can't reach the server. Check that the API is running on port 3000."
    }
    if (e.status === 403) {
      // Sign-up rules (username or password too short...) come with the
      // API's own sentence; a taken username comes without one.
      if (e.fromServer) return e.message
      return mode === "signin"
        ? "That username and password don't match. Check both and try again."
        : "That username is taken. Pick another one."
    }
  }
  return "Something went wrong. Try again."
}

export function AuthPanel({ className }: { className?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("signin")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in: go straight to the dashboard.
  useEffect(() => {
    if (getSession()) router.replace("/dashboard")
  }, [router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (mode === "signin") await signIn(username, password)
      else await signUp(username, password)
      router.push("/dashboard")
    } catch (err) {
      setError(errorMessage(err, mode))
      setPending(false)
    }
  }

  const action = mode === "signin" ? "Sign in" : "Create account"

  return (
    <Panel aria-labelledby="account-heading" className={cn("p-5 sm:p-6", className)}>
      <PanelHeader
        icon={KeyRoundIcon}
        title={<span id="account-heading">Your account</span>}
        subtitle={
          mode === "signin"
            ? "Sign in to see your sites and their checks."
            : "Pick a username and password. You can add sites right after."
        }
        className="mb-4"
      />

      <Segmented
        label="Account"
        value={mode}
        onValueChange={(m) => {
          setMode(m)
          setError(null)
        }}
        options={MODES}
        className="mb-5"
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          id="username"
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          // Same rules as the API's SignupInput; sign-in takes any account.
          {...(mode === "signup" ? { minLength: 3, maxLength: 64 } : {})}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          {...(mode === "signup" ? { minLength: 8, maxLength: 128, hint: "At least 8 characters." } : {})}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-critical/25 bg-critical/[0.08] px-3.5 py-2.5 text-sm font-medium text-critical"
          >
            <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 glow-soft" />
            <span>{error}</span>
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="mt-1 h-11 rounded-xl text-base font-semibold shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--foreground)_45%,transparent)]"
          disabled={pending}
        >
          {pending ? (mode === "signin" ? "Signing in…" : "Creating account…") : action}
        </Button>
      </form>
    </Panel>
  )
}
