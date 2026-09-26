import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, PageTitle } from "@/components/site/site-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { notFound } from "next/navigation";
import { loginAs } from "@/app/actions/auth";
import { mockLoginEnabled } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import { REVIEWER_ROLES, ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * **Mock Authentication**: one click per portal account, no password. It is the
 * placeholder for Google sign-in, which is not built yet, and it is also how a
 * developer jumps between the roles. Real Google OAuth replaces this page and
 * `loginAs` together — `mockLoginEnabled()` closes the door as soon as
 * `GOOGLE_CLIENT_ID` and friends are set. `next` arrives from the sign-in
 * card, so "Book a room" still lands on `/book` through this door.
 */
export default async function MockLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Once Google sign-in is configured this page is not there at all, rather
  // than refusing politely — there is nothing here anyone should reach.
  if (!mockLoginEnabled()) notFound();
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
    <div className="border-b border-border bg-band">
      <Container className="pt-12 pb-20 lg:pt-16">
        <PageTitle
          className="mb-10"
          intro="Google sign-in is not connected yet, so this stands in for it: choose the account to continue as — no password needed."
        >
          Mock Authentication
        </PageTitle>

        <div className="grid gap-8 md:grid-cols-2">
          <PersonaGroup title="Requesters" description="Submit and track booking requests" profiles={requesters} next={next} />
          <PersonaGroup title="Reviewers & Admins" description="Approve, reject and allocate rooms" profiles={reviewers} next={next} />
        </div>

        {profiles.length === 0 && (
          <p className="rounded-[2px] border border-dashed border-border-strong p-6 text-center text-[15px] text-muted-foreground">
            No portal accounts exist in this database yet. Run <code>supabase/seed.sql</code>, or
            delete <code>.local-db.json</code> to reseed the mock store.
          </p>
        )}

        <div className="mt-8 text-center">
          <Button asChild variant="ghost" size="sm">
            <Link href={SIGN_IN_PATH}>← Back to LDAP sign in</Link>
          </Button>
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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {profiles.map((p) => (
          <form key={p.id} action={loginAs.bind(null, p.id, next)}>
            <Button
              type="submit"
              variant="outline"
              className="h-auto w-full justify-between gap-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.full_name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {p.email}
                  {p.hostel_name ? ` · ${p.hostel_name}` : ""}
                  {p.department_or_club ? ` · ${p.department_or_club}` : ""}
                </span>
              </span>
              <Badge variant="secondary" className="shrink-0">
                {ROLE_LABELS[p.role]}
              </Badge>
            </Button>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}
