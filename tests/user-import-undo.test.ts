import fs from "fs";
import { randomUUID } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { planUserImport, type UserImportContext } from "@/lib/users-import";
import {
  importFieldsOf,
  planUserImportRevert,
  revertBlocker,
  uidsToRelease,
  type UserImportBatch,
} from "@/lib/users-import-undo";
import type { DataStore } from "@/lib/store/types";
import type { Profile } from "@/lib/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * Undoing an import, end to end against a store (14 Oct 2026).
 *
 * `tests/user-import-idempotency.test.ts` proves that importing the same sheet
 * twice leaves one row with one id. This file proves the other half, the one
 * [04-production.md](../.memories/04-production.md) §1a.7 said outright was
 * missing: **what an import changed can be put back.**
 *
 * Deleting the rows an import added was always possible from Users & Roles.
 * Restoring the rows it *updated* was not possible at all - the previous
 * values were kept nowhere, and the audit row recorded only the counts. A
 * sheet a month out of date therefore overwrote every correction the office
 * had made by hand, including the hostel a warden is scoped to and the unit an
 * HOD is found through, with no way back.
 *
 * The tests below are the properties that matter at import time, and each one
 * is a thing that would otherwise be discovered on real data:
 *
 *   * the previous values are recorded **before** the writes, so an import
 *     that dies part-way is still undoable;
 *   * the undo restores only what the import changed;
 *   * an account corrected by hand since the import is **left alone and
 *     named**, never silently rolled back;
 *   * an account that cannot be deleted (it has a booking) is named, and the
 *     rest of the undo still runs;
 *   * undoing twice is refused.
 */

const EMPTY = {
  profiles: [] as Profile[],
  guest_houses: [],
  rooms: [],
  bookings: [] as { id: string; user_id: string }[],
  booking_rooms: [],
  booking_guests: [],
  booking_logs: [],
  hostels: ["Malhar", "Saveri"],
  units: [
    {
      id: "u-cse",
      name: "Computer Science",
      kind: "department",
      parent_id: null,
      head_id: null,
      acting_head_id: null,
    },
  ],
};

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  db = useThrowawayMockDb(EMPTY);
  const { MockStore } = await import("@/lib/store/mock");
  store = new MockStore();
});
afterAll(() => db.cleanup());

async function context(): Promise<UserImportContext> {
  return {
    profiles: await store.listProfiles(),
    assignable: ["student", "employee", "warden"],
    hostels: await store.listHostels(),
    units: await store.listUnits(),
  };
}

/**
 * Apply a paste exactly as `importUsersAction` does: mint the ids, record the
 * batch **first**, then write. `stopAfter` leaves the writes unfinished, which
 * is how the "timed out part-way" case is reproduced without a timeout.
 */
async function apply(text: string, stopAfter?: number): Promise<UserImportBatch> {
  const plan = planUserImport(text, await context());
  expect(plan.problems).toEqual([]);
  const added = plan.added.map((row) => ({ ...row, id: randomUUID() }));
  const batch = await store.recordUserImport({
    actor_id: null,
    actor_name: "Test Operator",
    status: "applying",
    columns_used: plan.columns.join(", "),
    added: added.map(({ id, email }) => ({ id, email })),
    updated: plan.updated.map(({ id, before, row }) => ({
      id,
      email: row.email,
      before: importFieldsOf(before),
      after: importFieldsOf(row),
    })),
    unchanged_count: plan.unchanged,
    error: null,
  });
  let written = 0;
  for (const { id, before, row } of plan.updated) {
    if (before.ldap_uid && (before.ldap_uid ?? null) !== row.ldap_uid) {
      await store.updateProfile(id, { ldap_uid: null });
    }
  }
  if (stopAfter === undefined) await store.createProfiles(added);
  for (const { id, row } of plan.updated) {
    if (stopAfter !== undefined && written >= stopAfter) break;
    await store.updateProfile(id, row);
    written += 1;
  }
  await store.settleUserImport(batch.id, {
    status: stopAfter === undefined ? "applied" : "failed",
    error: stopAfter === undefined ? null : "stopped for the test",
  });
  return (await store.getUserImport(batch.id))!;
}

/** Undo one, exactly as `revertUserImportAction` does. */
async function revert(batchId: string, locked?: (p: Profile) => string | null) {
  const batch = (await store.getUserImport(batchId))!;
  const plan = planUserImportRevert(batch, await store.listProfiles(), locked);
  const conflicts = [...plan.conflicts];
  let restored = 0;
  let removed = 0;
  for (const account of plan.remove) {
    try {
      await store.deleteProfile(account.id);
      removed += 1;
    } catch (e) {
      conflicts.push(`${account.email} - ${e instanceof Error ? e.message : "no"}`);
    }
  }
  const fresh = await store.listProfiles();
  for (const id of uidsToRelease(plan.restore, fresh)) {
    await store.updateProfile(id, { ldap_uid: null }).catch(() => undefined);
  }
  for (const row of plan.restore) {
    await store.updateProfile(row.id, row.to);
    restored += 1;
  }
  await store.settleUserImport(batchId, {
    status: "reverted",
    reverted_by: null,
    reverted_actor_name: "Test Operator",
  });
  return { restored, removed, conflicts };
}

const A = "undo.anjali@smail.iitpkd.ac.in";
const B = "undo.rahul@smail.iitpkd.ac.in";
const C = "undo.priya@iitpkd.ac.in";

const FIRST = [
  "email, full_name, role, hostel_name, roll_number, ldap_uid",
  `${A}, Anjali Menon, student, Malhar, 112201001, undoanjali`,
  `${B}, Rahul Nair, student, Saveri, 142202014, undorahul`,
].join("\n");

/** The stale sheet: it moves Anjali to the wrong hostel and renames Rahul. */
const STALE = [
  "email, full_name, role, hostel_name",
  `${A}, Anjali Menon, student, Saveri`,
  `${B}, R. Nair, student, Saveri`,
  `${C}, Dr Priya Sharma, employee, `,
].join("\n");

async function find(email: string): Promise<Profile | undefined> {
  return (await store.listProfiles()).find((p) => p.email.toLowerCase() === email);
}

/**
 * Each test starts from the same two imported accounts and no batches.
 *
 * Written as a file reset rather than as undo-what-the-last-test-did, because
 * a test that leans on the undo to clean up after itself cannot then be
 * trusted to be testing it. `loadDb()` self-heals the seeded personas back in,
 * which is why every assertion here is keyed on these three addresses.
 */
beforeEach(async () => {
  fs.writeFileSync(db.file, JSON.stringify(EMPTY));
  await apply(FIRST);
});

describe("an import records what it is about to change", () => {
  it("writes the batch before the writes, so a part-way import is still undoable", async () => {
    // Two updates planned, only the first written - the shape of a timeout.
    const batch = await apply(STALE, 1);

    expect(batch.status).toBe("failed");
    // The record names everything the import intended, not only what landed.
    expect(batch.updated).toHaveLength(2);
    expect(batch.added).toHaveLength(1);
    expect((await find(A))?.hostel_name).toBe("Saveri");
    // Rahul was never reached, and neither was the new account.
    expect((await find(B))?.full_name).toBe("Rahul Nair");
    expect(await find(C)).toBeUndefined();

    const result = await revert(batch.id);
    expect(result.restored).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect((await find(A))?.hostel_name).toBe("Malhar");
  });

  it("keeps the previous value of every field it overwrites", async () => {
    const batch = await apply(STALE);
    const anjali = batch.updated.find((u) => u.email.toLowerCase() === A)!;

    expect(anjali.before.hostel_name).toBe("Malhar");
    expect(anjali.after.hostel_name).toBe("Saveri");
    // A column the paste does not carry is left alone, so it is on neither side.
    expect(anjali.before.ldap_uid).toBe("undoanjali");
    expect(anjali.after.ldap_uid).toBe("undoanjali");
  });
});

describe("undoing one", () => {
  it("restores what it changed and removes what it added, keeping ids", async () => {
    const before = await find(A);
    const batch = await apply(STALE);
    expect((await find(A))?.hostel_name).toBe("Saveri");
    expect((await find(B))?.full_name).toBe("R. Nair");
    expect(await find(C)).toBeDefined();

    const result = await revert(batch.id);

    expect(result).toMatchObject({ restored: 2, removed: 1, conflicts: [] });
    const after = await find(A);
    expect(after?.hostel_name).toBe("Malhar");
    expect(after?.full_name).toBe("Anjali Menon");
    // The id never moves - 19 foreign keys point at it.
    expect(after?.id).toBe(before?.id);
    expect((await find(B))?.full_name).toBe("Rahul Nair");
    expect(await find(C)).toBeUndefined();
  });

  it("refuses a second undo", async () => {
    const batch = await apply(STALE);
    await revert(batch.id);
    const settled = (await store.getUserImport(batch.id))!;

    expect(settled.status).toBe("reverted");
    expect(revertBlocker(settled)).toMatch(/already undone/i);
    expect(settled.reverted_at).not.toBeNull();
  });

  it("leaves an account corrected since the import alone, and names it", async () => {
    const batch = await apply(STALE);
    // The office fixes Anjali's hostel by hand afterwards; the undo must not
    // throw that away in the name of putting things back.
    const anjali = (await find(A))!;
    await store.updateProfile(anjali.id, { hostel_name: "Malhar", full_name: "Anjali R Menon" });

    const result = await revert(batch.id);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain(A);
    expect(result.conflicts[0]).toMatch(/changed since the import/);
    expect((await find(A))?.full_name).toBe("Anjali R Menon");
    // The rest of the undo still ran.
    expect((await find(B))?.full_name).toBe("Rahul Nair");
    expect(await find(C)).toBeUndefined();
  });

  it("names an added account it cannot delete, and still undoes the rest", async () => {
    const batch = await apply(STALE);
    const priya = (await find(C))!;
    // Someone has already booked on the imported account. The store refuses to
    // delete anybody with a booking, and that refusal must not stop the undo.
    const raw = JSON.parse(fs.readFileSync(db.file, "utf8"));
    raw.bookings.push({ id: "b-undo-1", user_id: priya.id });
    fs.writeFileSync(db.file, JSON.stringify(raw));

    const result = await revert(batch.id);

    expect(result.removed).toBe(0);
    expect(result.restored).toBe(2);
    expect(result.conflicts.join(" ")).toContain(C);
    expect(result.conflicts.join(" ")).toMatch(/bookings/);
    expect(await find(C)).toBeDefined();
    expect((await find(A))?.hostel_name).toBe("Malhar");
  });
});

describe("the rules the undo will not bend", () => {
  it("skips an account this console user may not edit", async () => {
    const batch = await apply(STALE);
    const plan = planUserImportRevert(batch, await store.listProfiles(), (p) =>
      p.email.toLowerCase() === A ? "Only a developer can edit this account" : null
    );

    expect(plan.restore.map((r) => r.email.toLowerCase())).not.toContain(A);
    expect(plan.conflicts.join(" ")).toContain("Only a developer can edit this account");
  });

  it("releases an LDAP username before restoring it to its old holder", async () => {
    // Two accounts swap usernames in one paste. `lower(ldap_uid)` is unique,
    // so restoring them one at a time collides unless the current holder
    // gives it up first - the same trap the import itself has.
    const swap = [
      "email, ldap_uid",
      `${A}, undorahul`,
      `${B}, undoanjali`,
    ].join("\n");
    const batch = await apply(swap);
    expect((await find(A))?.ldap_uid).toBe("undorahul");

    const result = await revert(batch.id);

    expect(result.restored).toBe(2);
    expect(result.conflicts).toEqual([]);
    expect((await find(A))?.ldap_uid).toBe("undoanjali");
    expect((await find(B))?.ldap_uid).toBe("undorahul");
  });

  it("names the other half of a swap when one half was corrected by hand", async () => {
    /**
     * Found by running `supabase/repairs/2026-10-14-restore-user-import.sql`
     * against a throwaway Postgres (14 Oct 2026). Two accounts swap usernames
     * in one import; somebody then corrects one of them by hand, so the undo
     * must leave that one alone - which means the **other** one cannot have
     * its old username back either, because the account holding it is staying
     * as it is. The unique index refuses it, and the right outcome is to name
     * that row, not to fail the undo.
     */
    const swap = ["email, ldap_uid", `${A}, undorahul`, `${B}, undoanjali`].join("\n");
    const batch = await apply(swap);
    const anjali = (await find(A))!;
    // The hand correction: Anjali keeps the username the import gave her.
    await store.updateProfile(anjali.id, { full_name: "Anjali R Menon" });

    const result = await revert(batch.id);

    // Anjali is left alone, and Rahul cannot be given `undoanjali` back.
    expect(result.restored).toBe(0);
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts.join(" ")).toMatch(/changed since the import/);
    expect(result.conflicts.join(" ")).toMatch(/LDAP username/);
    expect((await find(A))?.ldap_uid).toBe("undorahul");
    expect((await find(B))?.ldap_uid).toBe("undoanjali");
  });

  it("does nothing for a batch that changed nothing", () => {
    const empty: UserImportBatch = {
      id: "batch-0",
      at: "2026-10-14T00:00:00.000Z",
      actor_id: null,
      actor_name: "Test Operator",
      status: "applied",
      columns_used: "email",
      added: [],
      updated: [],
      unchanged_count: 12,
      error: null,
      reverted_at: null,
      reverted_by: null,
      reverted_actor_name: null,
    };
    expect(revertBlocker(empty)).toMatch(/changed nothing/);
  });
});

describe("createProfiles", () => {
  it("writes the whole chunk or none of it", async () => {
    const taken = (await store.listProfiles())[0];
    const before = (await store.listProfiles()).length;

    await expect(
      store.createProfiles([
        {
          id: randomUUID(),
          email: "undo.fresh@iitpkd.ac.in",
          full_name: "Fresh Person",
          role: "employee",
          hostel_name: null,
          department_or_club: null,
          roll_number: null,
          ldap_uid: null,
          unit_id: null,
          staff_category: null,
        },
        // Second row collides with somebody already on the list.
        {
          id: randomUUID(),
          email: taken.email,
          full_name: "Duplicate Person",
          role: "employee",
          hostel_name: null,
          department_or_club: null,
          roll_number: null,
          ldap_uid: null,
          unit_id: null,
          staff_category: null,
        },
      ])
    ).rejects.toThrow(/already exists/);

    expect((await store.listProfiles()).length).toBe(before);
    expect(await find("undo.fresh@iitpkd.ac.in")).toBeUndefined();
  });
});
