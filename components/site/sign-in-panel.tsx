import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
import { Container, NoticeBox, PageTitle, siteButton } from "@/components/site/site-ui";
import { isMockDirectory } from "@/lib/ldap";
import { SAMPLE_ACCOUNT } from "@/lib/ldap/mock-directory";
import { LOGIN_DOMAIN } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`), on the grey band: a title, a lead paragraph and the domain
 * notice on the left, the white sign-in card on the right. Someone already
 * signed in is offered a way through instead of a second form. Renders its
 * own full-width band, so a page uses it without a `Container`.
 */
export function SignInPanel({
  title,
  intro,
  aside,
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
  /** Extra content under the notice box. */
  aside?: React.ReactNode;
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
      <Container className="grid items-start gap-x-16 gap-y-10 pt-12 pb-20 lg:grid-cols-12 lg:pt-16 lg:pb-24">
        <div className="min-w-0 lg:col-span-6">
          <PageTitle intro={intro}>{title}</PageTitle>
          <div className="mt-8 space-y-7">
            <NoticeBox label="Please note">
              Sign in with your institute <strong>LDAP username and password</strong>, or with
              your <strong>@{LOGIN_DOMAIN}</strong> account (students:{" "}
              <strong>@smail.{LOGIN_DOMAIN}</strong>). Personal accounts cannot be used to book.
            </NoticeBox>
            {aside}
          </div>
        </div>

        <div className="min-w-0 lg:col-span-5 lg:col-start-8">
          {user ? (
            <div className="border border-border border-t-[3px] border-t-ink bg-white px-[clamp(18px,5vw,32px)] pt-8 pb-[34px]">
              <h2 className="mb-3 text-[26px] font-semibold text-ink">You are signed in</h2>
              <p className="text-[15.5px] leading-[1.55] text-body">
                as <strong className="text-ink">{user.full_name}</strong> ({user.email}),{" "}
                {ROLE_LABELS[user.role]}.
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
            />
          )}
        </div>
      </Container>
    </div>
  );
}
