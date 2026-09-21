import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import type { DataStore } from "@/lib/store/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * The mock store's Settings tables, including the constraints it emulates from
 * migration 16, and the self-healing of a `.local-db.json` written before
 * those tables existed.
 */

// A database file as it looked before migration 16: no hostels, no
// whitelist, no audit log, units without an office class.
const OLD_DB = {
  profiles: [
    { id: "s1", email: "s1@smail.iitpkd.ac.in", full_name: "S1", role: "student", hostel_name: "Tilang", department_or_club: null, roll_number: null, ldap_uid: null, unit_id: null, staff_category: null },
    { id: "official-admin", email: "admin@iitpkd.ac.in", full_name: "Director's Office", role: "official", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "admin", unit_id: null, staff_category: null },
  ],
  guest_houses: [],
  rooms: [],
  bookings: [],
  booking_rooms: [],
  booking_guests: [],
  booking_logs: [],
  form_configs: [],
  room_holds: [],
  email_outbox: [],
  units: [{ id: "u1", name: "Maths", kind: "department", parent_id: null, head_id: null, acting_head_id: null }],
  app_settings: { admin_password_hash: "scrypt$abc" },
};

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  db = useThrowawayMockDb(OLD_DB);
  const { MockStore } = await import("@/lib/store/mock");
  store = new MockStore();
});
afterAll(() => db.cleanup());

describe("self-healing an old database file", () => {
  it("seeds hostels from the accounts that name them, plus the demo hostels", async () => {
    expect(await store.listHostels()).toEqual(["Malhar", "Saveri", "Tilang"]);
  });

  it("seeds the whitelist with the addresses that used to be hardcoded", async () => {
    expect(await store.listOfficialEmails()).toEqual([
      "admin@iitpkd.ac.in",
      "director.office@iitpkd.ac.in",
      "registrar@iitpkd.ac.in",
    ]);
  });

  it("gives old units an office class of null and adds the demo offices", async () => {
    const units = await store.listUnits();
    expect(units.find((u) => u.id === "u1")?.office_class).toBeNull();
    expect(units.find((u) => u.id === "unit-director-office")?.office_class).toBe("officer");
  });

  it("gives a seeded persona with no unit its demo unit, and nobody else", async () => {
    expect((await store.getProfile("official-admin"))?.unit_id).toBe("unit-director-office");
    expect((await store.getProfile("s1"))?.unit_id).toBeNull();
  });

  it("keeps the console password hash readable as a string", async () => {
    expect(await store.getSetting("admin_password_hash")).toBe("scrypt$abc");
  });

  it("wrote the healed file back", () => {
    const saved = JSON.parse(fs.readFileSync(db.file, "utf8"));
    expect(Array.isArray(saved.hostels)).toBe(true);
    expect(Array.isArray(saved.security_audit)).toBe(true);
  });
});

describe("hostels behave like the foreign key", () => {
  it("refuses an account naming a hostel that is not on the list", async () => {
    await expect(store.updateProfile("s1", { hostel_name: "Nowhere" })).rejects.toThrow(/not a hostel/);
  });

  it("refuses to remove a hostel someone lives in", async () => {
    await expect(store.removeHostel("Tilang")).rejects.toThrow(/still name Tilang/);
  });

  it("renames a hostel and everyone in it", async () => {
    await store.renameHostel("Tilang", "Tilang Hall");
    expect((await store.getProfile("s1"))?.hostel_name).toBe("Tilang Hall");
    expect(await store.listHostels()).toContain("Tilang Hall");
  });

  it("adds and removes an unused hostel, refusing a duplicate", async () => {
    await store.addHostel("Kalyani");
    await expect(store.addHostel("kalyani")).rejects.toThrow(/already on the list/);
    await store.removeHostel("Kalyani");
    expect(await store.listHostels()).not.toContain("Kalyani");
  });
});

describe("json settings and the whitelist", () => {
  it("stores a settings group as an object", async () => {
    await store.setJsonSetting("rules.booking", { advance_booking_months: 2, max_stay_nights: 10 });
    expect(await store.getJsonSetting("rules.booking")).toEqual({
      advance_booking_months: 2,
      max_stay_nights: 10,
    });
    expect(await store.getJsonSetting("rules.meals")).toBeNull();
  });

  it("lowercases whitelisted addresses and refuses duplicates", async () => {
    await store.addOfficialEmail("Dean.Academic@IITPKD.ac.in");
    expect(await store.listOfficialEmails()).toContain("dean.academic@iitpkd.ac.in");
    await expect(store.addOfficialEmail("dean.academic@iitpkd.ac.in")).rejects.toThrow(/already/);
    await store.removeOfficialEmail("DEAN.ACADEMIC@iitpkd.ac.in");
    expect(await store.listOfficialEmails()).not.toContain("dean.academic@iitpkd.ac.in");
  });
});

describe("the audit log", () => {
  it("appends and filters, newest first", async () => {
    const base = { actor_id: "developer", actor_role: "developer", ip: null, user_agent: null };
    await store.appendAudit({ ...base, actor_name: "Dev", event: "settings.changed", target: "rules.booking", details: { changes: ["max_stay_nights: 14 → 10"] } });
    await new Promise((r) => setTimeout(r, 5));
    await store.appendAudit({ ...base, actor_name: "Dev", event: "export.csv", target: "history", details: {} });
    const all = await store.listAudit({});
    expect(all.map((e) => e.event)).toEqual(["export.csv", "settings.changed"]);
    expect((await store.listAudit({ event: "settings.changed" }))).toHaveLength(1);
    expect((await store.listAudit({ q: "max_stay" }))[0].target).toBe("rules.booking");
  });
});
