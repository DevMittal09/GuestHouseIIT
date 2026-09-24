import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingPayloadSchema, MAX_COPY_TO_EMAILS } from "@/lib/booking-schema";
import {
  clubsBookableBy,
  facultyInChargeOf,
  mightBeFacultyInCharge,
  mustBookThroughFacultyInCharge,
  raisedByFacultyInCharge,
} from "@/lib/club-booking";
import {
  DEFAULT_DEBIT_RULES,
  debitHeadsByType,
  describeDebit,
  upgradeDebitRules,
} from "@/lib/debit-heads";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import {
  awaitingSettlement,
  buildInvoiceDocument,
  describeMealDates,
  invoiceableFromArchive,
  invoiceFacts,
  invoiceKind,
} from "@/lib/invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { parseRuleGroup, DEFAULT_RULES } from "@/lib/settings";
import type { Tariff } from "@/lib/tariffs";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import type { EmailMessage } from "@/lib/mail/types";
import type { DataStore } from "@/lib/store/types";
import type { NewBookingInput, Profile, Role } from "@/lib/types";
import type { Unit } from "@/lib/units";
import { actsAsRequester, approvalStagesFor, canReviewBooking, initialStatusFor } from "@/lib/workflow";
import { booking, GH, guest, profile, room, useThrowawayMockDb } from "./helpers";

/**
 * The office's fourth list of corrections (24 Sep 2026): invoices after
 * check-out and for dining, project details only with a project, a project's
 * sub-head, lighter guest forms for faculty/staff and official bookings, clubs
 * booked by their Faculty Advisor, per-booking Copy to, and Special Funds.
 */

const HOUSES = [GH];
const checkInDate = addDaysToDateValue(toInstituteDateValue(new Date()), 3);
const checkOutDate = addDaysToDateValue(checkInDate, 2);

function config(role: Role) {
  return sanitizeFormConfig(buildDefaultFormConfig(role, HOUSES), HOUSES);
}

/** A complete, valid official booking for `role`, with the given guest rows. */
function payload(guests: Record<string, unknown>[], patch: Record<string, unknown> = {}) {
  return {
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "official",
    debit_head: "department_budget",
    privacy_consent: true,
    purpose_of_visit: "Visiting collaborator",
    check_in: `${checkInDate}T12:00`,
    check_out: `${checkOutDate}T10:00`,
    rooms: [{ room_type: null, guests }],
    ...patch,
  };
}

function parse(role: Role, body: ReturnType<typeof payload>) {
  return bookingPayloadSchema(config(role), { mealsAvailable: false, requesterEmail: "x@iitpkd.ac.in" }).safeParse(body);
}

const errors = (result: ReturnType<typeof parse>) =>
  result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

// ------------------------------------------------------------- guest fields

describe("guest details: faculty/staff need name and gender, official needs gender", () => {
  it("faculty and staff: name and gender are enough — age, relationship and ID are optional", () => {
    const result = parse("employee", payload([{ name: "Dr. A. Visitor", gender: "male", citizenship: "indian" }]));
    expect(errors(result)).toEqual([]);
    // No age is an adult, not an infant.
    expect(result.success && result.data.rooms[0].guests[0].age).toBeNull();
  });

  it("faculty and staff: name and gender are still required", () => {
    const messages = errors(parse("employee", payload([{ age: "40", citizenship: "indian" }])));
    expect(messages.some((m) => m.startsWith("rooms.0.guests.0.name"))).toBe(true);
    expect(messages.some((m) => m.startsWith("rooms.0.guests.0.gender"))).toBe(true);
  });

  it("official: only the gender is required", () => {
    // An office also chooses Direct or HOD approval; that is not a guest field.
    const office = { office_approval: "direct" };
    expect(errors(parse("official", payload([{ gender: "female", citizenship: "indian" }], office)))).toEqual([]);
    const messages = errors(parse("official", payload([{ name: "A dignitary", citizenship: "indian" }], office)));
    expect(messages).toEqual(["rooms.0.guests.0.gender: Gender is required"]);
  });

  it("a blank age is no longer silently 0 — an infant — where age is required", () => {
    const studentGuest = { name: "Mother", age: "", gender: "female", relationship: "Mother", id_number: "1234 5678 9012", citizenship: "indian" };
    const result = bookingPayloadSchema(config("student"), { mealsAvailable: false }).safeParse(
      payload([studentGuest], { booking_type: "personal", debit_head: "personal_funds" })
    );
    expect(result.success ? [] : result.error.issues.map((i) => i.message)).toContain("Age is required");
  });

  it("an infant can still be aged 0, and the output parses again unchanged", () => {
    const body = payload([
      { name: "Dr. A", gender: "male", citizenship: "indian" },
      { name: "Baby", age: "0", gender: "female", citizenship: "indian" },
    ]);
    const first = parse("employee", body);
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data.rooms[0].guests.map((g) => g.age)).toEqual([null, 0]);
    const second = parse("employee", first.data as unknown as ReturnType<typeof payload>);
    expect(second.success && second.data.rooms[0].guests.map((g) => g.age)).toEqual([null, 0]);
  });

  it("a stored config cannot hide the age, but may make it optional", () => {
    const stored = buildDefaultFormConfig("student", HOUSES);
    expect(sanitizeFormConfig({ ...stored, guest_fields: { ...stored.guest_fields, age: "hidden" } }, HOUSES).guest_fields.age).toBe("required");
    expect(sanitizeFormConfig({ ...stored, guest_fields: { ...stored.guest_fields, age: "optional" } }, HOUSES).guest_fields.age).toBe("optional");
  });
});

// ------------------------------------------------------------------ copy to

describe("Copy to on New Booking", () => {
  const guest1 = [{ name: "Dr. A", gender: "male", citizenship: "indian" }];

  it("drops blank rows and repeats, keeps the rest in order", () => {
    const result = parse("employee", payload(guest1, { copy_to_emails: ["", "sec@iitpkd.ac.in", "guest@example.org", "SEC@iitpkd.ac.in", "  "] }));
    expect(result.success && result.data.copy_to_emails).toEqual(["sec@iitpkd.ac.in", "guest@example.org"]);
    // Round trip: the cleaned list parses to itself.
    if (result.success) {
      const again = parse("employee", result.data as unknown as ReturnType<typeof payload>);
      expect(again.success && again.data.copy_to_emails).toEqual(["sec@iitpkd.ac.in", "guest@example.org"]);
    }
  });

  it("names the row that is not an address", () => {
    expect(errors(parse("employee", payload(guest1, { copy_to_emails: ["ok@iitpkd.ac.in", "not-an-address"] })))).toEqual([
      "copy_to_emails.1: Enter a valid email address",
    ]);
  });

  it("takes as many as are needed, up to the ceiling", () => {
    const many = Array.from({ length: MAX_COPY_TO_EMAILS }, (_, i) => `person${i}@example.org`);
    expect(parse("employee", payload(guest1, { copy_to_emails: many })).success).toBe(true);
    expect(parse("employee", payload(guest1, { copy_to_emails: [...many, "one-more@example.org"] })).success).toBe(false);
  });

  it("is optional", () => {
    const result = parse("employee", payload(guest1));
    expect(result.success && result.data.copy_to_emails).toEqual([]);
  });
});

// ------------------------------------------------ project sub-head, Special Funds

describe("debitable heads: a project's sub-head, and Special Funds", () => {
  const guest1 = [{ name: "Dr. A", gender: "male", citizenship: "indian" }];

  it("takes a typed sub-head with Project, and refuses it with any other head", () => {
    const withProject = parse("employee", payload(guest1, { debit_head: "project_grant", project_id: "p1", debit_subhead: " Travel " }));
    expect(withProject.success && withProject.data.debit_subhead).toBe("Travel");
    expect(errors(parse("employee", payload(guest1, { debit_subhead: "Travel" })))).toEqual([
      "debit_subhead: A sub-head applies only when the head is Project",
    ]);
    // Optional with Project.
    expect(parse("employee", payload(guest1, { debit_head: "project_grant", project_id: "p1" })).success).toBe(true);
  });

  it("offers Special Funds on every official booking, never a student's or a personal one", () => {
    const priya = { staff_category: "faculty" as const, unit_id: null };
    const room = debitHeadsByType("employee", ["official", "personal"], priya, [], DEFAULT_DEBIT_RULES, "room");
    expect(room.official).toContain("special_budget");
    expect(room.personal).toEqual(["personal_funds"]);
    for (const category of ["faculty", "staff", "officer_office", "department_office", "club", "manager"] as const) {
      expect(DEFAULT_DEBIT_RULES.room[category]).toContain("special_budget");
    }
    expect(DEFAULT_DEBIT_RULES.room.student).not.toContain("special_budget");
    expect(DEFAULT_DEBIT_RULES.room.personal).not.toContain("special_budget");
    // A floor under Settings, like the faculty's Institute Grant.
    const forced = debitHeadsByType("student", ["personal"], priya, [], {
      ...DEFAULT_DEBIT_RULES,
      room: { ...DEFAULT_DEBIT_RULES.room, student: ["personal_funds", "special_budget"] },
    });
    expect(forced.personal).toEqual(["personal_funds"]);
  });

  it("Special Funds needs nothing more; which fund may be named", () => {
    const heads = { room: { official: ["department_budget" as const, "special_budget" as const] }, dining: {} };
    const schema = bookingPayloadSchema(config("employee"), { mealsAvailable: false, debitHeads: heads });
    expect(schema.safeParse(payload(guest1, { debit_head: "special_budget" })).success).toBe(true);
    const named = schema.safeParse(payload(guest1, { debit_head: "special_budget", debit_details: "Director's fund" }));
    expect(named.success && named.data.debit_details).toBe("Director's fund");
  });

  it("adds Special Funds once to a Settings row saved before it existed, and never again", () => {
    const old = { room: { ...DEFAULT_DEBIT_RULES.room, staff: ["department_budget"] }, dining: DEFAULT_DEBIT_RULES.dining };
    const upgraded = parseRuleGroup("debit", old);
    expect(upgraded.room.staff).toEqual(["department_budget", "special_budget"]);
    expect(upgraded.revision).toBe(2);
    // Saved since: the office's untick stands.
    const unticked = parseRuleGroup("debit", { ...upgraded, room: { ...upgraded.room, staff: ["department_budget"] } });
    expect(unticked.room.staff).toEqual(["department_budget"]);
    expect(upgradeDebitRules({ revision: 2, room: { staff: [] } })).toEqual({ revision: 2, room: { staff: [] } });
  });

  it("describes the head with its sub-head, the same words everywhere", () => {
    expect(
      describeDebit({ debit_head: "project_grant", debit_details: "SP/2025/017 — Storage", debit_subhead: "Travel" })
    ).toBe("Project Grant — SP/2025/017 — Storage · Sub-head: Travel");
    expect(describeDebit({ debit_head: "special_budget", debit_details: null })).toBe("Special Funds");
  });
});

// ------------------------------------------------------------------ clubs

describe("clubs are booked by their Faculty Advisor", () => {
  const units: Unit[] = [
    { id: "u-council", name: "Cultural Council", kind: "council", parent_id: null, head_id: "secretary", acting_head_id: null, faculty_advisor_id: "fa-dance" },
    { id: "u-club", name: "Dance Club", kind: "club", parent_id: "u-council", head_id: null, acting_head_id: null },
    { id: "u-headed", name: "Music Club", kind: "club", parent_id: null, head_id: "secretary", acting_head_id: null, hod_unit_id: "u-dept", faculty_advisor_id: "dr-music" },
    { id: "u-dept", name: "Music Department", kind: "department", parent_id: null, head_id: "hod-music", acting_head_id: null },
  ];
  const dance = profile({ id: "club-dance", role: "club", department_or_club: "Dance", unit_id: "u-club" });
  const music = profile({ id: "club-music", role: "club", department_or_club: "Music", unit_id: "u-headed" });
  const fa = profile({ id: "fa-dance", role: "employee", staff_category: "faculty" });
  const drMusic = profile({ id: "dr-music", role: "employee" });
  const secretary = profile({ id: "secretary", role: "student" });
  const hodMusic = profile({ id: "hod-music", role: "employee" });
  const everyone: Profile[] = [dance, music, fa, drMusic, secretary, hodMusic];

  it("finds the Faculty Advisor named in the console — the club's own, else its council's; never the student secretary", () => {
    expect(facultyInChargeOf(dance, everyone, units).map((p) => p.id)).toEqual(["fa-dance"]);
    expect(facultyInChargeOf(music, everyone, units).map((p) => p.id)).toEqual(["dr-music"]);
    expect(clubsBookableBy(secretary, everyone, units)).toEqual([]);
    expect(clubsBookableBy(fa, everyone, units).map((c) => c.id)).toEqual(["club-dance"]);
    // The cheap pre-check the nav uses agrees.
    expect(mightBeFacultyInCharge(fa, units)).toBe(true);
    expect(mightBeFacultyInCharge(drMusic, units)).toBe(true);
    expect(mightBeFacultyInCharge(hodMusic, units)).toBe(false);
    expect(mightBeFacultyInCharge(secretary, units)).toBe(false);
  });

  it("a club's own account cannot book", () => {
    expect(mustBookThroughFacultyInCharge("club")).toBe(true);
    expect(mustBookThroughFacultyInCharge("employee")).toBe(false);
  });

  it("goes straight to the Guest House Manager when the advisor raised it — even where the club has an HOD", () => {
    expect(initialStatusFor("club", "room", { bookingType: "official", raisedByFacultyInCharge: true })).toBe("PENDING_GH_MANAGER");
    expect(
      initialStatusFor("club", "room", { bookingType: "official", hasHodApprover: true, raisedByFacultyInCharge: true })
    ).toBe("PENDING_GH_MANAGER");
    const stored = { user_role: "club" as const, user_id: music.id, created_by: drMusic.id, booking_type: "official" };
    expect(raisedByFacultyInCharge(stored)).toBe(true);
    expect(approvalStagesFor(stored, music, units)).toEqual([]);
    // Raised by the club itself (a stored legacy row): the old route.
    expect(approvalStagesFor({ ...stored, created_by: null }, music, units)).toEqual(["PENDING_FA", "PENDING_HOD"]);
  });

  it("whoever raised it may cancel it, and may never approve it", () => {
    const b = { user_id: music.id, created_by: drMusic.id };
    expect(actsAsRequester(b, drMusic.id)).toBe(true);
    expect(actsAsRequester(b, music.id)).toBe(true);
    expect(actsAsRequester(b, hodMusic.id)).toBe(false);
    const pending = { status: "PENDING_HOD" as const, requester: music, created_by: hodMusic.id };
    expect(canReviewBooking(hodMusic, pending, units)).toBe(false);
    expect(canReviewBooking(hodMusic, { ...pending, created_by: drMusic.id }, units)).toBe(true);
  });
});

// ------------------------------------------------------------------ invoices

const TARIFFS: Tariff[] = (["room", "breakfast", "lunch", "dinner"] as const).map((item) => ({
  id: item,
  guest_house_id: null,
  item,
  room_type: null,
  booking_type: null,
  requester_role: null,
  rate: item === "room" ? 2000 : 100,
  effective_from: "2024-01-01",
  note: null,
  created_at: "2024-01-01T00:00:00.000Z",
  created_by: null,
}));
const CTX = { tariffs: TARIFFS, rules: DEFAULT_RULES.invoice, capacity: DEFAULT_RULES.capacity };

describe("invoices", () => {
  const dining = () =>
    booking(
      {
        service_type: "meals_only",
        status: "APPROVED",
        meal_guest_count: 12,
        debit_head: "department_budget",
        meals: [
          { date: "2026-09-20", breakfast: false, lunch: true, dinner: false },
          { date: "2026-09-21", breakfast: false, lunch: true, dinner: false },
        ],
      },
      []
    );

  it("a dining invoice prints the meal dates and head count, and nothing about rooms", () => {
    const doc = buildInvoiceDocument(dining(), CTX);
    expect(invoiceKind(doc)).toBe("dining");
    const labels = [...invoiceFacts(doc).left, ...invoiceFacts(doc).right].map(([l]) => l);
    for (const gone of ["Check-In", "Check-Out", "No. of Room", "No. of Infants", "Primary Guest", "Project"]) {
      expect(labels.some((l) => l.startsWith(gone))).toBe(false);
    }
    expect(labels).toContain("Meal Date(s): ");
    expect(describeMealDates(doc)).toBe("20 Sep 2026 – 21 Sep 2026");
    // Renders — the room table is left out rather than drawn empty.
    expect(renderInvoicePdf(doc).byteLength).toBeGreaterThan(1000);
  });

  it("a snapshot from before `kind` is read from its shape", () => {
    const doc = buildInvoiceDocument(dining(), CTX);
    delete doc.kind;
    expect(invoiceKind(doc)).toBe("dining");
  });

  it("project details only with the Project head, with the sub-head under them", () => {
    const stay = (patch: Parameters<typeof booking>[0]) =>
      booking({ status: "VACATED", ...patch }, [{ guests: [guest()], assigned: room() }]);
    const plain = invoiceFacts(buildInvoiceDocument(stay({ debit_head: "department_budget" }), CTX)).left.map(([l]) => l);
    expect(plain.some((l) => l.startsWith("Project"))).toBe(false);
    const project = invoiceFacts(
      buildInvoiceDocument(
        stay({ debit_head: "project_grant", debit_details: "SP/2025/017 — Storage (Dr. A)", debit_subhead: "Travel" }),
        CTX
      )
    ).left;
    expect(project).toEqual(
      expect.arrayContaining([
        ["Project Detail: ", "Storage (Dr. A)"],
        ["Project Number: ", "SP/2025/017"],
        ["Project Sub-head: ", "Travel"],
      ])
    );
    const special = invoiceFacts(
      buildInvoiceDocument(stay({ debit_head: "special_budget", debit_details: "Director's fund" }), CTX)
    ).left;
    expect(special).toContainEqual(["Special Fund: ", "Director's fund"]);
  });

  it("a checked-out stay stays on the desk's list until it is paid, and can be invoiced from the archive", () => {
    const now = new Date("2026-09-24T06:00:00.000Z");
    const left = booking({ id: "b-left", status: "VACATED", check_out: "2026-09-23T04:30:00.000Z" });
    const paid = booking({ id: "b-paid", status: "VACATED", check_out: "2026-09-22T04:30:00.000Z" });
    const old = booking({ id: "b-old", status: "VACATED", check_out: "2026-07-01T04:30:00.000Z" });
    const list = awaitingSettlement([old, paid, left], [{ booking_id: "b-paid", status: "paid" }], now);
    expect(list.map((b) => b.id)).toEqual(["b-left"]);
    expect(invoiceableFromArchive(old)).toBe(true);
    expect(invoiceableFromArchive(booking({ status: "APPROVED" }))).toBe(false);
    expect(invoiceableFromArchive(dining())).toBe(true);
  });
});

// ---------------------------------------------------------- the mock store

let store: DataStore;
let notify: typeof import("@/lib/mail/notify");
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  delete process.env.MAIL_REDIRECT_ALL_TO;
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  notify = await import("@/lib/mail/notify");
});
afterAll(() => db.cleanup());

function input(patch: Partial<NewBookingInput> = {}): NewBookingInput {
  return {
    user_id: "employee-priya",
    guest_house_id: "gh-bageshri",
    user_role: "employee",
    status: "PENDING_HOD",
    purpose_of_visit: "Test visit",
    check_in: "2031-01-10T06:30:00.000Z",
    check_out: "2031-01-11T04:30:00.000Z",
    booking_type: "official",
    service_type: "room",
    debit_head: "project_grant",
    debit_details: "SP/2025/017 — Storage",
    debit_document_url: null,
    meal_preference: null,
    meal_guest_count: null,
    pets_policy_acknowledged: true,
    alumni_name: null,
    alumni_roll_number: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    rooms: [{ room_type: null, guests: [{ name: "G", age: null, gender: "female", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
    ...patch,
  };
}

async function requesterMail(bookingId: string, event: EmailMessage["event_key"]) {
  return (await store.listEmails({ bookingId, limit: 50 }))
    .filter((r) => r.event_key === event)
    .map((r) => ({ to: r.to_emails, cc: r.cc_emails }));
}

describe("the mock store and the mail", () => {
  it("keeps the Copy-to list and the sub-head, and a guest with no age", async () => {
    const created = await store.createBooking(
      input({ copy_to_emails: ["sec@iitpkd.ac.in"], debit_subhead: "Travel" })
    );
    const read = await store.getBooking(created.id);
    expect(read?.copy_to_emails).toEqual(["sec@iitpkd.ac.in"]);
    expect(read?.debit_subhead).toBe("Travel");
    expect(read?.guests[0].age).toBeNull();
    expect(read?.guests[0].is_infant).toBe(false);
  });

  it("copies every mail to the requester to the Copy-to list", async () => {
    const created = await store.createBooking(input({ copy_to_emails: ["sec@iitpkd.ac.in", "guest@example.org"] }));
    await notify.notifyBookingSubmitted(created.id);
    expect(await requesterMail(created.id, "booking.submitted.requester")).toEqual([
      { to: ["priya@iitpkd.ac.in"], cc: ["sec@iitpkd.ac.in", "guest@example.org"] },
    ]);
  });

  it("a club booking raised by its faculty in-charge: the club's, on both lists, the in-charge copied, the log names them", async () => {
    const created = await store.createBooking(
      input({
        user_id: "club-petrichor",
        user_role: "club",
        status: "PENDING_GH_MANAGER",
        created_by: "faculty-arun",
        debit_head: "department_budget",
        debit_details: null,
      })
    );
    expect((await store.listBookingsForUser("faculty-arun")).map((b) => b.id)).toContain(created.id);
    expect((await store.listBookingsForUser("club-petrichor")).map((b) => b.id)).toContain(created.id);
    const read = (await store.getBooking(created.id))!;
    expect(read.logs[0].action_by).toBe("faculty-arun");
    await notify.notifyBookingSubmitted(created.id);
    expect(await requesterMail(created.id, "booking.submitted.requester")).toEqual([
      { to: ["petrichor@iitpkd.ac.in"], cc: ["arun.prasad@iitpkd.ac.in"] },
    ]);
  });
});
