import { mealDayCounts, MEAL_KEYS, MEAL_LABELS } from "./meals";
import { countBedGuests, countInfants, ROOM_TYPE_LABELS } from "./occupancy";
import { invoiceHeadLabel, needsProject } from "./debit-heads";
import { resolveTariff, type Tariff, type TariffItem } from "./tariffs";
import {
  addDaysToDateValue,
  formatDateValue,
  formatInstituteDate,
  formatInstituteDateTime,
  parseDateValue,
  toInstituteDateValue,
} from "./tz";
import type { CapacityRules, InvoiceRules } from "./settings";
import type { BookingWithDetails, DebitHead, MealKey, Room } from "./types";

/**
 * The guest house invoice (Phase 5), as pure functions.
 *
 * Everything the printed invoice shows is worked out here from the booking,
 * the tariff rows and the invoice Settings — then **frozen**: issuing stores
 * the whole `InvoiceDocument` as the invoice's snapshot, and the PDF is drawn
 * from the snapshot, never recomputed. A tariff edited next year, a guest
 * renamed or a project retitled cannot change an invoice already handed over.
 * A correction is a cancellation (with a reason) and a new invoice.
 *
 * Money is **integer paise** throughout, so no sum is ever off by a
 * floating-point hair; it becomes rupees only for display and in the
 * reporting columns of the `invoices` table.
 *
 * The layout follows the office's template (`public/GHM_Invoice.docx`)
 * exactly: Booking Details | Invoice Details, a room table with a row per room
 * and per extra bed, a dining table of exactly Breakfast, Lunch and Dinner,
 * then Sub Total (A), Sub Total (B), Total (A+B), GST on Total and the Grand
 * Total.
 */

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued — awaiting payment",
  paid: "Paid",
  cancelled: "Cancelled",
};

export type PaymentMode = "cash" | "upi" | "account_transfer";

export const PAYMENT_MODES: PaymentMode[] = ["cash", "upi", "account_transfer"];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  account_transfer: "Account transfer",
};

/** A reference is required for anything but cash: the UTR or UPI transaction id. */
export function paymentReferenceError(mode: PaymentMode, reference: string | null | undefined): string | null {
  if (mode === "cash") return null;
  return reference?.trim()
    ? null
    : `Enter the ${mode === "upi" ? "UPI transaction id" : "transfer reference (UTR)"} for this payment`;
}

export type MealCounts = Record<MealKey, number>;

// ------------------------------------------------------------------ money

/** Rupees (as the tariff stores them) to integer paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

/** Half-up to the whole rupee: ₹10.50 → ₹11, ₹10.49 → ₹10. */
export function roundHalfUpToRupee(paise: number): number {
  return Math.floor((paise + 50) / 100) * 100;
}

/**
 * GST on a total, rounded half-up to the rupee. Computed in integers:
 * percent is taken to basis points, so 18% of ₹25 is exactly ₹4.50 and rounds
 * to ₹5 rather than to whatever 4.499999 happens to be.
 */
export function gstPaise(totalPaise: number, percent: number): number {
  const bp = Math.round(percent * 100);
  if (bp <= 0 || totalPaise <= 0) return 0;
  return Math.floor((totalPaise * bp + 500_000) / 1_000_000) * 100;
}

/**
 * Indian grouping with the rupee sign: ₹1,23,456.00. Written out rather than
 * left to `Intl`, because a server without full ICU would print Western
 * grouping on an official document.
 */
export function formatINR(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${negative ? "-" : ""}₹${grouped}.${fraction}`;
}

// ------------------------------------------------------------ numbering

/**
 * The Indian financial year an instant falls in, by the institute's
 * calendar: 1 April 2026 to 31 March 2027 is "2026-27". The running number
 * restarts at 0001 each April.
 */
export function financialYear(at: string | Date): string {
  const day = parseDateValue(toInstituteDateValue(at));
  if (!day) throw new Error("Not a date");
  const start = day.month >= 4 ? day.year : day.year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** GH/2026-27/0001 */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number, digits: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(digits, "0")}`;
}

// ---------------------------------------------------------- chargeable days

/**
 * The days a stay is charged for, each as the institute date it starts on —
 * the date whose tariff prices it.
 *
 * - `night`: one per calendar night between the check-in and check-out dates.
 *   Arriving after midnight and leaving the same morning is still one.
 * - `24h`: one per 24 hours from check-in; a further day starts only when the
 *   stay runs more than `graceHours` into it. The office's tariff sheet words
 *   it as "24 hours, with a permissible variation of ±4 hours".
 *
 * Never fewer than one: a guest who used a room for an afternoon used it.
 */
export function chargeableDays(
  checkIn: string,
  checkOut: string,
  basis: InvoiceRules["day_basis"],
  graceHours: number
): string[] {
  const firstDate = toInstituteDateValue(checkIn);
  let count: number;
  if (basis === "night") {
    const a = parseDateValue(firstDate)!;
    const b = parseDateValue(toInstituteDateValue(checkOut))!;
    count = Math.round(
      (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000
    );
  } else {
    const hours = (Date.parse(checkOut) - Date.parse(checkIn)) / 3_600_000;
    count = Number.isFinite(hours) ? Math.ceil((hours - graceHours) / 24) : 1;
  }
  count = Math.max(1, count);
  if (basis === "night") {
    return Array.from({ length: count }, (_, i) => addDaysToDateValue(firstDate, i));
  }
  const start = Date.parse(checkIn);
  return Array.from({ length: count }, (_, i) =>
    toInstituteDateValue(new Date(start + i * 86_400_000))
  );
}

/**
 * Consecutive days charged at the same rate, so a mid-stay tariff change
 * prints as two rows instead of an average nobody can check.
 */
export function splitByRate(
  days: string[],
  rateFor: (day: string) => number | null
): { from: string; to: string; days: number; rate: number | null }[] {
  const out: { from: string; to: string; days: number; rate: number | null }[] = [];
  for (const day of days) {
    const rate = rateFor(day);
    const last = out[out.length - 1];
    if (last && last.rate === rate) {
      last.to = day;
      last.days++;
    } else {
      out.push({ from: day, to: day, days: 1, rate });
    }
  }
  return out;
}

// ------------------------------------------------------ what the stay used

/**
 * When the guest actually arrived and left, from the desk's own log: the
 * check-in and check-out the caretaker recorded. A stay not yet checked out
 * is billed to its booked check-out; one never recorded as arriving, from its
 * booked check-in.
 */
export function actualStayTimes(booking: Pick<BookingWithDetails, "check_in" | "check_out" | "logs">): {
  checkIn: string;
  checkOut: string;
  actualIn: boolean;
  actualOut: boolean;
} {
  const last = (status: string) =>
    [...booking.logs]
      .filter((l) => l.new_status === status)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .pop()?.timestamp ?? null;
  const inAt = last("OCCUPIED");
  const outAt = last("VACATED");
  return {
    checkIn: inAt ?? booking.check_in,
    checkOut: outAt ?? booking.check_out,
    actualIn: inAt !== null,
    actualOut: outAt !== null,
  };
}

/**
 * Meals served, as covers: each meal ticked on a day × the people eating it.
 * On a stay the people are the guests with a bed (an infant shares a
 * guardian's plate as they share the bed); on a dining booking, its head
 * count. The desk corrects these on the invoice when the kitchen's tally
 * differs — the correction is what is printed.
 */
export function mealCovers(
  booking: Pick<BookingWithDetails, "meals" | "guests" | "service_type" | "meal_guest_count">
): MealCounts {
  const diners =
    booking.service_type === "meals_only" ? (booking.meal_guest_count ?? 0) : countBedGuests(booking.guests);
  const ticks = mealDayCounts(booking.meals);
  return {
    breakfast: ticks.breakfast * diners,
    lunch: ticks.lunch * diners,
    dinner: ticks.dinner * diners,
  };
}

/**
 * Extra beds per allocated room: the guests the manager put in a room card
 * beyond the room's own beds. Rooms held but not tied to a card (bookings from
 * before migration 11) are pooled, with any extra beds put against the last.
 */
export function extraBedsByRoom(
  booking: Pick<BookingWithDetails, "rooms" | "assigned_rooms" | "guests">,
  capacity: CapacityRules
): { room: Room; extra: number }[] {
  const out = new Map<string, { room: Room; extra: number }>();
  const mapped = new Set<string>();
  for (const card of booking.rooms ?? []) {
    const room = card.assigned_room;
    if (!room) continue;
    mapped.add(room.id);
    const standard = capacity.room_types[room.room_type]?.standard ?? 1;
    const beds = countBedGuests(card.guests);
    const prev = out.get(room.id);
    out.set(room.id, { room, extra: (prev?.extra ?? 0) + Math.max(0, beds - standard) });
  }
  const unmapped = booking.assigned_rooms.filter((r) => !mapped.has(r.id));
  if (unmapped.length > 0) {
    const onCards = new Set((booking.rooms ?? []).filter((c) => c.assigned_room).flatMap((c) => c.guests.map((g) => g.id)));
    const rest = booking.guests.filter((g) => !onCards.has(g.id));
    const standard = unmapped.reduce((n, r) => n + (capacity.room_types[r.room_type]?.standard ?? 1), 0);
    const extra = Math.max(0, countBedGuests(rest) - standard);
    unmapped.forEach((room, i) => out.set(room.id, { room, extra: i === unmapped.length - 1 ? extra : 0 }));
  }
  // In the order the rooms were allocated.
  return booking.assigned_rooms.map((r) => out.get(r.id)).filter((x): x is { room: Room; extra: number } => !!x);
}

/** "SP/2025/017 — Grid-scale storage (Dr. A. Kumar)" back into its parts. */
export function projectFromDetails(details: string | null): { number: string; title: string } | null {
  if (!details) return null;
  const at = details.indexOf(" — ");
  if (at < 0) return { number: details.trim(), title: "" };
  return { number: details.slice(0, at).trim(), title: details.slice(at + 3).trim() };
}

// ------------------------------------------------------------ the document

/**
 * `rate` and `amount` are the **taxable value** (before GST) — what the Tariff
 * and Amount columns print, so that Total (A+B) + GST = Grand Total. When the
 * tariff includes GST, `rate_incl` / `amount_incl` are the office's prices.
 */
export type InvoiceRoomLine = {
  kind: "room" | "extra_bed";
  description: string;
  days: number;
  /** Paise per day, per bed for extra beds, before GST. Null when no tariff covers it. */
  rate: number | null;
  amount: number;
  rate_incl: number | null;
  amount_incl: number;
  gst_percent: number;
};

export type InvoiceMealLine = {
  meal: MealKey;
  count: number;
  rate: number | null;
  amount: number;
  rate_incl: number | null;
  amount_incl: number;
  gst_percent: number;
};

/** One row of the tax breakdown: taxable value and GST for a SAC at a rate. */
export type GstBreakdown = {
  label: "Accommodation" | "Food";
  sac: string;
  percent: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
};

/**
 * Taxable value and GST of a price. Inclusive: `gross` is the price paid,
 * the taxable value is backed out and rounded to the paisa, and the GST is the
 * difference — so the two always add back to the price exactly. Exclusive:
 * `gross` is the taxable value and GST is added, rounded to the paisa.
 */
export function splitGst(gross: number, percent: number, inclusive: boolean): { taxable: number; tax: number } {
  if (percent <= 0) return { taxable: gross, tax: 0 };
  if (inclusive) {
    const bp = Math.round(percent * 100);
    const taxable = Math.round((gross * 10_000) / (10_000 + bp));
    return { taxable, tax: gross - taxable };
  }
  return { taxable: gross, tax: Math.round((gross * Math.round(percent * 100)) / 10_000) };
}

/**
 * The accommodation rate for a room charged `ratePaise` a day: the lower rate
 * while the room's value (before GST) is at most the threshold, else the higher.
 */
export function roomGstPercent(ratePaise: number, rules: InvoiceRules): number {
  const value = rules.prices_include_gst ? splitGst(ratePaise, rules.gst_room_percent, true).taxable : ratePaise;
  return value <= rules.gst_room_threshold * 100 ? rules.gst_room_percent : rules.gst_room_above_percent;
}

/** CGST and SGST, half each; an odd paisa goes to SGST. */
export function halves(tax: number): { cgst: number; sgst: number } {
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst };
}

/** Everything printed on an invoice. Stored whole as the issued invoice's snapshot. */
export type InvoiceDocument = {
  version: 1;
  /**
   * A stay, or a dining (meals-only) booking, which has no rooms, no check-in
   * and no check-out — so its invoice prints none of them (24 Sep 2026).
   * Absent on snapshots issued before then; read it through `invoiceKind`.
   */
  kind?: "stay" | "dining";
  booking_id: string;
  booking_reference: string;
  guest_house: string;
  booked_by: string;
  unit: string;
  debit_head: DebitHead | null;
  debit_head_label: string;
  project_title: string | null;
  project_number: string | null;
  /** The project's sub-head the requester typed (migration 24). */
  project_subhead?: string | null;
  /** Which special fund, when the head is Special Funds and the requester said. */
  special_fund?: string | null;
  /** A dining booking's days, "yyyy-MM-dd", in order. Empty on a stay. */
  meal_dates?: string[];
  /** Null until issued; the preview prints "DRAFT". */
  invoice_number: string | null;
  invoice_date: string;
  primary_guest: string;
  check_in: string;
  check_out: string;
  rooms: number;
  guests: number;
  infants: number;
  room_lines: InvoiceRoomLine[];
  subtotal_rooms: number;
  /** Always Breakfast, Lunch, Dinner, in that order. */
  meal_lines: InvoiceMealLine[];
  subtotal_dining: number;
  /** Taxable value, A + B. */
  total: number;
  /** The effective rate on the whole invoice (rounded), for reports. */
  gst_percent: number;
  gst: number;
  cgst: number;
  sgst: number;
  /** Per SAC and rate — printed under the table. */
  gst_breakdown: GstBreakdown[];
  /** Whether the tariffs the invoice was priced at included GST. */
  prices_include_gst: boolean;
  grand_total: number;
  gstin: string;
  bank: InvoiceRules["bank"];
  contact: InvoiceRules["contact"];
  day_basis: InvoiceRules["day_basis"];
  /** What stops it being issued — a charge no tariff covers. Empty when it can be. */
  problems: string[];
};

export type InvoiceContext = {
  tariffs: Tariff[];
  rules: InvoiceRules;
  capacity: CapacityRules;
  /** The desk's corrected meal counts; the computed covers when absent. */
  mealCounts?: MealCounts | null;
  invoiceNumber?: string | null;
  /** Defaults to now. */
  invoiceDate?: string;
};

/** "No extra-bed rate covers …" */
const RATE_NOUN: Record<TariffItem, string> = {
  room: "room",
  extra_bed: "extra-bed",
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
};

function dayRange(from: string, to: string): string {
  const a = formatDateValue(from, { weekday: false });
  return from === to ? a : `${a} – ${formatDateValue(to, { weekday: false })}`;
}

export function buildInvoiceDocument(booking: BookingWithDetails, ctx: InvoiceContext): InvoiceDocument {
  const problems: string[] = [];
  const stay = actualStayTimes(booking);
  const house = booking.guest_house?.name ?? "";
  const base = {
    guest_house_id: booking.guest_house_id,
    booking_type: booking.booking_type,
    requester_role: booking.user_role,
  };
  const rules = ctx.rules;
  const inclusive = rules.prices_include_gst;
  /** A line's printed figures from its tariff (paise) and quantity. */
  const price = (tariff: number | null, qty: number, percent: number) => {
    if (tariff === null) return { rate: null, amount: 0, rate_incl: null, amount_incl: 0, gst_percent: percent };
    if (inclusive) {
      // The Tariff column shows the rate before GST; the Amount is that rate
      // times the quantity; the line's GST is what makes it up to the price.
      const rate = splitGst(tariff, percent, true).taxable;
      return { rate, amount: rate * qty, rate_incl: tariff, amount_incl: tariff * qty, gst_percent: percent };
    }
    const tax = splitGst(tariff * qty, percent, false).tax;
    return { rate: tariff, amount: tariff * qty, rate_incl: null, amount_incl: tariff * qty + tax, gst_percent: percent };
  };
  const priceOf = (item: TariffItem, roomType: Room["room_type"] | null, date: string): number | null => {
    const t = resolveTariff(ctx.tariffs, { ...base, item, room_type: roomType, date });
    return t ? toPaise(t.rate) : null;
  };
  const missing = (item: TariffItem, date: string, what: string) =>
    problems.push(
      `No ${RATE_NOUN[item]} rate covers ${what} at ${house} on ${formatDateValue(date, { year: true })} — add one in Tariffs & Invoicing, applying from that date or earlier.`
    );

  // ---- rooms and extra beds
  const days = chargeableDays(stay.checkIn, stay.checkOut, ctx.rules.day_basis, ctx.rules.grace_hours);
  const roomLines: InvoiceRoomLine[] = [];
  const extras = extraBedsByRoom(booking, ctx.capacity);
  for (const { room, extra } of extras) {
    const typeLabel = ROOM_TYPE_LABELS[room.room_type] ?? room.room_type;
    const groups = splitByRate(days, (d) => priceOf("room", room.room_type, d));
    for (const g of groups) {
      if (g.rate === null) missing("room", g.from, `room ${room.room_number}`);
      roomLines.push({
        kind: "room",
        description: `${room.room_number} — ${typeLabel}${groups.length > 1 ? ` (${dayRange(g.from, g.to)})` : ""}`,
        days: g.days,
        ...price(g.rate, g.days, g.rate === null ? rules.gst_room_percent : roomGstPercent(g.rate, rules)),
      });
    }
    if (extra > 0) {
      const bedGroups = splitByRate(days, (d) => priceOf("extra_bed", room.room_type, d));
      for (const g of bedGroups) {
        if (g.rate === null) missing("extra_bed", g.from, `the extra bed in ${room.room_number}`);
        // An extra bed is part of the room's accommodation: the room's slab.
        const roomRate = priceOf("room", room.room_type, g.from);
        roomLines.push({
          kind: "extra_bed",
          description: `Extra bed${extra > 1 ? ` ×${extra}` : ""} — ${room.room_number}${bedGroups.length > 1 ? ` (${dayRange(g.from, g.to)})` : ""}`,
          days: g.days,
          ...price(g.rate, g.days * extra, roomGstPercent((roomRate ?? 0) + (g.rate ?? 0) * extra, rules)),
        });
      }
    }
  }
  const subtotalRooms = roomLines.reduce((n, l) => n + l.amount, 0);

  // ---- dining: exactly the three rows the template prints. A meal is priced
  // at the rate in force on the first day of the stay; counts are covers, or
  // the desk's correction.
  const counts = ctx.mealCounts ?? mealCovers(booking);
  const mealDate = toInstituteDateValue(stay.checkIn);
  const mealLines: InvoiceMealLine[] = MEAL_KEYS.map((meal) => {
    const count = Math.max(0, Math.floor(counts[meal] ?? 0));
    const rate = priceOf(meal, null, mealDate);
    if (count > 0 && rate === null) missing(meal, mealDate, `${MEAL_LABELS[meal].toLowerCase()}`);
    return { meal, count, ...price(rate, count, rules.gst_meal_percent) };
  });
  const subtotalDining = mealLines.reduce((n, l) => n + l.amount, 0);

  // ---- totals
  // Grouped by SAC and rate, as a tax invoice shows them. Inclusive: the
  // grand total is the sum of the prices exactly. Exclusive: GST is added per
  // group and the grand total rounded half-up to the rupee.
  const total = subtotalRooms + subtotalDining;
  const groups = new Map<string, GstBreakdown>();
  const add = (label: GstBreakdown["label"], sac: string, percent: number, taxable: number, gross: number) => {
    const key = `${label}|${percent}`;
    const g = groups.get(key) ?? { label, sac, percent, taxable: 0, tax: 0, cgst: 0, sgst: 0 };
    g.taxable += taxable;
    g.tax += gross - taxable;
    groups.set(key, g);
  };
  for (const l of roomLines) add("Accommodation", rules.sac_room, l.gst_percent, l.amount, l.amount_incl);
  for (const l of mealLines) if (l.count > 0) add("Food", rules.sac_meal, l.gst_percent, l.amount, l.amount_incl);
  const gstBreakdown = [...groups.values()].map((g) => {
    const tax = inclusive ? g.tax : gstPaise(g.taxable, g.percent);
    return { ...g, tax, ...halves(tax) };
  });
  const gst = gstBreakdown.reduce((n, g) => n + g.tax, 0);
  const grandTotal = inclusive ? total + gst : roundHalfUpToRupee(total + gst);
  const { cgst, sgst } = { cgst: gstBreakdown.reduce((n, g) => n + g.cgst, 0), sgst: gstBreakdown.reduce((n, g) => n + g.sgst, 0) };

  // ---- who and what
  const requester = booking.requester;
  const firstCard = [...(booking.rooms ?? [])].sort((a, b) => a.room_index - b.room_index)[0];
  const primary =
    firstCard?.guests.find((g) => !g.is_infant)?.name ??
    booking.guests.find((g) => !g.is_infant)?.name ??
    booking.on_behalf_of_name ??
    requester?.full_name ??
    "";
  const project = needsProject(booking.debit_head) ? projectFromDetails(booking.debit_details) : null;
  const mealsOnly = booking.service_type === "meals_only";

  return {
    version: 1,
    kind: mealsOnly ? "dining" : "stay",
    booking_id: booking.id,
    booking_reference: booking.booking_reference_id,
    guest_house: house,
    booked_by: booking.on_behalf_of_name ?? requester?.full_name ?? "",
    unit: booking.on_behalf_of_name
      ? booking.booking_type === "official"
        ? "Institute"
        : "—"
      : (requester?.department_or_club ?? (booking.user_role === "official" ? "Institute" : "—")),
    debit_head: booking.debit_head,
    debit_head_label: invoiceHeadLabel(booking.debit_head),
    project_title: project?.title || null,
    project_number: project?.number || null,
    project_subhead: needsProject(booking.debit_head) ? (booking.debit_subhead ?? null) : null,
    special_fund: booking.debit_head === "special_budget" ? (booking.debit_details ?? null) : null,
    meal_dates: mealsOnly ? [...new Set(booking.meals.map((d) => d.date))].sort() : [],
    invoice_number: ctx.invoiceNumber ?? null,
    invoice_date: ctx.invoiceDate ?? new Date().toISOString(),
    primary_guest: primary,
    check_in: stay.checkIn,
    check_out: stay.checkOut,
    rooms: mealsOnly ? 0 : booking.assigned_rooms.length,
    guests: mealsOnly ? (booking.meal_guest_count ?? 0) : countBedGuests(booking.guests),
    infants: mealsOnly ? 0 : countInfants(booking.guests),
    room_lines: roomLines,
    subtotal_rooms: subtotalRooms,
    meal_lines: mealLines,
    subtotal_dining: subtotalDining,
    total,
    gst_percent: total > 0 ? Math.round((gst * 10_000) / total) / 100 : 0,
    gst,
    cgst,
    sgst,
    gst_breakdown: gstBreakdown,
    prices_include_gst: inclusive,
    grand_total: grandTotal,
    gstin: ctx.rules.gstin,
    bank: ctx.rules.bank,
    contact: ctx.rules.contact,
    day_basis: ctx.rules.day_basis,
    problems,
  };
}

/** "12 Oct 2026" for the Invoice Date line. */
export function formatInvoiceDate(iso: string): string {
  return formatInstituteDate(iso);
}

/**
 * Whether an invoice is for a stay or for dining alone. Snapshots issued
 * before `kind` existed are read from their shape: a dining booking had no
 * rooms and no room lines.
 */
export function invoiceKind(doc: Pick<InvoiceDocument, "kind" | "rooms" | "room_lines">): "stay" | "dining" {
  if (doc.kind) return doc.kind;
  return doc.rooms === 0 && doc.room_lines.length === 0 ? "dining" : "stay";
}

/**
 * A dining booking's days as the invoice prints them: one range when they
 * run on consecutive days ("12 Oct 2026 – 14 Oct 2026"), else a list.
 * Snapshots without `meal_dates` fall back to the first and last day booked.
 */
export function describeMealDates(doc: Pick<InvoiceDocument, "meal_dates" | "check_in" | "check_out">): string {
  const dates =
    doc.meal_dates && doc.meal_dates.length > 0
      ? doc.meal_dates
      : [...new Set([toInstituteDateValue(doc.check_in), toInstituteDateValue(doc.check_out)])].sort();
  const day = (d: string) => formatDateValue(d, { year: true, weekday: false });
  if (dates.length === 1) return day(dates[0]);
  const consecutive = dates.every((d, i) => i === 0 || addDaysToDateValue(dates[i - 1], 1) === d);
  return consecutive ? `${day(dates[0])} – ${day(dates[dates.length - 1])}` : dates.map(day).join(", ");
}

/**
 * The facts printed above the tariff table, left (who pays) and right (what
 * was booked), for the PDF and the desk's preview alike — so the two cannot
 * disagree about what an invoice says.
 *
 * - **Project details only with the Project head** (24 Sep 2026). They used
 *   to print on every invoice, blank, which read as a project that had not
 *   been filled in. The sub-head follows the project; a Special Fund's name
 *   follows that head.
 * - **A dining invoice says nothing about rooms**: no check-in or check-out,
 *   no rooms, no infants, no primary guest — the days the kitchen cooked and
 *   the head count instead.
 */
export function invoiceFacts(doc: InvoiceDocument): { left: [string, string][]; right: [string, string][] } {
  const left: [string, string][] = [
    ["Booked By (Name) : ", doc.booked_by],
    ["Department/Section/Institute: ", doc.unit],
    ["Debitable head: ", doc.debit_head_label],
  ];
  if (doc.debit_head === "project_grant") {
    left.push(["Project Detail: ", doc.project_title ?? ""], ["Project Number: ", doc.project_number ?? ""]);
    if (doc.project_subhead) left.push(["Project Sub-head: ", doc.project_subhead]);
  }
  if (doc.debit_head === "special_budget" && doc.special_fund) {
    left.push(["Special Fund: ", doc.special_fund]);
  }
  const right: [string, string][] = [
    ["Invoice No.: ", doc.invoice_number ?? "DRAFT — not yet issued"],
    ["Invoice Date: ", formatInvoiceDate(doc.invoice_date)],
  ];
  if (invoiceKind(doc) === "dining") {
    right.push(["Meal Date(s): ", describeMealDates(doc)], ["No. of Guests(s): ", String(doc.guests)]);
  } else {
    right.push(
      ["Primary Guest Name: ", doc.primary_guest],
      ["Check-In Date & Time: ", formatInstituteDateTime(doc.check_in)],
      ["Check-Out Date & Time: ", formatInstituteDateTime(doc.check_out)],
      ["No. of Room(s) : ", String(doc.rooms)],
      ["No. of Guests(s): ", String(doc.guests)],
      ["No. of Infants(s): ", String(doc.infants)]
    );
  }
  return { left, right };
}

/** The totals rows under the tariff table — a dining invoice has no A and B. */
export function invoiceTotalLabels(doc: Pick<InvoiceDocument, "kind" | "rooms" | "room_lines">): {
  total: string;
  grandTotal: string;
} {
  return invoiceKind(doc) === "dining"
    ? { total: "Total", grandTotal: "Grand Total (including GST)" }
    : { total: "Total (A+B)", grandTotal: "Grand Total (A+B including GST)" };
}

export const INVOICE_TITLE = (guestHouse: string) => `INVOICE - IIT Palakkad ${guestHouse} Guest House`;

/** "GST on Total (CGST 2.5% + SGST 2.5%):" — the rate when there is one. */
export function gstRowLabel(doc: Pick<InvoiceDocument, "gst_breakdown" | "gst">): string {
  const rates = [...new Set((doc.gst_breakdown ?? []).map((g) => g.percent))];
  if (doc.gst === 0 || rates.length === 0) return "GST on Total:";
  if (rates.length === 1) return `GST on Total (CGST ${rates[0] / 2}% + SGST ${rates[0] / 2}%):`;
  return "GST on Total (CGST + SGST, see below):";
}

/**
 * The tax lines under the table, one per SAC and rate:
 * "Accommodation, SAC 996311: taxable ₹13,500.00 @ 5% — CGST ₹337.50 + SGST ₹337.50".
 */
export function gstBreakdownLines(doc: Pick<InvoiceDocument, "gst_breakdown" | "prices_include_gst">): string[] {
  return (doc.gst_breakdown ?? []).map(
    (g) =>
      `${g.label}, SAC ${g.sac}: taxable ${formatINR(g.taxable)} @ ${g.percent}% — CGST ${formatINR(g.cgst)} + SGST ${formatINR(g.sgst)}`
  );
}

export const GST_INCLUDED_NOTE = "The tariff rates include GST; the amounts above are shown before GST.";

/**
 * Why an invoice cannot be issued for this booking now, or null when it can.
 * Issued at check-out — the desk may do it while the guest is still in the
 * room (they are often asked for the bill before the guest formally leaves),
 * so an occupied stay qualifies, billed to its booked check-out.
 */
export function invoiceBlocker(
  booking: Pick<BookingWithDetails, "status" | "service_type" | "meals">,
  doc: Pick<InvoiceDocument, "problems" | "room_lines" | "meal_lines">,
  now: Date = new Date()
): string | null {
  if (booking.service_type === "meals_only") {
    // A dining booking is billed once its first meal has come round — the
    // kitchen may already have served it — and never before it was approved.
    if (!["APPROVED", "OCCUPIED", "VACATED"].includes(booking.status)) {
      return "A dining booking is invoiced once it has been approved.";
    }
    const first = [...booking.meals].map((d) => d.date).sort()[0];
    if (first && first > toInstituteDateValue(now)) {
      return `A dining booking is invoiced from the day of its first meal (${formatDateValue(first, { year: true })}).`;
    }
  } else if (booking.status !== "OCCUPIED" && booking.status !== "VACATED") {
    return "An invoice is issued at check-out, once the guest has checked in.";
  }
  if (doc.problems.length > 0) return doc.problems[0];
  if (doc.room_lines.length === 0 && doc.meal_lines.every((l) => l.count === 0)) {
    return "There is nothing to charge: no rooms were allocated and no meals were served.";
  }
  return null;
}

// ------------------------------------------------------ after check-out

/**
 * How far back the desk's "Checked out — to bill" list reaches. Older stays
 * are still invoiced from the Approval Log; this is only the daily list.
 */
export const UNSETTLED_WINDOW_DAYS = 30;

/**
 * Stays that have checked out and are not yet paid for, newest first — the
 * desk's list of bills to settle, on the manager's console and the
 * caretaker's alike (24 Sep 2026: the caretaker issues invoices at
 * reception, and had no way back to a stay once it was marked Vacated).
 *
 * A dining booking is not here: it never checks out, and the kitchen page
 * has its own "Dining to invoice". A cancelled invoice leaves the stay on
 * the list, since the bill is open again.
 */
export function awaitingSettlement(
  vacated: BookingWithDetails[],
  invoices: Pick<InvoiceRecord, "booking_id" | "status">[],
  now: Date = new Date(),
  windowDays: number = UNSETTLED_WINDOW_DAYS
): BookingWithDetails[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const paid = new Set(invoices.filter((i) => i.status === "paid").map((i) => i.booking_id));
  return vacated
    .filter((b) => b.status === "VACATED" && b.service_type !== "meals_only")
    .filter((b) => Date.parse(b.check_out) >= since && !paid.has(b.id))
    .sort((a, b) => b.check_out.localeCompare(a.check_out));
}

/**
 * Whether the desk can open an invoice for this booking from the archive —
 * after check-out, however long ago. Before that the consoles offer it: an
 * occupied stay from its row, a dining booking from the kitchen page.
 */
export function invoiceableFromArchive(
  booking: Pick<BookingWithDetails, "status" | "service_type">
): boolean {
  if (booking.service_type === "meals_only") {
    return booking.status === "APPROVED" || booking.status === "OCCUPIED" || booking.status === "VACATED";
  }
  return booking.status === "OCCUPIED" || booking.status === "VACATED";
}

// ------------------------------------------------------------ the record

/** One row of the `invoices` table (migration 19). Amounts in rupees. */
export type InvoiceRecord = {
  id: string;
  booking_id: string;
  status: InvoiceStatus;
  invoice_number: string | null;
  fy: string | null;
  seq: number | null;
  /** The snapshot. Null on a draft, which is priced afresh each time it is shown. */
  document: InvoiceDocument | null;
  /** The desk's corrected meal counts, or null to use the computed covers. */
  meal_counts: MealCounts | null;
  debit_head: string | null;
  project_number: string | null;
  subtotal_rooms: number;
  subtotal_dining: number;
  total: number;
  gst_percent: number;
  gst_amount: number;
  grand_total: number;
  payment_mode: PaymentMode | null;
  payment_reference: string | null;
  paid_at: string | null;
  paid_by: string | null;
  issued_at: string | null;
  issued_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  replaces_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceFilter = {
  bookingId?: string;
  bookingIds?: string[];
  /** Issued within [from, to), ISO instants. */
  issuedFrom?: string;
  issuedTo?: string;
  /** Paid within [from, to), ISO instants. */
  paidFrom?: string;
  paidTo?: string;
};

export type IssueInvoiceInput = {
  bookingId: string;
  fy: string;
  prefix: string;
  digits: number;
  document: InvoiceDocument;
  mealCounts: MealCounts | null;
  issuedBy: string;
  replaces: string | null;
};

/**
 * A refused invoice operation — the database's INVOICE_EXISTS /
 * INVOICE_IMMUTABLE, or the mock's equivalent. Its message is written for the
 * desk and is shown as it stands.
 */
export class InvoiceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceStateError";
  }
}

/** The part of a "CODE|message" database exception meant for people. */
export function invoiceErrorFrom(message: string): InvoiceStateError | null {
  const m = /(INVOICE_EXISTS|INVOICE_IMMUTABLE|TARIFF_IN_FORCE)\|([^\n]+)/.exec(message);
  return m ? new InvoiceStateError(m[2].trim()) : null;
}

/** What `issue_invoice()` writes to the reporting columns, from the snapshot. */
export function invoiceColumnsFrom(doc: InvoiceDocument) {
  return {
    debit_head: doc.debit_head,
    project_number: doc.project_number,
    subtotal_rooms: toRupees(doc.subtotal_rooms),
    subtotal_dining: toRupees(doc.subtotal_dining),
    total: toRupees(doc.total),
    gst_percent: doc.gst_percent,
    gst_amount: toRupees(doc.gst),
    grand_total: toRupees(doc.grand_total),
  };
}
