import * as fs from "fs";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allocateRooms } from "@/app/actions/bookings";
import { reinstateMissedBooking } from "@/app/actions/manager";
import { dispatchOutbox } from "@/lib/mail/dispatch";
import { runMissedSweep } from "@/lib/missed-server";
import {
  as,
  day,
  freeRooms,
  MANAGER,
  mustSubmitRoom,
  reload,
  resetBookings,
  sql,
  submitMeals,
  submitRoom,
} from "./harness";

beforeAll(resetBookings);

describe("meals", () => {
  it("a dining booking at the kitchen goes to the desk and stores its plan", async () => {
    const r = await submitMeals("faculty.cse@iitpkd.ac.in", [day(3), day(4)], 6);
    expect(r.ok ? "ok" : r.error).toBe("ok");
    const [row] = await sql<{ status: string; service_type: string; meals: unknown; meal_diet_counts: unknown }>(
      "select status, service_type, meals, meal_diet_counts from bookings where id = $1",
      [(r as { id: string }).id]
    );
    expect(row.status).toBe("PENDING_GH_MANAGER");
    expect(row.service_type).toBe("meals_only");
    expect(row.meals).toEqual([
      { date: day(3), breakfast: false, lunch: true, dinner: false },
      { date: day(4), breakfast: false, lunch: true, dinner: false },
    ]);
    expect(row.meal_diet_counts).toEqual({ veg: 6, non_veg: 0 });
  });

  it("the kitchen's 30 a sitting counts every live booking for it", async () => {
    expect((await submitMeals("faculty.cse@iitpkd.ac.in", [day(6)], 20)).ok).toBe(true);
    const over = await submitMeals("staff.cse@iitpkd.ac.in", [day(6)], 15);
    expect(over.ok).toBe(false);
    expect((await submitMeals("staff.cse@iitpkd.ac.in", [day(6)], 10)).ok).toBe(true);
  });

  it("a stay at Hamsanandi can carry meals", async () => {
    const b = await mustSubmitRoom("faculty.cse@iitpkd.ac.in", {
      guestHouse: "Hamsanandi",
      checkIn: `${day(8)}T09:00`,
      checkOut: `${day(9)}T10:00`,
      lunchOn: [day(8)],
    });
    expect(b.service_type).toBe("room_meals");
    expect(b.meals.filter((m) => m.lunch).map((m) => m.date)).toEqual([day(8)]);
  });

  it("a student cannot book meals, and cannot book Hamsanandi", async () => {
    const meals = await submitMeals("dayscholar@smail.iitpkd.ac.in", [day(3)], 2);
    expect(meals.ok).toBe(false);
    const hamsanandi = await submitRoom("dayscholar@smail.iitpkd.ac.in", {
      guestHouse: "Hamsanandi",
      checkIn: `${day(8)}T12:00`,
      checkOut: `${day(9)}T10:00`,
    });
    expect(hamsanandi.ok).toBe(false);
  });
});

describe("the nightly Missed sweep", () => {
  it("marks a request whose check-in day has gone, once, and the manager puts it back", async () => {
    const b = await mustSubmitRoom("faculty.cse@iitpkd.ac.in", { checkIn: `${day(12)}T12:00`, checkOut: `${day(13)}T10:00` });
    const waiting = await mustSubmitRoom("staff.cse@iitpkd.ac.in", { checkIn: `${day(12)}T12:00`, checkOut: `${day(13)}T10:00` });
    // Move the first into the past, as if nobody had decided it in time.
    await sql(
      "update bookings set check_in = now() - interval '3 days', check_out = now() - interval '2 days' where id = $1",
      [b.id]
    );

    expect(await runMissedSweep()).toBe(1);
    expect((await reload(b.id)).status).toBe("MISSED");
    expect((await reload(waiting.id)).status).toBe("PENDING_HOD");
    const mail = await sql("select 1 from email_outbox where booking_id = $1 and event_key = 'booking.missed.requester'", [b.id]);
    expect(mail).toHaveLength(1);
    expect(await runMissedSweep()).toBe(0);

    await as(MANAGER);
    expect((await reinstateMissedBooking(b.id, "")).ok).toBe(false);
    expect(await reinstateMissedBooking(b.id, "HOD was away")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("PENDING_HOD");
    // The sweep must not undo the manager's decision the next night.
    expect(await runMissedSweep()).toBe(0);
    expect((await reload(b.id)).status).toBe("PENDING_HOD");
  });

  it("a request whose check-in was earlier today is not missed, and can still be allocated", async () => {
    const b = await mustSubmitRoom("director_iitpkd@iitpkd.ac.in", { checkIn: `${day(0)}T00:00`, checkOut: `${day(1)}T10:00` });
    expect(await runMissedSweep()).toBe(0);
    const [room] = await freeRooms(b);
    await as(MANAGER);
    expect(await allocateRooms(b.id, [room], [], "I")).toEqual({ ok: true });
  });
});

describe("mail", () => {
  it("every step queues mail, and the dispatcher settles all of it", async () => {
    const b = await mustSubmitRoom("btech.saveri@smail.iitpkd.ac.in", { checkIn: `${day(20)}T12:00`, checkOut: `${day(21)}T10:00` });
    const events = await sql<{ event_key: string; to_emails: string[]; cc_emails: string[] }>(
      "select event_key, to_emails, cc_emails from email_outbox where booking_id = $1 order by created_at",
      [b.id]
    );
    expect(events.map((e) => e.event_key)).toContain("booking.submitted.requester");
    expect(events.find((e) => e.event_key === "booking.submitted.requester")?.to_emails).toEqual([
      "btech.saveri@smail.iitpkd.ac.in",
    ]);

    // A dispatch started by the action's `after()` may be mid-send, and a
    // second dispatcher steps aside while one runs - so wait for the queue.
    let unsettled: { status: string; last_error: string | null }[] = [];
    for (let i = 0; i < 50; i++) {
      await dispatchOutbox();
      unsettled = await sql("select status, last_error from email_outbox where status <> 'SENT'");
      if (unsettled.length === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(unsettled).toEqual([]);
  });
});

describe("what PostgreSQL holds that the mock store never saw", () => {
  it("a foreign form_configs row is ignored, and the booking goes through", async () => {
    await sql(
      `insert into form_configs (role, config) values ('student', '{"max_rooms":1,"allowed_guest_houses":["Bageshri"],"require_relationship":true}')
       on conflict (role) do update set config = excluded.config`
    );
    try {
      const r = await submitRoom("phd.malhar@smail.iitpkd.ac.in", { checkIn: `${day(24)}T12:00`, checkOut: `${day(25)}T10:00` });
      expect(r.ok ? "ok" : r.error).toBe("ok");
    } finally {
      await sql("delete from form_configs where role = 'student'");
    }
  });

  describe("an ID document upload", () => {
    const written: string[] = [];
    afterAll(() => {
      for (const p of written) fs.rmSync(path.join(process.cwd(), ".uploads", p), { force: true });
    });

    it("is stored, linked to the guest, and required where the record does not name the guest", async () => {
      const without = await submitRoom("phd.malhar@smail.iitpkd.ac.in", {
        checkIn: `${day(28)}T12:00`,
        checkOut: `${day(29)}T10:00`,
        guests: [{ name: "A Friend", relationship: "Self" }],
      });
      expect(without.ok).toBe(false);

      // A 1x1 PNG.
      const png = Buffer.from(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
          "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
        "hex"
      );
      const file = new File([png], "id.png", { type: "image/png" });
      const r = await submitRoom("phd.malhar@smail.iitpkd.ac.in", {
        checkIn: `${day(28)}T12:00`,
        checkOut: `${day(29)}T10:00`,
        guests: [{ name: "A Friend", relationship: "Self" }],
        files: { guest_doc_0_0: file },
      });
      expect(r.ok ? "ok" : r.error).toBe("ok");
      const [g] = await sql<{ id_document_url: string | null }>(
        "select id_document_url from booking_guests where booking_id = $1",
        [(r as { id: string }).id]
      );
      expect(g.id_document_url).toBeTruthy();
      written.push(g.id_document_url!);
      expect(fs.existsSync(path.join(process.cwd(), ".uploads", g.id_document_url!))).toBe(true);
    });
  });
});
