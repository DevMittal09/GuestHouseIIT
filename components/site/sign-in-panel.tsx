import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { LoginForm } from "@/components/login-form";
import { Container, Eyebrow, NoticeBox, siteButton } from "@/components/site/site-ui";
import { isMockDirectory } from "@/lib/ldap";
import { SAMPLE_ACCOUNT } from "@/lib/ldap/mock-directory";
import { LOGIN_DOMAIN, type SitePhoto } from "@/lib/site";
import { ROLE_LABELS, type Profile } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

/**
 * The gated entry points of the public site (`/book-room`, `/book-meal`,
 * `/sign-in`), as one split card: a photograph carrying the page's `<h1>` and
 * lead on one side, the sign-in form on the other. Someone already signed in
 * is offered a way through instead of a second form.
 */
export function SignInPanel({
  title,
  intro,
  photo,
  aside,
  user,
  continueTo,
  continueLabel,
  next,
  submitLabel,
  footnote,
}: {
  title: string;
  intro: React.ReactNode;
  /** The photograph behind the title. */
  photo: SitePhoto;
  /** Extra content under the lead, on the photograph (so: light text). */
  aside?: React.ReactNode;
  user: Profile | null;
  /** Where a signed-in visitor should go, already resolved for their role. */
  continueTo: string;
  continueLabel: string;
  next?: string;
  submitLabel?: string;
  footnote?: React.ReactNode;
}) {
  return (
    <Container className="py-[clamp(20px,4vw,56px)]">
      <div className="grid overflow-hidden rounded-[clamp(24px,3vw,36px)] bg-white shadow-lift ring-1 ring-border lg:grid-cols-[1.05fr_1fr]">
        <div className="relative isolate flex min-h-[clamp(340px,48vw,680px)] flex-col justify-end overflow-hidden bg-ink p-[clamp(24px,4.5vw,56px)]">
          {photo.src && (
            <Image
              src={photo.src}
              alt=""
              fill
              preload
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="-z-10 animate-drift object-cover"
            />
          )}
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/55 to-transparent" />
          <div aria-hidden className="grain absolute inset-0 -z-10" />
          <div className="animate-rise">
            <Eyebrow tone="saffron" className="mb-4">
              IIT Palakkad Guest House
            </Eyebrow>
            <h1 className="text-[clamp(38px,5vw,60px)] leading-[1.02] font-semibold text-white">{title}</h1>
            <p className="mt-4 max-w-[52ch] text-[16.5px] leading-[1.65] text-white/80">{intro}</p>
            {aside && <div className="mt-7">{aside}</div>}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-7 p-[clamp(24px,4.5vw,64px)]">
          <NoticeBox label="Please note">
            Sign in with your institute <strong className="text-foreground">LDAP username and password</strong>,
            or with Google using your <strong className="text-foreground">@{LOGIN_DOMAIN}</strong> account
            (students: <strong className="text-foreground">@smail.{LOGIN_DOMAIN}</strong>). Personal accounts
            cannot be used to book.
          </NoticeBox>

          {user ? (
            <div className="min-w-0">
              <h2 className="text-[30px] leading-tight font-semibold text-foreground">You are signed in</h2>
              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-band/70 p-4 ring-1 ring-border">
                <span
                  aria-hidden
                  className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-saffron to-vermilion font-heading text-lg font-bold text-ink"
                >
                  {initials(user.full_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{user.full_name}</span>
                  <span className="block truncate text-[13.5px] text-muted-foreground">
                    {user.email} · {ROLE_LABELS[user.role]}
                  </span>
                </span>
              </div>
              <Link href={continueTo} className={cn(siteButton.primary, "mt-6 w-full")}>
                {continueLabel} <ArrowRight aria-hidden className="size-4" />
              </Link>
              <form action={logout} className="mt-4 text-center">
                <button
                  type="submit"
                  className="cursor-pointer text-sm font-semibold text-vermilion-deep underline-offset-4 hover:underline"
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
            />
          )}
        </div>
      </div>
    </Container>
  );
}
