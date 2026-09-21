import { reviewersOfRequester } from "@/lib/mail/recipients";
import { ROLE_LABELS, type Profile, type Role } from "@/lib/types";
import { initialStatusFor, REVIEWER_STAGE } from "@/lib/workflow";
import {
  academicRecordKindFor,
  academicRecordRows,
  COPY_TO_RULE,
  profileRows,
  type DetailRow,
} from "./fields";
import { academicRecordFor, isMockAcademicSource, type AcademicLookup } from "./index";
import type { AcademicRecord, AcademicRecordKind } from "./types";

export type CopyToEntry = { name: string | null; email: string | null };

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

export async function academicDetailsFor(profile: Profile): Promise<AcademicDetails> {
  const kind = academicRecordKindFor(profile.role);
  const lookup = await academicRecordFor(profile);
  const record = lookup.status === "found" ? lookup.record : null;
  return {
    kind,
    status: lookup.status,
    rows: record ? academicRecordRows(record) : profileRows(profile),
    copyTo: kind ? await copyToFor(profile, kind, record) : null,
    sample: record !== null && isMockAcademicSource(),
  };
}

async function copyToFor(
  profile: Profile,
  kind: AcademicRecordKind,
  record: AcademicRecord | null
): Promise<CopyTo | null> {
  const rule = COPY_TO_RULE[kind];
  if (rule === "head_of_department") {
    const head =
      record?.kind === "office" && (record.head_name || record.head_email)
        ? [{ name: record.head_name, email: record.head_email }]
        : [];
    return { entries: head, emptyNote: "Not on record" };
  }
  if (rule === "approver") {
    // Whoever approves the request on the portal, found the way the request
    // itself is routed — so the card cannot name someone the request will
    // never reach. It follows the portal profile, not the academic record.
    const status = initialStatusFor(profile.role);
    const approverRole = (Object.keys(REVIEWER_STAGE) as Role[]).find(
      (role) => REVIEWER_STAGE[role] === status
    );
    const scope =
      approverRole === "warden"
        ? (profile.hostel_name ?? "your hostel")
        : (profile.department_or_club ?? "you");
    try {
      const approvers = await reviewersOfRequester(profile, status);
      return {
        entries: approvers.map((p) => ({ name: p.full_name, email: p.email })),
        emptyNote: `No ${approverRole ? ROLE_LABELS[approverRole] : "approver"} is set up on the portal for ${scope} yet.`,
      };
    } catch (e) {
      console.error("[academic] copy-to lookup failed:", e instanceof Error ? e.message : e);
      return { entries: [], emptyNote: "Could not be looked up right now." };
    }
  }
  return null;
}
