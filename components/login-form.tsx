import { siteButton } from "@/components/site/site-ui";
import { cn } from "@/lib/utils";

/**
 * The sign-in card's doors - **one button per door that is open**.
 *
 * - **Sign in with Google**: the institute's real door (OpenID Connect,
 *   institute domains only, and the account must already exist). Shown
 *   whenever Google is configured, with Google's own mark.
 * - **Mock authentication**: the account picker at `/mock-login`, which is
 *   how every workflow is tested. No Google mark on it - it is not Google,
 *   and a mark that says it is would be a lie on a public page.
 *
 * **The email and password form came off on 7 Nov 2026** (the owner: "make a
 * mock authentication for this instead of sign in with password"). Nothing
 * was deleted below the interface: `signInWithPassword`, the throttle and
 * `profiles.password_hash` are all as they were. Don't put the fields back
 * without being asked.
 */
export function LoginForm({
  next,
  submitLabel,
  doors,
  notice,
}: {
  next?: string;
  /**
   * What the caller wants its door called - `/book-room` passes "Sign in to
   * book", so the button names the thing the visitor came to do.
   *
   * **It follows whichever door is the only one open** (9 Nov 2026). It used
   * to default to "Sign in with Google" and was read by the Google button
   * alone, which was right on 30 Oct when Google was the only door - but the
   * account picker came back on 7 Nov and nobody joined the two up. The
   * result was a label that existed only where Google was configured: on a
   * deployment without it, `/book-room`'s door read a bare "Sign in", and the
   * public-site journey that looks for "Sign in to book" could only pass on a
   * machine with real Google credentials in its `.env.local`.
   *
   * Where **both** doors are open the caller's label stays on Google's, which
   * is the real one; the picker keeps saying what it is.
   */
  submitLabel?: string;
  /** Which doors are open. At least one always is, or the card says nothing. */
  doors: { google: boolean; mock: boolean };
  notice?: string | null;
}) {
  const withNext = (path: string) =>
    next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path;

  return (
    <div className="min-w-0">
      {notice && (
        <p
          role="alert"
          className="mb-5 rounded border border-vermilion-deep/40 bg-vermilion/8 px-3 py-2 text-[14.5px] text-ink"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {doors.google && (
          <a href={withNext("/api/auth/google/start")} className={cn(siteButton.brand, "w-full gap-3")}>
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
            {submitLabel ?? "Sign in with Google"}
          </a>
        )}

        {doors.mock && (
          <a
            href={withNext("/mock-login")}
            className={cn(doors.google ? siteButton.outline : siteButton.ink, "w-full")}
          >
            {/* With Google beside it this button has to say what it is, so the
                caller's label stays on the real door. On its own it *is* the
                door, and takes the caller's label - "Sign in to book" on
                `/book-room` - falling back to a plain "Sign in". */}
            {doors.google ? "Mock authentication" : (submitLabel ?? "Sign in")}
          </a>
        )}
      </div>

      {doors.mock && (
        <p className="mt-4 text-[13.5px] leading-[1.55] text-muted-foreground">
          Mock authentication is a demo door: choose a kind of user, then the account to continue
          as. No password is needed.
        </p>
      )}
    </div>
  );
}
