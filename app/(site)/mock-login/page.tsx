import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/site/site-ui";
import { loginAs } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import { REVIEWER_ROLES, ROLE_LABELS, type Profile } from "@/lib/types";
import { initials } from "@/lib/utils";

/**
 * The placeholder behind "Sign in with Google": one click per portal account,
 * no password. Real Google OAuth replaces this page and `loginAs` together.
 * Until then it is also how a developer jumps between the ten roles without
 * typing a password. `next` arrives from the sign-in card, so "Book a room"
 * still lands on `/book` through this door.
 */
export default async function MockLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeForRole(user.role));

  const profiles = await getStore().listProfiles();
  // Split by where the persona *works*, not by whether it can book: the IAR
  // Office both approves and books, and belongs with the reviewers.
  const isStaff = (p: Profile) => REVIEWER_ROLES.includes(p.role) || p.role === "developer";
  const requesters = profiles.filter((p) => !isStaff(p));
  const reviewers = profiles.filter(isStaff);

  return (
    <div className="bg-paper">
      <Container className="py-[clamp(40px,6vw,80px)]">
        <div className="max-w-[720px]">
          <Eyebrow className="mb-4">Development sign-in</Eyebrow>
          <h1 className="text-[clamp(36px,5vw,56px)] leading-[1.05] font-semibold text-foreground">
            Sign in with Google
          </h1>
          <p className="mt-4 text-[17px] leading-[1.65] text-body">
            Google sign-in is not connected yet. In this development build, choose the account to
            continue as — no password needed.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PersonaGroup title="Requesters" description="Submit and track booking requests" profiles={requesters} next={next} />
          <PersonaGroup title="Reviewers & admins" description="Approve, reject and allocate rooms" profiles={reviewers} next={next} />
        </div>

        <div className="mt-10 text-center">
          <Link
            href={SIGN_IN_PATH}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-band"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to LDAP sign in
          </Link>
        </div>
      </Container>
    </div>
  );
}

function PersonaGroup({
  title,
  description,
  profiles,
  next,
}: {
  title: string;
  description: string;
  profiles: Profile[];
  next: string | null;
}) {
  return (
    <section className="min-w-0 rounded-3xl bg-white p-[clamp(18px,3vw,28px)] shadow-soft ring-1 ring-border">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-semibold text-foreground">{title}</h2>
          <p className="text-[14px] text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full bg-band px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
          {profiles.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {profiles.map((p) => (
          <li key={p.id}>
            <form action={loginAs.bind(null, p.id, next)}>
              <button
                type="submit"
                className="group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-border bg-white p-3 text-left transition-all duration-150 hover:border-vermilion/40 hover:bg-vermilion-soft/40 hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion"
              >
                <span
                  aria-hidden
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-saffron to-vermilion font-heading text-[15px] font-bold text-ink"
                >
                  {initials(p.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">{p.full_name}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {p.email}
                    {p.hostel_name ? ` · ${p.hostel_name}` : ""}
                    {p.department_or_club ? ` · ${p.department_or_club}` : ""}
                  </span>
                </span>
                <span className="hidden shrink-0 rounded-full bg-band px-2.5 py-1 text-[11.5px] font-semibold text-body ring-1 ring-border sm:inline">
                  {ROLE_LABELS[p.role]}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-vermilion-deep"
                />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
