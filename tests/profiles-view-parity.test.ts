import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planUserImport, type UserImportContext } from "@/lib/users-import";
import type { DataStore } from "@/lib/store/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * **What a profile write reads back as.**
 *
 * Migration 37 moved a person's hostel, department, roll number and staff
 * category onto a read path - `profiles_v` in Postgres, `resolveComputed()` in
 * the mock store - that resolves them from the institute tables. Both resolvers
 * **coalesce**: the institute tables win where they hold a row for that person,
 * and the column stored on `profiles` answers where they do not.
 *
 * That fallback is not a nicety, and it has been got wrong twice - once in the
 * SQL view and once in the mock store. Reading the institute tables *only*
 * breaks three things at once, none of which reports an error:
 *
 *   * **the import stops being idempotent.** A value it has just written reads
 *     back as null, so the next paste of the same sheet sees every row as
 *     changed. `tests/user-import-idempotency.test.ts` did not catch it,
 *     because its sheet carries no roll number.
 *   * **a warden loses their scope.** `canReview()` and `routeFor()` read
 *     `profile.hostel_name`; on a project where the institute tables are
 *     empty - which is every project until the office imports them - a
 *     student's request would silently stop routing to their Assistant Warden.
 *   * **the console appears to do nothing.** Users & Roles writes the stored
 *     column; the row then reads back without it.
 *
 * So this file asserts the property directly: **whatever is written to a
 * profile is what comes back out of it**, with no institute row involved.
 */

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  db = useThrowawayMockDb();
  const { MockStore } = await import("@/lib/store/mock");
  store = new MockStore();
});
afterAll(() => db.cleanup());

describe("a profile reads back what was written to it", () => {
  it("keeps a roll number, a hostel and a department with no institute row", async () => {
    const written = await store.createProfile({
      email: "parity.one@smail.iitpkd.ac.in",
      full_name: "Parity One",
      role: "student",
      hostel_name: "Malhar",
      roll_number: "990000911",
      department_or_club: null,
      ldap_uid: "990000911",
      unit_id: null,
    });

    const read = await store.getProfile(written.id);
    expect(read?.roll_number).toBe("990000911");
    expect(read?.hostel_name).toBe("Malhar");
    expect(read?.ldap_uid).toBe("990000911");

    // And through the list, which is what the console and the import read.
    const listed = (await store.listProfiles()).find((p) => p.id === written.id);
    expect(listed?.roll_number).toBe("990000911");
    expect(listed?.hostel_name).toBe("Malhar");
  });

  it("keeps a warden's hostel, which is their whole scope", async () => {
    const warden = await store.createProfile({
      email: "parity.warden@iitpkd.ac.in",
      full_name: "Parity Warden",
      role: "warden",
      hostel_name: "Saveri",
      department_or_club: null,
      roll_number: null,
      ldap_uid: null,
      unit_id: null,
    });
    expect((await store.getProfile(warden.id))?.hostel_name).toBe("Saveri");
  });

  it("keeps an employee's staff category", async () => {
    const faculty = await store.createProfile({
      email: "parity.faculty@iitpkd.ac.in",
      full_name: "Parity Faculty",
      role: "employee",
      hostel_name: null,
      department_or_club: "Civil Engineering",
      roll_number: null,
      ldap_uid: null,
      unit_id: null,
      staff_category: "faculty",
    });
    const read = await store.getProfile(faculty.id);
    expect(read?.staff_category).toBe("faculty");
    expect(read?.department_or_club).toBe("Civil Engineering");
  });
});

describe("so the institute's sheet can be pasted twice", () => {
  // The exact sequence `e2e/ninth-round.spec.ts` walks: a sheet carrying a
  // roll number for a student and for an employee, imported and then pasted
  // again. The second plan must change nothing.
  const PASTE = [
    "email, name, roll_number, role",
    "990000901@smail.iitpkd.ac.in, Imported One, 990000901, student",
    "imported.two@iitpkd.ac.in, Imported Two, EMP9002, employee",
  ].join("\n");

  async function context(): Promise<UserImportContext> {
    return {
      profiles: await store.listProfiles(),
      assignable: ["student", "employee", "warden", "official"],
      hostels: await store.listHostels(),
      units: await store.listUnits(),
      // What `userImportContext` passes: every address must be the
      // institute's, and a student's roll number is read off theirs.
      instituteOnly: true,
    };
  }

  it("adds both the first time and changes neither the second", async () => {
    const first = planUserImport(PASTE, await context());
    expect(first.problems).toEqual([]);
    expect(first.added).toHaveLength(2);
    for (const row of first.added) await store.createProfile(row);

    const second = planUserImport(PASTE, await context());
    expect(second.problems).toEqual([]);
    expect(second.added).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged).toBe(2);
  });
});
