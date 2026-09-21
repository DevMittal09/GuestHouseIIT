"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { signInWithLdap } from "@/app/actions/auth";

const LABEL = "mb-2 block text-[13px] font-semibold text-foreground/90";
const FIELD = "relative";
const ICON = "pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground";
const INPUT =
  "block h-12 w-full rounded-xl border border-input bg-white pr-4 pl-11 text-[15.5px] text-foreground shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 hover:border-border-strong focus-visible:border-vermilion focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/15";

/** The Google "G", as Google's sign-in button guidelines draw it. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * The sign-in form the institute sees, on `/sign-in`, `/book-room` and
 * `/book-meal`: an LDAP username and password, or Google. `signInWithLdap`
 * redirects on success, so the only state this holds is the error from a
 * failed attempt (and whether the password is shown).
 *
 * "Sign in with Google" is a placeholder: it opens the mock account picker at
 * `/mock-login` until Google OAuth is connected, carrying `next` along so both
 * doors land in the same place. "Keep me signed in" and "Forgot password" are
 * deliberately absent — passwords belong to the directory, and a control that
 * does nothing is worse than none.
 */
export function LoginForm({
  sampleAccount,
  next,
  submitLabel = "Sign in",
  footnote,
}: {
  /** A dummy LDAP login to show, while sign-in checks the dummy directory. */
  sampleAccount: { uid: string; password: string } | null;
  /** Where to land after signing in, when the page wants somewhere specific. */
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const googleHref = next ? `/mock-login?next=${encodeURIComponent(next)}` : "/mock-login";

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signInWithLdap(username, password, next);
      // Only a failure returns — success leaves through `redirect()`.
      if (!result.ok) {
        setError(result.error);
        setPassword("");
      }
    });
  };

  return (
    <div className="min-w-0">
      <h2 className="text-[30px] leading-tight font-semibold text-foreground">Sign in</h2>
      <p className="mt-1.5 mb-7 text-[15px] text-muted-foreground">
        Sign in with your institute LDAP account.
      </p>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <label htmlFor="login-username" className={LABEL}>
            LDAP username
          </label>
          <div className={FIELD}>
            <UserRound aria-hidden className={ICON} />
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. 142301026"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className={INPUT}
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className={LABEL}>
            LDAP password
          </label>
          <div className={FIELD}>
            <LockKeyhole aria-hidden className={ICON} />
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className={`${INPUT} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-band hover:text-foreground"
            >
              {showPassword ? <EyeOff aria-hidden className="size-[18px]" /> : <Eye aria-hidden className="size-[18px]" />}
              <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
            </button>
          </div>
        </div>

        {error && (
          <p
            id="login-error"
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || username.trim() === "" || password === ""}
          className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-vermilion-deep text-[15.5px] font-semibold text-white shadow-glow transition-all duration-200 hover:bg-vermilion-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
        >
          {isPending ? "Signing in…" : submitLabel}
          {!isPending && <ArrowRight aria-hidden className="size-4" />}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Link
        href={googleHref}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-input bg-white text-[15px] font-semibold text-foreground shadow-xs transition-colors duration-150 hover:border-border-strong hover:bg-band/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion"
      >
        <GoogleMark />
        Sign in with Google
      </Link>

      {footnote && (
        <p className="mt-5 text-[13.5px] leading-normal text-muted-foreground">{footnote}</p>
      )}

      {/*
        Everything below is for development and demos, and goes when real
        authentication lands — see .memories/08-roadmap.md item 1.
      */}
      <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-band/60 px-4 py-3 text-center text-[12.5px] leading-normal text-muted-foreground">
        Demo build —{" "}
        {sampleAccount ? (
          <>
            LDAP accounts are dummy ones, e.g.{" "}
            <code className="rounded-md bg-white px-1.5 py-0.5 font-mono text-foreground ring-1 ring-border">
              {sampleAccount.uid}
            </code>{" "}
            /{" "}
            <code className="rounded-md bg-white px-1.5 py-0.5 font-mono text-foreground ring-1 ring-border">
              {sampleAccount.password}
            </code>
            .{" "}
          </>
        ) : null}
        &ldquo;Sign in with Google&rdquo; opens a persona picker until Google sign-in is connected.
      </div>
    </div>
  );
}
