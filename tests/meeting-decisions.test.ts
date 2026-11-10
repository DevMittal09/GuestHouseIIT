import { describe, expect, it } from "vitest";
import { allocatableRooms, generalInventory, roomAccessError, visibleFreeRooms } from "@/lib/rooms-access";
import { programmeFromRollNumber, spouseBookingError } from "@/lib/student-programme";
import { cancellationNoticeError, latestCheckOutDate, stayLengthError } from "@/lib/policy";
import { inArrivalOrder } from "@/lib/workflow";
import { DEFAULT_RULES } from "@/lib/settings";
import { originalDatesPatch } from "@/lib/operations";
import { seedRooms, seedTariffs, seedGuestHouses } from "@/lib/store/seed";
import { tariffCategoriesFor, tariffCategorySheet } from "@/lib/tariff-category";
import { resolveTariff } from "@/lib/tariffs";
import { profile, room } from "./helpers";

const access = DEFAULT_RULES.portal;
describe("meeting rules", () => {
  it.each([["123451789", "btech"], ["123452789", "mtech"], ["123453789", "ms"], ["123454789", "phd"]])("reads %s as %s", (roll, programme) => {
    expect(programmeFromRollNumber(roll)).toBe(programme);
    expect(spouseBookingError({ roll_number: roll }) === null).toBe(["ms", "phd"].includes(programme));
  });
  it("does not grant spouse access from a conflicting programme label", () => {
    expect(spouseBookingError({ roll_number: "123451789", programme: "PhD" })).not.toBeNull();
    expect(spouseBookingError({ roll_number: null, programme: "PhD" })).not.toBeNull();
  });
  it("keeps director-only rooms separate from online VIP grants", () => {
    const vip = profile({ email: "DIRECTOR@IITPKD.AC.IN" });
    const rooms = [room(), room({ id: "vip", room_class: "vip" }), room({ id: "director", room_class: "director_only" }), room({ id: "reserved", room_class: "reserved" })];
    expect(allocatableRooms(rooms, vip, access).map((r) => r.id)).toEqual(["room-1", "vip"]);
    expect(roomAccessError(rooms[2], vip, access)).toMatch(/directly/);
    expect(allocatableRooms(rooms, profile({ role: "gh_manager" }), access)).toHaveLength(3);
    expect(allocatableRooms(rooms, profile(), { ...access, vip_roles: ["employee"] })).toHaveLength(2);
  });
  it("keeps 16 physical Hamsanandi rooms, 11 general rooms, and Bageshri's existing numbers", () => {
    const h = seedGuestHouses.find((h) => h.name === "Hamsanandi")!;
    const rooms = seedRooms.filter((r) => r.guest_house_id === h.id);
    expect(rooms).toHaveLength(16);
    expect(generalInventory(rooms)).toHaveLength(11);
    expect(rooms.filter((r) => r.room_class === "director_only").map((r) => r.room_number)).toEqual(["C1", "C2"]);
    expect(seedRooms.filter((r) => r.guest_house_id !== h.id).map((r) => r.room_number)).toEqual(["201", "202", "203", "204", "206", "302", "303", "305", "306", "307"]);
  });
  it("caps the published count and never reports negative availability", () => {
    expect([21, 14, 13, 0, -1].map((n) => visibleFreeRooms(n, 14))).toEqual([14, 14, 13, 0, 0]);
  });
  /**
   * **Superseded on 10 Nov 2026.** The meeting of 9 Nov said official
   * bookings had no maximum duration; the owner then asked for "14 days max
   * for everyone", limited in the check-out picker. A stay that genuinely has
   * to run longer is extended by the desk after approval
   * (`extendStayAction`), which has never consulted this rule.
   */
  it("caps every kind of booking, and exempts the Director's Office alone", () => {
    const start = new Date("2026-11-10T12:00:00+05:30"), end = new Date("2026-12-10T12:00:00+05:30");
    expect(stayLengthError(start, end, 14)).toMatch(/30 nights/);
    // Not the role, not the booking type - the address, and only this one.
    expect(stayLengthError(start, end, 14, "director.office@iitpkd.ac.in")).toBeNull();
    expect(stayLengthError(start, end, 14, "  Director.Office@IITPKD.ac.in ")).toBeNull();
    expect(stayLengthError(start, end, 14, "registrar@iitpkd.ac.in")).toMatch(/30 nights/);
    // The picker says the same thing: a cap for everyone, none for that one.
    expect(latestCheckOutDate("2026-11-10", 14)).toBe("2026-11-24");
    expect(latestCheckOutDate("2026-11-10", 14, "director.office@iitpkd.ac.in")).toBeNull();
    // 0 is the other way off: the office turning the cap off in Settings.
    expect(latestCheckOutDate("2026-11-10", 0)).toBeNull();
  });
  it("accepts exactly 24 hours' cancellation notice and refuses one millisecond less", () => {
    const arrival = new Date("2026-11-11T12:00:00+05:30");
    expect(cancellationNoticeError(arrival, new Date(arrival.getTime() - 86400000))).toBeNull();
    expect(cancellationNoticeError(arrival, new Date(arrival.getTime() - 86400000 + 1))).not.toBeNull();
  });
  it("sorts by submission instant with deterministic ties, without mutating input", () => {
    const rows = [{ id: "b", created_at: "2026-11-09T11:00:00+05:30" }, { id: "a", created_at: "2026-11-09T05:30:00Z" }, { id: "c", created_at: "2026-11-09T06:00:00Z" }];
    expect(inArrivalOrder(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0].id).toBe("b");
  });
  it("keeps the first requested dates after repeated edits", () => {
    const dates = { check_in: "original-in", check_out: "original-out" };
    expect(originalDatesPatch(dates)).toEqual({ original_check_in: "original-in", original_check_out: "original-out" });
    expect(originalDatesPatch({ ...dates, original_check_in: "first", original_check_out: "last" })).toEqual({});
  });
  it("publishes all six category rates on the mock store", () => {
    const sheet = tariffCategorySheet(seedTariffs, seedGuestHouses, "2026-11-09");
    for (const house of seedGuestHouses) expect(sheet.map((r) => r.rateByGuestHouse[house.id])).toEqual(house.name === "Bageshri" ? [1000,1500,2000] : [1500,2000,2500]);
  });
  it("offers only the categories a kind of booking can be charged at", () => {
    // The office's own descriptions: Category I is "parents of students on a
    // personal visit", II is "official duty", III is "academic visitors".
    expect(tariffCategoriesFor("personal")).toEqual(["I"]);
    expect(tariffCategoriesFor("official")).toEqual(["II", "III"]);
    // Alumni keep all three: the sheet says nothing about them, and hiding
    // the right one would leave a stay that cannot be invoiced.
    expect(tariffCategoriesFor("alumni")).toEqual(["I", "II", "III"]);
    // The sheet narrows with them, and is the whole sheet when unasked.
    const narrowed = tariffCategorySheet(seedTariffs, seedGuestHouses, "2026-11-09", "personal");
    expect(narrowed.map((r) => r.category)).toEqual(["I"]);
    expect(tariffCategorySheet(seedTariffs, seedGuestHouses, "2026-11-09")).toHaveLength(3);
  });
  it("never substitutes an uncategorised room rate for a missing selected category", () => {
    const house = seedGuestHouses[0];
    expect(resolveTariff(seedTariffs.filter((t) => !t.tariff_category), { guest_house_id: house.id, item: "room", room_type: "double_sharing", booking_type: "personal", requester_role: "employee", tariff_category: "III", date: "2026-11-09" })).toBeNull();
  });
});
