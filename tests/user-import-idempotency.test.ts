import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planUserImport, type UserImportContext } from "@/lib/users-import";
import type { DataStore } from "@/lib/store/types";
import type { Profile } from "@/lib/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * Repeatable imports of the institute's user list, end to end against a store.
 *
 * `tests/ninth-round.test.ts` covers `planUserImport`'s own rules - the header
 * line, the column order, the refusals. This file covers the property the
 * **college's repeated spreadsheets** depend on, which is a different claim
 * and needs a store to make: **a person who is imported twice is one row with
 * one id, for ever.**
 *
 * That matters because 19 foreign keys across 11 tables point at
 * `profiles.id` - bookings, approvals, logs, invoices, sessions, units'
 * heads and Faculty Advisors. If a re-import inserted a second row, or
 * reassigned an id, the booking history of everyone in the sheet would
 * detach in one press. It is the single most expensive thing that could go
 * wrong with the import, and it is also invisible: nothing on screen would
 * say so.
 *
 * Written 13 Oct 2026, preparing for the import.
 */

/**
 * The mock store's `loadDb()` **self-heals**: it adds any missing seeded
 * persona to the file it loads (AGENTS.md, "Two backends, one interface"). So
 * this fixture is never the whole table, and the assertions below are deltas
 * over whatever it holds, keyed on addresses the seed does not use.
 */
const EMPTY = {
  profiles: [] as Profile[],
  guest_houses: [],
  rooms: [],
  bookings: [],
  booking_rooms: [],
  booking_guests: [],
  booking_logs: [],
  hostels: ["Malhar", "Saveri"],
  units: [
    { id: "u-cse", name: "Computer Science", kind: "department", parent_id: null, head_id: null, acting_head_id: null },
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

/** The context the console builds, from whatever the store holds right now. */
async function context(): Promise<UserImportContext> {
  return {
    profiles: await store.listProfiles(),
    assignable: ["student", "employee", "warden"],
    hostels: await store.listHostels(),
    units: await store.listUnits(),
  };
}

/** Apply a plan the way `importUsersAction` does. */
async function apply(text: string) {
  const plan = planUserImport(text, await context());
  expect(plan.problems).toEqual([]);
  for (const row of plan.added) await store.createProfile(row);
  for (const { id, row } of plan.updated) await store.updateProfile(id, row);
  return plan;
}

// The college's sheet, as the office would paste it. Addresses chosen so they
// cannot collide with a seeded demo persona.
const A = "imp001@smail.iitpkd.ac.in";
const B = "imp002@smail.iitpkd.ac.in";
const C = "imp.faculty@iitpkd.ac.in";
const D = "imp.newcomer@iitpkd.ac.in";

const SHEET = [
  "email, full_name, role, hostel_name, roll_number, ldap_uid",
  `${A}, Anjali Menon, student, Malhar, 112201001, imp001`,
  `${B}, Rahul Nair, student, Saveri, 142202014, imp002`,
  `${C}, Dr Priya Sharma, employee, , , impfaculty`,
].join("\n");

/** Only the rows this file is about. */
async function mine(): Promise<Profile[]> {
  const sheet = new Set([A, B, C, D]);
  return (await store.listProfiles()).filter((p) => sheet.has(p.email.toLowerCase()));
}

describe("importing the same sheet twice", () => {
  it("adds everyone the first time", async () => {
    expect(await mine()).toHaveLength(0);
    const plan = await apply(SHEET);
    expect(plan.added).toHaveLength(3);
    expect(plan.updated).toHaveLength(0);
    expect(await mine()).toHaveLength(3);
  });

  it("changes nothing the second time, and adds nobody", async () => {
    const before = await store.listProfiles();
    const plan = planUserImport(SHEET, await context());

    expect(plan.problems).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.updated).toEqual([]);
    expect(plan.unchanged).toBe(3);

    // Nothing to apply, so nothing can drift.
    expect(await store.listProfiles()).toEqual(before);
  });

  it("keeps every id stable, which is what the foreign keys need", async () => {
    const before = new Map((await mine()).map((p) => [p.email, p.id]));

    // An updated sheet: a corrected name, a new hostel, and one new person.
    const updated = [
      "email, full_name, role, hostel_name, roll_number, ldap_uid",
      `${A}, Anjali R Menon, student, Saveri, 112201001, imp001`,
      `${B}, Rahul Nair, student, Saveri, 142202014, imp002`,
      `${C}, Dr Priya Sharma, employee, , , impfaculty`,
      `${D}, New Comer, student, Malhar, 112301099, impnewcomer`,
    ].join("\n");

    const plan = await apply(updated);
    expect(plan.added).toHaveLength(1);
    expect(plan.updated).toHaveLength(1);
    expect(plan.unchanged).toBe(2);

    const after = new Map((await mine()).map((p) => [p.email, p.id]));
    for (const [email, id] of before) {
      expect(after.get(email), `${email} kept its id`).toBe(id);
    }
    expect(after.size).toBe(4);

    const anjali = (await mine()).find((p) => p.email === A)!;
    expect(anjali.full_name).toBe("Anjali R Menon");
    expect(anjali.hostel_name).toBe("Saveri");
  });

  it("matches on the email case-insensitively, so a re-cased sheet is not a new person", async () => {
    const count = (await mine()).length;
    const recased = [
      "email, full_name, role, hostel_name, roll_number, ldap_uid",
      `${C.toUpperCase()}, Dr Priya Sharma, employee, , , impfaculty`,
    ].join("\n");

    const plan = planUserImport(recased, await context());
    expect(plan.problems).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect((await mine()).length).toBe(count);
  });
});

describe("what a partial sheet may and may not do", () => {
  it("leaves a column the paste does not carry alone, rather than clearing it", async () => {
    // A sheet of email and name only - the case that would otherwise wipe
    // everyone's hostel, roll number and LDAP username.
    const thin = ["email, full_name", `${A}, Anjali R Menon`].join("\n");

    const plan = planUserImport(thin, await context());
    expect(plan.problems).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.unchanged).toBe(1);

    const anjali = (await mine()).find((p) => p.email === A)!;
    expect(anjali.hostel_name).toBe("Saveri");
    expect(anjali.roll_number).toBe("112201001");
    expect(anjali.ldap_uid).toBe("imp001");
  });

  it("refuses a hostel that is not on record rather than inventing one", async () => {
    const plan = planUserImport(
      ["email, full_name, role, hostel_name", "x@iitpkd.ac.in, X Y, student, Nowhere"].join("\n"),
      await context()
    );
    expect(plan.problems.join(" ")).toMatch(/"Nowhere" is not a hostel on record/);
    expect(plan.added).toEqual([]);
  });

  it("refuses a unit that is not on record rather than inventing one", async () => {
    const plan = planUserImport(
      ["email, full_name, role, unit", "x@iitpkd.ac.in, X Y, employee, Astrophysics"].join("\n"),
      await context()
    );
    expect(plan.problems.join(" ")).toMatch(
      /"Astrophysics" is not a department, club or office on record/
    );
    expect(plan.added).toEqual([]);
  });
});

describe("the store's own duplicate guard, behind the plan", () => {
  it("refuses a second profile with the same email even if a plan asked for one", async () => {
    // `planUserImport` would never produce this - the guard is here because
    // the plan is not the only caller, and because a concurrent import must
    // not be able to make two rows for one person.
    await expect(
      store.createProfile({
        email: C.toUpperCase(),
        full_name: "Impostor",
        role: "student",
        hostel_name: null,
        department_or_club: null,
        roll_number: null,
        ldap_uid: null,
        unit_id: null,
        staff_category: null,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("refuses to give one LDAP username to two accounts", async () => {
    await expect(
      store.createProfile({
        email: "someone.else@iitpkd.ac.in",
        full_name: "Someone Else",
        role: "employee",
        hostel_name: null,
        department_or_club: null,
        roll_number: null,
        ldap_uid: "impfaculty",
        unit_id: null,
        staff_category: null,
      })
    ).rejects.toThrow();
  });
});
