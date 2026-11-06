import { describe, expect, it } from "vitest";
import { invoiceRoleError } from "@/lib/access";
import type { AvailabilityCounts } from "@/lib/availability";
import {
  buildDefaultFormConfig,
  isResearchScholar,
  sanitizeFormConfig,
  scholarOnlyRelationshipError,
  type RoleFormConfig,
} from "@/lib/form-config";
import { cancellationNoticeError, canStillCancel, isDurationExempt, stayLengthError } from "@/lib/policy";
import { DEFAULT_RULES, parseRuleGroup, ruleGroupError } from "@/lib/settings";
import { seedGuestHouses, seedRooms, seedTariffs } from "@/lib/store/seed";
import { deskTariffCategories, roomTariffSheet } from "@/lib/tariff-categories";
import {
  capCounts,
  cappedFree,
  hasVipAccess,
  heldToVisibleRoomCap,
  roomsVisibleTo,
  vipAllocationError,
  vipRoomIds,
} from "@/lib/vip";

/**
 * **The owner's sixteenth list** (4 Nov 2026): VIP rooms, the visible-room
 * pool, the one-month window, official stays uncapped, cancellation 24 hours
 * ahead, the caretaker's invoices, a research scholar's spouse, the room
 * naming convention and Categories I-III. The rules on plain data; the seed
 * is the demo database's own.
 */

const HAMSANANDI = seedGuestHouses.find((g) => g.name === "Hamsanandi")!;
const BAGESHRI = seedGuestHouses.find((g) => g.name === "Bageshri")!;
const hamsanandiRooms = seedRooms.filter((r) => r.guest_house_id === HAMSANANDI.id);

describe("the rooms are named as the sixteenth list names them", () => {
  it("Bageshri B1-B10, Hamsanandi A1-A4, C1-C2 and D1-D4", () => {
    expect(seedRooms.filter((r) => r.guest_house_id === BAGESHRI.id).map((r) => r.room_number)).toEqual(
      ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"]
    );
    expect(hamsanandiRooms.map((r) => r.room_number)).toEqual([
      "A1", "A2", "A3", "A4", "C1", "C2", "D1", "D2", "D3", "D4",
    ]);
  });
});

describe("VIP rooms", () => {
  const policy = DEFAULT_RULES.policy;

  it("are C1 and C2 until the manager saves a list, found by room number", () => {
    const ids = vipRoomIds(hamsanandiRooms, policy);
    expect([...ids].map((id) => hamsanandiRooms.find((r) => r.id === id)?.room_number).sort()).toEqual([
      "C1",
      "C2",
    ]);
  });

  it("are exactly the saved list once there is one - even an empty one", () => {
    expect([...vipRoomIds(hamsanandiRooms, { vip_room_ids: ["x"] })]).toEqual(["x"]);
    expect(vipRoomIds(hamsanandiRooms, { vip_room_ids: [] }).size).toBe(0);
  });

  it("belong to the three fixed accounts and whoever the manager adds", () => {
    expect(hasVipAccess("Director@iitpkd.ac.in", policy)).toBe(true);
    expect(hasVipAccess("office_director@iitpkd.ac.in", policy)).toBe(true);
    expect(hasVipAccess("adadmin@iitpkd.ac.in", policy)).toBe(true);
    expect(hasVipAccess("priya@iitpkd.ac.in", policy)).toBe(false);
    expect(hasVipAccess("priya@iitpkd.ac.in", { vip_emails: ["priya@iitpkd.ac.in"] })).toBe(true);
    expect(hasVipAccess(null, policy)).toBe(false);
  });

  it("are not counted for a general requester, and are for a VIP and the desk", () => {
    const visible = (role: "employee" | "gh_caretaker", email: string) =>
      roomsVisibleTo(hamsanandiRooms, { role, email }, policy).map((r) => r.room_number);
    expect(visible("employee", "priya@iitpkd.ac.in")).not.toContain("C1");
    expect(visible("employee", "priya@iitpkd.ac.in")).toHaveLength(8);
    expect(visible("employee", "director@iitpkd.ac.in")).toHaveLength(10);
    expect(visible("gh_caretaker", "caretaker@iitpkd.ac.in")).toHaveLength(10);
  });

  it("are allocated only to a VIP's booking, or the manager's own", () => {
    const c1 = hamsanandiRooms.find((r) => r.room_number === "C1")!;
    const a1 = hamsanandiRooms.find((r) => r.room_number === "A1")!;
    const faculty = { role: "employee" as const, email: "priya@iitpkd.ac.in" };
    expect(vipAllocationError([c1.id], hamsanandiRooms, faculty, policy)).toContain("C1 is a VIP room");
    expect(vipAllocationError([a1.id], hamsanandiRooms, faculty, policy)).toBeNull();
    expect(
      vipAllocationError([c1.id], hamsanandiRooms, { role: "official", email: "director@iitpkd.ac.in" }, policy)
    ).toBeNull();
    expect(
      vipAllocationError([c1.id], hamsanandiRooms, { role: "gh_manager", email: "ghm@iitpkd.ac.in" }, policy)
    ).toBeNull();
  });
});

describe("the visible-room pool", () => {
  it("never reads above the cap, and a room taken anywhere comes off it", () => {
    // Nothing held: a guest house's own free rooms, under the cap.
    expect(cappedFree(10, 0, 14)).toBe(10);
    expect(cappedFree(8, 0, 14)).toBe(8);
    // Six held across both houses: 14 - 6 = 8 left of the pool.
    expect(cappedFree(10, 6, 14)).toBe(8);
    expect(cappedFree(4, 6, 14)).toBe(4);
    expect(cappedFree(10, 20, 14)).toBe(0);
    // 0 turns it off.
    expect(cappedFree(10, 6, 0)).toBe(10);
  });

  it("clamps every figure to what is left once rooms are held at either guest house", () => {
    const counts = (total: number, free: number): AvailabilityCounts => ({
      total,
      days: ["2026-11-10"],
      freeByDay: [free],
      freeThroughout: free,
      freeByHour: Array.from({ length: 24 }, () => free),
      bookedNow: null,
    });
    // Bageshri 10 rooms with all free, Hamsanandi 8 with all 8 held: the pool
    // has 6 left, so Bageshri reads 6 although 10 of its rooms are empty.
    const bageshri = counts(10, 10);
    const capped = capCounts(bageshri, [bageshri, counts(8, 0)], 14);
    expect(capped.freeByDay).toEqual([6]);
    expect(capped.freeThroughout).toBe(6);
    expect(capped.freeByHour?.[9]).toBe(6);
    // Under the cap nothing changes.
    expect(capCounts(bageshri, [bageshri, counts(8, 8)], 14).freeByDay).toEqual([10]);
  });

  it("holds a general requester to it, not the desk or a VIP", () => {
    expect(heldToVisibleRoomCap({ role: "employee", email: "priya@iitpkd.ac.in" })).toBe(true);
    expect(heldToVisibleRoomCap({ role: "gh_manager", email: "ghm@iitpkd.ac.in" })).toBe(false);
    expect(heldToVisibleRoomCap({ role: "official", email: "director@iitpkd.ac.in" })).toBe(false);
  });
});

describe("the booking rules", () => {
  it("opens bookings one month ahead and cancels 24 hours before check-in", () => {
    expect(DEFAULT_RULES.booking.advance_booking_months).toBe(1);
    expect(DEFAULT_RULES.booking.cancellation_notice_hours).toBe(24);
    const now = new Date("2026-11-04T10:00:00+05:30");
    expect(cancellationNoticeError("2026-11-05T10:00:00+05:30", 24, now)).toBeNull();
    expect(cancellationNoticeError("2026-11-05T09:59:00+05:30", 24, now)).toContain("24 hours");
    expect(canStillCancel("2026-11-04T12:00:00+05:30", 0, now)).toBe(true);
  });

  it("serves breakfast from 08:00, as the official policy says", () => {
    expect(DEFAULT_RULES.meals.windows.breakfast).toEqual({ start: "08:00", end: "09:30" });
  });

  it("does not cap an official stay, whoever raises it; a personal stay is still 14 nights", () => {
    const inAt = new Date("2030-01-01T12:00:00+05:30");
    const outAt = new Date("2030-01-21T10:00:00+05:30");
    expect(isDurationExempt("employee", "priya@iitpkd.ac.in", "official")).toBe(true);
    expect(stayLengthError(inAt, outAt, "employee", "priya@iitpkd.ac.in", 14, "official")).toBeNull();
    expect(stayLengthError(inAt, outAt, "employee", "priya@iitpkd.ac.in", 14, "personal")).toContain(
      "14 nights"
    );
  });

  it("keeps the policy group's own checks", () => {
    expect(parseRuleGroup("policy", null)).toEqual(DEFAULT_RULES.policy);
    expect(ruleGroupError("policy", { ...DEFAULT_RULES.policy, guidelines_url: "drive.google.com/x" })).toContain(
      "https://"
    );
    expect(
      ruleGroupError("policy", { ...DEFAULT_RULES.policy, guidelines_url: "https://drive.google.com/x" })
    ).toBeNull();
    expect(ruleGroupError("policy", { ...DEFAULT_RULES.policy, vip_emails: ["not an address"] })).toBeTruthy();
  });
});

describe("the caretaker invoices personal bookings only", () => {
  it("leaves an official booking's invoice to the manager", () => {
    expect(invoiceRoleError("gh_caretaker", "personal")).toBeNull();
    expect(invoiceRoleError("gh_caretaker", "official")).toContain("Guest House Manager");
    expect(invoiceRoleError("gh_caretaker", "alumni")).toContain("Guest House Manager");
    expect(invoiceRoleError("gh_manager", "official")).toBeNull();
    expect(invoiceRoleError("employee", "personal")).toBeTruthy();
  });
});

describe("a spouse, on a research scholar's request only", () => {
  const student = buildDefaultFormConfig("student", seedGuestHouses);

  it("reads the programme off the sixth character of the roll number", () => {
    expect(isResearchScholar("122203099")).toBe(true); // MS
    expect(isResearchScholar("112204001")).toBe(true); // PhD
    expect(isResearchScholar("112201001")).toBe(false); // B.Tech
    expect(isResearchScholar("142202014")).toBe(false); // M.Tech
    expect(isResearchScholar("112205001")).toBe(false); // M.Sc
    // Unreadable is never a widening.
    expect(isResearchScholar("12345")).toBe(false);
    expect(isResearchScholar(null)).toBe(false);
  });

  it("refuses a spouse from anyone else, and needs no parent from a scholar", () => {
    expect(student.relationship_options).toContain("Spouse");
    expect(scholarOnlyRelationshipError(student, ["Spouse"], false)).toContain("research scholars");
    expect(scholarOnlyRelationshipError(student, ["Spouse"], true)).toBeNull();
    expect(scholarOnlyRelationshipError(student, ["Mother", "Siblings"], false)).toBeNull();
    expect(student.dependent_relationships).not.toContain("Spouse");
    expect(student.unique_relationships).toContain("Spouse");
  });

  it("is backfilled onto a student form saved before the rule", () => {
    const saved = { ...student } as Partial<RoleFormConfig>;
    delete saved.scholar_only_relationships;
    saved.relationship_options = student.relationship_options.filter((r) => r !== "Spouse");
    saved.unique_relationships = student.unique_relationships.filter((r) => r !== "Spouse");
    const healed = sanitizeFormConfig(saved as RoleFormConfig, seedGuestHouses);
    expect(healed.relationship_options).toContain("Spouse");
    expect(healed.scholar_only_relationships).toEqual(["Spouse"]);
    expect(healed.unique_relationships).toContain("Spouse");
    // A row saved since is left as the console chose.
    const since = sanitizeFormConfig(
      { ...student, scholar_only_relationships: [], relationship_options: saved.relationship_options! },
      seedGuestHouses
    );
    expect(since.relationship_options).not.toContain("Spouse");
  });
});

describe("Categories I, II and III", () => {
  const today = "2026-11-04";

  it("are the published sheet, categories down and guest houses across", () => {
    const sheet = roomTariffSheet(seedTariffs, seedGuestHouses, today);
    expect(sheet.map((r) => r.title)).toEqual(["Category I", "Category II", "Category III"]);
    expect(sheet.map((r) => [r.rates[HAMSANANDI.id], r.rates[BAGESHRI.id]])).toEqual([
      [1500, 1000],
      [2000, 1500],
      [2500, 2000],
    ]);
    expect(sheet[2].description).toBe("academic visitors");
  });

  it("give a personal stay Category I alone - the desk never crosses booking types", () => {
    const personal = deskTariffCategories(seedTariffs, {
      guestHouse: HAMSANANDI,
      booking: { booking_type: "personal", user_role: "employee" },
      date: today,
    });
    expect(personal.map((c) => c.label.split(":")[0])).toEqual(["Category I"]);
    expect(personal[0].scope.booking_type).toBe("personal");
  });

  it("give an official stay II or III, both official", () => {
    const official = deskTariffCategories(seedTariffs, {
      guestHouse: BAGESHRI,
      booking: { booking_type: "official", user_role: "official" },
      date: today,
    });
    expect(official.map((c) => [c.label.split(":")[0], c.headline?.rate])).toEqual([
      ["Category II", 1500],
      ["Category III", 2000],
    ]);
    expect(official.every((c) => c.scope.booking_type === "official")).toBe(true);
  });
});
