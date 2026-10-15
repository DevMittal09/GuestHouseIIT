import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
import { Container, PageTitle, siteButton } from "@/components/site/site-ui";
import { LOGIN_DOMAIN, type SitePhoto } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`). Someone already signed in is offered a way through instead of
 * a second form. Renders its own `Container`.
 *
 * **Two shapes, chosen by whether a `photo` is given** (15 Oct 2026):
 *
 * - **With one** - `/sign-in` - the bordered split-screen panel it has had
 *   since 30 Sep 2026: the title, one line of lead and the form in five
 *   columns, the photograph filling the other seven from `lg`. (It filled
 *   half the *screen* for an afternoon on 26 Sep, which was too much; it now
 *   fills half the panel, inside the page's width.)
 * - **Without one** - the two booking doors, `/book-room` and `/book-meal`
 *   (the owner: "For room and meal booking remove the image and center align
 *   the login page") - a narrow panel centred in the page.
 *
 * **The form's own labels stay left-aligned in both.** Centring a label over
 * a full-width input separates the two and reads as a mistake; what centres
 * is the panel and the prose around it.
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
  const split = Boolean(photo);

  return (
    <div className="border-b border-border bg-band">
      <Container className="py-[clamp(24px,5vw,72px)]">
        {/* Split-screen, but contained: one bordered panel with the form on
            white in five columns and the photograph filling the other seven
            (from `lg`; phones get the form alone). Without a photograph the
            same panel is simply narrow and centred. */}
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-border-strong bg-white",
            split ? "grid lg:grid-cols-12" : "mx-auto w-full max-w-[560px]"
          )}
        >
          <div
            className={cn(
              "min-w-0 px-[clamp(20px,4vw,56px)] py-[clamp(32px,5vw,64px)]",
              split && "lg:col-span-5"
            )}
          >
            <div className={cn("w-full", split ? "max-w-[440px]" : "mx-auto max-w-[400px]")}>
              <PageTitle kicker="Guest house portal" intro={intro} center={!split}>
                {title}
              </PageTitle>

              <div className="mt-10">
                {user ? (
                  <div className="border-t border-ink pt-6">
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
                    center={!split}
                    googleSignIn={googleOauth() ? "google" : mockLoginEnabled() ? "mock" : "none"}
                    notice={notice}
                    domainNote={
                      <>
                        Use your institute LDAP account or your <strong>@{LOGIN_DOMAIN}</strong> account.
                        Personal email accounts cannot be used.
                      </>
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {photo?.src && (
            <div className="relative hidden min-h-[508px] border-l border-border-strong lg:col-span-7 lg:block">
              <Image src={photo.src} alt="" fill sizes="700px" className="object-cover" />
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
