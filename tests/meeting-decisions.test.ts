import { describe, expect, it } from "vitest";
import { allocatableRooms, generalInventory, roomAccessError, visibleFreeRooms } from "@/lib/rooms-access";
import { programmeFromRollNumber, spouseBookingError } from "@/lib/student-programme";
import { cancellationNoticeError, latestCheckOutDate, stayLengthError } from "@/lib/policy";
import { inArrivalOrder } from "@/lib/workflow";
import { DEFAULT_RULES } from "@/lib/settings";
import { originalDatesPatch } from "@/lib/operations";
import { seedRooms, seedTariffs, seedGuestHouses } from "@/lib/store/seed";
import { tariffCategorySheet } from "@/lib/tariff-category";
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
  it("allows official employee stays beyond fourteen days", () => {
    const start = new Date("2026-11-10T12:00:00+05:30"), end = new Date("2026-12-10T12:00:00+05:30");
    expect(stayLengthError(start, end, "employee", null, 14, "personal")).toMatch(/30 nights/);
    expect(stayLengthError(start, end, "employee", null, 14, "official")).toBeNull();
    expect(latestCheckOutDate("2026-11-10", "employee", null, 14, "official")).toBeNull();
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
  it("never substitutes an uncategorised room rate for a missing selected category", () => {
    const house = seedGuestHouses[0];
    expect(resolveTariff(seedTariffs.filter((t) => !t.tariff_category), { guest_house_id: house.id, item: "room", room_type: "double_sharing", booking_type: "personal", requester_role: "employee", tariff_category: "III", date: "2026-11-09" })).toBeNull();
  });
});
