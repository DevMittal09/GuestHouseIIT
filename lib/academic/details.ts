import type { Profile } from "@/lib/types";
import { copyToFor as copyToRecipients, formRouteFor, type CopyToEntry } from "./copy-to";
import {
  academicRecordKindFor,
  academicRecordRows,
  COPY_TO_RULE,
  profileRows,
  type DetailRow,
} from "./fields";
import { academicRecordFor, isMockAcademicSource, type AcademicLookup } from "./index";
import type { AcademicRecordKind } from "./types";

export type { CopyToEntry };

export type CopyTo = {
  entries: CopyToEntry[];
  /** Shown in place of the list when it is empty. */
  emptyNote: string;
};

/** Everything the details card shows, resolved on the server. */
export type AcademicDetails = {
  kind: AcademicRecordKind | null;
  status: AcademicLookup["status"];
  /** The record's fields, or the portal profile's when there is no record. */
  rows: DetailRow[];
  /** Null for kinds of account that have no "Copy to". */
  copyTo: CopyTo | null;
  /** The record shown is one of the dummy ones. */
  sample: boolean;
};

export async function academicDetailsFor(
  profile: Profile,
  /** The faculty in-charge filling in a club's form, when that is who is. */
  raisedBy: Profile | null = null
): Promise<AcademicDetails> {
  const kind = academicRecordKindFor(profile.role);
  const lookup = await academicRecordFor(profile);
  const record = lookup.status === "found" ? lookup.record : null;
  return {
    kind,
    status: lookup.status,
    rows: record ? academicRecordRows(record) : profileRows(profile),
    copyTo: kind ? await copyToFor(profile, kind, raisedBy) : null,
    sample: record !== null && isMockAcademicSource(),
  };
}

async function copyToFor(
  profile: Profile,
  kind: AcademicRecordKind,
  raisedBy: Profile | null
): Promise<CopyTo | null> {
  if (COPY_TO_RULE[kind].length === 0) return null;
  // The same rule the staff mail uses for CC (`lib/academic/copy-to.ts`), for
  // the request as the form opens — the role's default booking type.
  const { entries, failed } = await copyToRecipients(profile, formRouteFor(profile, raisedBy));
  return {
    entries,
    emptyNote: failed
      ? "Could not be looked up right now."
      : "Nobody — this request goes straight to the Guest House Manager, or nobody is set up to approve it yet.",
  };
}
