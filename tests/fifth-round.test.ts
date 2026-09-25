import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkFamily, compareNames, familySummary } from "@/lib/academic/family";
import type { StudentRecord } from "@/lib/academic/types";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import {
  DEFAULT_DEBIT_RULES,
  debitCategoryFor,
  debitHeadsByType,
  SPECIAL_FUNDS_CATEGORIES,
  upgradeDebitRules,
} from "@/lib/debit-heads";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import {
  buildInvoiceDocument,
  gstPaise,
  gstRowLabel,
  invoiceBlocker,
  invoiceTable,
  parseExtraCharges,
  type ExtraCharge,
  type InvoiceDocument,
} from "@/lib/invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import {
  impliedGender,
  knownGuestsFromBookings,
  knownGuestsFromRecord,
  knownSourceOf,
  mergeKnownGuests,
  prefillFor,
} from "@/lib/known-guests";
import { earlierCheckInError } from "@/lib/operations";
import { DEFAULT_RULES, parseRuleGroup, upgradeInvoiceRules } from "@/lib/settings";
import type { DataStore } from "@/lib/store/types";
import type { Tariff } from "@/lib/tariffs";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import { RoomClashError, type BookingLog, type NewBookingInput, type Role } from "@/lib/types";
import { booking, GH, guest, profile, room, useThrowawayMockDb } from "./helpers";

/**
 * The office's fifth list of corrections (25 Sep 2026): the student's family
 * for the Assistant Warden and filled in on New Booking, additional charges
 * on an invoice, typed meal counts repriced at once, GST at 18% on rooms and
 * 5% on food, Special Funds for everyone but students, the infant card, and an
 * earlier check-in at the desk.
 */

// ------------------------------------------------------------ Special Funds

describe("Special Funds for everyone except students", () => {
  const priya = { staff_category: "faculty" as const, unit_id: null };

  it("is in every category's defaults but the students'", () => {
    for (const kind of ["room", "dining"] as const) {
      for (const category of SPECIAL_FUNDS_CATEGORIES) {
        expect(DEFAULT_DEBIT_RULES[kind][category]).toContain("special_budget");
      }
      expect(DEFAULT_DEBIT_RULES[kind].student).not.toContain("special_budget");
    }
    expect(SPECIAL_FUNDS_CATEGORIES).not.toContain("student");
  });

  it("reaches personal and alumni bookings, and the IAR Student Cell", () => {
    expect(debitHeadsByType("employee", ["personal"], priya, [], DEFAULT_DEBIT_RULES).personal).toEqual([
      "personal_funds",
      "special_budget",
    ]);
    expect(debitHeadsByType("iar_student_cell", ["alumni"], priya, [], DEFAULT_DEBIT_RULES).alumni).toContain("special_budget");
    expect(debitHeadsByType("iar_cell", ["alumni"], priya, [], DEFAULT_DEBIT_RULES, "dining").alumni).toContain("special_budget");
  });

  it("files a student's personal booking as a student's, so it never gets it", () => {
    // A student's only booking type is personal; before 25 Sep that made the
    // category "personal", which now offers Special Funds.
    expect(debitCategoryFor("student", "personal", priya, [])).toBe("student");
    expect(debitHeadsByType("student", ["personal"], priya, [], DEFAULT_DEBIT_RULES).personal).toEqual(["personal_funds"]);
    // A floor under Settings: ticking it for students does not reach the form.
    const forced = { ...DEFAULT_DEBIT_RULES, room: { ...DEFAULT_DEBIT_RULES.room, student: ["personal_funds" as const, "special_budget" as const] } };
    expect(debitHeadsByType("student", ["personal"], priya, [], forced).personal).toEqual(["personal_funds"]);
  });

  it("upgrades a revision-2 row once, leaving the office's earlier unticks alone", () => {
    const rev2 = {
      revision: 2,
      room: { ...DEFAULT_DEBIT_RULES.room, staff: ["department_budget"], personal: ["personal_funds"], alumni: ["institute_grant"] },
      dining: { ...DEFAULT_DEBIT_RULES.dining, personal: ["personal_funds"] },
    };
    const upgraded = upgradeDebitRules(rev2) as typeof DEFAULT_DEBIT_RULES;
    expect(upgraded.revision).toBe(3);
    expect(upgraded.room.personal).toEqual(["personal_funds", "special_budget"]);
    expect(upgraded.room.alumni).toEqual(["institute_grant", "special_budget"]);
    expect(upgraded.dining.personal).toEqual(["personal_funds", "special_budget"]);
    // Staff unticked it after revision 2: that choice stands.
    expect(upgraded.room.staff).toEqual(["department_budget"]);
    // A row with no revision gets both rounds.
    const rev1 = upgradeDebitRules({ room: { staff: ["department_budget"], personal: ["personal_funds"] } }) as { room: Record<string, string[]> };
    expect(rev1.room.staff).toEqual(["department_budget", "special_budget"]);
    expect(rev1.room.personal).toEqual(["personal_funds", "special_budget"]);
  });
});

// ------------------------------------------------------------------ GST

describe("GST: 18% on rooms, 5% on food", () => {
  it("is the default, with no slab", () => {
    expect(DEFAULT_RULES.invoice.gst_room_percent).toBe(18);
    expect(DEFAULT_RULES.invoice.gst_meal_percent).toBe(5);
    expect("gst_room_threshold" in DEFAULT_RULES.invoice).toBe(false);
  });

  it("replaces a saved slab row's rates once, and keeps a rate set since", () => {
    const old = { ...DEFAULT_RULES.invoice, revision: undefined, gst_room_percent: 5, gst_room_threshold: 7500, gst_room_above_percent: 18, accounts_email: "accounts@iitpkd.ac.in" };
    const read = parseRuleGroup("invoice", old);
    expect(read.gst_room_percent).toBe(18);
    expect(read.gst_meal_percent).toBe(5);
    expect(read.accounts_email).toBe("accounts@iitpkd.ac.in");
    expect(read.revision).toBe(2);
    expect("gst_room_threshold" in read).toBe(false);
    // Saved from the console after the upgrade: the office's own rate.
    expect(parseRuleGroup("invoice", { ...read, gst_room_percent: 12 }).gst_room_percent).toBe(12);
    expect(upgradeInvoiceRules({ revision: 2, gst_room_percent: 12 })).toEqual({ revision: 2, gst_room_percent: 12 });
  });
});

// ------------------------------------------------------- the invoice, v2

const RULES = DEFAULT_RULES.invoice;
const CAP = DEFAULT_RULES.capacity;

function t(patch: Partial<Tariff>): Tariff {
  return {
    id: Math.random().toString(36).slice(2),
    guest_house_id: null,
    item: "room",
    room_type: null,
    booking_type: null,
    requester_role: null,
    rate: 0,
    effective_from: "2024-01-01",
    note: null,
    created_at: "2024-01-01T00:00:00.000Z",
    created_by: null,
    ...patch,
  };
}

const TARIFFS: Tariff[] = [
  t({ guest_house_id: GH.id, item: "room", rate: 2000 }),
  t({ item: "extra_bed", rate: 500 }),
  t({ item: "breakfast", rate: 80 }),
  t({ item: "lunch", rate: 120 }),
  t({ item: "dinner", rate: 100 }),
];

const log = (status: BookingLog["new_status"], timestamp: string): BookingLog => ({
  id: timestamp, booking_id: "b-1", action_by: null, action_by_name: "Desk", previous_status: null, new_status: status, remarks: null, timestamp,
});

// Two nights in one double room, no meals booked.
const stay = booking(
  {
    status: "VACATED",
    logs: [log("OCCUPIED", "2026-10-01T08:30:00.000Z"), log("VACATED", "2026-10-03T04:30:00.000Z")],
  },
  [{ guests: [guest({ name: "Prof. A" }), guest({ name: "Dr. B" })], assigned: room({ id: "r-d", room_number: "B-204" }) }]
);

const CHARGES: ExtraCharge[] = [
  { section: "room", description: "Extra bed at the desk", comment: null, quantity: 1, unit_price: 50_000 },
  { section: "dining", description: "Birthday cake", comment: null, quantity: 1, unit_price: 30_000 },
  { section: "other", description: "Broken vase", comment: "B-204, 2 Oct", quantity: 1, unit_price: 150_000 },
];

describe("meals the desk adds are charged", () => {
  it("prices the typed counts, so the grand total moves with them", () => {
    const none = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP });
    const added = buildInvoiceDocument(stay, {
      tariffs: TARIFFS,
      rules: RULES,
      capacity: CAP,
      mealCounts: { breakfast: 2, lunch: 0, dinner: 2 },
    });
    expect(none.meal_lines.map((l) => l.count)).toEqual([0, 0, 0]);
    expect(added.meal_lines.map((l) => l.count)).toEqual([2, 0, 2]);
    // ₹80 × 2 + ₹100 × 2, GST-inclusive.
    expect(added.grand_total - none.grand_total).toBe(2 * 8_000 + 2 * 10_000);
    expect(invoiceBlocker(stay, added)).toBeNull();
  });
});

describe("the invoice, per-section GST and additional charges", () => {
  const doc = buildInvoiceDocument(stay, {
    tariffs: TARIFFS,
    rules: RULES,
    capacity: CAP,
    mealCounts: { breakfast: 2, lunch: 0, dinner: 2 },
    extraCharges: CHARGES,
  });

  it("taxes rooms at 18% and food at 5% on their own subtotals; other charges carry none", () => {
    expect(doc.version).toBe(2);
    // Inclusive: each section's subtotal and GST add back to its prices.
    expect(doc.subtotal_rooms + (doc.gst_rooms ?? 0)).toBe(2 * 200_000 + 50_000);
    expect(doc.subtotal_dining + (doc.gst_dining ?? 0)).toBe(2 * 8_000 + 2 * 10_000 + 30_000);
    expect(doc.subtotal_other).toBe(150_000);
    expect(doc.gst_rooms).toBe(68_643);
    expect(doc.gst_dining).toBe(3_143);
    expect(doc.gst).toBe(68_643 + 3_143);
    expect(doc.total).toBe(doc.subtotal_rooms + doc.subtotal_dining + 150_000);
    expect(doc.grand_total).toBe(400_000 + 50_000 + 36_000 + 30_000 + 150_000);
    expect(doc.extra_lines?.map((l) => [l.section, l.gst_percent])).toEqual([
      ["room", 18],
      ["dining", 5],
      ["other", 0],
    ]);
    expect(doc.gst_breakdown.map((g) => [g.label, g.percent])).toEqual([
      ["Accommodation", 18],
      ["Food", 5],
    ]);
    for (const g of doc.gst_breakdown) expect(g.cgst + g.sgst).toBe(g.tax);
  });

  it("adds GST on each subtotal when the rates exclude it", () => {
    const rules = { ...RULES, prices_include_gst: false };
    const ex = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules, capacity: CAP, mealCounts: { breakfast: 2, lunch: 0, dinner: 2 }, extraCharges: CHARGES });
    expect(ex.subtotal_rooms).toBe(450_000);
    expect(ex.gst_rooms).toBe(gstPaise(450_000, 18));
    expect(ex.subtotal_dining).toBe(66_000);
    expect(ex.gst_dining).toBe(gstPaise(66_000, 5));
    expect(ex.grand_total).toBe(450_000 + 81_000 + 66_000 + 3_300 + 150_000);
  });

  it("prints the revised template: Rate, GST per subtotal, other charges, one grand total", () => {
    const table = invoiceTable(doc);
    expect(table.rateHeading).toBe("Rate");
    expect(table.sections.map((s) => s.key)).toEqual(["rooms", "dining", "other"]);
    expect(table.sections[0].totals.map((x) => x.label)).toEqual(["Room Charges Subtotal (A):", "GST @ 18% on Subtotal (A):"]);
    expect(table.sections[1].heading).toBe("Dining Charges");
    expect(table.sections[1].totals.map((x) => x.label)).toEqual(["Dining Charges Subtotal (B):", "GST @ 5% on Subtotal (B):"]);
    expect(table.sections[2].totals.map((x) => x.label)).toEqual(["Other Charges Subtotal (C):"]);
    expect(table.closing).toEqual([{ label: "Grand Total (Including GST):", amount: doc.grand_total }]);
    // Additional charges sit in their section, the comment under the description.
    expect(table.sections[0].rows.at(-1)).toMatchObject({ label: "Extra bed at the desk", qty: 1 });
    expect(table.sections[1].rows.map((r) => r.label)).toEqual(["Breakfast", "Lunch", "Dinner", "Birthday cake"]);
    expect(table.sections[2].rows[0]).toMatchObject({ label: "Broken vase", note: "B-204, 2 Oct" });
    // No other charges, no Other Charges table.
    const plain = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP });
    expect(invoiceTable(plain).sections.map((s) => s.key)).toEqual(["rooms", "dining"]);
  });

  it("reprints an invoice issued before 25 Sep exactly as it was", () => {
    const old: InvoiceDocument = { ...plainV1(), version: 1 };
    const table = invoiceTable(old);
    expect(table.rateHeading).toBe("Tariff");
    expect(table.sections.map((s) => s.totals.map((x) => x.label))).toEqual([["Sub Total (A):"], ["Sub Total (B):"]]);
    expect(table.sections[1].heading).toBe("Dining Charges Details");
    expect(table.closing.map((x) => x.label)).toEqual(["Total (A+B)", gstRowLabel(old), "Grand Total (A+B including GST):"]);
  });

  it("an additional charge alone is something to invoice", () => {
    const empty = booking({ status: "VACATED", logs: [log("OCCUPIED", "2026-10-01T08:30:00.000Z")] }, []);
    const nothing = buildInvoiceDocument(empty, { tariffs: TARIFFS, rules: RULES, capacity: CAP });
    expect(invoiceBlocker(empty, nothing)).toMatch(/nothing to charge/);
    const withCharge = buildInvoiceDocument(empty, { tariffs: TARIFFS, rules: RULES, capacity: CAP, extraCharges: [CHARGES[2]] });
    expect(invoiceBlocker(empty, withCharge)).toBeNull();
  });

  it("a dining invoice goes unlettered and takes no room charges", () => {
    const dining = booking({ service_type: "meals_only", status: "APPROVED", meal_guest_count: 10, meals: [{ date: "2026-10-01", breakfast: false, lunch: true, dinner: false }] }, []);
    const d = buildInvoiceDocument(dining, { tariffs: TARIFFS, rules: RULES, capacity: CAP, extraCharges: [CHARGES[2]] });
    const table = invoiceTable(d);
    expect(table.sections.map((s) => s.key)).toEqual(["dining", "other"]);
    expect(table.sections[0].totals.map((x) => x.label)).toEqual(["Dining Charges Subtotal:", "GST @ 5% on Subtotal:"]);
    expect(parseExtraCharges([{ section: "room", description: "Extra bed", quantity: 1, amount: "500" }], "dining")).toMatchObject({ ok: false });
  });

  it("draws a table longer than a page onto the next, footer on each", () => {
    const many: ExtraCharge[] = Array.from({ length: 15 }, (_, i) => ({
      section: "other",
      description: `Damaged item ${i + 1}`,
      comment: "Noted at check-out by the caretaker, with the guest present",
      quantity: 1,
      unit_price: 10_000,
    }));
    const long = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP, extraCharges: many, invoiceNumber: "GH/2026-27/0009" });
    const pdf = Buffer.from(renderInvoicePdf(long, null)).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    const pages = Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf)?.[1] ?? 0);
    expect(pages).toBeGreaterThanOrEqual(2);
    const one = Buffer.from(renderInvoicePdf(buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP }), null)).toString("latin1");
    expect(Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(one)?.[1] ?? 0)).toBe(1);
  });
});

describe("additional charges as typed", () => {
  it("keeps rupees as paise and says what is wrong, row by row", () => {
    expect(parseExtraCharges([{ section: "other", description: " Broken vase ", comment: " ", quantity: "2", amount: "1,500" }], "stay")).toMatchObject({
      ok: false,
    });
    expect(parseExtraCharges([{ section: "other", description: "Broken vase", comment: " ", quantity: "2", amount: "1500.50" }], "stay")).toEqual({
      ok: true,
      charges: [{ section: "other", description: "Broken vase", comment: null, quantity: 2, unit_price: 150_050 }],
    });
    const bad = (row: Record<string, unknown>) => parseExtraCharges([{ section: "room", description: "Extra bed", quantity: 1, amount: "500", ...row }], "stay");
    expect(bad({ description: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/say what it is for/) });
    expect(bad({ quantity: "0" })).toMatchObject({ ok: false, error: expect.stringMatching(/quantity/) });
    expect(bad({ amount: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/amount/) });
    expect(bad({ amount: "-5" })).toMatchObject({ ok: false, error: expect.stringMatching(/amount/) });
    expect(bad({ amount: "10.555" })).toMatchObject({ ok: false, error: expect.stringMatching(/two decimals/) });
    expect(bad({ section: "free" })).toMatchObject({ ok: false, error: expect.stringMatching(/charged under/) });
    expect(parseExtraCharges(Array.from({ length: 21 }, () => ({})), "stay")).toMatchObject({ ok: false, error: expect.stringMatching(/At most 20/) });
    expect(parseExtraCharges(null, "stay")).toEqual({ ok: true, charges: [] });
  });
});

function plainV1(): InvoiceDocument {
  const d = buildInvoiceDocument(stay, { tariffs: TARIFFS, rules: RULES, capacity: CAP });
  // A snapshot as issued before 25 Sep had none of the version-2 fields.
  const rest: Partial<InvoiceDocument> = { ...d };
  for (const k of ["extra_lines", "subtotal_other", "gst_room_percent", "gst_meal_percent", "gst_rooms", "gst_dining"] as const) delete rest[k];
  return { ...(rest as InvoiceDocument), version: 1 };
}

// ------------------------------------------------------- earlier check-in

describe("bringing a check-in forward", () => {
  it("allows an earlier check-in on an approved or current stay only", () => {
    const b = booking({ status: "APPROVED" });
    const earlier = new Date(Date.parse(b.check_in) - 6 * 3_600_000).toISOString();
    expect(earlierCheckInError(b, earlier)).toBeNull();
    expect(earlierCheckInError(b, b.check_in)).toMatch(/earlier/);
    expect(earlierCheckInError(b, new Date(Date.parse(b.check_in) + 3_600_000).toISOString())).toMatch(/earlier/);
    expect(earlierCheckInError(b, new Date(Date.parse(b.check_in) - 61 * 86_400_000).toISOString())).toMatch(/60 days/);
    expect(earlierCheckInError({ ...b, status: "PENDING_GH_MANAGER" }, earlier)).toMatch(/approved or current/);
    expect(earlierCheckInError({ ...b, service_type: "meals_only" }, earlier)).toMatch(/dining/);
    expect(earlierCheckInError(b, "not a date")).toMatch(/Choose/);
  });
});

// ------------------------------------------------------ known guests

const ANJALI: StudentRecord = {
  kind: "student",
  roll_number: "112201001",
  name: "Anjali Menon",
  program: "B.Tech",
  department: "CSE",
  email: "112201001@smail.iitpkd.ac.in",
  phone: null,
  father_name: "Ramesh Menon",
  mother_name: "Sreeja Menon",
  guardian_name: null,
  hostel: "Malhar",
};

describe("filling in guests the portal already knows", () => {
  it("takes a student's father, mother and guardian from the record, nobody from other kinds", () => {
    expect(knownGuestsFromRecord(ANJALI).map((k) => [k.name, k.relationship, k.gender])).toEqual([
      ["Ramesh Menon", "Father", "male"],
      ["Sreeja Menon", "Mother", "female"],
    ]);
    expect(knownGuestsFromRecord({ ...ANJALI, father_name: null, mother_name: null, guardian_name: "Gopinath Nair" }).map((k) => k.relationship)).toEqual(["Guardian"]);
    expect(knownGuestsFromRecord({ kind: "employee", employee_id: "F1", name: "P", department: null, employee_type: null, phone: null, email: null, office_number: null })).toEqual([]);
    expect(knownGuestsFromRecord(null)).toEqual([]);
  });

  it("takes the adults of the requester's own earlier bookings, newest first, once each", () => {
    const own = (id: string, created: string, guests: ReturnType<typeof guest>[]) =>
      booking({ id, user_id: "p-1", created_at: created, booking_reference_id: `REF-${id}` }, [{ guests }]);
    const bookings = [
      own("b-old", "2026-01-01T00:00:00.000Z", [guest({ name: "Asha Nair", relationship: "Spouse", gender: "female" })]),
      own("b-new", "2026-06-01T00:00:00.000Z", [
        guest({ name: "Asha Nair", relationship: "Spouse", gender: "female" }),
        guest({ name: "Baby", is_infant: true, age: 2 }),
        guest({ name: "Guest" }),
        guest({ name: "Dr. K. Rao", relationship: "Collaborator", citizenship: "other", nationality: "DE" }),
      ]),
      // Raised for a club: the club's guests, not the requester's.
      booking({ id: "b-club", user_id: "club-1", created_by: "p-1", created_at: "2026-07-01T00:00:00.000Z" }, [{ guests: [guest({ name: "Band member" })] }]),
    ];
    const known = knownGuestsFromBookings(bookings, "p-1");
    expect(known.map((k) => [k.name, k.relationship, k.reference])).toEqual([
      ["Asha Nair", "Spouse", "REF-b-new"],
      ["Dr. K. Rao", "Collaborator", "REF-b-new"],
    ]);
    expect(known[1]).toMatchObject({ citizenship: "other", nationality: "DE" });
    expect(knownGuestsFromBookings(bookings, "p-1", 1)).toHaveLength(1);
  });

  it("puts the record first and fills in by relationship, ignoring case", () => {
    const fromBookings = knownGuestsFromBookings(
      [booking({ user_id: "p-1" }, [{ guests: [guest({ name: "ramesh menon", relationship: "Father" }), guest({ name: "Priya", relationship: "Siblings" })] }])],
      "p-1"
    );
    const known = mergeKnownGuests(knownGuestsFromRecord(ANJALI), fromBookings);
    expect(known.map((k) => k.name)).toEqual(["Ramesh Menon", "Sreeja Menon", "Priya"]);
    expect(prefillFor(known, "father")?.name).toBe("Ramesh Menon");
    expect(prefillFor(known, "Siblings")?.source).toBe("booking");
    expect(prefillFor(known, "Grandmother")).toBeNull();
    expect(knownSourceOf(known, " ramesh  menon ", "Father")?.source).toBe("record");
    expect(knownSourceOf(known, "Ramesh Menon", "Mother")).toBeNull();
    expect(impliedGender("Mother")).toBe("female");
    expect(impliedGender("grandfather")).toBe("male");
    expect(impliedGender("Colleague")).toBeNull();
  });
});

// ---------------------------------------------------- the warden's check

describe("the Assistant Warden's check against the academic record", () => {
  it("compares names ignoring case, spacing, punctuation and titles", () => {
    expect(compareNames("Dr. Ramesh  Menon", "ramesh menon")).toBe("same");
    expect(compareNames("Menon Ramesh", "Ramesh Menon")).toBe("close");
    expect(compareNames("Ramesh", "Ramesh Menon")).toBe("close");
    expect(compareNames("Suresh Menon", "Ramesh Menon")).toBe("different");
    expect(compareNames("", "Ramesh Menon")).toBe("different");
  });

  it("gives a verdict per relationship on the record or the request", () => {
    const checks = checkFamily(ANJALI, [
      { name: "Ramesh Menon", relationship: "Father" },
      { name: "Sreeja", relationship: "Mother" },
      { name: "Anil", relationship: "Siblings" },
    ]);
    expect(checks.map((c) => [c.relationship, c.verdict])).toEqual([
      ["Father", "match"],
      ["Mother", "close"],
    ]);
    expect(familySummary(checks)).toBe("check");
    expect(familySummary(checkFamily(ANJALI, [{ name: "ramesh menon", relationship: "father" }]))).toBe("match");
    const differs = checkFamily(ANJALI, [{ name: "Someone Else", relationship: "Father" }]);
    expect(differs[0].verdict).toBe("differs");
    expect(differs[1]).toMatchObject({ relationship: "Mother", verdict: "not_on_request", onRecord: "Sreeja Menon" });
    // No record to compare with.
    expect(checkFamily(null, [{ name: "X", relationship: "Guardian" }])).toEqual([
      { relationship: "Guardian", onRecord: null, onRequest: ["X"], verdict: "not_on_record" },
    ]);
    expect(familySummary(checkFamily(ANJALI, []))).toBe("none");
  });

  it("builds a panel for each student request in the queue, and only those", async () => {
    const { studentRecordPanels } = await import("@/lib/academic/family-server");
    const anjali = profile({ id: "student-anjali", role: "student", email: "112201001@smail.iitpkd.ac.in" });
    const panels = await studentRecordPanels([
      booking({ id: "b-s", user_role: "student", requester: anjali }, [
        { guests: [guest({ name: "Ramesh Menon", relationship: "Father" }), guest({ name: "Baby", relationship: "Father", is_infant: true, age: 1 })] },
      ]),
      booking({ id: "b-e", user_role: "employee" }),
    ]);
    expect(Object.keys(panels)).toEqual(["b-s"]);
    expect(panels["b-s"].status).toBe("found");
    expect(panels["b-s"].rows.find((r) => r.label === "Father's Name")?.value).toBe("Ramesh Menon");
    // The infant is not a parent, whatever was typed.
    expect(panels["b-s"].family[0]).toMatchObject({ relationship: "Father", onRequest: ["Ramesh Menon"], verdict: "match" });
  });
});

// ------------------------------------------------------------ infant card

describe("the infant card", () => {
  const houses = [GH];
  const config = (role: Role) => sanitizeFormConfig(buildDefaultFormConfig(role, houses), houses);
  const checkIn = addDaysToDateValue(toInstituteDateValue(new Date()), 3);
  const body = (infant: Record<string, unknown>) => ({
    guest_house_id: GH.id,
    service_type: "room",
    booking_type: "official",
    debit_head: "department_budget",
    privacy_consent: true,
    purpose_of_visit: "Visiting collaborator",
    check_in: `${checkIn}T12:00`,
    check_out: `${addDaysToDateValue(checkIn, 2)}T10:00`,
    rooms: [{ room_type: null, guests: [{ name: "Dr. A", gender: "male", citizenship: "indian" }, { name: "Baby A", gender: "female", citizenship: "indian", infant: true, ...infant }] }],
  });
  const parse = (b: unknown) => bookingPayloadSchema(config("employee"), { mealsAvailable: false }).safeParse(b);
  const messages = (b: unknown) => {
    const r = parse(b);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  it("needs an age below 5, even on a form where ages are optional", () => {
    expect(messages(body({ age: "" }))).toEqual(["rooms.0.guests.1.age: Choose the infant's age"]);
    expect(messages(body({ age: "7" }))).toEqual(["rooms.0.guests.1.age: An infant is below 5 — add a guest instead"]);
  });

  it("is an infant, and the output parses again unchanged", () => {
    const first = parse(body({ age: "2" }));
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data.rooms[0].guests[1]).toMatchObject({ age: 2, infant: true });
    const second = parse(first.data);
    expect(second.success && second.data.rooms[0].guests[1]).toMatchObject({ age: 2, infant: true });
  });
});

// ------------------------------------------------------------ the store

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;
beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles();
});
afterAll(() => db.cleanup());

const ROOM = "gh-bageshri-203";
const LOG = { action_by: "gh-manager", action_by_name: "Manager", new_status: "APPROVED" as const, remarks: "test" };
const input = (checkIn: string, checkOut: string, patch: Partial<NewBookingInput> = {}): NewBookingInput => ({
  user_id: "employee-priya", guest_house_id: "gh-bageshri", user_role: "employee", status: "APPROVED",
  purpose_of_visit: "Visit", check_in: checkIn, check_out: checkOut, booking_type: "official", service_type: "room",
  debit_head: "department_budget", debit_details: null, debit_document_url: null, meal_preference: null, meal_guest_count: null,
  pets_policy_acknowledged: true, alumni_name: null, alumni_roll_number: null, alumni_id_url: null, custom_fields: null, meals: [],
  rooms: [{ room_type: null, guests: [{ name: "Guest One", age: 40, gender: "female", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
  ...patch,
});

describe("the store", () => {
  it("moves the holds with an earlier check-in, and refuses one into another stay's turnaround", async () => {
    const first = await store.createBooking(input("2031-07-10T08:30:00.000Z", "2031-07-12T05:30:00.000Z"));
    await store.updateBookingStatus(first.id, { status: "APPROVED", assigned_room_ids: [ROOM] }, LOG);
    const second = await store.createBooking(input("2031-07-13T08:30:00.000Z", "2031-07-15T05:30:00.000Z"));
    await store.updateBookingStatus(second.id, { status: "APPROVED", assigned_room_ids: [ROOM] }, LOG);
    // 06:00 UTC on the 12th is inside the first stay's 4-hour turnaround.
    await expect(store.updateBookingDetails(second.id, { check_in: "2031-07-12T06:00:00.000Z" }, LOG)).rejects.toBeInstanceOf(RoomClashError);
    await store.updateBookingDetails(second.id, { check_in: "2031-07-12T10:00:00.000Z" }, LOG);
    expect((await store.getBooking(second.id))?.check_in).toBe("2031-07-12T10:00:00.000Z");
    expect(await store.getOccupiedRoomIds("gh-bageshri", "2031-07-12T11:00:00.000Z", "2031-07-12T12:00:00.000Z")).toContain(ROOM);
  });

  it("keeps the desk's additional charges on the draft, and on the issued invoice", async () => {
    const b = await store.createBooking(input("2031-08-10T08:30:00.000Z", "2031-08-12T05:30:00.000Z", { status: "VACATED" }));
    await store.saveInvoiceDraft(b.id, { breakfast: 1, lunch: 0, dinner: 0 }, "gh-caretaker", CHARGES);
    expect((await store.listInvoices({ bookingId: b.id }))[0].extra_charges).toEqual(CHARGES);
    // Saving counts alone leaves the charges as they are.
    await store.saveInvoiceDraft(b.id, { breakfast: 2, lunch: 0, dinner: 0 }, "gh-caretaker");
    const draft = (await store.listInvoices({ bookingId: b.id }))[0];
    expect(draft.extra_charges).toEqual(CHARGES);
    expect(draft.meal_counts).toEqual({ breakfast: 2, lunch: 0, dinner: 0 });
    const document = buildInvoiceDocument((await store.getBooking(b.id))!, {
      tariffs: await store.listTariffs(),
      rules: RULES,
      capacity: CAP,
      extraCharges: CHARGES,
    });
    const issued = await store.issueInvoice({
      bookingId: b.id, fy: "2031-32", prefix: "GH", digits: 4, document, mealCounts: null, extraCharges: CHARGES.slice(0, 1), issuedBy: "gh-caretaker", replaces: null,
    });
    expect(issued.id).toBe(draft.id);
    expect(issued.extra_charges).toEqual(CHARGES.slice(0, 1));
    expect(issued.document?.extra_lines).toHaveLength(3);
    await expect(store.saveInvoiceDraft(b.id, null, "gh-caretaker", [])).rejects.toThrow(/already has invoice/);
  });
});
