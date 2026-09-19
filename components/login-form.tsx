"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { INSTITUTE_EMAIL_ERROR, isInstituteEmail, LOGIN_DOMAIN } from "@/lib/site";

const LABEL = "mb-[7px] block text-[13px] font-bold tracking-[0.03em] text-body";
const INPUT =
  "block w-full rounded-[2px] border border-border-strong bg-white px-3.5 py-[13px] text-[15.5px] text-navy placeholder:text-[#8390a5] focus-visible:border-navy focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold aria-invalid:border-destructive";

/**
 * The sign-in card the institute sees, on `/sign-in`, `/book-room` and
 * `/book-meal`. `signIn` redirects on success, so the only state this holds is
 * the error from a failed attempt.
 *
 * The institute-domain check here is a courtesy that saves a round trip;
 * `signIn()` repeats it on the server, which is the rule. "Keep me signed in"
 * and "Forgot password" from the design are deliberately absent: the mock
 * session has neither, and a control that does nothing is worse than none.
 */
export function LoginForm({
  demoPassword,
  next,
  submitLabel = "Sign in",
  footnote,
}: {
  demoPassword: string;
  /** Where to land after signing in, when the page wants somewhere specific. */
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isInstituteEmail(email)) {
      setError(INSTITUTE_EMAIL_ERROR);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await signIn(email, password, next);
      // Only a failure returns — success leaves through `redirect()`.
      if (!result.ok) {
        setError(result.error);
        setPassword("");
      }
    });
  };

  return (
    <div className="min-w-0">
      <div className="rounded-[2px] border border-t-[3px] border-border border-t-navy bg-white px-[clamp(18px,5vw,30px)] pt-8 pb-[34px]">
        <h2 className="mb-[22px] text-[25px] font-semibold text-navy">Sign in</h2>
        <form onSubmit={submit} noValidate>
          <label htmlFor="login-email" className={LABEL}>
            Institute email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder={`name@${LOGIN_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={`${INPUT} mb-[18px]`}
          />

          <label htmlFor="login-password" className={LABEL}>
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={`${INPUT} mb-[22px]`}
          />

          {error && (
            <p id="login-error" role="alert" className="-mt-2 mb-4 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || email.trim() === "" || password === ""}
            className="w-full cursor-pointer rounded-[3px] bg-navy p-3.5 text-[15.5px] font-bold text-white transition-colors duration-150 hover:bg-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Signing in…" : submitLabel}
          </button>
        </form>
        {footnote && (
          <p className="mt-4 text-sm leading-normal text-muted-foreground">{footnote}</p>
        )}
      </div>

      {/*
        Everything below is for development and demos, and goes when real
        authentication lands — see .memories/08-roadmap.md item 1.
      */}
      <div className="mt-5 border border-dashed border-border-strong bg-band px-4 py-3 text-center text-[13px] text-muted-foreground">
        Demo build — every seeded account signs in with the password{" "}
        <code className="rounded-[2px] bg-white px-1 py-0.5 font-mono text-navy">{demoPassword}</code>
        .{" "}
        <Link href="/mock-login" className="font-semibold text-navy underline underline-offset-2">
          Pick a persona instead
        </Link>
      </div>
    </div>
  );
}
