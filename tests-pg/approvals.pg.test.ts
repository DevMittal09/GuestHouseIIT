import { beforeAll, describe, expect, it } from "vitest";
import { allocateRooms, reviewBooking } from "@/app/actions/bookings";
import { as, day, freeRooms, logsOf, MANAGER, mustSubmitRoom, reload, resetBookings, sql, submitRoom } from "./harness";

/**
 * Who a request goes to first, who may forward it, and who may not - on
 * PostgreSQL, through the real actions. Forwarding failed outright on this
 * store until 7 Nov 2026 (`assignRoomsToCards` bound text into a uuid).
 */
beforeAll(resetBookings);

const stay = (n: number) => ({ checkIn: `${day(n)}T12:00`, checkOut: `${day(n + 1)}T10:00` });

describe("first stage of each kind of request", () => {
  it.each([
    ["dayscholar@smail.iitpkd.ac.in", "PENDING_GH_MANAGER", "a student with no hostel goes straight to the desk"],
    ["btech.saveri@smail.iitpkd.ac.in", "PENDING_WARDEN", "a Saveri student goes to the warden office"],
    ["ms.tilang@smail.iitpkd.ac.in", "PENDING_WARDEN", "a Tilang student goes to the warden office"],
    ["faculty.cse@iitpkd.ac.in", "PENDING_HOD", "faculty go to their HOD"],
    ["staff.cse@iitpkd.ac.in", "PENDING_HOD", "non-teaching staff go to their HOD"],
    ["director_iitpkd@iitpkd.ac.in", "PENDING_GH_MANAGER", "an office with no HOD goes direct"],
    ["iar@iitpkd.ac.in", "PENDING_GH_MANAGER", "the IAR Office goes direct"],
  ])("%s -> %s (%s)", async (email, status) => {
    const b = await mustSubmitRoom(email, stay(10));
    expect(b.status).toBe(status);
    const [first] = await logsOf(b.id);
    expect(first.new_status).toBe(status);
    expect(first.previous_status).toBeNull();
  });

  it("an office that chooses Requires HOD approval goes to its HOD", async () => {
    const b = await mustSubmitRoom("office_cs@iitpkd.ac.in", { ...stay(10), officeApproval: "hod" });
    expect(b.status).toBe("PENDING_HOD");
  });

  it("a club's booking is raised by its Faculty Advisor and goes straight to the desk", async () => {
    const r = await submitRoom("advisor.cultural@iitpkd.ac.in", { ...stay(10), forClub: "sec_arts@iitpkd.ac.in" });
    expect(r.ok ? "ok" : r.error).toBe("ok");
    const [row] = await sql<{ status: string; role: string; creator: string }>(
      `select b.status, b.user_role as role, c.email as creator
         from bookings b join profiles c on c.id = b.created_by where b.id = $1`,
      [(r as { id: string }).id]
    );
    expect(row).toEqual({ status: "PENDING_GH_MANAGER", role: "club", creator: "advisor.cultural@iitpkd.ac.in" });
  });

  it("a club's own account cannot submit", async () => {
    const r = await submitRoom("sec_arts@iitpkd.ac.in", stay(10));
    expect(r.ok).toBe(false);
  });
});

describe("forwarding", () => {
  it("the Saveri Assistant Warden forwards; the Warden, Deputy, another hostel and the HOD cannot", async () => {
    const b = await mustSubmitRoom("btech.saveri@smail.iitpkd.ac.in", stay(14));
    for (const wrong of [
      "warden.saveriboys@iitpkd.ac.in",
      "dwarden.saveriboys@iitpkd.ac.in",
      "awarden.malharboys@iitpkd.ac.in",
      "hod.cse@iitpkd.ac.in",
    ]) {
      await as(wrong);
      expect((await reviewBooking(b.id, "approve")).ok, wrong).toBe(false);
    }
    expect((await reload(b.id)).status).toBe("PENDING_WARDEN");

    await as("awarden.saveriboys@iitpkd.ac.in");
    expect(await reviewBooking(b.id, "approve")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("PENDING_GH_MANAGER");
    const log = await logsOf(b.id);
    expect(log.at(-1)).toMatchObject({ previous_status: "PENDING_WARDEN", new_status: "PENDING_GH_MANAGER" });
  });

  it("at a hostel with only a Warden, the Warden decides", async () => {
    const b = await mustSubmitRoom("ms.tilang@smail.iitpkd.ac.in", stay(14));
    await as("warden.tilangagirls@iitpkd.ac.in");
    expect(await reviewBooking(b.id, "approve")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("PENDING_GH_MANAGER");
  });

  it("the HOD forwards a faculty request; the requester cannot approve their own", async () => {
    const b = await mustSubmitRoom("faculty.cse@iitpkd.ac.in", stay(14));
    await as("faculty.cse@iitpkd.ac.in");
    expect((await reviewBooking(b.id, "approve")).ok).toBe(false);
    await as("hod.dse@iitpkd.ac.in");
    expect((await reviewBooking(b.id, "approve")).ok).toBe(false);
    await as("hod.cse@iitpkd.ac.in");
    expect(await reviewBooking(b.id, "approve")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("PENDING_GH_MANAGER");
  });

  it("the manager does not approve through review - only by allocating", async () => {
    const b = await mustSubmitRoom("dayscholar@smail.iitpkd.ac.in", stay(14));
    await as(MANAGER);
    expect((await reviewBooking(b.id, "approve")).ok).toBe(false);
  });
});

describe("rejection", () => {
  it("needs a reason, is recorded, and ends the request", async () => {
    const b = await mustSubmitRoom("staff.cse@iitpkd.ac.in", stay(18));
    await as("hod.cse@iitpkd.ac.in");
    expect((await reviewBooking(b.id, "reject", "  ")).ok).toBe(false);
    expect(await reviewBooking(b.id, "reject", "Not an official visit")).toEqual({ ok: true });
    const after = await reload(b.id);
    expect(after.status).toBe("REJECTED");
    expect(after.rejection_reason).toBe("Not an official visit");
    expect((await logsOf(b.id)).at(-1)?.new_status).toBe("REJECTED");
  });

  it("the desk rejects a request waiting for it", async () => {
    const b = await mustSubmitRoom("iar@iitpkd.ac.in", stay(18));
    await as(MANAGER);
    expect(await reviewBooking(b.id, "reject", "No rooms that week")).toEqual({ ok: true });
    expect((await reload(b.id)).status).toBe("REJECTED");
  });
});

describe("allocation", () => {
  it("assigns rooms and approves in one step, holding them in room_holds", async () => {
    const b = await mustSubmitRoom("director_iitpkd@iitpkd.ac.in", stay(22));
    const [room] = await freeRooms(b);
    await as(MANAGER);
    expect(await allocateRooms(b.id, [room])).toEqual({ ok: true });
    const after = await reload(b.id);
    expect(after.status).toBe("APPROVED");
    expect(after.assigned_room_ids).toEqual([room]);
    const holds = await sql("select * from room_holds where booking_id = $1", [b.id]);
    expect(holds).toHaveLength(1);
    const [card] = await sql<{ assigned_room_id: string }>(
      "select assigned_room_id from booking_rooms where booking_id = $1",
      [b.id]
    );
    expect(card.assigned_room_id).toBe(room);
  });

  it("refuses a room another stay already holds - the exclusion constraint, not a pre-check", async () => {
    const first = await mustSubmitRoom("iar@iitpkd.ac.in", stay(26));
    const second = await mustSubmitRoom("director_iitpkd@iitpkd.ac.in", stay(26));
    const [room] = await freeRooms(first);
    await as(MANAGER);
    expect(await allocateRooms(first.id, [room])).toEqual({ ok: true });
    const clash = await allocateRooms(second.id, [room]);
    expect(clash.ok).toBe(false);
    expect((await reload(second.id)).status).toBe("PENDING_GH_MANAGER");
    expect(await sql("select 1 from room_holds where booking_id = $1", [second.id])).toHaveLength(0);
  });

  it("only the manager allocates", async () => {
    const b = await mustSubmitRoom("iar@iitpkd.ac.in", stay(30));
    const [room] = await freeRooms(b);
    for (const who of ["gh.reception@iitpkd.ac.in", "hod.cse@iitpkd.ac.in", "developer@iitpkd.ac.in"]) {
      await as(who);
      expect((await allocateRooms(b.id, [room])).ok, who).toBe(false);
    }
  });
});
