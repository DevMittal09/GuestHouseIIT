import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
import { NoticeBox, PageTitle, siteButton } from "@/components/site/site-ui";
import { isMockDirectory } from "@/lib/ldap";
import { SAMPLE_ACCOUNT } from "@/lib/ldap/mock-directory";
import { LOGIN_DOMAIN } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`): a title, a lead paragraph and the domain notice on the left, the
 * sign-in card on the right. Someone already signed in is offered a way
 * through instead of a second form.
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-11">
      <div className="min-w-0">
        <PageTitle intro={intro}>{title}</PageTitle>
        <div className="mt-[26px] space-y-6">
          <NoticeBox label="Please note">
            Sign in with your institute <strong>LDAP username and password</strong>, or with
            your <strong>@{LOGIN_DOMAIN}</strong> account (students:{" "}
            <strong>@smail.{LOGIN_DOMAIN}</strong>). Personal accounts cannot be used to book.
          </NoticeBox>
          {aside}
        </div>
      </div>

      {user ? (
        <div className="min-w-0 rounded-[2px] border border-t-[3px] border-border border-t-navy bg-white px-[clamp(18px,5vw,30px)] pt-8 pb-[34px]">
          <h2 className="mb-3 text-[25px] font-semibold text-navy">You are signed in</h2>
          <p className="text-[15.5px] leading-[1.55] text-body">
            as <strong className="text-navy">{user.full_name}</strong> ({user.email}),{" "}
            {ROLE_LABELS[user.role]}.
          </p>
          <Link href={continueTo} className={`${siteButton.navy} mt-6 w-full`}>
            {continueLabel}
          </Link>
          <form action={logout} className="mt-4 text-center">
            <button
              type="submit"
              className="cursor-pointer text-sm font-semibold text-navy underline underline-offset-2 hover:text-gold-dark"
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
  );
}
