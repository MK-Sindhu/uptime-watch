"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Field } from "@/components/field"
import { Button } from "@/components/ui/button"
import { ApiError, getSession, signIn, signUp } from "@/lib/api"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup"

function errorMessage(e: unknown, mode: Mode) {
  if (e instanceof ApiError) {
    if (e.status === 0 || e.status >= 500) {
      return "Can't reach the server. Check that the API is running on port 3000."
    }
    if (e.status === 403) {
      return mode === "signin"
        ? "That username and password don't match. Check both and try again."
        : "That username is taken. Pick another one."
    }
  }
  return "Something went wrong. Try again."
}

export function AuthPanel() {
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
    <div className="rounded-xl border bg-card p-6 shadow-[0_1px_0_var(--grid-major),0_12px_32px_-16px_color-mix(in_oklch,var(--ink),transparent_75%)]">
      <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m)
              setError(null)
            }}
            className={cn(
              "h-8 rounded-md text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              mode === m
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
        <Field
          id="username"
          label="Username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="rounded-md border border-pulse-down/30 bg-pulse-down/8 px-3 py-2 text-sm text-pulse-down">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-1 h-10 text-base" disabled={pending}>
          {pending ? (mode === "signin" ? "Signing in…" : "Creating account…") : action}
        </Button>
      </form>
    </div>
  )
}
