import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ruleMatches, type ApprovalRouteRule } from "@/lib/approval-routes";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { DEFAULT_RULES } from "@/lib/settings";
import { seedGuestHouses, seedProfiles } from "@/lib/store/seed";
import type { DataStore } from "@/lib/store/types";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import type { Profile, Role } from "@/lib/types";
import {
  emailFormatError,
  rollNumberFromEmail,
  batchGroupName,
  copyToAddressError,
  copyToRuleFor,
  isLoginBlocked,
  parseIdentifiers,
  planAccessChange,
  planGroupMembers,
  signInRefusal,
  studyYear,
  studyYearLabel,
  userGroupSchema,
} from "@/lib/user-groups";
import { planUserImport } from "@/lib/users-import";
import { importFieldsOf, planUserImportRevert } from "@/lib/users-import-undo";
import { useThrowawayMockDb } from "./helpers";

/**
 * **User groups and who may sign in** (5 Nov 2026, the owner). The rules on
 * plain data, then the two writes through the mock store.
 */

const person = (over: Partial<Profile> & { id: string; email: string }): Profile => ({
  full_name: over.id,
  role: "student",
  account_status: "active",
  ldap_uid: null,
  hostel_name: null,
  department_or_club: null,
  roll_number: null,
  ...over,
});

const anjali = person({ id: "a", email: "112201001@smail.iitpkd.ac.in", roll_number: "112201001", group_id: "g1" });
const rahul = person({ id: "r", email: "142202014@smail.iitpkd.ac.in", roll_number: "142202014" });
const manager = person({ id: "m", email: "ghm@iitpkd.ac.in", role: "gh_manager" });
const PROFILES = [anjali, rahul, manager];
const CONTEXT = { profiles: PROFILES, actorId: "m" };

describe("a student group is a programme and a batch", () => {
  const input = {
    name: "",
    role: "student",
    programme: "BTech",
    batch_year: 2023,
    prefill_copy_to: [],
    allowed_copy_to: [],
  };

  it("is named from them, so no two groups spell one batch apart", () => {
    const parsed = userGroupSchema.parse({ ...input, name: "anything typed" });
    expect(parsed.name).toBe("B.Tech 2023 batch");
    expect(batchGroupName("BTech", 2022)).toBe("B.Tech 2022 batch");
    expect(batchGroupName("PhD", 2022, "jan")).toBe("PhD Jan 2022 batch");
  });

  it("asks MS and PhD which intake, and nobody else", () => {
    const research = { ...input, programme: "PhD" };
    expect(userGroupSchema.safeParse(research).success).toBe(false);
    const parsed = userGroupSchema.parse({ ...research, intake: "jan" });
    expect(parsed.name).toBe("PhD Jan 2023 batch");
    expect(parsed.intake).toBe("jan");
    expect(userGroupSchema.parse({ ...input, programme: "MS", intake: "aug" }).name).toBe("MS Aug 2023 batch");
    // A B.Tech batch has one intake, whatever a crafted request says.
    expect(userGroupSchema.parse({ ...input, intake: "jan" })).toMatchObject({
      name: "B.Tech 2023 batch",
      intake: null,
    });
  });

  it("counts an MS or PhD batch from the month it joined", () => {
    const at = (date: string) => new Date(`${date}T12:00:00+05:30`);
    expect(studyYear(2024, at("2024-12-31"), "jan")).toBe(1);
    expect(studyYear(2024, at("2025-01-01"), "jan")).toBe(2);
    expect(studyYear(2024, at("2025-07-31"), "aug")).toBe(1);
    expect(studyYear(2024, at("2025-08-01"), "aug")).toBe(2);
    expect(studyYearLabel({ programme: "PhD", batch_year: 2024, intake: "jan" }, at("2026-11-05"))).toBe("3rd year");
    expect(studyYearLabel({ programme: "PhD", batch_year: 2024, intake: "aug" }, at("2026-11-05"))).toBe("3rd year");
    expect(studyYearLabel({ programme: "MS", batch_year: 2025, intake: "aug" }, at("2026-07-15"))).toBe("1st year");
  });

  it("needs both, and a named group needs a name", () => {
    expect(userGroupSchema.safeParse({ ...input, batch_year: null }).success).toBe(false);
    const named = { ...input, role: "employee", programme: null, batch_year: null };
    expect(userGroupSchema.safeParse(named).success).toBe(false);
    expect(userGroupSchema.parse({ ...named, name: "Faculty" }).programme).toBeNull();
  });

  it("can never hand out the developer role", () => {
    const parsed = userGroupSchema.safeParse({ ...input, role: "developer", programme: null, batch_year: null, name: "Root" });
    expect(parsed.success).toBe(false);
  });

  it("works out the year, turning over in July", () => {
    expect(studyYear(2023, new Date("2024-06-30T12:00:00+05:30"))).toBe(1);
    expect(studyYear(2023, new Date("2024-07-01T12:00:00+05:30"))).toBe(2);
    const on = new Date("2026-11-05T12:00:00+05:30");
    expect(studyYearLabel({ programme: "BTech", batch_year: 2023 }, on)).toBe("4th year");
    expect(studyYearLabel({ programme: "MTech", batch_year: 2023 }, on)).toBe("past its 2 years");
    // A research degree has no fixed end, and a named group has no year.
    expect(studyYearLabel({ programme: "PhD", batch_year: 2020 }, on)).toBe("7th year");
    expect(studyYearLabel({ programme: null, batch_year: null }, on)).toBeNull();
  });

  it("refuses a copy address off the institute's domain", () => {
    const result = userGroupSchema.safeParse({ ...input, prefill_copy_to: ["someone@gmail.com"] });
    expect(result.success).toBe(false);
    expect(
      userGroupSchema.parse({ ...input, allowed_copy_to: ["Dean@IITPKD.ac.in", "dean@iitpkd.ac.in", "x@smail.iitpkd.ac.in"] })
        .allowed_copy_to
    ).toEqual(["dean@iitpkd.ac.in", "x@smail.iitpkd.ac.in"]);
  });
});

describe("only IIT Palakkad addresses may sign in", () => {
  it("refuses any other address, whatever else is true of the account", () => {
    expect(signInRefusal({ email: "priya@iitpkd.ac.in" })).toBeNull();
    expect(signInRefusal({ email: "112201001@smail.iitpkd.ac.in" })).toBeNull();
    expect(signInRefusal({ email: "someone@gmail.com" })).toContain("Only IIT Palakkad");
    // Not fooled by a lookalike domain.
    expect(signInRefusal({ email: "a@iitpkd.ac.in.evil.com" })).toContain("Only IIT Palakkad");
    expect(signInRefusal({ email: "a@fakeiitpkd.ac.in" })).toContain("Only IIT Palakkad");
  });

  it("still refuses a blocked institute account", () => {
    expect(signInRefusal({ email: "a@iitpkd.ac.in", login_disabled_at: "2026-11-05T00:00:00Z" })).toContain(
      "has ended"
    );
  });

  it("is what every import checks, with or without a group", () => {
    const plan = planUserImport("email,full_name\na@gmail.com,A Person", {
      profiles: [],
      assignable: ["student"],
      hostels: [],
      units: [],
      instituteOnly: true,
    });
    expect(plan.problems[0]).toContain("not an IIT Palakkad address");
  });

  it("seeds no account that could not sign in", () => {
    expect(seedProfiles.filter((p) => signInRefusal(p))).toEqual([]);
  });
});

describe("the institute's two kinds of address", () => {
  it("are the only two domains that may sign in", () => {
    expect(signInRefusal({ email: "a@cse.iitpkd.ac.in" })).toContain("Only IIT Palakkad");
    expect(signInRefusal({ email: "a@smail.iitpkd.ac.in.evil.com" })).toContain("Only IIT Palakkad");
  });

  it("are a student's roll number at smail, and everyone else's name at iitpkd", () => {
    expect(emailFormatError("student", "112301001@smail.iitpkd.ac.in", "112301001")).toBeNull();
    expect(emailFormatError("student", "112301001@SMAIL.iitpkd.ac.in", null)).toBeNull();
    expect(emailFormatError("student", "anjali@iitpkd.ac.in", null)).toContain("<roll number>@smail");
    expect(emailFormatError("student", "112301001@smail.iitpkd.ac.in", "112301002")).toContain("does not match");
    expect(emailFormatError("employee", "priya@iitpkd.ac.in", "EMP1")).toBeNull();
    expect(emailFormatError("employee", "priya@smail.iitpkd.ac.in")).toContain("@iitpkd.ac.in");
  });

  it("holds for every seeded account", () => {
    expect(seedProfiles.map((p) => emailFormatError(p.role, p.email, p.roll_number)).filter(Boolean)).toEqual([]);
  });

  it("gives a student's sheet its roll numbers from the address", () => {
    const plan = planUserImport("email,full_name\n112301007@smail.iitpkd.ac.in,New Person", {
      profiles: [],
      assignable: ["student"],
      hostels: [],
      units: [],
      group: { id: "g", role: "student", programme: "BTech" },
    });
    expect(plan.added[0].roll_number).toBe("112301007");
    expect(rollNumberFromEmail("priya@iitpkd.ac.in")).toBeNull();
  });

  it("refuses a sheet putting a student or a member of staff on the wrong one", () => {
    const base = { profiles: [], hostels: [], units: [], instituteOnly: true };
    const student = planUserImport("email,full_name,role\nanjali@iitpkd.ac.in,A Person,student", {
      ...base,
      assignable: ["student"],
    });
    expect(student.problems[0]).toContain("<roll number>@smail");
    const staff = planUserImport("email,full_name,role\n112301001@smail.iitpkd.ac.in,A Person,employee", {
      ...base,
      assignable: ["employee"],
    });
    expect(staff.problems[0]).toContain("@iitpkd.ac.in");
  });

  it("finds a student by roll number even with none on the account", () => {
    const blank = person({ id: "b", email: "112301009@smail.iitpkd.ac.in" });
    const plan = planAccessChange("block", "112301009", { ...CONTEXT, profiles: [...PROFILES, blank] });
    expect(plan.targets.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("the Copy to box", () => {
  it("is untouched for someone in no group", () => {
    const rule = copyToRuleFor(null);
    expect(copyToAddressError("guest@example.org", rule)).toBeNull();
  });

  it("is institute addresses only for a group with no list", () => {
    const rule = copyToRuleFor({ prefill_copy_to: [], allowed_copy_to: [] });
    expect(copyToAddressError("anyone@iitpkd.ac.in", rule)).toBeNull();
    expect(copyToAddressError("anyone@smail.iitpkd.ac.in", rule)).toBeNull();
    expect(copyToAddressError("guest@example.org", rule)).toContain("IIT Palakkad");
  });

  it("is the list, plus what is filled in, for a group with one", () => {
    const rule = copyToRuleFor(
      { prefill_copy_to: ["warden@iitpkd.ac.in"], allowed_copy_to: ["dean@iitpkd.ac.in"] },
      ["sec_arts@iitpkd.ac.in"]
    );
    for (const ok of ["DEAN@iitpkd.ac.in", "warden@iitpkd.ac.in", "sec_arts@iitpkd.ac.in"]) {
      expect(copyToAddressError(ok, rule)).toBeNull();
    }
    expect(copyToAddressError("other@iitpkd.ac.in", rule)).toContain("group's list");
  });

  it("is applied by the booking schema, on the row that is wrong", () => {
    const houses = seedGuestHouses;
    const config = sanitizeFormConfig(buildDefaultFormConfig("employee", houses), houses);
    const today = toInstituteDateValue(new Date());
    const payload = {
      guest_house_id: houses[0].id,
      service_type: "room",
      booking_type: "personal",
      debit_head: "personal_funds",
      purpose_of_visit: "Family visiting",
      check_in: `${addDaysToDateValue(today, 3)}T12:00`,
      check_out: `${addDaysToDateValue(today, 4)}T10:00`,
      rooms: [{ room_type: null, guests: [{ name: "A Guest", gender: "female", citizenship: "indian" }] }],
      meals: [],
      copy_to_emails: ["ok@iitpkd.ac.in", "guest@example.org"],
    };
    const schema = (copyTo?: ReturnType<typeof copyToRuleFor>) =>
      bookingPayloadSchema(config, { mealsAvailable: false, rules: DEFAULT_RULES, copyTo });
    expect(schema().safeParse(payload).success).toBe(true);
    const refused = schema(copyToRuleFor({ prefill_copy_to: [], allowed_copy_to: [] })).safeParse(payload);
    expect(refused.success).toBe(false);
    expect(!refused.success && refused.error.issues[0].path).toEqual(["copy_to_emails", 1]);
  });
});

describe("reading the list the office sent", () => {
  it("takes lines, commas and repeats", () => {
    expect(parseIdentifiers("112201001\n142202014, 112201001\n\n# a note\n")).toEqual(["112201001", "142202014"]);
  });

  it("reads a spreadsheet from its roll number column alone", () => {
    const sheet = "Name,Roll No,Branch\nAnjali Menon,112201001,CSE\nRahul Nair,142202014,EE\n";
    expect(parseIdentifiers(sheet)).toEqual(["112201001", "142202014"]);
  });
});

describe("blocking", () => {
  it("names what it cannot find, and goes ahead with the rest", () => {
    const plan = planAccessChange("block", "112201001\n999999999", CONTEXT);
    expect(plan.targets.map((t) => t.id)).toEqual(["a"]);
    expect(plan.notFound).toEqual(["999999999"]);
  });

  it("matches by roll number or address, once each", () => {
    const plan = planAccessChange("block", `112201001\n${anjali.email}\n${rahul.email}`, CONTEXT);
    expect(plan.targets.map((t) => t.id)).toEqual(["a", "r"]);
  });

  it("will not guess between two accounts sharing a roll number", () => {
    const twin = person({ id: "t", email: "twin@iitpkd.ac.in", roll_number: "112201001" });
    const plan = planAccessChange("block", "112201001", { ...CONTEXT, profiles: [...PROFILES, twin] });
    expect(plan.targets).toEqual([]);
    expect(plan.refused[0]).toContain("Use the email address");
  });

  it("warns about a stay still to come, and blocks anyway", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const plan = planAccessChange("block", "112201001", {
      ...CONTEXT,
      now,
      bookings: [
        { user_id: "a", booking_reference_id: "REF-LIVE", status: "APPROVED", check_out: "2026-12-01T05:00:00Z" },
        { user_id: "a", booking_reference_id: "REF-DONE", status: "VACATED", check_out: "2026-12-01T05:00:00Z" },
        { user_id: "a", booking_reference_id: "REF-PAST", status: "APPROVED", check_out: "2026-10-01T05:00:00Z" },
      ],
    });
    expect(plan.targets).toHaveLength(1);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain("REF-LIVE");
  });

  it("warns when the person approves for others", () => {
    const warden = person({ id: "w", email: "warden@iitpkd.ac.in", role: "warden" });
    const hod = person({ id: "h", email: "hod@iitpkd.ac.in", role: "employee" });
    const plan = planAccessChange("block", `${warden.email}\n${hod.email}`, {
      ...CONTEXT,
      profiles: [...PROFILES, warden, hod],
      units: [{ id: "u", name: "CSE", category: "department", parent_department_id: null, head_id: "h", acting_head_id: null }],
    });
    expect(plan.warnings.join(" ")).toContain("Assistant Warden");
    expect(plan.warnings.join(" ")).toContain("heads CSE");
  });

  it("will not block you, the last manager, or an account you may not edit", () => {
    expect(planAccessChange("block", manager.email, CONTEXT).targets).toEqual([]);
    const other = person({ id: "m2", email: "m2@iitpkd.ac.in", role: "gh_manager" });
    const onlyOther = planAccessChange("block", other.email, { ...CONTEXT, actorId: "dev", profiles: [other] });
    expect(onlyOther.refused[0]).toContain("Appoint someone first");
    const dev = person({ id: "d", email: "dev@iitpkd.ac.in", role: "developer" });
    const locked = planAccessChange("block", dev.email, {
      ...CONTEXT,
      profiles: [...PROFILES, dev],
      locked: (p) => (p.role === "developer" ? "Only a developer can change a developer account" : null),
    });
    expect(locked.targets).toEqual([]);
  });

  it("restores only who is blocked", () => {
    const gone = { ...anjali, login_disabled_at: "2026-11-05T00:00:00Z" };
    const plan = planAccessChange("restore", `112201001\n${rahul.email}`, { ...CONTEXT, profiles: [gone, rahul, manager] });
    expect(plan.targets.map((t) => t.id)).toEqual(["a"]);
    expect(plan.alreadyDone).toEqual([rahul.email]);
    expect(isLoginBlocked(gone)).toBe(true);
    expect(isLoginBlocked(rahul)).toBe(false);
  });
});

describe("adding members by hand", () => {
  const groups = [{ id: "g1", name: "B.Tech 2022 batch" }, { id: "g2", name: "M.Tech 2022 batch" }];

  it("moves someone from another group, says so, and refuses another kind of account", () => {
    const plan = planGroupMembers({ id: "g2", role: "student" }, `112201001\n142202014\n${manager.email}\nnobody@iitpkd.ac.in`, PROFILES, groups);
    expect(plan.add.map((p) => p.id)).toEqual(["a", "r"]);
    expect(plan.moved[0]).toContain("moves from B.Tech 2022 batch");
    expect(plan.refused[0]).toContain("different kind of account");
    expect(plan.notFound).toEqual(["nobody@iitpkd.ac.in"]);
  });
});

describe("loading a CSV into a group", () => {
  const context = (role: Role = "student", assignable: Role[] = ["student", "employee"]) => ({
    profiles: PROFILES,
    assignable,
    hostels: ["Malhar"],
    units: [],
    group: { id: "g9", role, programme: "BTech" as const },
  });

  it("gives everyone the group and its role, with no role column", () => {
    const plan = planUserImport(
      "email,full_name,roll_number\n112301001@smail.iitpkd.ac.in,New Person,112301001\n142202014@smail.iitpkd.ac.in,Rahul Nair,142202014",
      context()
    );
    expect(plan.problems).toEqual([]);
    expect(plan.added[0]).toMatchObject({ role: "student", group_id: "g9" });
    expect(plan.updated[0].row.group_id).toBe("g9");
  });

  it("refuses an address off the domain, and nothing is imported", () => {
    const plan = planUserImport("email,full_name\na@gmail.com,A Person\nb@iitpkd.ac.in,B Person", context());
    expect(plan.problems[0]).toContain("not an IIT Palakkad address");
    expect(plan.added).toEqual([]);
  });

  it("refuses a sheet whose role column disagrees with the group", () => {
    const plan = planUserImport("email,full_name,role\na@iitpkd.ac.in,A Person,Faculty", context());
    expect(plan.problems[0]).toContain("this group's members are");
  });

  it("refuses a group whose role this console may not hand out", () => {
    const plan = planUserImport("email,full_name\na@iitpkd.ac.in,A Person", context("gh_manager"));
    expect(plan.problems[0]).toContain("cannot assign");
    expect(plan.added).toEqual([]);
  });

  it("warns about a roll number off the programme, without refusing it", () => {
    const plan = planUserImport("email,full_name,roll_number\n112304001@smail.iitpkd.ac.in,B Person,112304001", context());
    expect(plan.problems).toEqual([]);
    expect(plan.added).toHaveLength(1);
    expect(plan.warnings?.[0]).toContain("does not read as B.Tech");
  });

  it("leaves a plain import's rows with no group at all, and keeps an existing one", () => {
    const { group: _omit, ...plain } = context();
    void _omit;
    const plan = planUserImport(
      `email,full_name\nnew@iitpkd.ac.in,New Person\n${anjali.email},Renamed Person`,
      plain
    );
    expect(plan.added[0]).not.toHaveProperty("group_id");
    expect(plan.updated[0].row.group_id).toBe("g1");
  });

  it("takes someone back out of the group on undo", () => {
    const before = importFieldsOf(rahul);
    const after = { ...before, group_id: "g9" };
    const now = { ...rahul, group_id: "g9" };
    const plan = planUserImportRevert(
      { added: [], updated: [{ id: "r", email: rahul.email, before, after }] },
      [now]
    );
    expect(plan.restore[0].to.group_id).toBeNull();
    expect(plan.conflicts).toEqual([]);
  });
});

describe("an approval route limited to a group", () => {
  const rule: ApprovalRouteRule = {
    id: "phd",
    name: "PhD 2022",
    active: true,
    when: { group_ids: ["g-phd"] },
    stages: [],
  };

  it("matches only that group's requests", () => {
    expect(ruleMatches(rule, { role: "student", groupId: "g-phd" })).toBe(true);
    expect(ruleMatches(rule, { role: "student", groupId: "g-other" })).toBe(false);
    expect(ruleMatches(rule, { role: "student" })).toBe(false);
  });
});

describe("through the store", () => {
  let store: DataStore;
  let db: ReturnType<typeof useThrowawayMockDb>;

  beforeAll(async () => {
    db = useThrowawayMockDb();
    store = new (await import("@/lib/store/mock")).MockStore();
    await store.listProfiles();
  });
  afterAll(() => db.cleanup());

  it("seeds the demo batches with their students in them", async () => {
    const groups = await store.listUserGroups();
    expect(groups.map((g) => g.name)).toContain("B.Tech 2022 batch");
    const student = seedProfiles.find((p) => p.id === "student-anjali")!;
    expect((await store.getProfile(student.id))?.group_id).toBe("group-btech-2022");
  });

  it("creates a group, refuses its twin, and frees members when one is deleted", async () => {
    const input = { name: "Visitors", role: "employee" as Role, programme: null, batch_year: null, intake: null, prefill_copy_to: [], allowed_copy_to: [] };
    const group = await store.createUserGroup(input);
    await expect(store.createUserGroup({ ...input, name: "VISITORS" })).rejects.toThrow("already exists");
    await store.updateProfiles(["employee-priya"], { group_id: group.id });
    expect((await store.getProfile("employee-priya"))?.group_id).toBe(group.id);
    await store.deleteUserGroup(group.id);
    expect((await store.getProfile("employee-priya"))?.group_id).toBeNull();
  });

  it("blocks many at once, keeps their bookings, and can restore them", async () => {
    const before = (await store.listBookings({})).length;
    await store.updateProfiles(["student-anjali", "student-rahul"], {
      login_disabled_at: "2026-11-05T00:00:00.000Z",
      login_disabled_reason: "Graduated",
    });
    expect(isLoginBlocked((await store.getProfile("student-rahul"))!)).toBe(true);
    expect((await store.listBookings({})).length).toBe(before);
    await store.updateProfiles(["student-anjali", "student-rahul"], { login_disabled_at: null, login_disabled_reason: null });
    expect(isLoginBlocked((await store.getProfile("student-anjali"))!)).toBe(false);
  });
});

describe("reading every account", () => {
  /**
   * The defect this guards used to be PostgREST's: a `select` returned at most
   * 1000 rows and **said nothing**, so `listProfiles()` silently lost everyone
   * past the first thousand - which would have broken the Google callback's
   * account lookup and the institute's account import
   * (`GOOGLE-SIGN-IN.md`, defect 1). The paging loop that worked around it
   * went with the Supabase client on 6 Nov 2026.
   *
   * The test stays, against the new mechanism, because the *property* is what
   * matters: one statement, no cap, every row returned. A `LIMIT` added here
   * by someone optimising a slow page would reintroduce exactly the old bug.
   */
  const accounts = Array.from({ length: 2345 }, (_, i) =>
    person({ id: `p${i}`, email: `${i}@smail.iitpkd.ac.in` })
  );

  it("issues one uncapped statement and returns all 2345", async () => {
    const { PostgresStore } = await import("@/lib/store/postgres");
    const statements: string[] = [];
    const store = Object.create(PostgresStore.prototype) as InstanceType<typeof PostgresStore>;
    Object.defineProperty(store, "pool", {
      value: {
        query: async (sql: string) => {
          statements.push(sql);
          return { rows: accounts, rowCount: accounts.length };
        },
      },
    });

    const found = await store.listProfiles();
    expect(found).toHaveLength(2345);
    expect(new Set(found.map((p) => p.id)).size).toBe(2345);
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/\blimit\b/i);
    expect(statements[0]).not.toMatch(/\boffset\b/i);
  });
});
