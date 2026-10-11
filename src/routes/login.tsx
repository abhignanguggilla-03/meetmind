
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;

    async function checkSession() {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (active && session) {
        await navigate({ to: "/", replace: true });
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [navigate]);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          setMessage("Account created successfully. You can now sign in.");
        } else {
          setMessage(
            "Registration submitted. Check your email to confirm your account if confirmation is enabled, then sign in."
          );
        }

        setMode("login");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        await navigate({ to: "/" });
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-sm">
        <a
          href="/"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to MeetMind AI
        </a>

        <div className="mt-6">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl">MeetMind</span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              AI
            </span>
          </div>

          <h1 className="mt-6 text-3xl font-semibold">
            {mode === "login" ? "Welcome back" : "Create employee account"}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to access your MeetMind workspace."
              : "Register with your email to get started."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                maxLength={100}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              minLength={6}
              required
            />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                Use at least 6 characters.
              </p>
            )}
          </div>

          <Button className="w-full" type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create employee account"}
          </Button>
        </form>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className={`mt-4 break-words text-sm ${
              isError ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {message}
          </p>
        )}

        <div className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login"
            ? "New employee? "
            : "Already have an account? "}

          <button
            type="button"
            className="font-medium text-primary underline underline-offset-4"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
              setIsError(false);
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}
