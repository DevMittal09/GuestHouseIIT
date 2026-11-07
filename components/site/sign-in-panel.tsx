import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { LoginForm } from "@/components/login-form";
import { Container, PageTitle, siteButton } from "@/components/site/site-ui";
import { googleOauth, mockLoginEnabled } from "@/lib/env";
import { type SitePhoto } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";

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
  photo?: SitePhoto;
  user: Profile | null;
  continueTo: string;
  continueLabel: string;
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
  notice?: string | null;
}) {
  void photo;

  return (
    <div className="border-b border-border bg-band">
      <Container className="py-[clamp(24px,5vw,72px)]">
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
                    doors={{ google: googleOauth() !== null, mock: mockLoginEnabled() }}
                    notice={notice}
                  />
                )}
              </div>

              {footnote && (
                <p className="mt-5 text-center text-sm leading-normal text-muted-foreground">
                  {footnote}
                </p>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
