import { beforeEach, describe, expect, it } from "vitest";
import { allocateRooms, cancelBooking } from "@/app/actions/bookings";
import { getRoomAvailability } from "@/app/actions/availability";
import { getInvoicePanel, issueInvoiceAction, saveInvoiceDraftAction } from "@/app/actions/invoices";
import { managerCancelBooking, reassignRooms, updateBookingStay } from "@/app/actions/manager";
import { shortenStayAction } from "@/app/actions/operations";
import { getStore } from "@/lib/store";
import { as, CARETAKER, day, freeRooms, MANAGER, mustSubmitRoom, reload, resetBookings, sql, submitRoom } from "./harness";

beforeEach(async () => {
  await resetBookings();
  await sql("update rooms set room_class = 'general'");
});
const stay = { checkIn: `${day(5)}T12:00`, checkOut: `${day(15)}T10:00` };
const employee = "staff.cse@iitpkd.ac.in";

async function request(bookingType: "personal" | "official" = "personal") {
  return mustSubmitRoom(employee, { ...stay, bookingType });
}
async function allocated(bookingType: "personal" | "official" = "personal") {
  const b = await request(bookingType);
  const [room] = await freeRooms(b);
  await as(MANAGER);
  expect(await allocateRooms(b.id, [room], [], "III")).toEqual({ ok: true });
  return reload(b.id);
}

describe("meeting decisions through PostgreSQL actions", () => {
  it("requires a manager category, persists it, and rejects a caretaker allocation", async () => {
    const b = await request(); const [room] = await freeRooms(b);
    await as(CARETAKER);
    expect((await allocateRooms(b.id, [room], [], "I")).ok).toBe(false);
    await as(MANAGER);
    expect((await allocateRooms(b.id, [room])).ok).toBe(false);
    expect((await allocateRooms(b.id, [room], [], "IV")).ok).toBe(false);
    expect(await allocateRooms(b.id, [room], [], "II")).toEqual({ ok: true });
    expect((await reload(b.id)).tariff_category).toBe("II");
  });
  it("uses the manager category when pricing an invoice", async () => {
    const b = await allocated();
    const panel = await getInvoicePanel(b.id);
    expect(JSON.stringify(panel)).toContain('"tariff_category":"III"');
    expect(JSON.stringify(panel)).toContain('200000'); // Bageshri Category III, paise
  });
  it("refuses official invoice drafts and issue from the caretaker", async () => {
    const b = await allocated("official");
    await as(CARETAKER);
    expect((await saveInvoiceDraftAction(b.id, null, [])).ok).toBe(false);
    const issued = await issueInvoiceAction(b.id, null);
    expect(issued.ok).toBe(false);
    expect(issued.ok ? "" : issued.error).toMatch(/Only the Guest House Manager/);
    expect(await sql("select id from invoices where booking_id = $1", [b.id])).toHaveLength(0);
  });
  it("shortens a pending request before allocation, keeps original dates, and queues notification", async () => {
    const b = await request(); await as(MANAGER);
    expect(await updateBookingStay(b.id, { check_out: `${day(8)}T10:00`, reason: "Only three days approved" })).toEqual({ ok: true });
    const changed = await reload(b.id);
    expect(changed.original_check_in).toBe(b.check_in);
    expect(changed.original_check_out).toBe(b.check_out);
    expect(changed.check_out).not.toBe(b.check_out);
    expect(await sql("select id from email_outbox where booking_id = $1 and event_key = 'booking.stay_shortened.requester'", [b.id])).toHaveLength(1);
    const [room] = await freeRooms(changed);
    expect(await allocateRooms(b.id, [room], [], "I")).toEqual({ ok: true });
    expect(await shortenStayAction(b.id, `${day(7)}T10:00`, "One day less")).toEqual({ ok: true });
    expect((await reload(b.id)).original_check_out).toBe(b.check_out);
    const [hold] = await sql<{ until: string }>("select upper(during)::text as until from room_holds where booking_id = $1", [b.id]);
    expect(new Date(hold.until).toISOString()).toBe((await reload(b.id)).check_out);
  });
  it("rejects booking type changes and caretaker date/category changes", async () => {
    const b = await allocated(); await as(CARETAKER);
    expect((await updateBookingStay(b.id, { tariff_category: "I", reason: "Change" })).ok).toBe(false);
    expect((await shortenStayAction(b.id, `${day(7)}T10:00`, "Change")).ok).toBe(false);
    await as(MANAGER);
    const forged = { booking_type: "official", reason: "Change" };
    expect((await updateBookingStay(b.id, forged)).ok).toBe(false);
    expect((await reload(b.id)).booking_type).toBe("personal");
  });
  it.each(["vip", "reserved", "director_only"] as const)("blocks a general requester from %s on allocation and reassignment", async (roomClass) => {
    const b = await request(); const rooms = await freeRooms(b);
    await getStore().updateRoom(rooms[0], { room_class: roomClass });
    await as(MANAGER);
    expect((await allocateRooms(b.id, [rooms[0]], [], "I")).ok).toBe(false);
    expect(await allocateRooms(b.id, [rooms[1]], [], "I")).toEqual({ ok: true });
    expect((await reassignRooms(b.id, [rooms[0]], "Move")).ok).toBe(false);
  });
  it("does not disclose restricted inventory or count a reserved room as available", async () => {
    const b = await request(); const rooms = await freeRooms(b);
    await getStore().updateRoom(rooms[0], { room_class: "reserved" });
    await getStore().updateRoom(rooms[1], { room_class: "director_only" });
    await getStore().updateRoom(rooms[2], { room_class: "vip" });
    await as(employee);
    const result = await getRoomAvailability(b.guest_house_id, b.check_in, b.check_out);
    expect(result.rooms).toEqual([]); expect(result.segments).toEqual([]);
    expect(result.counts.total).toBe(0); expect(result.counts.freeThroughout).toBe(1);
    await as(MANAGER);
    const desk = await getRoomAvailability(b.guest_house_id, b.check_in, b.check_out);
    expect(desk.rooms).toHaveLength(4);
  });
  it("rejects late requester cancellation but lets the manager release the rooms", async () => {
    const b = await allocated();
    await updateBookingStay(b.id, { check_in: `${day(0)}T23:59`, reason: "Arriving tonight" });
    await as(employee);
    expect((await cancelBooking(b.id, "Cannot travel")).ok).toBe(false);
    await as(MANAGER);
    expect(await managerCancelBooking(b.id, "Visit cancelled")).toEqual({ ok: true });
    expect(await sql("select 1 from room_holds where booking_id = $1", [b.id])).toHaveLength(0);
  });
  /**
   * **Superseded on 10 Nov 2026.** The meeting of 9 Nov exempted official
   * bookings from the stay cap, and this asserted that through the real
   * action. The owner then asked for "14 days max for everyone", so the
   * exemption - and the older one for the `official`, `gh_manager` and
   * `developer` roles - is gone. A stay that must run longer is extended by
   * the desk after approval, which is a different action and still uncapped.
   */
  it("refuses a 30-night stay whatever the booking type", async () => {
    const dates = { checkIn: `${day(5)}T12:00`, checkOut: `${day(35)}T10:00` };
    for (const bookingType of ["personal", "official"] as const) {
      const result = await submitRoom(employee, { ...dates, bookingType });
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/14 nights/);
    }
    // And the same account books a stay inside the cap without complaint.
    const within = { checkIn: `${day(5)}T12:00`, checkOut: `${day(12)}T10:00` };
    expect((await submitRoom(employee, { ...within, bookingType: "official" })).ok).toBe(true);
  });
  it("enforces research-scholar spouse eligibility on the server", async () => {
    for (const email of ["btech.saveri@smail.iitpkd.ac.in", "dayscholar@smail.iitpkd.ac.in"]) {
      const result = await submitRoom(email, { ...stay, guests: [{ relationship: "Spouse" }], files: { "guest_doc_0_0": new File(["%PDF-1.4\n%%EOF"], "id.pdf", { type: "application/pdf" }) } });
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/server:.*spouse/i);
    }
    for (const email of ["phd.malhar@smail.iitpkd.ac.in", "ms.tilang@smail.iitpkd.ac.in"]) {
      const result = await submitRoom(email, { ...stay, guests: [{ relationship: "Spouse" }], files: { "guest_doc_0_0": new File(["%PDF-1.4\n%%EOF"], "id.pdf", { type: "application/pdf" }) } });
      expect(result.ok ? "ok" : result.error).toBe("ok");
    }
  });
});
