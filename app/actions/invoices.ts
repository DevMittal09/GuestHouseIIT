"use server";

import { revalidatePath } from "next/cache";
import {
  canCancelInvoices,
  canExportCollections,
  canIssueInvoices,
  canUseConsoleSection,
} from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import { collectionsCsv, monthBounds } from "@/lib/collections";
import {
  buildInvoiceDocument,
  financialYear,
  invoiceBlocker,
  InvoiceStateError,
  mealCovers,
  paymentReferenceError,
  PAYMENT_MODES,
  type InvoiceDocument,
  type InvoiceRecord,
  type MealCounts,
  type PaymentMode,
} from "@/lib/invoice";
import { notifyInvoiceIssued } from "@/lib/mail/notify";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import { tariffInputSchema, tariffLockedError, type Tariff } from "@/lib/tariffs";
import { toInstituteDateValue } from "@/lib/tz";
import type { BookingWithDetails, Profile } from "@/lib/types";
import type { ActionResult } from "./bookings";

/**
 * Invoices (Phase 5): preview → correct the meal counts → issue & print →
 * mark paid, from the manager's and caretaker's consoles.
 *
 * Every action re-checks the caller's role here; the buttons being hidden is
 * not the boundary. Issuing freezes the whole printed document as the
 * invoice's snapshot (`lib/invoice.ts`), and the database refuses any later
 * change to it (migration 19): a correction is a cancellation with a reason
 * and a new invoice, which records the one it replaces.
 */

const MIGRATION_HINT =
  "Invoices are not set up yet — apply supabase/migrations/00000000000019_tariffs_and_invoices.sql.";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof InvoiceStateError) return { ok: false, error: e.message };
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return { ok: false, error: MIGRATION_HINT };
  console.error("[invoices]", e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

async function requireDesk(): Promise<Profile> {
  const user = await requireUser();
  if (!canIssueInvoices(user.role)) throw new InvoiceStateError("Only the guest house desk can work with invoices");
  return user;
}

function cleanCounts(counts: MealCounts | null | undefined): MealCounts | null {
  if (!counts) return null;
  const n = (v: unknown) => {
    const x = Math.floor(Number(v));
    if (!Number.isFinite(x) || x < 0 || x > 10_000) throw new InvoiceStateError("Meal counts must be whole numbers from 0");
    return x;
  };
  return { breakfast: n(counts.breakfast), lunch: n(counts.lunch), dinner: n(counts.dinner) };
}

async function priceBooking(booking: BookingWithDetails, mealCounts: MealCounts | null, extra: { invoiceNumber?: string; invoiceDate?: string } = {}) {
  const [rules, tariffs] = await Promise.all([getRules(), getStore().listTariffs()]);
  return buildInvoiceDocument(booking, {
    tariffs,
    rules: rules.invoice,
    capacity: rules.capacity,
    mealCounts,
    ...extra,
  });
}

export type InvoicePanel = {
  bookingId: string;
  bookingReference: string;
  /** The invoice being worked on: the live issued/paid one, else the priced draft. */
  current: InvoiceRecord | null;
  /** What would be printed: the snapshot once issued, else priced now. */
  document: InvoiceDocument;
  /** The covers worked out from the booking, for "reset to computed". */
  computedCounts: MealCounts;
  /** Why it cannot be issued now, or null. */
  blocker: string | null;
  /** Earlier invoices, cancelled. */
  history: InvoiceRecord[];
  canCancel: boolean;
};

/** Everything the invoice dialog shows for one booking. */
export async function getInvoicePanel(
  bookingId: string
): Promise<{ ok: true; panel: InvoicePanel } | { ok: false; error: string }> {
  try {
    const user = await requireDesk();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const invoices = await store.listInvoices({ bookingId });
    const live = invoices.find((i) => i.status !== "cancelled") ?? null;
    const document =
      live?.document ?? (await priceBooking(booking, live?.meal_counts ?? null));
    return {
      ok: true,
      panel: {
        bookingId,
        bookingReference: booking.booking_reference_id,
        current: live,
        document,
        computedCounts: mealCovers(booking),
        blocker: live && live.status !== "draft" ? null : invoiceBlocker(booking, document),
        history: invoices.filter((i) => i.status === "cancelled"),
        canCancel: canCancelInvoices(user.role),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Keep the desk's meal-count correction on the draft. */
export async function saveInvoiceMealCounts(bookingId: string, counts: MealCounts | null): Promise<ActionResult> {
  try {
    const user = await requireDesk();
    const store = getStore();
    if (!(await store.getBooking(bookingId))) return { ok: false, error: "Booking not found" };
    await store.saveInvoiceDraft(bookingId, cleanCounts(counts), user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Issue the invoice: number it (next in the financial year), freeze the
 * snapshot, and — for an official booking — mail it to Accounts. After a
 * cancellation the new invoice records the one it replaces.
 */
export async function issueInvoiceAction(
  bookingId: string,
  counts: MealCounts | null
): Promise<{ ok: true; invoiceId: string; number: string } | { ok: false; error: string }> {
  try {
    const user = await requireDesk();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const mealCounts = cleanCounts(counts);
    const now = new Date().toISOString();
    const document = await priceBooking(booking, mealCounts, { invoiceDate: now });
    const blocker = invoiceBlocker(booking, document);
    if (blocker) return { ok: false, error: blocker };

    const rules = (await getRules()).invoice;
    const previous = await store.listInvoices({ bookingId });
    const replaced = previous
      .filter((i) => i.status === "cancelled" && !previous.some((p) => p.replaces_invoice_id === i.id))
      .sort((a, b) => (b.cancelled_at ?? "").localeCompare(a.cancelled_at ?? ""))[0];

    const invoice = await store.issueInvoice({
      bookingId,
      fy: financialYear(now),
      prefix: rules.serial_prefix,
      digits: rules.serial_digits,
      document,
      mealCounts,
      issuedBy: user.id,
      replaces: replaced?.id ?? null,
    });
    await recordAudit(user, "invoice.issued", invoice.invoice_number, {
      booking: booking.booking_reference_id,
      grand_total: invoice.grand_total,
      replaces: replaced?.invoice_number ?? null,
    });
    await notifyInvoiceIssued(invoice.id);
    revalidatePath("/manager");
    revalidatePath("/caretaker");
    revalidatePath("/dashboard");
    return { ok: true, invoiceId: invoice.id, number: invoice.invoice_number ?? "" };
  } catch (e) {
    return fail(e);
  }
}

export async function markInvoicePaidAction(
  invoiceId: string,
  mode: PaymentMode,
  reference: string | null,
  paidOn: string | null
): Promise<ActionResult> {
  try {
    const user = await requireDesk();
    if (!PAYMENT_MODES.includes(mode)) return { ok: false, error: "Choose how it was paid" };
    const refError = paymentReferenceError(mode, reference);
    if (refError) return { ok: false, error: refError };
    const now = new Date();
    let paidAt = now.toISOString();
    if (paidOn) {
      // A date typed at the desk: payments are recorded the day they come in,
      // or later — never in the future.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > toInstituteDateValue(now)) {
        return { ok: false, error: "The payment date cannot be in the future" };
      }
      if (paidOn !== toInstituteDateValue(now)) paidAt = `${paidOn}T06:30:00.000Z`; // noon IST
    }
    const store = getStore();
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found" };
    if (invoice.issued_at && paidAt < invoice.issued_at.slice(0, 10)) {
      return { ok: false, error: "The payment date is before the invoice was issued" };
    }
    await store.markInvoicePaid(invoiceId, { mode, reference: reference?.trim() || null, paidAt, paidBy: user.id });
    await recordAudit(user, "invoice.paid", invoice.invoice_number, { mode, reference: reference?.trim() || null });
    revalidatePath("/manager");
    revalidatePath("/caretaker");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInvoiceAction(invoiceId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canCancelInvoices(user.role)) return { ok: false, error: "Only the Guest House Manager can cancel an invoice" };
    const why = reason?.trim() ?? "";
    if (why.length < 5) return { ok: false, error: "Say why the invoice is being cancelled" };
    const store = getStore();
    const invoice = await store.getInvoice(invoiceId);
    if (!invoice) return { ok: false, error: "Invoice not found" };
    await store.cancelInvoice(invoiceId, { reason: why.slice(0, 500), by: user.id });
    await recordAudit(user, "invoice.cancelled", invoice.invoice_number, { reason: why.slice(0, 500) });
    revalidatePath("/manager");
    revalidatePath("/caretaker");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ tariffs

async function requireBillingConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "billing")) {
    throw new InvoiceStateError("Only the Guest House Manager or a developer can change tariffs");
  }
  if (!(await isAdminUnlocked())) {
    throw new InvoiceStateError("The console is locked — enter the console password again");
  }
  return user;
}

export async function listTariffsForConsole(): Promise<{ ok: true; tariffs: Tariff[] } | { ok: false; error: string }> {
  try {
    await requireBillingConsole();
    return { ok: true, tariffs: await getStore().listTariffs() };
  } catch (e) {
    return fail(e);
  }
}

/** A new rate. Rates already in force are never edited — this is how a price changes. */
export async function createTariffAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireBillingConsole();
    const parsed = tariffInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid rate" };
    const store = getStore();
    if (parsed.data.guest_house_id && !(await store.getGuestHouse(parsed.data.guest_house_id))) {
      return { ok: false, error: "That guest house no longer exists" };
    }
    const row = await store.createTariff({ ...parsed.data, created_by: user.id });
    await recordAudit(user, "settings.changed", "tariffs", { added: row });
    revalidatePath("/admin/billing");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Only a rate that has not come into force yet can be removed. */
export async function deleteTariffAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireBillingConsole();
    const store = getStore();
    const row = (await store.listTariffs()).find((t) => t.id === id);
    if (!row) return { ok: false, error: "That rate is already gone" };
    const locked = tariffLockedError(row, toInstituteDateValue(new Date()));
    if (locked) return { ok: false, error: locked };
    await store.deleteTariff(id);
    await recordAudit(user, "settings.changed", "tariffs", { removed: row });
    revalidatePath("/admin/billing");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------- collections

/** The month's invoices and payments as CSV, with totals by mode and head. */
export async function exportCollectionsCsv(
  month: string
): Promise<{ ok: true; csv: string; filename: string; rows: number } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (!canExportCollections(user.role)) return { ok: false, error: "Only the guest house desk can export collections" };
    const bounds = monthBounds(month);
    if (!bounds) return { ok: false, error: "Choose a month" };
    const store = getStore();
    const [issued, paid] = await Promise.all([
      store.listInvoices({ issuedFrom: bounds.from, issuedTo: bounds.to }),
      store.listInvoices({ paidFrom: bounds.from, paidTo: bounds.to }),
    ]);
    const all = [...new Map([...issued, ...paid].map((i) => [i.id, i])).values()];
    await recordAudit(user, "export.collections", month, { invoices: all.length });
    return {
      ok: true,
      csv: collectionsCsv(all, month, bounds),
      filename: `collections-${month}.csv`,
      rows: all.length,
    };
  } catch (e) {
    return fail(e);
  }
}
