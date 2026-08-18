import Image from "next/image";
import { redirect } from "next/navigation";
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
import { REQUESTER_ROLES, ROLE_LABELS, type Profile } from "@/lib/types";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  const profiles = await getStore().listProfiles();
  const requesters = profiles.filter((p) => REQUESTER_ROLES.includes(p.role));
  const reviewers = profiles.filter((p) => !REQUESTER_ROLES.includes(p.role));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <div className="mb-10 text-center">
        <Image
          src="/iitpkd-logo.png"
          alt="IIT Palakkad logo"
          width={72}
          height={72}
          className="mx-auto mb-4 size-18"
          priority
        />
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Indian Institute of Technology Palakkad
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Guest House Booking Portal
        </h1>
        <p className="mt-2 text-muted-foreground">
          Bageshri &amp; Hamsanandi &middot; Sign in as a persona to explore each workflow
          (mock authentication for local development)
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <PersonaGroup title="Requesters" description="Submit and track booking requests" profiles={requesters} />
        <PersonaGroup title="Reviewers & Admins" description="Approve, reject and allocate rooms" profiles={reviewers} />
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
