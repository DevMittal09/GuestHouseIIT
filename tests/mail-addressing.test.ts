import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addressStaffMail, uniqueAddresses } from "@/lib/mail/addressing";
import { applyRedirect } from "@/lib/mail/redirect";
import type { EmailMessage } from "@/lib/mail/types";
import type { DataStore } from "@/lib/store/types";
import type { BookingStatus, NewBookingInput, Role } from "@/lib/types";
import { useThrowawayMockDb } from "./helpers";

// ---------------------------------------------------------------- pure rules

describe("To and CC", () => {
  it("drops anyone in To from CC, ignoring case", () => {
    expect(addressStaffMail(["Warden@IITPKD.ac.in"], ["warden@iitpkd.ac.in", "fa@iitpkd.ac.in"])).toEqual({
      to: ["Warden@IITPKD.ac.in"],
      cc: ["fa@iitpkd.ac.in"],
    });
  });

  it("de-duplicates both lines and ignores blanks", () => {
    expect(
      addressStaffMail(["a@x.in", "A@x.in ", ""], ["b@x.in", "B@X.IN", null, undefined, "a@x.in"])
    ).toEqual({ to: ["a@x.in"], cc: ["b@x.in"] });
    expect(uniqueAddresses([" c@x.in", "C@x.in", "d@x.in"])).toEqual(["c@x.in", "d@x.in"]);
  });
});

describe("MAIL_REDIRECT_ALL_TO", () => {
  const message = {
    to: ["manager@iitpkd.ac.in"],
    cc: ["warden@iitpkd.ac.in", "hod@iitpkd.ac.in"],
    subject: "Guest house approvals — Mon 21 Sep 2026",
    html: "<html><body><p>Hello</p></body></html>",
    text: "Hello",
    references: ["<root@x>"],
  };

  it("swallows CC as well as To, and records both originals", () => {
    const { message: out, originalRecipients } = applyRedirect(message, "inbox@iitpkd.ac.in");
    expect(out.to).toEqual(["inbox@iitpkd.ac.in"]);
    expect(out.cc).toEqual([]);
    expect(out.headers?.["X-Original-To"]).toBe("manager@iitpkd.ac.in");
    expect(out.headers?.["X-Original-Cc"]).toBe("warden@iitpkd.ac.in, hod@iitpkd.ac.in");
    expect(out.html).toContain("Cc: warden@iitpkd.ac.in, hod@iitpkd.ac.in");
    expect(out.text).toContain("To: manager@iitpkd.ac.in · Cc: warden@iitpkd.ac.in");
    expect(originalRecipients).toEqual([
      "manager@iitpkd.ac.in",
      "warden@iitpkd.ac.in",
      "hod@iitpkd.ac.in",
    ]);
    // Threading survives the redirect, so the redirected inbox still groups.
    expect(out.references).toEqual(["<root@x>"]);
  });

  it("leaves the message alone when no redirect is set", () => {
    expect(applyRedirect(message, null).message).toBe(message);
  });
});

// ------------------------------------------------- every requester role, end to end

let store: DataStore;
let notify: typeof import("@/lib/mail/notify");
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  delete process.env.MAIL_REDIRECT_ALL_TO;
  db = useThrowawayMockDb(); // fresh file: the seed personas and units
  store = new (await import("@/lib/store/mock")).MockStore();
  notify = await import("@/lib/mail/notify");
});
afterAll(() => db.cleanup());

const MANAGER = "guesthouse@iitpkd.ac.in";
const DESK = [MANAGER, "gh.reception@iitpkd.ac.in"];

function input(user: string, role: Role, status: BookingStatus, patch: Partial<NewBookingInput> = {}): NewBookingInput {
  return {
    user_id: user,
    guest_house_id: "gh-bageshri",
    user_role: role,
    status,
    purpose_of_visit: "Test visit",
    check_in: "2031-01-10T06:30:00.000Z",
    check_out: "2031-01-11T04:30:00.000Z",
    booking_type: "official",
    service_type: "room",
    debit_head: null,
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
    rooms: [{ room_type: null, guests: [{ name: "G", age: 40, gender: "female", relationship: "Mother", id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
    ...patch,
  };
}

async function mails(bookingId: string, event: EmailMessage["event_key"]) {
  const rows = await store.listEmails({ bookingId, limit: 50 });
  return rows
    .filter((r) => r.event_key === event)
    .map((r) => ({ to: r.to_emails, cc: r.cc_emails }));
}

/** Submit, then (optionally) forward, reading what each staff mail was addressed to. */
async function route(user: string, role: Role, status: BookingStatus, patch: Partial<NewBookingInput> = {}) {
  const booking = await store.createBooking(input(user, role, status, patch));
  await notify.notifyBookingSubmitted(booking.id);
  return booking.id;
}

async function forward(bookingId: string, approverId: string, from: BookingStatus) {
  await store.updateBookingStatus(bookingId, { status: "PENDING_GH_MANAGER" }, {
    action_by: approverId, action_by_name: "Approver", new_status: "PENDING_GH_MANAGER", remarks: "ok",
  });
  const approver = (await store.getProfile(approverId))!;
  await notify.notifyTierApproved(bookingId, approver, from);
}

describe("staff mail is To the actioner and CC the Copy-to list, for every requester role", () => {
  it("student: warden first, then the manager with the warden in CC", async () => {
    const id = await route("student-anjali", "student", "PENDING_WARDEN", { booking_type: "personal" });
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([
      { to: ["warden.malhar@iitpkd.ac.in"], cc: [] },
    ]);
    await forward(id, "warden-malhar", "PENDING_WARDEN");
    expect(await mails(id, "booking.pending.reviewer")).toEqual([
      { to: [MANAGER], cc: ["warden.malhar@iitpkd.ac.in"] },
    ]);
  });

  it("the Saveri warden is never To or CC on a Malhar student's request", async () => {
    const id = await route("student-anjali", "student", "PENDING_WARDEN", { booking_type: "personal" });
    const all = await store.listEmails({ bookingId: id });
    expect(all.flatMap((m) => [...m.to_emails, ...m.cc_emails])).not.toContain("warden.saveri@iitpkd.ac.in");
  });

  it("club: the council secretary (by appointment), then the manager with the secretary in CC", async () => {
    const id = await route("club-petrichor", "club", "PENDING_FA");
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([
      { to: ["112301045@smail.iitpkd.ac.in"], cc: [] },
    ]);
    await forward(id, "secretary-cultural", "PENDING_FA");
    expect(await mails(id, "booking.pending.reviewer")).toEqual([
      { to: [MANAGER], cc: ["112301045@smail.iitpkd.ac.in"] },
    ]);
  });

  it("faculty official: the HOD, then the manager with the HOD in CC", async () => {
    const id = await route("employee-priya", "employee", "PENDING_HOD");
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([
      { to: ["hod.cse@iitpkd.ac.in"], cc: [] },
    ]);
    await forward(id, "hod-cse", "PENDING_HOD");
    expect(await mails(id, "booking.pending.reviewer")).toEqual([
      { to: [MANAGER], cc: ["hod.cse@iitpkd.ac.in"] },
    ]);
  });

  it("faculty personal: straight to the manager, nobody in CC", async () => {
    const id = await route("employee-priya", "employee", "PENDING_GH_MANAGER", {
      booking_type: "personal",
    });
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([{ to: [MANAGER], cc: [] }]);
  });

  it("an office: the manager, with the office's head in CC", async () => {
    const id = await route("official-admin", "official", "PENDING_GH_MANAGER");
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([
      { to: [MANAGER], cc: ["director@iitpkd.ac.in"] },
    ]);
  });

  it("IAR Office booking for itself: the manager, its head in CC, and never itself as approver", async () => {
    const id = await route("iar-cell", "iar_cell", "PENDING_GH_MANAGER");
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([
      { to: [MANAGER], cc: ["dean.iar@iitpkd.ac.in"] },
    ]);
  });

  it("IAR Student Cell: the IAR Office, then the manager with the IAR Office in CC", async () => {
    const id = await route("iar-student-cell", "iar_student_cell", "PENDING_IAR", {
      booking_type: "alumni",
      alumni_name: "A. Alumnus",
      alumni_roll_number: "101",
    });
    expect(await mails(id, "booking.submitted.reviewer")).toEqual([{ to: ["iar@iitpkd.ac.in"], cc: [] }]);
    await forward(id, "iar-cell", "PENDING_IAR");
    expect(await mails(id, "booking.pending.reviewer")).toEqual([
      { to: [MANAGER], cc: ["iar@iitpkd.ac.in"] },
    ]);
  });

  it("allocation: one message per desk address, the Copy-to list in CC on the first only", async () => {
    const id = await route("student-anjali", "student", "PENDING_WARDEN", { booking_type: "personal" });
    await store.updateBookingStatus(id, { status: "APPROVED", assigned_room_ids: ["gh-bageshri-B-110"] }, {
      action_by: "gh-manager", action_by_name: "Manager", new_status: "APPROVED", remarks: "Rooms",
    });
    await notify.notifyRoomsAllocated(id, (await store.getProfile("gh-manager"))!);
    const desk = await mails(id, "booking.allocated.desk");
    // Threaded mail: one per recipient, CC once, so the warden joins the
    // first recipient's thread rather than receiving it twice.
    expect(desk.map((m) => m.to[0]).sort()).toEqual([...DESK].sort());
    expect(desk.flatMap((m) => m.cc)).toEqual(["warden.malhar@iitpkd.ac.in"]);
  });

  it("cancellation: To the manager, the reviewers in CC — no separate for-information mail", async () => {
    const id = await route("employee-priya", "employee", "PENDING_HOD");
    await notify.notifyCancellationRequested(id, "Plans changed");
    expect(await mails(id, "booking.cancellation_requested.manager")).toEqual([
      { to: [MANAGER], cc: ["hod.cse@iitpkd.ac.in"] },
    ]);
    expect(await mails(id, "booking.cancellation_requested.reviewer")).toEqual([]);
  });

  it("threaded staff mail shares the day's thread root for To, and CC rides on it", async () => {
    const id = await route("student-anjali", "student", "PENDING_WARDEN", { booking_type: "personal" });
    await forward(id, "warden-malhar", "PENDING_WARDEN");
    const [row] = (await store.listEmails({ bookingId: id })).filter(
      (r) => r.event_key === "booking.pending.reviewer"
    );
    expect(row.thread_root).toMatch(/^<gh-approvals-\d{4}-\d{2}-\d{2}-[0-9a-f]{16}@/);
    expect(row.cc_emails).toEqual(["warden.malhar@iitpkd.ac.in"]);
  });
});
