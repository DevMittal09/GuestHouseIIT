"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { signInWithLdap } from "@/app/actions/auth";

const LABEL = "mb-[7px] block text-[13px] font-bold tracking-[0.03em] text-body";
const INPUT =
  "block w-full rounded-[2px] border border-border-strong bg-white px-3.5 py-[13px] text-[15.5px] text-navy placeholder:text-[#8390a5] focus-visible:border-navy focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold aria-invalid:border-destructive";

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
 * The sign-in card the institute sees, on `/sign-in`, `/book-room` and
 * `/book-meal`: an LDAP username and password, or the second door.
 * `signInWithLdap` redirects on success, so the only state this holds is the
 * error from a failed attempt.
 *
 * The second door is **"Sign in with Google"** — the real OpenID Connect flow
 * (`/api/auth/google/start`, Phase 8) — once Google is configured. Until then
 * it is **"Mock Authentication"**, the persona picker at `/mock-login`, and it
 * says so rather than promising Google and delivering something else.
 * "Keep me signed in" and "Forgot password" from the design are deliberately
 * absent — passwords belong to the directory, and a control that does nothing
 * is worse than none.
 */
export function LoginForm({
  sampleAccount,
  next,
  submitLabel = "Sign in",
  footnote,
  googleSignIn = "none",
  notice,
}: {
  /** A dummy LDAP login to show, while sign-in checks the dummy directory. */
  sampleAccount: { uid: string; password: string } | null;
  /** Where to land after signing in, when the page wants somewhere specific. */
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
  /** Real Google sign-in, the mock account picker, or neither. */
  googleSignIn?: "google" | "mock" | "none";
  /** A message from a failed sign-in (`?error=` on the way back from Google). */
  notice?: string | null;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const secondDoorPath = googleSignIn === "google" ? "/api/auth/google/start" : "/mock-login";
  const secondDoorHref = next
    ? `${secondDoorPath}?next=${encodeURIComponent(next)}`
    : secondDoorPath;

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
      <div className="rounded-[2px] border border-t-[3px] border-border border-t-navy bg-white px-[clamp(18px,5vw,30px)] pt-8 pb-[34px]">
        {notice && (
          <p role="alert" className="mb-4 rounded-[3px] border border-red-300 bg-red-50 px-3 py-2 text-[14.5px] text-red-900">
            {notice}
          </p>
        )}
        <h2 className="mb-1.5 text-[25px] font-semibold text-navy">Sign in</h2>
        <p className="mb-[22px] text-[14.5px] text-muted-foreground">
          With your institute LDAP account
        </p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="login-username" className={LABEL}>
            LDAP username
          </label>
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
            className={`${INPUT} mb-[18px]`}
          />

          <label htmlFor="login-password" className={LABEL}>
            LDAP password
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
            disabled={isPending || username.trim() === "" || password === ""}
            className="w-full cursor-pointer rounded-[3px] bg-navy p-3.5 text-[15.5px] font-bold text-white transition-colors duration-150 hover:bg-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Signing in…" : submitLabel}
          </button>
        </form>

        {googleSignIn !== "none" && (
          <>
            <div className="my-6 flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <Link
              href={secondDoorHref}
              prefetch={false}
              className="flex w-full items-center justify-center gap-3 rounded-[3px] border border-border-strong bg-white p-3 text-[15.5px] font-semibold text-navy transition-colors duration-150 hover:border-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {/* The Google mark belongs only on the real Google flow — on the
                  placeholder it would claim something the button does not do. */}
              {googleSignIn === "google" ? <GoogleMark /> : <KeyRoundIcon className="size-5 shrink-0" aria-hidden />}
              {googleSignIn === "google" ? "Sign in with Google" : "Mock Authentication"}
            </Link>
          </>
        )}

        {footnote && (
          <p className="mt-4 text-sm leading-normal text-muted-foreground">{footnote}</p>
        )}
      </div>

      {/*
        Everything below is for development and demos, and goes when real
        authentication lands — see .memories/08-roadmap.md item 1.
      */}
      <div className="mt-5 border border-dashed border-border-strong bg-band px-4 py-3 text-center text-[13px] leading-normal text-muted-foreground">
        Demo build —{" "}
        {sampleAccount ? (
          <>
            LDAP accounts are dummy ones, e.g.{" "}
            <code className="rounded-[2px] bg-white px-1 py-0.5 font-mono text-navy">
              {sampleAccount.uid}
            </code>{" "}
            /{" "}
            <code className="rounded-[2px] bg-white px-1 py-0.5 font-mono text-navy">
              {sampleAccount.password}
            </code>
            .{" "}
          </>
        ) : null}
&ldquo;Mock Authentication&rdquo; opens a persona picker; it is replaced by
        &ldquo;Sign in with Google&rdquo; once Google sign-in is connected.
      </div>
    </div>
  );
}
