import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
import { Container, PageTitle, siteButton } from "@/components/site/site-ui";
import { type SitePhoto } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`). Someone already signed in is offered a way through instead of
 * a second form. Renders its own `Container`.
 *
 * **One shape since 27 Oct 2026: a narrow panel, centred.** The owner asked
 * for the photograph off `/sign-in` too ("remove the image currently
 * displayed on the right side of the sign-in portal... centre-align the
 * sign-in content"), which is what `/book-room` and `/book-meal` were given
 * on 15 Oct 2026. The three doors are now the same panel.
 *
 * `photo` is **kept and unused**: the split-screen shape is three lines away
 * if the office asks for it back, and `SIGN_IN_PHOTOS` still holds the
 * photographs - all of which are in the Gallery regardless.
 *
 * There is nothing left to left-align: the panel holds a heading, one
 * button and two short lines, so the old rule about labels sitting left of
 * a centred panel no longer has a field to apply to.
 */
export function SignInPanel({
  title,
  intro,
  photo,
  user,
  continueTo,
  continueLabel,
  next,
  submitLabel,
  footnote,
  notice,
}: {
  title: string;
  intro: React.ReactNode;
  /** Beside the form from `lg`. Leave it out for a centred, narrow panel. */
  photo?: SitePhoto;
  user: Profile | null;
  /** Where a signed-in visitor should go, already resolved for their role. */
  continueTo: string;
  continueLabel: string;
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
  /** A failed sign-in's message, e.g. coming back from Google. */
  notice?: string | null;
}) {
  // `photo` is accepted and deliberately not drawn - see the note above.
  void photo;

  return (
    <div className="border-b border-border bg-band">
      <Container className="py-[clamp(24px,5vw,72px)]">
        {/* Split-screen, but contained: one bordered panel with the form on
            white in five columns and the photograph filling the other seven
            (from `lg`; phones get the form alone). Without a photograph the
            same panel is simply narrow and centred. */}
        <div
          className="mx-auto w-full max-w-[560px] overflow-hidden rounded-lg border border-border-strong bg-white"
        >
          <div className="min-w-0 px-[clamp(20px,4vw,56px)] py-[clamp(32px,5vw,64px)]">
            <div className="mx-auto w-full max-w-[400px]">
              <PageTitle kicker="Guest house portal" intro={intro} center>
                {title}
              </PageTitle>

              <div className="mt-10">
                {user ? (
                  <div className="border-t border-ink pt-6 text-center">
                    <p className="text-[16px] leading-[1.6] text-body">
                      You are signed in as <strong className="text-ink">{user.full_name}</strong>{" "}
                      ({ROLE_LABELS[user.role]}).
                    </p>
                    <Link href={continueTo} className={`${siteButton.brand} mt-6 w-full`}>
                      {continueLabel}
                    </Link>
                    <form action={logout} className="mt-4 text-center">
                      <button
                        type="submit"
                        className="cursor-pointer text-sm font-semibold text-ink underline decoration-vermilion underline-offset-4 hover:text-vermilion-deep"
                      >
                        Sign in as someone else
                      </button>
                    </form>
                  </div>
                ) : (
                  <LoginForm
                    next={next}
                    submitLabel={submitLabel}
                    footnote={footnote}
                    center
                    doors={{ google: googleOauth() !== null, mock: mockLoginEnabled() }}
                    notice={notice}
                  />
                )}
              </div>
            </div>
          </div>

        </div>
      </Container>
    </div>
  );
}
