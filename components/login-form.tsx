"use client";

/**
 * The sign-in form. Since 30 Oct 2026 it is a single "Sign in with Google"
 * button - the email+password form is commented out below.
 */

export function LoginForm({
  next,
  submitLabel = "Sign in with Google",
  center,
  notice,
}: {
  next?: string;
  submitLabel?: string;
  center?: boolean;
  notice?: string | null;
}) {
  const googleUrl = next
    ? `/api/auth/google/start?next=${encodeURIComponent(next)}`
    : "/api/auth/google/start";

  return (
    <div className="min-w-0">
      {notice && (
        <p
          role="alert"
          className="mb-5 rounded-[3px] border border-red-300 bg-red-50 px-3 py-2 text-[14.5px] text-red-900"
        >
          {notice}
        </p>
      )}

      <a
        href={googleUrl}
        className={`mt-2 flex w-full items-center justify-center gap-3 rounded-md bg-vermilion-deep p-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-vermilion-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion${center ? "" : ""}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {submitLabel}
      </a>
    </div>
  );
}

/* ---------- Email + password form (commented out 30 Oct 2026) ----------
 *
 * The portal used email+password sign-in before Google OAuth was configured.
 * To re-enable: uncomment the form below and the `signInWithPassword` action
 * in `app/actions/auth.ts`, then import it here.
 *

import { useActionState } from "react";
import { signInWithPassword } from "@/app/actions/auth";

export function LoginFormPassword({
  next,
  submitLabel = "Sign in",
  center,
  notice,
}: {
  next?: string;
  submitLabel?: string;
  center?: boolean;
  notice?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      const result = await signInWithPassword(email, password, next);
      if (!result.ok) return { error: result.error ?? "Sign-in failed" };
      return { error: null };
    },
    { error: null }
  );

  const error = notice ?? state.error;

  return (
    <div className="min-w-0">
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-[3px] border border-red-300 bg-red-50 px-3 py-2 text-[14.5px] text-red-900"
        >
          {error}
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className={`mb-1.5 block text-[14.5px] font-medium text-ink${center ? "" : ""}`}>
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded border border-border-strong bg-white px-3 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-vermilion focus:ring-1 focus:ring-vermilion"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[14.5px] font-medium text-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded border border-border-strong bg-white px-3 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-vermilion focus:ring-1 focus:ring-vermilion"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 flex w-full items-center justify-center rounded-md bg-vermilion-deep p-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-vermilion-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion disabled:opacity-60"
        >
          {pending ? "Signing in..." : submitLabel}
        </button>
      </form>
    </div>
  );
}

 * ---------- end commented-out email+password form ---------- */
