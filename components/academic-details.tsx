import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { academicDetailsFor, type AcademicDetails, type CopyTo } from "@/lib/academic/details";
import { ACADEMIC_KIND_LABELS, type DetailRow } from "@/lib/academic/fields";
import { ROLE_LABELS, type Profile } from "@/lib/types";

/**
 * The signed-in person as the institute's academic database knows them — at
 * the top of New Booking, and on the warden's portal. Read-only: the academic
 * database is the place to correct them, not this page.
 *
 * Streams in behind its own Suspense boundary, so a slow academic database
 * holds up this card and nothing else. Falls back to the portal profile when
 * there is no record or the database cannot be reached.
 */
export function AcademicDetailsCard({
  user,
  title,
  raisedBy = null,
}: {
  user: Profile;
  title: string;
  /** A club's faculty in-charge filling in the club's form (24 Sep 2026). */
  raisedBy?: Profile | null;
}) {
  return (
    <Suspense fallback={<Pending title={title} />}>
      <Details user={user} title={title} raisedBy={raisedBy} />
    </Suspense>
  );
}

async function Details({ user, title, raisedBy }: { user: Profile; title: string; raisedBy: Profile | null }) {
  const details = await academicDetailsFor(user, raisedBy);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{describeSource(user, details)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.rows.map((row) => (
            <Field key={row.label} row={row} />
          ))}
          {details.copyTo && <CopyToField copyTo={details.copyTo} />}
        </dl>
        {details.sample && (
          <p className="border border-dashed border-border-strong bg-band px-4 py-3 text-[13px] leading-normal text-muted-foreground">
            Demo build — these are sample records until the institute&apos;s academic database is
            connected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function describeSource(user: Profile, details: AcademicDetails): string {
  const kind = details.kind ? ACADEMIC_KIND_LABELS[details.kind] : null;
  switch (details.status) {
    case "found":
      return `From the institute's academic database (${kind}).`;
    case "not_found":
      return `The academic database has no ${kind} record for ${user.email}, so these are from your portal profile.`;
    case "unavailable":
      return "The academic database could not be reached just now, so these are from your portal profile.";
    case "not_applicable":
      return `Pre-filled from your institute profile (${ROLE_LABELS[user.role]}).`;
  }
}

function Field({ row }: { row: DetailRow }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground uppercase tracking-wide">{row.label}</dt>
      <dd className="font-medium break-words">
        {row.value ?? <span className="font-normal text-muted-foreground">Not on record</span>}
      </dd>
    </div>
  );
}

function CopyToField({ copyTo }: { copyTo: CopyTo }) {
  return (
    <div className="min-w-0 border-t pt-4 sm:col-span-2">
      <dt className="text-xs text-muted-foreground uppercase tracking-wide">Copy to</dt>
      <dd className="font-medium break-words">
        {copyTo.entries.length === 0 ? (
          <span className="font-normal text-muted-foreground">{copyTo.emptyNote}</span>
        ) : (
          <ul className="space-y-0.5">
            {copyTo.entries.map((entry, i) => (
              <li key={entry.email ?? i}>
                {entry.name ?? entry.email}
                {entry.name && entry.email && (
                  <span className="font-normal text-muted-foreground"> — {entry.email}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function Pending({ title }: { title: string }) {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Looking you up in the academic database…</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded-[2px] bg-muted motion-safe:animate-pulse" />
            <div className="h-4 w-40 max-w-full rounded-[2px] bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
