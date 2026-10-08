import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
import { Container, PageTitle, siteButton } from "@/components/site/site-ui";
import { isMockDirectory } from "@/lib/ldap";
import { SAMPLE_ACCOUNT } from "@/lib/ldap/mock-directory";
import { LOGIN_DOMAIN, type SitePhoto } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`): one bordered split-screen panel on the band - the title, one
 * line of lead and the sign-in form in five columns, a photograph filling
 * the other seven on wide screens (30 Sep 2026; it filled half the *screen*
 * for an afternoon on 26 Sep, which was too much - now it fills half the
 * panel, inside the page's width). Someone already signed in is offered a
 * way through instead of a second form. Renders its own `Container`.
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
  photo: SitePhoto;
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
  return (
    <div className="border-b border-border bg-band">
      <Container className="py-[clamp(24px,5vw,72px)]">
        {/* Split-screen, but contained: one bordered panel with the form on
            white in five columns and the photograph filling the other seven
            (from `lg`; phones get the form alone). */}
        <div className="grid overflow-hidden rounded-lg border border-border-strong bg-white lg:grid-cols-12">
          <div className="min-w-0 px-[clamp(20px,4vw,56px)] py-[clamp(32px,5vw,64px)] lg:col-span-5">
            <div className="w-full max-w-[440px]">
              <PageTitle kicker="Guest house portal" intro={intro}>
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
                    sampleAccount={isMockDirectory() ? SAMPLE_ACCOUNT : null}
                    next={next}
                    submitLabel={submitLabel}
                    footnote={footnote}
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

          <div className="relative hidden min-h-[508px] border-l border-border-strong lg:col-span-7 lg:block">
            {photo.src && <Image src={photo.src} alt="" fill sizes="700px" className="object-cover" />}
          </div>
        </div>
      </Container>
    </div>
  );
}
