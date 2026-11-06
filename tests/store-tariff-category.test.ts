import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildInvoiceDocument } from "@/lib/invoice";
import { DEFAULT_RULES } from "@/lib/settings";
import { deskTariffCategories } from "@/lib/tariff-categories";
import { toInstituteDateValue } from "@/lib/tz";
import type { DataStore } from "@/lib/store/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * **The manager's tariff category, through the store** (31 Oct 2026,
 * migration 35).
 *
 * `tests/fifteenth-round.test.ts` has the rules on plain data; this walks the
 * seeded demo database the way the desk does - the request waiting at the
 * manager, the categories the office's own sheet offers for it, the approval
 * that records one, and the invoice priced at it afterwards. The store is the
 * seam where this round could break silently: the two columns are written by
 * `updateBookingStatus` beside the rooms, and a booking that came back
 * without them would be re-priced at the requester's own category with
 * nothing on screen to say so.
 */

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles(); // writes the seeded file
});
afterAll(() => db.cleanup());

const CTX = async () => ({
  tariffs: await store.listTariffs(),
  rules: DEFAULT_RULES.invoice,
  capacity: DEFAULT_RULES.capacity,
});

describe("approving with a tariff category", () => {
  it("offers the official categories, II and III, and stores the one chosen", async () => {
    const tariffs = await store.listTariffs();
    const houses = await store.listGuestHouses();
    const hamsanandi = houses.find((h) => h.name === "Hamsanandi")!;
    const waiting = (await store.listBookings({ status: "PENDING_GH_MANAGER" })).find(
      (b) => b.guest_house_id === hamsanandi.id && b.service_type !== "meals_only"
    );
    expect(waiting, "the seed should leave a Hamsanandi stay at the desk").toBeTruthy();
    const booking = waiting!;

    const categories = deskTariffCategories(tariffs, {
      guestHouse: booking.guest_house,
      booking: { booking_type: booking.booking_type, user_role: booking.user_role },
      service: booking.service_type,
      date: toInstituteDateValue(new Date(booking.check_in)),
    });
    // The seeded sheet (4 Nov 2026): an official stay at Hamsanandi is
    // Category III at ₹2,500 by the department's own facts, or Category II at
    // ₹2,000 - and never Category I, which is a personal stay's.
    expect(categories.map((c) => c.headline?.rate)).toEqual([2500, 2000]);
    expect(categories.map((c) => c.label.split(":")[0])).toEqual(["Category III", "Category II"]);
    const officer = categories[1];
    expect(officer.label).toContain("official duty");

    const rooms = await store.listRooms(booking.guest_house_id);
    await store.updateBookingStatus(
      booking.id,
      {
        status: "APPROVED",
        assigned_room_ids: [rooms[0].id],
        tariff_scope: officer.scope,
      },
      {
        action_by: null,
        action_by_name: "Guest House Manager",
        new_status: "APPROVED",
        remarks: `Rooms allocated: ${rooms[0].room_number} Tariff category: ${officer.label}.`,
      }
    );

    const stored = await store.getBooking(booking.id);
    expect(stored!.tariff_booking_type).toBe(officer.scope.booking_type);
    expect(stored!.tariff_requester_role).toBe("official");
    // Who asked, and what kind of stay it is, are untouched - the category is
    // about the rate and nothing else.
    expect(stored!.user_role).toBe(booking.user_role);
    expect(stored!.booking_type).toBe(booking.booking_type);

    // And the invoice follows it, with the office's wording on the snapshot.
    const ctx = await CTX();
    const priced = buildInvoiceDocument({ ...stored!, status: "VACATED" }, ctx);
    expect(priced.room_lines[0].rate_incl).toBe(200_000);
    expect(priced.tariff_category).toContain("Category II");

    // The same stay with no category recorded is priced as it always was.
    const legacy = buildInvoiceDocument(
      { ...stored!, status: "VACATED", tariff_booking_type: null, tariff_requester_role: null },
      ctx
    );
    expect(legacy.room_lines[0].rate_incl).toBe(250_000);
    expect(legacy.tariff_category).toBeNull();

    // The price it was approved at is in the trail, which is where it belongs:
    // the booking stores the category, never a rupee figure.
    const log = stored!.logs.find((l) => l.new_status === "APPROVED");
    expect(log?.remarks).toContain("Tariff category:");
  });

  it("clears the category when the approval carries none", async () => {
    const waiting = (await store.listBookings({ status: "PENDING_GH_MANAGER" }))[0];
    expect(waiting).toBeTruthy();
    await store.updateBookingStatus(
      waiting.id,
      { status: "REJECTED", rejection_reason: "Not needed", tariff_scope: null },
      { action_by: null, action_by_name: "Desk", new_status: "REJECTED", remarks: "Not needed" }
    );
    const stored = await store.getBooking(waiting.id);
    expect(stored!.tariff_booking_type).toBeNull();
    expect(stored!.tariff_requester_role).toBeNull();
  });
});
