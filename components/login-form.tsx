"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The sign-in form the institute sees. `signIn` redirects on success, so the
 * only state this holds is the error from a failed attempt.
 */
export function LoginForm({ demoPassword }: { demoPassword: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn(email, password);
      // Only a failure returns — success leaves through `redirect()`.
      if (!result.ok) {
        setError(result.error);
        setPassword("");
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Use your IIT Palakkad email address to book a guest house room or review
            requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Institute email address</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="name@iitpkd.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || email.trim() === "" || password === ""}
            >
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/*
        Everything below the rule is for development and demos, and goes when
        real authentication lands — see .memories/08-roadmap.md item 1.
      */}
      <div className="mt-8 border-t pt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Demo build — every seeded account signs in with the password{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">{demoPassword}</code>
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/mock-login">Continue with mock authentication</Link>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Pick a persona instead of typing credentials.
        </p>
      </div>
    </div>
  );
}
