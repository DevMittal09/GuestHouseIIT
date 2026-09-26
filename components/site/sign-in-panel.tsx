import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
import { PageTitle, siteButton } from "@/components/site/site-ui";
import { isMockDirectory } from "@/lib/ldap";
import { SAMPLE_ACCOUNT } from "@/lib/ldap/mock-directory";
import { LOGIN_DOMAIN, type SitePhoto } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`): a split screen — the title, one line of lead and the sign-in
 * form on the left, a photograph filling the right on wide screens. Someone
 * already signed in is offered a way through instead of a second form.
 * Renders its own full-width layout, so a page uses it without a `Container`.
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
    <div className="grid lg:min-h-[calc(100svh-88px)] lg:grid-cols-2">
      <div className="flex justify-center px-[clamp(16px,5vw,72px)] py-[clamp(48px,7vw,104px)]">
        <div className="w-full max-w-[460px]">
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

      <div className="relative hidden bg-band lg:block">
        {photo.src && (
          <Image src={photo.src} alt="" fill sizes="50vw" className="object-cover" />
        )}
      </div>
    </div>
  );
}
