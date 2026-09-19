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
import { loginAs } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { safeNextPath } from "@/lib/site";
import { getStore } from "@/lib/store";
import { REVIEWER_ROLES, ROLE_LABELS, type Profile } from "@/lib/types";

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
    <Container className="pt-11 pb-[88px]">
      <PageTitle
        className="mb-8"
        intro="Google sign-in is not connected yet. In this development build, choose the account to continue as — no password needed."
      >
        Sign in with Google
      </PageTitle>

      <div className="grid gap-8 md:grid-cols-2">
        <PersonaGroup title="Requesters" description="Submit and track booking requests" profiles={requesters} next={next} />
        <PersonaGroup title="Reviewers & Admins" description="Approve, reject and allocate rooms" profiles={reviewers} next={next} />
      </div>

      <div className="mt-8 text-center">
        <Button asChild variant="ghost" size="sm">
          <Link href={SIGN_IN_PATH}>← Back to LDAP sign in</Link>
        </Button>
      </div>
    </Container>
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
