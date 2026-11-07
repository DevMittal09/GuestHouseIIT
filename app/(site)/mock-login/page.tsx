import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { loginAs } from "@/app/actions/auth";
import { Container, PageTitle, siteButton } from "@/components/site/site-ui";
import { getApprovalRules } from "@/lib/approval-routes-server";
import { getCurrentUser } from "@/lib/auth";
import { mockLoginEnabled } from "@/lib/env";
import {
  personaGroup,
  personaGroupFor,
  personaGroupsPresent,
  personaRoute,
  type PersonaRoute,
} from "@/lib/mock-personas";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import { ROLE_LABELS, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Mock authentication" };

/**
 * **Mock Authentication** - the account picker, in two steps: choose the
 * **kind of user**, then the account.
 *
 * Two steps rather than one list because the point of these accounts is to
 * walk a workflow, and the question a tester actually has is "what kind of
 * person am I being next?" - not "which of forty names". The kinds are
 * `PERSONA_GROUPS`; each account shows **the chain its request would take**,
 * computed from the routes currently configured, so the picker cannot
 * promise something the portal would not do.
 *
 * It stands in for Google sign-in wherever that is not configured
 * (`mockLoginEnabled()`), and `next` arrives from the sign-in card, so
 * "Book a room" still lands on `/book` through this door.
 */
export default async function MockLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; kind?: string }>;
}) {
  // Where the door is shut it is not there at all, rather than refusing
  // politely: there is nothing here anyone should reach.
  if (!mockLoginEnabled()) notFound();

  const { next: rawNext, kind } = await searchParams;
  const next = safeNextPath(rawNext);
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeForRole(user.role));

  const store = getStore();
  const [all, units, rules] = await Promise.all([
    store.listProfiles(),
    store.listUnits().catch(() => []),
    getApprovalRules(),
  ]);
  const profiles = all
    .filter((p) => p.account_status === "active")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const groups = personaGroupsPresent(profiles);
  const chosen = kind ? personaGroup(kind) : null;
  const keep = (path: string) => (next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path);

  return (
    <div className="border-b border-border bg-band">
      <Container className="pt-12 pb-20 lg:pt-16">
        <PageTitle
          className="mb-10 max-w-[760px]"
          kicker="Demo build"
          intro={
            chosen
              ? chosen.blurb
              : "Choose the kind of user you want to test as. Every account below is a demo account, and no password is needed."
          }
        >
          {chosen ? chosen.title : "Mock authentication"}
        </PageTitle>

        {profiles.length === 0 ? (
          <p className="border-t border-ink pt-6 text-[15px] text-body">
            No accounts exist in this database yet. Run{" "}
            <code className="font-mono text-[14px]">npm run seed:personas</code>, or delete{" "}
            <code className="font-mono text-[14px]">.local-db.json</code> to reseed the mock store.
          </p>
        ) : chosen ? (
          <AccountList
            profiles={profiles.filter((p) => personaGroupFor(p) === chosen.id)}
            directory={{ profiles, units, rules }}
            next={next}
          />
        ) : (
          <ul className="grid gap-px border border-border-strong bg-border-strong sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => {
              const count = profiles.filter((p) => personaGroupFor(p) === group.id).length;
              return (
                <li key={group.id} className="bg-white">
                  <Link
                    href={keep(`/mock-login?kind=${group.id}`)}
                    className="group flex h-full flex-col gap-2 p-6 hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-card font-semibold text-ink">{group.title}</span>
                      <span className="figure-serif shrink-0 text-[18px] text-vermilion-deep">
                        {count}
                      </span>
                    </span>
                    <span className="text-[14.5px] leading-[1.55] text-body">{group.blurb}</span>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[14px] font-semibold text-ink">
                      Choose an account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[14.5px]">
          {chosen && (
            <Link href={keep("/mock-login")} className="font-semibold text-ink hover:text-vermilion-deep">
              ← All kinds of user
            </Link>
          )}
          <Link href={SIGN_IN_PATH} className="font-semibold text-ink hover:text-vermilion-deep">
            Back to sign in
          </Link>
        </div>
      </Container>
    </div>
  );
}

function AccountList({
  profiles,
  directory,
  next,
}: {
  profiles: Profile[];
  directory: Parameters<typeof personaRoute>[1];
  next: string | null;
}) {
  if (profiles.length === 0) {
    return (
      <p className="border-t border-ink pt-6 text-[15px] text-body">
        No account of this kind exists in this database yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-px border border-border-strong bg-border-strong">
      {profiles.map((profile) => (
        <li key={profile.id} className="bg-white">
          <AccountRow profile={profile} route={personaRoute(profile, directory)} next={next} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The small tracked capitals in front of a line on an account row.
 *
 * A `<span>`, not `Label` from `site-ui`, which is a `<p>` - these sit
 * **inside** a paragraph, and a `<p>` in a `<p>` is invalid HTML that React
 * reports as a hydration error.
 */
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-2 text-[11px] font-semibold tracking-[0.22em] text-vermilion-deep uppercase">
      {children}
    </span>
  );
}

function AccountRow({
  profile,
  route,
  next,
}: {
  profile: Profile;
  route: PersonaRoute;
  next: string | null;
}) {
  const where = [profile.hostel_name, profile.department_or_club].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-5 p-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-2">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-card font-semibold text-ink">{profile.full_name}</span>
          <span className="text-meta text-vermilion-deep">{ROLE_LABELS[profile.role]}</span>
        </p>
        <p className="font-mono text-[13.5px] break-all text-body">
          {profile.email}
          {where ? <span className="font-sans"> · {where}</span> : null}
        </p>

        {route.chain.length > 0 && (
          <p className="text-[14.5px] leading-[1.6] text-body">
            <RowLabel>Route</RowLabel>
            {route.chain.join(" → ")}
          </p>
        )}
        {route.ifHodApproval && (
          <p className="text-[14.5px] leading-[1.6] text-body">
            <RowLabel>Or</RowLabel>
            on Requires HOD approval: {route.ifHodApproval.join(" → ")}
          </p>
        )}
        {route.copiedTo.length > 0 && (
          <p className="text-[14.5px] leading-[1.6] text-body">
            <RowLabel>Copied</RowLabel>
            {route.copiedTo.join(", ")}
          </p>
        )}
        {route.advisorFor.length > 0 && (
          <p className="text-[14.5px] leading-[1.6] text-body">
            <RowLabel>Also books for</RowLabel>
            {route.advisorFor.join(", ")} (as Faculty Advisor, straight to the desk)
          </p>
        )}
        {route.decides && (
          <p className="text-[14.5px] leading-[1.6] text-body">
            {/* "In the chain" rather than "Decides": the same line also says
                when an account is only copied, and a label that contradicts
                its own sentence is worse than no label. */}
            <RowLabel>In the chain</RowLabel>
            {route.decides}
          </p>
        )}
        {route.cannotBook && (
          <p className="text-[14.5px] leading-[1.6] text-body">{route.cannotBook}</p>
        )}
      </div>

      <form action={loginAs.bind(null, profile.id, next)} className="shrink-0">
        {/* The whole name, not the first word: half these accounts open on a
            title ("Dr. Suresh Kumar") and half are an office, not a person
            ("CSE Department Office"). */}
        <button type="submit" className={siteButton.ink}>
          Continue as this account
        </button>
      </form>
    </div>
  );
}
