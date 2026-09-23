import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bucketOccupancyByDay, bucketOccupancyByHour, availabilityRange } from "@/lib/availability";
import { instituteDayBounds } from "@/lib/tz";
import { conflictBetween, holdGuard, bufferMs, isOverridable } from "@/lib/turnover";
import type { DataStore } from "@/lib/store/types";
import { BufferClashError, RoomClashError, type RoomOccupancySegment } from "@/lib/types";
import { room, useThrowawayMockDb } from "./helpers";

const H = 3_600_000;
const FOUR_H = bufferMs(240);
// Stays in institute time (IST = UTC+5:30): 12:00 IST is 06:30Z.
const stay = (from: string, to: string) => ({ from, to });
const A = stay("2030-01-10T06:30:00.000Z", "2030-01-11T06:30:00.000Z"); // out 12:00 IST on the 11th

describe("the guard, as the database builds it (migration 17)", () => {
  it("pads only the end of an ordinary hold", () => {
    const g = holdGuard(A, false, FOUR_H);
    expect(g.from).toBe(Date.parse(A.from));
    expect(g.to).toBe(Date.parse(A.to) + 4 * H);
  });

  it("shifts an accepted turnover's start by grace + buffer and trims its end by the grace", () => {
    const g = holdGuard(A, true, FOUR_H);
    expect(g.from).toBe(Date.parse(A.from) + 6 * H);
    expect(g.to).toBe(Date.parse(A.to) - 2 * H);
  });

  it("keeps a sliver for a stay too short to shrink", () => {
    const short = stay("2030-01-10T06:30:00.000Z", "2030-01-10T11:30:00.000Z");
    const g = holdGuard(short, true, FOUR_H);
    expect(g.to - g.from).toBe(2000);
  });
});

describe("classifying a requested stay against one already held", () => {
  const next = (offsetHours: number) =>
    stay(new Date(Date.parse(A.to) + offsetHours * H).toISOString(), "2030-01-13T06:30:00.000Z");

  it("free once the gap reaches the buffer — exactly four hours is enough", () => {
    expect(conflictBetween(next(4), A, FOUR_H)).toBe("free");
    expect(conflictBetween(next(5), A, FOUR_H)).toBe("free");
  });

  it("turnaround when there is a gap, but shorter than the buffer", () => {
    expect(conflictBetween(next(3), A, FOUR_H)).toBe("turnaround");
    expect(conflictBetween(next(0), A, FOUR_H)).toBe("turnaround");
    expect(isOverridable("turnaround")).toBe(true);
  });

  it("soft for a real overlap within the two-hour grace, hard beyond it", () => {
    expect(conflictBetween(next(-1), A, FOUR_H)).toBe("soft");
    expect(conflictBetween(next(-2), A, FOUR_H)).toBe("soft");
    expect(conflictBetween(next(-3), A, FOUR_H)).toBe("hard");
  });

  it("a stay inside another is hard however short", () => {
    const inside = stay("2030-01-10T08:30:00.000Z", "2030-01-10T09:30:00.000Z");
    expect(conflictBetween(inside, A, FOUR_H)).toBe("hard");
  });

  it("the buffer applies in both directions: an earlier stay must also leave room", () => {
    const earlier = stay("2030-01-08T06:30:00.000Z", "2030-01-10T04:30:00.000Z"); // leaves 2h before A
    expect(conflictBetween(earlier, A, FOUR_H)).toBe("turnaround");
    expect(conflictBetween(earlier, A, 0)).toBe("free");
  });

  it("no buffer: back-to-back is free, as before migration 17", () => {
    expect(conflictBetween(next(0), A, 0)).toBe("free");
  });
});

describe("charts: a booked bar ends at check-out, the turnaround is separate", () => {
  const seg: RoomOccupancySegment = {
    room_id: "room-1",
    booking_id: "b-1",
    booking_reference_id: "REF",
    status: "APPROVED",
    check_in: "2030-01-10T06:30:00.000Z",
    check_out: "2030-01-11T05:30:00.000Z", // 11:00 IST
    turnaround_until: "2030-01-11T09:30:00.000Z", // 15:00 IST
    requester_name: null,
    purpose_of_visit: null,
  };

  it("day view: 11:00 is free of the booking and hatched until 15:00", () => {
    const { start } = instituteDayBounds("2030-01-11");
    const day = bucketOccupancyByHour([room()], [seg], start).get("room-1")!;
    expect(day.hours[10]).toBe(seg);
    expect(day.hours[11]).toBeNull();
    expect(day.turnaround.slice(11, 15).every((t) => t === seg)).toBe(true);
    expect(day.turnaround[15]).toBeNull();
    expect(day.turnaround[10]).toBeNull();
  });

  it("week view: a turnaround bar after the stay, and booked minutes stop at check-out", () => {
    const range = availabilityRange("week", "2030-01-11")!;
    const week = bucketOccupancyByDay([room()], [seg], range).get("room-1")!;
    expect(week.turnarounds).toHaveLength(1);
    expect(week.turnarounds[0].from).toBeCloseTo(week.bars[0].to, 10);
    const friday = range.days.indexOf("2030-01-11");
    expect(week.bookedMinutes[friday]).toBe(11 * 60);
  });

  it("a stay with no buffer draws no turnaround", () => {
    const range = availabilityRange("week", "2030-01-11")!;
    const week = bucketOccupancyByDay([room()], [{ ...seg, turnaround_until: null }], range).get("room-1")!;
    expect(week.turnarounds).toEqual([]);
  });

  /**
   * 23 Sep 2026: a changeover the manager accepted really does put two stays
   * in one room for up to two hours. Drawn in the same red as an ordinary
   * booking it said nothing — the room reads as taken either way — so the
   * overlapping stretch is now its own band.
   */
  describe("two bookings on one room at once", () => {
    // Starts two hours before `seg` leaves: an accepted soft overlap.
    const other: RoomOccupancySegment = {
      ...seg,
      booking_id: "b-2",
      booking_reference_id: "REF2",
      check_in: "2030-01-11T03:30:00.000Z", // 09:00 IST
      check_out: "2030-01-12T05:30:00.000Z",
      turnaround_until: null,
    };

    it("day view: only the shared hours are marked, and they name both bookings", () => {
      const { start } = instituteDayBounds("2030-01-11");
      const day = bucketOccupancyByHour([room()], [seg, other], start).get("room-1")!;
      // 09:00 and 10:00 IST are held by both; 08:00 by the first alone and
      // 11:00 by the second alone.
      expect(day.overlaps[8]).toBeNull();
      expect(day.overlaps[9]?.map((o) => o.booking_reference_id).sort()).toEqual(["REF", "REF2"]);
      expect(day.overlaps[10]?.map((o) => o.booking_reference_id).sort()).toEqual(["REF", "REF2"]);
      expect(day.overlaps[11]).toBeNull();
      // The hour is still booked — the overlap is drawn over it, not instead.
      expect(day.hours[9]).not.toBeNull();
    });

    it("week view: one band covering exactly the shared stretch", () => {
      const range = availabilityRange("week", "2030-01-11")!;
      const week = bucketOccupancyByDay([room()], [seg, other], range).get("room-1")!;
      expect(week.overlaps).toHaveLength(1);
      const span = range.end.getTime() - range.start.getTime();
      const from =
        (new Date(other.check_in).getTime() - range.start.getTime()) / span;
      const to = (new Date(seg.check_out).getTime() - range.start.getTime()) / span;
      expect(week.overlaps[0].from).toBeCloseTo(from, 10);
      expect(week.overlaps[0].to).toBeCloseTo(to, 10);
      expect(
        week.overlaps[0].segments.map((o) => o.booking_reference_id).sort()
      ).toEqual(["REF", "REF2"]);
    });

    it("stays that only touch at check-out are not an overlap", () => {
      const backToBack: RoomOccupancySegment = {
        ...other,
        check_in: seg.check_out,
      };
      const { start } = instituteDayBounds("2030-01-11");
      const day = bucketOccupancyByHour([room()], [seg, backToBack], start).get("room-1")!;
      expect(day.overlaps.every((o) => o === null)).toBe(true);
      const range = availabilityRange("week", "2030-01-11")!;
      expect(
        bucketOccupancyByDay([room()], [seg, backToBack], range).get("room-1")!.overlaps
      ).toEqual([]);
    });
  });
});

// --------------------------------------------- the mock store emulates Postgres

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
});
afterAll(() => db.cleanup());

async function newBooking(checkIn: string, checkOut: string) {
  const b = await store.createBooking({
    user_id: "employee-priya",
    guest_house_id: "gh-hamsanandi",
    user_role: "employee",
    status: "PENDING_GH_MANAGER",
    purpose_of_visit: "Test",
    check_in: checkIn,
    check_out: checkOut,
    booking_type: "personal",
    service_type: "room",
    debit_head: "personal_funds",
    debit_details: null,
    debit_document_url: null,
    meal_preference: null,
    meal_guest_count: null,
    pets_policy_acknowledged: true,
    alumni_name: null,
    alumni_roll_number: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    rooms: [{ room_type: null, guests: [{ name: "G", age: 30, gender: "male", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
  });
  return b.id;
}

const ROOM = "gh-hamsanandi-C2";
const log = { action_by: "gh-manager", action_by_name: "Manager", new_status: "APPROVED" as const, remarks: "test" };
const allocate = (id: string, overrides: string[] = []) =>
  store.updateBookingStatus(
    id,
    { status: "APPROVED", assigned_room_ids: [ROOM], override_room_ids: overrides, override_by: overrides.length ? "gh-manager" : null },
    log
  );

describe("mock store: the constraint with the default 4-hour buffer", () => {
  let first: string;

  beforeAll(async () => {
    first = await newBooking("2030-03-10T06:30:00.000Z", "2030-03-11T06:30:00.000Z");
    await allocate(first);
  });

  it("refuses a check-in three hours after the last check-out", async () => {
    const id = await newBooking("2030-03-11T09:30:00.000Z", "2030-03-12T06:30:00.000Z");
    await expect(allocate(id)).rejects.toBeInstanceOf(RoomClashError);
    expect(await store.getOccupiedRoomIds("gh-hamsanandi", "2030-03-11T09:30:00.000Z", "2030-03-12T06:30:00.000Z")).toContain(ROOM);
  });

  it("allows it four hours after", async () => {
    const id = await newBooking("2030-03-11T10:30:00.000Z", "2030-03-12T06:30:00.000Z");
    await allocate(id);
    expect((await store.getBooking(id))?.assigned_room_ids).toEqual([ROOM]);
    await store.updateBookingStatus(id, { status: "CANCELLED" }, { ...log, new_status: "CANCELLED" });
  });

  it("allows a one-hour overlap the manager accepts, never three", async () => {
    const one = await newBooking("2030-03-11T05:30:00.000Z", "2030-03-12T06:30:00.000Z");
    await allocate(one, [ROOM]);
    await store.updateBookingStatus(one, { status: "CANCELLED" }, { ...log, new_status: "CANCELLED" });
    const three = await newBooking("2030-03-11T03:30:00.000Z", "2030-03-12T06:30:00.000Z");
    await expect(allocate(three, [ROOM])).rejects.toBeInstanceOf(RoomClashError);
  });

  it("draws the turnaround on the occupancy segment", async () => {
    const segs = await store.listRoomOccupancy("gh-hamsanandi", "2030-03-11T00:00:00.000Z", "2030-03-12T00:00:00.000Z");
    const mine = segs.find((s) => s.booking_id === first)!;
    expect(mine.check_out).toBe("2030-03-11T06:30:00.000Z");
    expect(mine.turnaround_until).toBe("2030-03-11T10:30:00.000Z");
    // A window that sees only the turnaround still returns the stay.
    const later = await store.listRoomOccupancy("gh-hamsanandi", "2030-03-11T08:00:00.000Z", "2030-03-11T09:00:00.000Z");
    expect(later.map((s) => s.booking_id)).toContain(first);
  });
});

describe("mock store: changing the buffer", () => {
  it("refuses a buffer that would make allocated stays clash, naming them, and changes nothing", async () => {
    const a = await newBooking("2030-04-10T06:30:00.000Z", "2030-04-11T06:30:00.000Z");
    await allocate(a);
    await store.applyBookingBuffer(0);
    const b = await newBooking("2030-04-11T07:30:00.000Z", "2030-04-12T06:30:00.000Z"); // 1h after
    await allocate(b);
    const err = await store.applyBookingBuffer(240).catch((e) => e);
    expect(err).toBeInstanceOf(BufferClashError);
    expect((err as BufferClashError).clashes).toMatch(/C2: IITPKD-GH-\d{4}-\w+ and IITPKD-GH-\d{4}-\w+/);
    expect(await store.getJsonSetting("rules.booking")).toMatchObject({ buffer_minutes: 0 });
  });

  it("accepts a buffer that fits, and it takes effect at once", async () => {
    await store.applyBookingBuffer(60);
    expect(await store.getJsonSetting("rules.booking")).toMatchObject({ buffer_minutes: 60 });
    const tooClose = await newBooking("2030-04-12T07:00:00.000Z", "2030-04-13T06:30:00.000Z"); // 30 min after b
    await expect(allocate(tooClose)).rejects.toBeInstanceOf(RoomClashError);
  });
});
