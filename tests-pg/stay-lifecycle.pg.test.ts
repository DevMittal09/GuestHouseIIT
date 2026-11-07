import { beforeAll, describe, expect, it } from "vitest";
import {
  allocateRooms,
  approveCancellation,
  cancelBooking,
  rejectCancellation,
  updateBookingLifecycle,
} from "@/app/actions/bookings";
import { issueInvoiceAction, markInvoicePaidAction } from "@/app/actions/invoices";
import { managerCancelBooking } from "@/app/actions/manager";
import { extendStayAction, moveCheckInAction } from "@/app/actions/operations";
import type { BookingWithDetails } from "@/lib/types";
import { as, CARETAKER, day, freeRooms, MANAGER, mustSubmitRoom, reload, resetBookings, sql } from "./harness";

/**
 * After approval: arrival, extensions, check-out, the bill, cancellations -
 * every write here goes through `updateBookingStatus` /
 * `updateBookingDetails` and the room-hold functions on PostgreSQL.
 */
beforeAll(resetBookings);

async function approved(email: string, o: Parameters<typeof mustSubmitRoom>[1]): Promise<BookingWithDetails> {
  const b = await mustSubmitRoom(email, o);
  expect(b.status).toBe("PENDING_GH_MANAGER");
  const [room] = await freeRooms(b);
  await as(MANAGER);
  expect(await allocateRooms(b.id, [room])).toEqual({ ok: true });
  return reload(b.id);
}

/** A stay that began at midnight this morning - the earliest a booking may name. */
const today = { checkIn: `${day(0)}T00:00`, checkOut: `${day(1)}T10:00` };

describe("a personal stay is settled before it is vacated", () => {
  it("Occupied -> refused Vacated -> invoice -> paid -> Vacated", async () => {
    const b = await approved("staff.cse@iitpkd.ac.in", { ...today, bookingType: "personal" });

    await as(CARETAKER);
    expect(await updateBookingLifecycle(b.id, "OCCUPIED")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("OCCUPIED");

    const unpaid = await updateBookingLifecycle(b.id, "VACATED");
    expect(unpaid.ok).toBe(false);
    expect((await reload(b.id)).status).toBe("OCCUPIED");

    const issued = await issueInvoiceAction(b.id, null);
    expect(issued.ok ? "ok" : issued.error).toBe("ok");
    const { invoiceId, number } = issued as { invoiceId: string; number: string };
    expect(number).toMatch(/\d/);
    const [inv] = await sql<{ status: string; grand_total: string }>(
      "select status, grand_total from invoices where id = $1",
      [invoiceId]
    );
    expect(inv.status).toBe("issued");
    expect(Number(inv.grand_total)).toBeGreaterThan(0);

    expect((await markInvoicePaidAction(invoiceId, "cash", null, null)).ok).toBe(false);
    expect(await markInvoicePaidAction(invoiceId, "upi", "UTR4455667788", null)).toEqual({ ok: true });
    expect(await updateBookingLifecycle(b.id, "VACATED")).toEqual({ ok: true });

    const after = await reload(b.id);
    expect(after.status).toBe("VACATED");
    expect(await sql("select 1 from room_holds where booking_id = $1", [b.id])).toHaveLength(0);
  });

  it("the manager alone may close one off unpaid, with a reason that is logged", async () => {
    const b = await approved("registrar@iitpkd.ac.in", { ...today, bookingType: "personal" });
    await as(CARETAKER);
    expect(await updateBookingLifecycle(b.id, "OCCUPIED")).toEqual({ ok: true });
    expect((await updateBookingLifecycle(b.id, "VACATED", "Guest left early")).ok).toBe(false);
    await as(MANAGER);
    expect(await updateBookingLifecycle(b.id, "VACATED", "Guest left early")).toEqual({ ok: true });
    const [log] = await sql<{ remarks: string }>(
      "select remarks from booking_logs where booking_id = $1 and new_status = 'VACATED'",
      [b.id]
    );
    expect(log.remarks).toContain("Guest left early");
  });

  it("a stay that has not begun cannot be marked Occupied", async () => {
    const b = await approved("staff.cse@iitpkd.ac.in", {
      checkIn: `${day(5)}T12:00`,
      checkOut: `${day(6)}T10:00`,
      bookingType: "personal",
    });
    await as(CARETAKER);
    expect((await updateBookingLifecycle(b.id, "OCCUPIED")).ok).toBe(false);
  });
});

describe("an official stay is billed after check-out", () => {
  it("Vacated first, then an invoice left outstanding", async () => {
    const b = await approved("director_iitpkd@iitpkd.ac.in", today);
    await as(CARETAKER);
    expect(await updateBookingLifecycle(b.id, "OCCUPIED")).toEqual({ ok: true });
    expect(await updateBookingLifecycle(b.id, "VACATED")).toEqual({ ok: true });
    const issued = await issueInvoiceAction(b.id, null);
    expect(issued.ok ? "ok" : issued.error).toBe("ok");
    const [inv] = await sql<{ status: string }>("select status from invoices where booking_id = $1", [b.id]);
    expect(inv.status).toBe("issued");
    // An issued invoice is frozen: a second one is refused until it is cancelled.
    expect((await issueInvoiceAction(b.id, null)).ok).toBe(false);
  });
});

describe("the desk moves a stay's dates", () => {
  it("extends an occupied stay, moving its holds", async () => {
    const b = await approved("director_iitpkd@iitpkd.ac.in", today);
    await as(CARETAKER);
    await updateBookingLifecycle(b.id, "OCCUPIED");
    expect((await extendStayAction(b.id, `${day(3)}T10:00`, "")).ok).toBe(false);
    expect(await extendStayAction(b.id, `${day(3)}T10:00`, "Guest stays on")).toEqual({ ok: true });
    const [hold] = await sql<{ upper: string }>(
      "select upper(during)::text as upper from room_holds where booking_id = $1",
      [b.id]
    );
    expect(new Date(hold.upper).toISOString()).toBe(new Date((await reload(b.id)).check_out).toISOString());
  });

  it("moves a check-in later for a late arrival", async () => {
    const b = await approved("iar@iitpkd.ac.in", { checkIn: `${day(8)}T12:00`, checkOut: `${day(10)}T10:00` });
    await as(MANAGER);
    expect(await moveCheckInAction(b.id, `${day(9)}T15:00`, "Arriving a day late")).toEqual({ ok: true });
    const after = await reload(b.id);
    expect(after.check_in).toBe(new Date(`${day(9)}T15:00:00+05:30`).toISOString());
    expect(after.status).toBe("APPROVED");
  });

  it("refuses an extension onto a room somebody else holds", async () => {
    const first = await approved("iar@iitpkd.ac.in", { checkIn: `${day(40)}T12:00`, checkOut: `${day(41)}T10:00` });
    const second = await mustSubmitRoom("director_iitpkd@iitpkd.ac.in", {
      checkIn: `${day(42)}T12:00`,
      checkOut: `${day(43)}T10:00`,
    });
    await as(MANAGER);
    expect(await allocateRooms(second.id, first.assigned_room_ids)).toEqual({ ok: true });
    expect((await extendStayAction(first.id, `${day(43)}T10:00`, "Staying on")).ok).toBe(false);
    expect((await reload(first.id)).check_out).toBe(first.check_out);
  });
});

describe("cancellation", () => {
  it("a requester asks, the manager declines, the requester asks again, the manager approves", async () => {
    const b = await approved("iar@iitpkd.ac.in", { checkIn: `${day(50)}T12:00`, checkOut: `${day(51)}T10:00` });
    await as("iar@iitpkd.ac.in");
    expect((await cancelBooking(b.id, "")).ok).toBe(false);
    expect(await cancelBooking(b.id, "Visit postponed")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("CANCELLATION_REQUESTED");
    // Rooms are still held while the request is open.
    expect(await sql("select 1 from room_holds where booking_id = $1", [b.id])).toHaveLength(1);

    await as(MANAGER);
    expect(await rejectCancellation(b.id, "Already invoiced to the department")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("APPROVED");

    await as("iar@iitpkd.ac.in");
    expect(await cancelBooking(b.id, "Visit cancelled")).toEqual({ ok: true });
    await as(MANAGER);
    expect(await approveCancellation(b.id)).toEqual({ ok: true });
    const after = await reload(b.id);
    expect(after.status).toBe("CANCELLATION_APPROVED");
    expect(after.assigned_room_ids).toEqual([]);
    expect(await sql("select 1 from room_holds where booking_id = $1", [b.id])).toHaveLength(0);
  });

  it("someone else cannot cancel your booking", async () => {
    const b = await approved("iar@iitpkd.ac.in", { checkIn: `${day(54)}T12:00`, checkOut: `${day(55)}T10:00` });
    await as("faculty.cse@iitpkd.ac.in");
    expect((await cancelBooking(b.id, "Not mine")).ok).toBe(false);
  });

  it("a pending request cancelled by its requester also waits for the manager", async () => {
    const b = await mustSubmitRoom("faculty.cse@iitpkd.ac.in", { checkIn: `${day(56)}T12:00`, checkOut: `${day(57)}T10:00` });
    await as("faculty.cse@iitpkd.ac.in");
    expect(await cancelBooking(b.id, "Changed plans")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("CANCELLATION_REQUESTED");
  });

  it("the manager cancels outright, and the room is free again", async () => {
    const b = await approved("director_iitpkd@iitpkd.ac.in", { checkIn: `${day(58)}T12:00`, checkOut: `${day(59)}T10:00` });
    await as(MANAGER);
    expect(await managerCancelBooking(b.id, "Guest house closed for repairs")).toEqual({ ok: true });
    const after = await reload(b.id);
    expect(after.status).toBe("CANCELLED");
    expect((await freeRooms(after)).length).toBe(4);
  });
});
