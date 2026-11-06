import Link from "next/link";
import { PasswordSignInForm } from "@/components/password-sign-in-form";

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
 * The sign-in door, inside `SignInPanel` (which supplies the heading).
 *
 * **Three doors, in this order** (6 Nov 2026, the owner: "the login page must
 * present the authentication options in this exact priority order"). Each is
 * drawn only when it is open, and the page says which is which:
 *
 * 1. **Email and password** - `PasswordSignInForm`, the primary door and the
 *    only one with fields. Solid vermilion: it is the call to action.
 *    Temporary, at the owner's request, because signing in as each test role
 *    through Google is slow to set up and slower to repeat.
 * 2. **Mock authentication** (`mockLoginEnabled()`) - *Mock Authentication*,
 *    opening the account picker at `/mock-login`, with one line underneath
 *    saying what it is.
 * 3. **Google** (`GOOGLE_CLIENT_ID` and friends configured) - *Sign in with
 *    Google*, the Google mark, the real OpenID Connect flow at
 *    `/api/auth/google/start` (Phase 8). **Still the intended method**: it is
 *    built and verified, and nothing about it changed when it moved down the
 *    page. `PASSWORD_LOGIN=false` puts it back at the top.
 *
 * Both lower doors are **outlined**, because the form above them is the solid
 * one: two solid vermilion buttons would be two calls to action, and the
 * palette has one.
 *
 * **The Google mark is never drawn on the mock button.** A Google "G" on a
 * button that does not talk to Google claims something untrue, and that rule
 * predates all three rounds.
 *
 * **The LDAP username and password fields are gone**, and so is every mention
 * of LDAP here - the form above is not it. `signInWithLdap`
 * (`app/actions/auth.ts`) and `lib/ldap/` are **untouched**: the directory
 * still backs *Import LDAP usernames* in Users & Roles, and on the mock store
 * it is also where `getPasswordHash` reads the demo personas' published
 * passwords from. Nothing about sessions, roles or access control changed:
 * every door ends in the same `sessions` row that `getCurrentUser()` reads.
 */
export function LoginForm({
  next,
  submitLabel = "Sign in",
  footnote,
  center,
  doors = { password: false, google: false, mock: false },
  notice,
}: {
  /** Where to land after signing in, when the page wants somewhere specific. */
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
  /** Centre the prose under the buttons. */
  center?: boolean;
  /**
   * Which doors are open. Any combination may be; none at all is the
   * "sign-in is not configured" case.
   */
  doors?: { password: boolean; google: boolean; mock: boolean };
  /** A message from a failed sign-in (`?error=` on the way back from Google). */
  notice?: string | null;
}) {
  const withNext = (path: string) =>
    next ? `${path}?next=${encodeURIComponent(next)}` : path;
  const solid =
    "flex w-full items-center justify-center gap-3 rounded-md bg-vermilion-deep p-3.5 text-[15.5px] font-semibold text-white transition-colors duration-150 hover:bg-vermilion-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion";
  const outline =
    "flex w-full items-center justify-center gap-3 rounded-md border border-ink bg-white p-3.5 text-[15.5px] font-semibold text-ink transition-colors duration-150 hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

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

      {!doors.password && !doors.google && !doors.mock && (
        <p className="rounded-[3px] border border-notice-border bg-notice px-4 py-3 text-[14.5px] leading-[1.55] text-ink">
          Sign-in is not configured on this deployment. Ask the guest house office.
        </p>
      )}

      {doors.password && <PasswordSignInForm next={next} submitLabel={submitLabel} />}

      {doors.password && (doors.mock || doors.google) && (
        <div className="my-6 flex items-center" aria-hidden="true">
          <span className="grow border-t border-border" />
          <span className="mx-3 shrink-0 text-[13px] text-muted-foreground">or</span>
          <span className="grow border-t border-border" />
        </div>
      )}

      {doors.mock && (
        <Link
          href={withNext("/mock-login")}
          prefetch={false}
          className={doors.password || doors.google ? outline : solid}
        >
          {doors.password || doors.google ? "Mock Authentication" : submitLabel}
        </Link>
      )}

      {doors.google && (
        <Link
          href={withNext("/api/auth/google/start")}
          prefetch={false}
          className={`${doors.password ? outline : solid}${doors.mock ? " mt-3" : ""}`}
        >
          <GoogleMark />
          Sign in with Google
        </Link>
      )}

      {doors.mock && (
        <p
          className={`mt-3.5 text-[13.5px] leading-[1.55] text-muted-foreground${center ? " text-center" : ""}`}
        >
          {doors.password || doors.google
            ? "Mock authentication is for testing - you will be asked to choose an account."
            : "Google sign-in is not connected yet - you will be asked to choose an account."}
        </p>
      )}

      {footnote && (
        <p className={`mt-5 text-sm leading-normal text-muted-foreground${center ? " text-center" : ""}`}>
          {footnote}
        </p>
      )}
    </div>
  );
}
