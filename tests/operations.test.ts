import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extensionError, noShowReleasable, planRoomRange, roomBlockError } from "@/lib/operations";
import type { DataStore } from "@/lib/store/types";
import { RoomClashError, type BookingLog, type NewBookingInput } from "@/lib/types";
import { booking, useThrowawayMockDb } from "./helpers";

/** Operational states (Phase 7): pure rules, then the mock store's behaviour. */

const log = (status: BookingLog["new_status"], timestamp: string): BookingLog => ({
  id: timestamp, booking_id: "b-1", action_by: null, action_by_name: "Desk", previous_status: null, new_status: status, remarks: null, timestamp,
});

describe("adding rooms in bulk", () => {
  it("expands a range, keeping the prefix and padding", () => {
    expect(planRoomRange("B-101 to B-105", []).create).toEqual(["B-101", "B-102", "B-103", "B-104", "B-105"]);
    expect(planRoomRange("H-001 to H-003", []).create).toEqual(["H-001", "H-002", "H-003"]);
    expect(planRoomRange("101-103", []).create).toEqual(["101", "102", "103"]);
    expect(planRoomRange("B-101..B-102, B-301\nB-305", []).create).toEqual(["B-101", "B-102", "B-301", "B-305"]);
  });

  it("skips rooms that exist and reports mistakes", () => {
    const plan = planRoomRange("B-101 to B-104", ["B-102", "b-103"]);
    expect(plan.create).toEqual(["B-101", "B-104"]);
    expect(plan.existing).toEqual(["B-102", "B-103"]);
    expect(planRoomRange("B-110 to B-101", []).problems[0]).toMatch(/backwards/);
    expect(planRoomRange("B-1 to B-500", []).problems[0]).toMatch(/at most 200/);
    expect(planRoomRange("!!", []).problems[0]).toMatch(/not a room number/);
  });
});

describe("rules", () => {
  it("validates a maintenance block", () => {
    expect(roomBlockError({ from: "2030-01-02T00:00:00Z", to: "2030-01-01T00:00:00Z", reason: "Paint" })).toMatch(/back in service/);
    expect(roomBlockError({ from: "2030-01-01T00:00:00Z", to: "2030-01-02T00:00:00Z", reason: "x" })).toMatch(/why/);
    expect(roomBlockError({ from: "2030-01-01T00:00:00Z", to: "2030-01-02T00:00:00Z", reason: "Repainting" })).toBeNull();
  });

  it("allows an extension only later than check-out, on an approved or current stay", () => {
    const b = booking({ status: "OCCUPIED" });
    expect(extensionError(b, "2030-01-13T04:30:00.000Z")).toBeNull();
    expect(extensionError(b, b.check_out)).toMatch(/later/);
    expect(extensionError({ ...b, status: "VACATED" }, "2030-01-13T04:30:00.000Z")).toMatch(/approved or current/);
    expect(extensionError({ ...b, service_type: "meals_only" }, "2030-01-13T04:30:00.000Z")).toMatch(/dining/);
  });

  it("releases a no-show only after check-in time, and never once checked in", () => {
    const b = booking({ status: "APPROVED" });
    const at = (h: number) => new Date(Date.parse(b.check_in) + h * 3_600_000);
    expect(noShowReleasable(b, at(-1))).toBe(false);
    expect(noShowReleasable(b, at(0))).toBe(true);
    expect(noShowReleasable(b, at(5), 6)).toBe(false);
    expect(noShowReleasable(b, at(6), 6)).toBe(true);
    expect(noShowReleasable({ ...b, logs: [log("OCCUPIED", b.check_in)] }, at(8))).toBe(false);
    expect(noShowReleasable({ ...b, status: "OCCUPIED" }, at(8))).toBe(false);
  });
});

// ------------------------------------------------------------------ the store

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;
beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles();
});
afterAll(() => db.cleanup());

const ROOM = "gh-bageshri-B-110";
const input = (checkIn: string, checkOut: string, patch: Partial<NewBookingInput> = {}): NewBookingInput => ({
  user_id: "employee-priya", guest_house_id: "gh-bageshri", user_role: "employee", status: "APPROVED",
  purpose_of_visit: "Visit", check_in: checkIn, check_out: checkOut, booking_type: "official", service_type: "room",
  debit_head: "department_budget", debit_details: null, debit_document_url: null, meal_preference: null, meal_guest_count: null,
  pets_policy_acknowledged: true, alumni_name: null, alumni_roll_number: null, alumni_id_url: null, custom_fields: null, meals: [],
  rooms: [{ room_type: null, guests: [{ name: "Guest One", age: 40, gender: "female", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
  ...patch,
});
const LOG = { action_by: "gh-manager", action_by_name: "Manager", new_status: "APPROVED" as const, remarks: "test" };

describe("maintenance blocks in the store", () => {
  it("refuses a block over a stay, and a stay into a block", async () => {
    const b = await store.createBooking(input("2031-03-10T08:30:00.000Z", "2031-03-12T05:30:00.000Z"));
    await store.updateBookingStatus(b.id, { status: "APPROVED", assigned_room_ids: [ROOM] }, LOG);
    await expect(
      store.createRoomBlock({ room_id: ROOM, from: "2031-03-11T00:00:00.000Z", to: "2031-03-11T06:00:00.000Z", reason: "Paint", created_by: null })
    ).rejects.toThrow(/held for/);
    // Nor in the turnaround buffer (4 h after check-out).
    await expect(
      store.createRoomBlock({ room_id: ROOM, from: "2031-03-12T07:00:00.000Z", to: "2031-03-12T08:00:00.000Z", reason: "Paint", created_by: null })
    ).rejects.toBeInstanceOf(RoomClashError);
    const block = await store.createRoomBlock({ room_id: ROOM, from: "2031-03-20T00:00:00.000Z", to: "2031-03-25T00:00:00.000Z", reason: "Repainting", created_by: null });
    const other = await store.createBooking(input("2031-03-21T08:30:00.000Z", "2031-03-22T05:30:00.000Z"));
    await expect(store.updateBookingStatus(other.id, { status: "APPROVED", assigned_room_ids: [ROOM] }, LOG)).rejects.toThrow(/maintenance/);
    expect(await store.getOccupiedRoomIds("gh-bageshri", "2031-03-21T00:00:00.000Z", "2031-03-22T00:00:00.000Z")).toContain(ROOM);
    // Moving the first stay's dates into the block is refused as well.
    await expect(store.updateBookingDetails(b.id, { check_out: "2031-03-21T05:30:00.000Z" }, LOG)).rejects.toThrow(/maintenance/);
    await store.deleteRoomBlock(block.id);
    await store.updateBookingStatus(other.id, { status: "APPROVED", assigned_room_ids: [ROOM] }, LOG);
    expect((await store.listRoomBlocks("gh-bageshri")).length).toBe(0);
  });
});

describe("extensions in the store", () => {
  it("records a request and settles it when the check-out moves past it", async () => {
    const b = await store.createBooking(input("2031-05-10T08:30:00.000Z", "2031-05-12T05:30:00.000Z"));
    await store.updateBookingDetails(b.id, { extension_request: { until: "2031-05-13T05:30:00.000Z", reason: "Viva moved" } }, LOG);
    expect((await store.getBooking(b.id))?.extension_requested_until).toBe("2031-05-13T05:30:00.000Z");
    await store.updateBookingDetails(b.id, { check_out: "2031-05-13T05:30:00.000Z" }, LOG);
    const after = await store.getBooking(b.id);
    expect(after?.check_out).toBe("2031-05-13T05:30:00.000Z");
    expect(after?.extension_requested_until).toBeNull();
  });
});

describe("no-shows and early check-out", () => {
  it("the automatic release frees the rooms, mails the requester, and is idempotent", async () => {
    const { runNoShowRelease } = await import("@/lib/no-show-server");
    const b = await store.createBooking(input("2031-06-10T08:30:00.000Z", "2031-06-12T05:30:00.000Z"));
    await store.updateBookingStatus(b.id, { status: "APPROVED", assigned_room_ids: ["gh-bageshri-B-201"] }, LOG);
    const later = new Date("2031-06-10T20:00:00.000Z");
    expect(await runNoShowRelease(later, 0)).toBe(0); // off
    await runNoShowRelease(new Date("2031-06-10T10:00:00.000Z"), 6); // too soon for this one
    expect((await store.getBooking(b.id))?.status).toBe("APPROVED");
    expect(await runNoShowRelease(later, 6)).toBeGreaterThanOrEqual(1);
    const released = await store.getBooking(b.id);
    expect(released?.status).toBe("CANCELLED");
    expect(released?.no_show_released_at).toBeTruthy();
    expect(released?.assigned_room_ids).toEqual([]);
    expect(released?.logs.at(-1)?.remarks).toMatch(/no-show/);
    const mails = (await store.listEmails({ bookingId: b.id, limit: 10 })).filter((m) => m.event_key === "booking.no_show.requester");
    expect(mails).toHaveLength(1);
    const again = await runNoShowRelease(later, 6);
    expect((await store.listEmails({ bookingId: b.id, limit: 10 })).filter((m) => m.event_key === "booking.no_show.requester")).toHaveLength(1);
    expect(again).toBe(0);
  });

  it("an early check-out frees the room from that moment", async () => {
    const b = await store.createBooking(input("2031-07-10T08:30:00.000Z", "2031-07-15T05:30:00.000Z"));
    await store.updateBookingStatus(b.id, { status: "APPROVED", assigned_room_ids: ["gh-bageshri-B-202"] }, LOG);
    await store.updateBookingStatus(b.id, { status: "OCCUPIED" }, { ...LOG, new_status: "OCCUPIED" });
    expect(await store.getOccupiedRoomIds("gh-bageshri", "2031-07-12T00:00:00.000Z", "2031-07-13T00:00:00.000Z")).toContain("gh-bageshri-B-202");
    await store.updateBookingStatus(b.id, { status: "VACATED" }, { ...LOG, new_status: "VACATED" });
    expect(await store.getOccupiedRoomIds("gh-bageshri", "2031-07-12T00:00:00.000Z", "2031-07-13T00:00:00.000Z")).not.toContain("gh-bageshri-B-202");
  });
});

describe("bulk rooms in the store", () => {
  it("adds all or nothing", async () => {
    const before = (await store.listAllRooms("gh-bageshri")).length;
    expect(await store.createRooms("gh-bageshri", [{ room_number: "B-401", room_type: "single" }, { room_number: "B-402", room_type: "single" }])).toBe(2);
    await expect(store.createRooms("gh-bageshri", [{ room_number: "B-403", room_type: "single" }, { room_number: "B-401", room_type: "single" }])).rejects.toThrow(/already exists/);
    expect((await store.listAllRooms("gh-bageshri")).length).toBe(before + 2);
  });
});
