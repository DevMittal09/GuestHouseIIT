import type { Profile, Role, StaffCategory } from "./types";

/**
 * Undoing a user import (14 Oct 2026).
 *
 * `lib/users-import.ts` plans an import and refuses it outright if any line is
 * wrong, so what reaches the store is valid. That was never the gap. The gap
 * was afterwards: an import **updates** people matched on `lower(email)`, and
 * until this module the previous values were not kept anywhere. The audit row
 * recorded the counts and the column list, so the office could see that 400
 * accounts had changed and not what any of them used to hold.
 *
 * Deleting the rows an import added was already possible (Users & Roles, tick,
 * Delete). Restoring the rows it **changed** was not possible at all, and that
 * is the dangerous half: a sheet that is a month out of date silently
 * overwrites every correction the office has made by hand since, including the
 * hostel a warden is scoped to and the unit an HOD is found through.
 *
 * So an import now writes down what it is about to do **before it does it**
 * (`DataStore.recordUserImport`), and this module turns that record back into
 * a list of writes. Three properties matter, and each is a deliberate choice:
 *
 * 1. **Only the fields an import can write are restored** ({@link
 *    UserImportFields}, the same eight `sameProfile` compares). A profile
 *    holds more than that, and an undo that wrote the whole row back would
 *    revert edits the import never made.
 * 2. **A row changed since the import is left alone and named.** The undo is
 *    not "make it look like last Tuesday"; it is "take back what this import
 *    did". If somebody has since corrected an account by hand, reverting it
 *    would destroy the newer, better value - so it becomes a conflict the
 *    operator reads, in the same spirit as `deleteUsersAction` naming back
 *    whoever it could not remove.
 * 3. **The record is written before the writes, not after.** An import that
 *    times out part-way through - the thing
 *    [04-production.md](../.memories/04-production.md) §1a.6 warns about -
 *    therefore still has a complete undo record, because the record never
 *    depended on the import finishing.
 *
 * Pure, so the console can show what an undo would do and the tests need no
 * store.
 */

/**
 * The fields a spreadsheet import may write, and the only ones an undo
 * restores. Deliberately the same eight that `sameProfile` and
 * `changedFields` compare in `lib/users-import.ts`: if a column is added to
 * the import, it belongs in all three.
 */
export type UserImportFields = {
  full_name: string;
  role: Role;
  hostel_name: string | null;
  department_or_club: string | null;
  roll_number: string | null;
  ldap_uid: string | null;
  staff_category: StaffCategory | null;
  unit_id: string | null;
};

/**
 * Where a batch got to.
 *
 * `applying` is written before the first profile is touched and is what a
 * timed-out import leaves behind, so a batch sitting in that state is the
 * signal to check it rather than an error in itself.
 */
export type UserImportStatus = "applying" | "applied" | "failed" | "reverted";

/** One account an import created. The id is minted before the insert. */
export type ImportedAccount = { id: string; email: string };

/** One account an import changed, with what it held and what it was given. */
export type ChangedAccount = {
  id: string;
  email: string;
  before: UserImportFields;
  after: UserImportFields;
};

/** One import, as stored (migration 32) - the undo record. */
export type UserImportBatch = {
  id: string;
  at: string;
  actor_id: string | null;
  /** Denormalized like `booking_logs.action_by_name`, so it survives the account. */
  actor_name: string;
  status: UserImportStatus;
  /** The columns the paste was read as, for the operator reading the list. */
  columns_used: string;
  added: ImportedAccount[];
  updated: ChangedAccount[];
  unchanged_count: number;
  error: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
  reverted_actor_name: string | null;
};

export type NewUserImportBatch = Omit<
  UserImportBatch,
  "id" | "at" | "reverted_at" | "reverted_by" | "reverted_actor_name"
>;

/** What `settleUserImport` may change once the writes are done, or have failed. */
export type UserImportSettlement = {
  status: UserImportStatus;
  error?: string | null;
  reverted_by?: string | null;
  reverted_actor_name?: string | null;
};

/** The eight import-writable fields of anything that has them, with nulls normalized. */
export function importFieldsOf(source: {
  full_name: string;
  role: Role;
  hostel_name?: string | null;
  department_or_club?: string | null;
  roll_number?: string | null;
  ldap_uid?: string | null;
  staff_category?: StaffCategory | null;
  unit_id?: string | null;
}): UserImportFields {
  return {
    full_name: source.full_name,
    role: source.role,
    hostel_name: source.hostel_name ?? null,
    department_or_club: source.department_or_club ?? null,
    roll_number: source.roll_number ?? null,
    ldap_uid: source.ldap_uid ?? null,
    staff_category: source.staff_category ?? null,
    unit_id: source.unit_id ?? null,
  };
}

const FIELD_LABELS: [keyof UserImportFields, string][] = [
  ["full_name", "Name"],
  ["role", "Role"],
  ["hostel_name", "Hostel"],
  ["department_or_club", "Dept / Club"],
  ["roll_number", "Roll No."],
  ["ldap_uid", "LDAP username"],
  ["staff_category", "Category"],
  ["unit_id", "Unit"],
];

/** Which of the eight differ, by the label the console already uses for each. */
export function differingFields(a: UserImportFields, b: UserImportFields): string[] {
  return FIELD_LABELS.filter(([key]) => a[key] !== b[key]).map(([, label]) => label);
}

export function sameImportFields(a: UserImportFields, b: UserImportFields): boolean {
  return differingFields(a, b).length === 0;
}

/** What an undo would do: restore these, remove those, and leave the rest named. */
export type UserImportRevertPlan = {
  /** Accounts to put back, with the values to write. */
  restore: { id: string; email: string; to: UserImportFields }[];
  /** Accounts the import created, to delete. */
  remove: ImportedAccount[];
  /**
   * Accounts the undo will **not** touch, and why - one line each. Non-empty
   * is normal and not a refusal: the rest of the plan still applies, the way
   * `deleteUsersAction` removes what it can and names what it cannot.
   */
  conflicts: string[];
};

/**
 * Turn an import's record back into a list of writes.
 *
 * `locked` is the console's own per-account rule (`userEditError`), passed in
 * rather than imported so this stays pure: a manager must not be able to undo
 * a developer's change to a developer's account just because an import made
 * it.
 */
export function planUserImportRevert(
  batch: Pick<UserImportBatch, "added" | "updated">,
  profiles: Profile[],
  locked?: (profile: Profile) => string | null
): UserImportRevertPlan {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const candidates: UserImportRevertPlan["restore"] = [];
  const restore: UserImportRevertPlan["restore"] = [];
  const remove: ImportedAccount[] = [];
  const conflicts: string[] = [];

  for (const changed of batch.updated) {
    const current = byId.get(changed.id);
    if (!current) {
      conflicts.push(`${changed.email} - the account has since been deleted`);
      continue;
    }
    const stop = locked?.(current);
    if (stop) {
      conflicts.push(`${current.email} - ${stop}`);
      continue;
    }
    const now = importFieldsOf(current);
    if (sameImportFields(now, changed.before)) {
      // Already holds what it held before the import. Nothing to put back:
      // somebody has undone this one by hand, or the import changed a field
      // that has since been set back.
      continue;
    }
    if (!sameImportFields(now, changed.after)) {
      conflicts.push(
        `${current.email} - changed since the import (${differingFields(now, changed.after).join(
          ", "
        )}), left as it is`
      );
      continue;
    }
    candidates.push({ id: changed.id, email: changed.email, to: changed.before });
  }

  /**
   * Second pass: a username the undo wants to give back may be held by an
   * account the undo is **not** touching.
   *
   * Two accounts swap usernames in one import and somebody then corrects one
   * of them by hand. The corrected one is left alone by the pass above, so it
   * keeps the username the import gave it - and the other one therefore
   * cannot have that username back, because `lower(ldap_uid)` is unique.
   *
   * Naming the row here rather than letting the write fail is what keeps the
   * undo from making things worse: releasing a username and then failing to
   * write the old one would leave that account unable to sign in at all. A
   * holder that **is** being restored is fine - it gives the username up first
   * ({@link uidsToRelease}).
   *
   * Found by running `supabase/repairs/2026-10-14-restore-user-import.sql`
   * against a throwaway Postgres, where the same case appears as a
   * `skip_reason`. The two implementations agree deliberately.
   */
  const restoring = new Set(candidates.map((c) => c.id));
  for (const candidate of candidates) {
    const wanted = candidate.to.ldap_uid?.toLowerCase();
    const holder = wanted
      ? profiles.find((p) => p.id !== candidate.id && p.ldap_uid?.toLowerCase() === wanted)
      : undefined;
    if (holder && !restoring.has(holder.id)) {
      conflicts.push(
        `${candidate.email} - LDAP username ${candidate.to.ldap_uid} is now held by ${holder.email}, left as it is`
      );
      continue;
    }
    restore.push(candidate);
  }

  for (const account of batch.added) {
    const current = byId.get(account.id);
    // Already gone - someone deleted it from Users & Roles. Not a conflict:
    // the end state is the one the undo is asking for.
    if (!current) continue;
    const stop = locked?.(current);
    if (stop) {
      conflicts.push(`${current.email} - ${stop}`);
      continue;
    }
    remove.push({ id: account.id, email: current.email });
  }

  return { restore, remove, conflicts };
}

/**
 * The accounts whose LDAP username has to be given up before the restores can
 * run.
 *
 * `lower(ldap_uid)` is unique, so two accounts that swapped usernames in one
 * import cannot be restored one at a time - the first write collides with the
 * second account, which still holds the username. The same two passes as
 * `importLdapUidsAction`, for the same reason, and only over the rows whose
 * username actually moves.
 */
export function uidsToRelease(
  restore: UserImportRevertPlan["restore"],
  profiles: Profile[]
): string[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return restore
    .filter((r) => {
      const current = byId.get(r.id)?.ldap_uid ?? null;
      return current !== null && current !== r.to.ldap_uid;
    })
    .map((r) => r.id);
}

/** "3 restored, 412 removed" - for the toast and the audit row. */
export function describeRevert(result: { restored: number; removed: number }): string {
  const parts = [
    result.restored > 0 ? `${result.restored} restored` : null,
    result.removed > 0 ? `${result.removed} removed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing to undo";
}

/** "412 added, 3 updated" with the role names spelled out, for the imports list. */
export function describeBatch(batch: UserImportBatch): string {
  const parts = [
    batch.added.length > 0 ? `${batch.added.length} added` : null,
    batch.updated.length > 0 ? `${batch.updated.length} updated` : null,
    batch.unchanged_count > 0 ? `${batch.unchanged_count} unchanged` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing changed";
}

/** Why this batch cannot be undone, or null when it can. */
export function revertBlocker(batch: UserImportBatch): string | null {
  if (batch.status === "reverted") {
    const who = batch.reverted_actor_name ? ` by ${batch.reverted_actor_name}` : "";
    return `That import was already undone${who}`;
  }
  if (batch.added.length === 0 && batch.updated.length === 0) {
    return "That import changed nothing";
  }
  return null;
}
