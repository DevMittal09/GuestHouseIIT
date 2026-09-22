import { z } from "zod";
import { parseDateValue } from "./tz";
import type { BookingType, MealKey, Role, RoomType } from "./types";

/**
 * The guest house tariff (Phase 5): what a room night, an extra bed and each
 * meal costs, **effective-dated**.
 *
 * A tariff is a row, not a constant, because prices change and an invoice
 * must be priced at the rate in force on the night it charges for. A new
 * price is a new row with a later `effective_from`, never an edit of an old
 * one — a row already in force is part of how past stays were priced, so the
 * console refuses to change or delete it (`tariffLockedError`). Invoices keep
 * the rates they printed in their snapshot anyway, so even that is belt and
 * braces.
 *
 * A row may narrow itself by guest house, room type, booking type and the
 * requester's role; a blank qualifier means "any". The rate for a night is the
 * **most specific** row in force, and among equally specific rows the one that
 * came into force last (`resolveTariff`). So the office can set one general
 * Hamsanandi rate and a separate one for government officers, and raise the
 * general rate later without touching the officers'.
 */

export type TariffItem = "room" | "extra_bed" | MealKey;

export const TARIFF_ITEMS: TariffItem[] = ["room", "extra_bed", "breakfast", "lunch", "dinner"];

export const TARIFF_ITEM_LABELS: Record<TariffItem, string> = {
  room: "Room, per day",
  extra_bed: "Extra bed, per day",
  breakfast: "Breakfast, per head",
  lunch: "Lunch, per head",
  dinner: "Dinner, per head",
};

export type Tariff = {
  id: string;
  /** Null: every guest house. */
  guest_house_id: string | null;
  item: TariffItem;
  /** Null: any room type. Only meaningful for rooms and extra beds. */
  room_type: RoomType | null;
  /** Null: any booking type. */
  booking_type: BookingType | null;
  /** Null: any requester. The role of whoever the booking belongs to. */
  requester_role: Role | null;
  /** Rupees, up to two decimals. Zero is a price: "free for students". */
  rate: number;
  /** Institute calendar date ("yyyy-MM-dd") the rate applies from. */
  effective_from: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

export type NewTariffInput = Omit<Tariff, "id" | "created_at">;

/** What one charge is being priced for. */
export type TariffQuery = {
  guest_house_id: string;
  item: TariffItem;
  room_type: RoomType | null;
  booking_type: BookingType;
  requester_role: Role;
  /** Institute calendar date the charge falls on. */
  date: string;
};

function specificity(t: Tariff): number {
  return (
    (t.guest_house_id ? 8 : 0) +
    (t.requester_role ? 4 : 0) +
    (t.booking_type ? 2 : 0) +
    (t.room_type ? 1 : 0)
  );
}

function applies(t: Tariff, q: TariffQuery): boolean {
  return (
    t.item === q.item &&
    t.effective_from <= q.date &&
    (t.guest_house_id === null || t.guest_house_id === q.guest_house_id) &&
    (t.room_type === null || t.room_type === q.room_type) &&
    (t.booking_type === null || t.booking_type === q.booking_type) &&
    (t.requester_role === null || t.requester_role === q.requester_role)
  );
}

/**
 * The row that prices this charge, or null when there is none — which the
 * invoice reports as a problem instead of printing a zero.
 *
 * Specificity is weighted guest house > requester > booking type > room type,
 * so the ranking never ties between two different kinds of qualifier; only
 * rows with the same qualifiers compete on date, and the later one wins.
 */
export function resolveTariff(tariffs: Tariff[], q: TariffQuery): Tariff | null {
  let best: Tariff | null = null;
  for (const t of tariffs) {
    if (!applies(t, q)) continue;
    if (
      !best ||
      specificity(t) > specificity(best) ||
      (specificity(t) === specificity(best) &&
        (t.effective_from > best.effective_from ||
          (t.effective_from === best.effective_from && t.created_at > best.created_at)))
    ) {
      best = t;
    }
  }
  return best;
}

/**
 * Whether a row is already in force, and so part of how some stay was — or is
 * being — priced. Such a row is never edited or deleted: the office adds a new
 * row from a later date instead.
 */
export function tariffLockedError(t: Pick<Tariff, "effective_from">, today: string): string | null {
  return t.effective_from <= today
    ? "This rate is already in force, so stays have been priced with it. Add a new rate from a later date instead."
    : null;
}

const money = z.coerce
  .number({ message: "The rate is required" })
  .min(0, "The rate cannot be negative")
  .max(1_000_000, "The rate is implausibly large")
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
    message: "The rate can have at most two decimals",
  });

export const tariffInputSchema = z
  .object({
    guest_house_id: z.string().min(1).nullable(),
    item: z.enum(["room", "extra_bed", "breakfast", "lunch", "dinner"]),
    room_type: z.enum(["single", "double_sharing"]).nullable(),
    booking_type: z.enum(["official", "personal", "alumni"]).nullable(),
    requester_role: z
      .enum(["student", "employee", "official", "club", "alumni", "iar_cell", "iar_student_cell", "gh_manager"])
      .nullable(),
    rate: money,
    effective_from: z
      .string()
      .refine((v) => parseDateValue(v) !== null, "The date the rate applies from is required"),
    note: z.string().trim().max(200).nullable(),
  })
  .refine((t) => t.room_type === null || t.item === "room" || t.item === "extra_bed", {
    message: "A room type only narrows room and extra-bed rates",
  });

/** "Hamsanandi · Double sharing · Official · Official booking", for the console. */
export function describeTariffScope(
  t: Pick<Tariff, "guest_house_id" | "room_type" | "booking_type" | "requester_role">,
  names: { guestHouse: (id: string) => string; roomType: (t: RoomType) => string; bookingType: (t: BookingType) => string; role: (r: Role) => string }
): string {
  const parts = [
    t.guest_house_id ? names.guestHouse(t.guest_house_id) : "Every guest house",
    t.room_type ? names.roomType(t.room_type) : null,
    t.booking_type ? `${names.bookingType(t.booking_type)} bookings` : null,
    t.requester_role ? `requester: ${names.role(t.requester_role)}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
