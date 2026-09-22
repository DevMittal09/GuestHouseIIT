import fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataStore } from "@/lib/store/types";
import type { InvoiceDocument } from "@/lib/invoice";
import type { NewBookingInput } from "@/lib/types";
import { useThrowawayMockDb } from "./helpers";

/**
 * The mock store's invoices and tariffs — its stand-ins for migration 19's
 * counter, unique live invoice, immutability trigger and tariff lock — and the
 * mail to Accounts with the PDF attached.
 */

let store: DataStore;
let db: ReturnType<typeof useThrowawayMockDb>;

beforeAll(async () => {
  process.env.MAIL_DRY_RUN = "true";
  delete process.env.MAIL_REDIRECT_ALL_TO;
  db = useThrowawayMockDb();
  store = new (await import("@/lib/store/mock")).MockStore();
  await store.listProfiles(); // writes the seeded file
});
afterAll(() => db.cleanup());

function doc(bookingId: string, total = 250_000): InvoiceDocument {
  return {
    version: 1,
    booking_id: bookingId,
    booking_reference: "REF",
    guest_house: "Hamsanandi",
    booked_by: "Dr. Priya Sharma",
    unit: "CSE",
    debit_head: "department_budget",
    debit_head_label: "Department",
    project_title: null,
    project_number: null,
    invoice_number: null,
    invoice_date: "2026-09-22T06:30:00.000Z",
    primary_guest: "Guest",
    check_in: "2026-09-20T08:30:00.000Z",
    check_out: "2026-09-22T04:30:00.000Z",
    rooms: 1,
    guests: 1,
    infants: 0,
    room_lines: [{ kind: "room", description: "H-101 — Double sharing", days: 1, rate: total, amount: total, rate_incl: total, amount_incl: total, gst_percent: 0 }],
    subtotal_rooms: total,
    meal_lines: [
      { meal: "breakfast", count: 0, rate: 8000, amount: 0, rate_incl: 8000, amount_incl: 0, gst_percent: 0 },
      { meal: "lunch", count: 0, rate: 12000, amount: 0, rate_incl: 12000, amount_incl: 0, gst_percent: 0 },
      { meal: "dinner", count: 0, rate: 10000, amount: 0, rate_incl: 10000, amount_incl: 0, gst_percent: 0 },
    ],
    subtotal_dining: 0,
    total,
    gst_percent: 0,
    gst: 0,
    cgst: 0,
    sgst: 0,
    gst_breakdown: [],
    prices_include_gst: true,
    grand_total: total,
    gstin: "32AAAAI9910J1ZR",
    bank: { account_holder: "x", account_number: "123456", bank_name: "SBI", ifsc: "SBIN0006640", branch: "K" },
    contact: { address: "a", phone: "p", email: "ghm@iitpkd.ac.in" },
    day_basis: "night",
    problems: [],
  };
}

function bookingInput(patch: Partial<NewBookingInput> = {}): NewBookingInput {
  return {
    user_id: "employee-priya",
    guest_house_id: "gh-hamsanandi",
    user_role: "employee",
    status: "VACATED",
    purpose_of_visit: "Examiner visit",
    check_in: "2026-09-20T08:30:00.000Z",
    check_out: "2026-09-22T04:30:00.000Z",
    booking_type: "official",
    service_type: "room",
    debit_head: "department_budget",
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
    rooms: [{ room_type: null, guests: [{ name: "Guest One", age: 40, gender: "female", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null }] }],
    ...patch,
  };
}

const issue = (bookingId: string, fy = "2026-27", replaces: string | null = null) =>
  store.issueInvoice({ bookingId, fy, prefix: "GH", digits: 4, document: doc(bookingId), mealCounts: null, issuedBy: "gh-manager", replaces });

describe("invoices in the mock store", () => {
  it("self-heals a database written before migration 19", async () => {
    const raw = JSON.parse(fs.readFileSync(db.file, "utf8"));
    delete raw.tariffs;
    delete raw.invoices;
    delete raw.invoice_counters;
    fs.writeFileSync(db.file, JSON.stringify(raw));
    const tariffs = await store.listTariffs();
    expect(tariffs.find((t) => t.item === "room" && t.requester_role === "official")?.rate).toBe(4000);
    expect(tariffs.some((t) => t.item === "extra_bed")).toBe(false);
    expect(await store.listInvoices({})).toEqual([]);
  });

  it("numbers consecutively per financial year and restarts in April", async () => {
    const a = await store.createBooking(bookingInput());
    const b = await store.createBooking(bookingInput());
    const c = await store.createBooking(bookingInput());
    expect((await issue(a.id)).invoice_number).toBe("GH/2026-27/0001");
    expect((await issue(b.id)).invoice_number).toBe("GH/2026-27/0002");
    expect((await issue(c.id, "2027-28")).invoice_number).toBe("GH/2027-28/0001");
  });

  it("refuses a second live invoice for a booking, without spending a number", async () => {
    const a = await store.createBooking(bookingInput());
    const first = await issue(a.id);
    await expect(issue(a.id)).rejects.toThrow(/already has invoice/);
    const next = await issue((await store.createBooking(bookingInput())).id);
    expect(next.seq).toBe((first.seq ?? 0) + 1);
  });

  it("keeps issued invoices immutable: pay once, cancel with a reason, never after", async () => {
    const a = await store.createBooking(bookingInput());
    const inv = await issue(a.id);
    await expect(store.saveInvoiceDraft(a.id, { breakfast: 1, lunch: 0, dinner: 0 }, "gh-manager")).rejects.toThrow(/already has invoice/);
    await expect(
      store.markInvoicePaid(inv.id, { mode: "upi", reference: "", paidAt: "2026-09-22T07:00:00.000Z", paidBy: "gh-manager" })
    ).rejects.toThrow(/reference/);
    await store.markInvoicePaid(inv.id, { mode: "upi", reference: "UTR1", paidAt: "2026-09-22T07:00:00.000Z", paidBy: "gh-manager" });
    await expect(
      store.markInvoicePaid(inv.id, { mode: "cash", reference: null, paidAt: "2026-09-22T07:00:00.000Z", paidBy: "gh-manager" })
    ).rejects.toThrow(/cannot go from paid/);
    await expect(store.cancelInvoice(inv.id, { reason: " ", by: "gh-manager" })).rejects.toThrow(/reason/);
    await store.cancelInvoice(inv.id, { reason: "Lunch counted twice", by: "gh-manager" });
    await expect(store.cancelInvoice(inv.id, { reason: "again", by: "gh-manager" })).rejects.toThrow(/cancelled/);
    const stored = await store.getInvoice(inv.id);
    expect(stored?.document?.invoice_number).toBe(inv.invoice_number);
    expect(stored?.payment_reference).toBe("UTR1");

    // A correction is a new invoice that names the one it replaces.
    const again = await issue(a.id, "2026-27", inv.id);
    expect(again.invoice_number).not.toBe(inv.invoice_number);
    expect(again.replaces_invoice_id).toBe(inv.id);
  });

  it("promotes the draft in place, and a draft goes with its booking", async () => {
    const a = await store.createBooking(bookingInput());
    const draft = await store.saveInvoiceDraft(a.id, { breakfast: 2, lunch: 1, dinner: 0 }, "gh-manager");
    expect(draft.status).toBe("draft");
    const issued = await issue(a.id);
    expect(issued.id).toBe(draft.id);

    const b = await store.createBooking(bookingInput());
    await store.saveInvoiceDraft(b.id, null, "gh-manager");
    await store.deleteBooking(b.id);
    expect(await store.listInvoices({ bookingId: b.id })).toEqual([]);
    await expect(store.deleteBooking(a.id)).rejects.toThrow(/cannot be deleted/);
  });

  it("locks a rate once it is in force", async () => {
    const past = await store.createTariff({
      guest_house_id: null, item: "extra_bed", room_type: null, booking_type: null, requester_role: null,
      rate: 500, effective_from: "2026-01-01", note: null, created_by: null,
    });
    await expect(store.deleteTariff(past.id)).rejects.toThrow(/in force/);
    const input = {
      guest_house_id: past.guest_house_id, item: past.item, room_type: past.room_type, booking_type: past.booking_type,
      requester_role: past.requester_role, rate: past.rate, effective_from: past.effective_from, note: past.note, created_by: null,
    };
    await expect(store.createTariff(input)).rejects.toThrow(/already starts/);
    const future = await store.createTariff({ ...input, effective_from: "2099-04-01" });
    await store.deleteTariff(future.id);
    expect((await store.listTariffs()).some((t) => t.id === future.id)).toBe(false);
  });
});

describe("the invoice goes to Accounts", () => {
  it("mails an official invoice To Accounts, CC the HOD and the requester, with the PDF", async () => {
    await store.setJsonSetting("rules.invoice", { accounts_email: "accounts@iitpkd.ac.in" });
    const notify = await import("@/lib/mail/notify");
    const { dispatchOutbox } = await import("@/lib/mail/dispatch");
    const b = await store.createBooking(bookingInput());
    const inv = await issue(b.id);
    await notify.notifyInvoiceIssued(inv.id);
    const rows = (await store.listEmails({ bookingId: b.id, limit: 20 })).filter((r) => r.event_key === "invoice.issued.accounts");
    expect(rows).toHaveLength(1);
    expect(rows[0].to_emails).toEqual(["accounts@iitpkd.ac.in"]);
    expect(rows[0].cc_emails).toEqual(["hod.cse@iitpkd.ac.in", "priya@iitpkd.ac.in"]);
    expect(rows[0].attachments).toEqual([{ kind: "invoice", invoice_id: inv.id }]);
    // Queueing already started a dispatcher in the background; wait for it
    // (or run one) until the message settles — rendering the PDF takes a moment.
    let status: string | undefined;
    for (let i = 0; i < 40; i++) {
      await dispatchOutbox({ batchSize: 50 });
      status = (await store.listEmails({ bookingId: b.id, limit: 20 })).find((r) => r.event_key === "invoice.issued.accounts")?.status;
      if (status === "SENT" || status === "FAILED") break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(status).toBe("SENT");
  });

  it("does not mail a personal booking's invoice", async () => {
    const notify = await import("@/lib/mail/notify");
    const b = await store.createBooking(bookingInput({ booking_type: "personal", debit_head: "personal_funds" }));
    const inv = await issue(b.id);
    await notify.notifyInvoiceIssued(inv.id);
    const rows = (await store.listEmails({ bookingId: b.id, limit: 20 })).filter((r) => r.event_key === "invoice.issued.accounts");
    expect(rows).toHaveLength(0);
  });
});
