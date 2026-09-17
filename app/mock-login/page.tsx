import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthMasthead } from "@/components/auth-masthead";
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
import { homeForRole } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { REVIEWER_ROLES, ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * Mock authentication — one click per seeded persona, no password. It exists so
 * a developer can jump between the ten roles without signing out; `/` is the
 * credential form the institute sees. Both go when real authentication lands.
 */
export default async function MockLoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  const profiles = await getStore().listProfiles();
  // Split by where the persona *works*, not by whether it can book: the IAR
  // Office both approves and books, and belongs with the reviewers.
  const isStaff = (p: Profile) => REVIEWER_ROLES.includes(p.role) || p.role === "developer";
  const requesters = profiles.filter((p) => !isStaff(p));
  const reviewers = profiles.filter(isStaff);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <AuthMasthead subtitle="Sign in as a persona to explore each workflow (mock authentication for local development)" />

      <div className="grid gap-8 md:grid-cols-2">
        <PersonaGroup title="Requesters" description="Submit and track booking requests" profiles={requesters} />
        <PersonaGroup title="Reviewers & Admins" description="Approve, reject and allocate rooms" profiles={reviewers} />
      </div>

      <div className="mt-8 text-center">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to sign in</Link>
        </Button>
      </div>
    </main>
  );
}

function PersonaGroup({
  title,
  description,
  profiles,
}: {
  title: string;
  description: string;
  profiles: Profile[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {profiles.map((p) => (
          <form key={p.id} action={loginAs.bind(null, p.id)}>
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
