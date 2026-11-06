"use client";

import { useActionState } from "react";
import { signInWithPassword, type SignInResult } from "@/app/actions/auth";

/**
 * The email and password door, inside `LoginForm`.
 *
 * **The primary door since 6 Nov 2026** (the owner: "for the time being, I
 * want to use username/password authentication as the primary login method
 * because it is much easier for testing"), drawn above Mock Authentication
 * and Google. It is deliberately temporary: Google OpenID Connect is built,
 * verified and unchanged, and `PASSWORD_LOGIN=false` closes this one.
 *
 * The only client component among the three doors, because it is the only one
 * with state to hold: `useActionState` keeps the server action's message
 * across a submission, and `pending` stops a second one. The other two are
 * links, so `LoginForm` stays a server component and goes on taking a
 * `footnote` of arbitrary JSX.
 *
 * **Success never returns here.** `signInWithPassword` ends in `redirect()`,
 * as every other door does, so there is no success state to render and no
 * client-side navigation to get wrong.
 *
 * The username is the account's email address: the portal has no separate
 * username, and `getProfileByEmail` is what the Google callback matches on
 * too. No field is starred, so `RequiredFieldsNote` does not apply.
 */
export function PasswordSignInForm({
  next,
  submitLabel = "Sign in",
}: {
  next?: string;
  /**
   * What the submit button says. The booking doors pass "Sign in to book" and
   * "Sign in to book meals", which is the one place the page can say what the
   * sign-in is *for* - it used to sit on the picker's button, and this is now
   * the primary door.
   */
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<SignInResult, FormData>(
    signInWithPassword,
    { ok: false, error: null }
  );

  const field =
    "block w-full rounded border border-border-strong bg-white px-3 py-2.5 text-[15px] text-ink placeholder:text-muted-foreground focus:border-vermilion focus:outline-none focus:ring-1 focus:ring-vermilion";
  const label = "mb-1.5 block text-left text-[14px] font-medium text-ink";

  return (
    <form action={formAction} className="space-y-4 text-left">
      {state.error && (
        <p
          role="alert"
          className="rounded-[3px] border border-red-300 bg-red-50 px-3 py-2 text-[14.5px] text-red-900"
        >
          {state.error}
        </p>
      )}

      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="signin-email" className={label}>
          Email address
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={field}
          placeholder="you@iitpkd.ac.in"
        />
      </div>

      <div>
        <label htmlFor="signin-password" className={label}>
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 flex w-full items-center justify-center rounded-md bg-vermilion-deep p-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-vermilion-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion disabled:opacity-60"
      >
        {pending ? "Signing in..." : submitLabel}
      </button>
    </form>
  );
}
