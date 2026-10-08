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
 * The signed-in person as the institute's academic database knows them - at
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
  const source = describeSource(user, details);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {source && <CardDescription>{source}</CardDescription>}
      </CardHeader>
      {/* A GOV.UK summary list: key and value on one ruled row where the
          card is wide enough (a container query, so it works in the booking
          page's side column and full width on /warden alike). */}
      <CardContent className="@container space-y-4 pt-2">
        <dl className="divide-y divide-border">
          {details.rows.map((row) => (
            <Field key={row.label} row={row} />
          ))}
          {details.copyTo && <CopyToField copyTo={details.copyTo} />}
        </dl>
        {details.sample && (
          <p className="border border-dashed border-border-strong bg-band px-4 py-3 text-[13px] leading-normal text-muted-foreground">
            Demo build - these are sample records until the institute&apos;s academic database is
            connected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A line under the title only when the details are *not* the record: a
 * record found needs no caption (the office asked for "From the institute's
 * academic database (Student)" to go, 30 Sep 2026), but a fallback to the
 * portal profile should still say so.
 */
function describeSource(user: Profile, details: AcademicDetails): string | null {
  const kind = details.kind ? ACADEMIC_KIND_LABELS[details.kind] : null;
  switch (details.status) {
    case "found":
      return null;
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
    <div className="grid min-w-0 gap-x-4 gap-y-0.5 py-2.5 @md:grid-cols-[minmax(8rem,34%)_1fr]">
      <dt className="text-[13px] font-semibold text-muted-foreground">{row.label}</dt>
      <dd className="break-words text-ink">
        {row.value ?? <span className="text-muted-foreground">Not on record</span>}
      </dd>
    </div>
  );
}

function CopyToField({ copyTo }: { copyTo: CopyTo }) {
  return (
    <div className="grid min-w-0 gap-x-4 gap-y-0.5 py-2.5 @md:grid-cols-[minmax(8rem,34%)_1fr]">
      <dt className="text-[13px] font-semibold text-muted-foreground">Copy to</dt>
      <dd className="break-words text-ink">
        {copyTo.entries.length === 0 ? (
          <span className="font-normal text-muted-foreground">{copyTo.emptyNote}</span>
        ) : (
          <ul className="space-y-0.5">
            {copyTo.entries.map((entry, i) => (
              <li key={entry.email ?? i}>
                {entry.name ?? entry.email}
                {entry.name && entry.email && (
                  <span className="font-normal text-muted-foreground"> - {entry.email}</span>
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
      <CardContent className="grid gap-4">
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
