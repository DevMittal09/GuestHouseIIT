import Link from "next/link";

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
 * **No password, and up to two buttons** (6 Nov 2026, the owner: "add mock
 * authentication along with google oauth in the sign in page for now"; it was
 * one button from 27 Oct 2026, when LDAP came off the page). Each door is
 * drawn when it is open, and the page says which is which:
 *
 * - **Google** (`GOOGLE_CLIENT_ID` and friends configured) - *Sign in with
 *   Google*, the Google mark, the real OpenID Connect flow at
 *   `/api/auth/google/start` (Phase 8). Solid vermilion: it is the real door
 *   and the one the institute will use.
 * - **Mock authentication** (`mockLoginEnabled()`) - *Mock Authentication*,
 *   opening the account picker at `/mock-login`, with one line underneath
 *   saying what it is. Outlined rather than solid when Google is beside it,
 *   because it is the lesser door; solid when it is the only one, because
 *   then it is the only thing to press.
 *
 * **The Google mark is never drawn on the mock button.** A Google "G" on a
 * button that does not talk to Google claims something untrue, and that rule
 * predates both rounds.
 *
 * **The LDAP username and password fields are gone**, and so is every mention
 * of LDAP here. `signInWithLdap` (`app/actions/auth.ts`) and `lib/ldap/` are
 * **untouched** - the directory still backs *Import LDAP usernames* in Users
 * & Roles, and the door can be reopened by rendering a form again. Nothing
 * about sessions, roles or access control changed: every door ends in the
 * same `sessions` row that `getCurrentUser()` reads.
 */
export function LoginForm({
  next,
  submitLabel = "Sign in",
  footnote,
  center,
  doors = { google: false, mock: false },
  notice,
}: {
  /** Where to land after signing in, when the page wants somewhere specific. */
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
  /** Centre the prose under the buttons. */
  center?: boolean;
  /**
   * Which doors are open. Both may be, since 6 Nov 2026; neither is the
   * "sign-in is not configured" case.
   */
  doors?: { google: boolean; mock: boolean };
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

      {!doors.google && !doors.mock && (
        <p className="rounded-[3px] border border-notice-border bg-notice px-4 py-3 text-[14.5px] leading-[1.55] text-ink">
          Sign-in is not configured on this deployment. Ask the guest house office.
        </p>
      )}

      {doors.google && (
        <Link href={withNext("/api/auth/google/start")} prefetch={false} className={solid}>
          <GoogleMark />
          Sign in with Google
        </Link>
      )}

      {doors.mock && (
        <Link
          href={withNext("/mock-login")}
          prefetch={false}
          className={`${doors.google ? `${outline} mt-3` : solid}`}
        >
          {doors.google ? "Mock Authentication" : submitLabel}
        </Link>
      )}

      {doors.mock && (
        <p
          className={`mt-3.5 text-[13.5px] leading-[1.55] text-muted-foreground${center ? " text-center" : ""}`}
        >
          {doors.google
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
