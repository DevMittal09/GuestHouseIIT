import { z } from "zod";
import { addDaysToDateValue, formatDateValue, parseDateValue } from "./tz";
import {
  BOOKING_TYPE_LABELS,
  ROLE_LABELS,
  type BookingType,
  type MealKey,
  type Role,
  type RoomType,
  type ServiceType,
} from "./types";

/**
 * The guest house tariff (Phase 5): what a room night, an extra bed and each
 * meal costs, **effective-dated**.
 *
 * A tariff is a row, not a constant, because prices change and an invoice
 * must be priced at the rate in force on the night it charges for. A new
 * price is a new row with a later `effective_from`, never an edit of an old
 * one - a row already in force is part of how past stays were priced, so the
 * console refuses to change or delete it (`tariffLockedError`). Invoices keep
 * the rates they printed in their snapshot anyway, so even that is belt and
 * braces.
 *
 * And a new row starts **in the future**: `effective_from` must be later than
 * today (`tariffStartError`, 16 Oct 2026). The office changes a price for the
 * bookings still to come, not for the nights it has already quoted.
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

/** The charges on a dining booking, which holds no room. */
export const MEAL_TARIFF_ITEMS: TariffItem[] = ["breakfast", "lunch", "dinner"];

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
 * The row that prices this charge, or null when there is none - which the
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
 * Whether a row is already in force, and so part of how some stay was - or is
 * being - priced. Such a row is never edited or deleted: the office adds a new
 * row from a later date instead.
 */
export function tariffLockedError(t: Pick<Tariff, "effective_from">, today: string): string | null {
  return t.effective_from <= today
    ? "This rate is already in force, so stays have been priced with it. Add a new rate from a later date instead."
    : null;
}

/**
 * Whether a rate may start on this date: a new rate applies **from a future
 * date only** (16 Oct 2026, the owner: "only for future booking GHM can
 * change the rates ... currently even past and todays rate apparently we can
 * change rates, which is not right").
 *
 * The console used to take any date. A rate dated today or earlier re-priced
 * nights that had already been quoted on the form, approved, and in some
 * cases slept in - the guest was told one figure and invoiced another. A rate
 * that starts tomorrow cannot reach a night anybody has stayed.
 *
 * The companion of `tariffLockedError`, which refuses an **edit** of a row
 * once it is in force. Together: a rate in force is never changed, and a new
 * rate never starts in the past.
 */
export function tariffStartError(effectiveFrom: string, today: string): string | null {
  if (parseDateValue(effectiveFrom) === null) return "The date the rate applies from is required";
  if (effectiveFrom > today) return null;
  const earliest = formatDateValue(addDaysToDateValue(today, 1), { weekday: false, year: true });
  return `A new rate applies from a future date, so stays already booked keep the rate they were quoted. The earliest is ${earliest}.`;
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

// ------------------------------------------------- the scope a stay is priced at

/**
 * **The part of a tariff's scope the Guest House Manager chooses** (31 Oct
 * 2026, the owner: "the final authority for determining the applicable tariff
 * category must rest with the GHM").
 *
 * A rate is scoped by guest house, room type, booking type and requester role.
 * The guest house is where the guest actually sleeps and the room type is the
 * room they are actually given, so neither is anybody's decision. The other
 * two are: the office's sheet prices Hamsanandi's rooms at one rate generally
 * and another "for government officers" - a row scoped by `requester_role` -
 * and which of those a visitor falls under is a judgement about the visit, not
 * a fact about the account that typed the form in.
 *
 * So this pair **is** the tariff category: the two dimensions of
 * `resolveTariff` that the desk decides. Storing the pair rather than a rupee
 * figure is deliberate - a stay crossing a rate change is still priced night
 * by night, and a rate stored on the booking would be a second source of
 * truth for money the moment the office published a new row.
 */
export type TariffScope = {
  booking_type: BookingType;
  requester_role: Role;
};

/** Stable, storable, and what a radio's value is. */
export function tariffScopeKey(scope: TariffScope): string {
  return `${scope.booking_type}:${scope.requester_role}`;
}

/**
 * A stored or submitted key back as a scope, or null when it is not one.
 *
 * Checked against the unions themselves, because the key arrives from a
 * client: the desk's own radio writes it, and nothing else may.
 */
export function parseTariffScope(key: string | null | undefined): TariffScope | null {
  if (!key) return null;
  const parts = key.split(":");
  if (parts.length !== 2) return null;
  const [bookingType, role] = parts;
  if (!Object.hasOwn(BOOKING_TYPE_LABELS, bookingType)) return null;
  if (!Object.hasOwn(ROLE_LABELS, role)) return null;
  return { booking_type: bookingType as BookingType, requester_role: role as Role };
}

/**
 * **The scope a booking's charges are resolved at**: the category the manager
 * chose, else the booking's own facts.
 *
 * The fallback is what the portal did before the category existed, which is
 * what a booking approved before this round has to go on being priced at -
 * there is no decision recorded for it, and inventing one would be the
 * "default tariff" this change exists to rule out. Every booking approved
 * since carries the manager's choice, because the approval asks for it.
 */
export function pricingScopeFor(
  booking: {
    booking_type: BookingType;
    user_role: Role;
    tariff_booking_type?: BookingType | null;
    tariff_requester_role?: Role | null;
  }
): TariffScope {
  return booking.tariff_booking_type && booking.tariff_requester_role
    ? {
        booking_type: booking.tariff_booking_type,
        requester_role: booking.tariff_requester_role,
      }
    : { booking_type: booking.booking_type, requester_role: booking.user_role };
}

/**
 * The charge a tariff category is **about**: the room on a stay, the meals on
 * a dining booking. A guest house with no kitchen has no dining charge at
 * all, so a dining booking there has no category to choose - and no dining
 * section on its invoice either (`invoicePrintsDining`).
 */
export function tariffCategoryItems(service: ServiceType, servesMeals: boolean): TariffItem[] {
  if (service === "meals_only") return servesMeals ? [...MEAL_TARIFF_ITEMS] : [];
  return ["room"];
}

/** "Official · Employee (Faculty & Staff)" - a scope in plain words. */
export function describeTariffCategoryScope(scope: TariffScope): string {
  return `${BOOKING_TYPE_LABELS[scope.booking_type]} · ${ROLE_LABELS[scope.requester_role]}`;
}

/**
 * **What the office calls this category**, and what the scope says in plain
 * words - one implementation, read by the desk's list of categories
 * (`deskTariffCategories`) and by the invoice that records the one chosen.
 *
 * The name is the `note` on the row that actually prices the category's
 * defining charge, because that is where the office writes its own words:
 * "Tariff sheet: Hamsanandi type 3, government officers". An unnamed row
 * leaves the scope to speak for itself rather than inventing a name for it.
 */
export function describeTariffCategory(
  tariffs: Tariff[],
  q: {
    guestHouseId: string;
    scope: TariffScope;
    service?: ServiceType;
    servesMeals: boolean;
    roomType?: RoomType;
    date: string;
  }
): { label: string; scope_label: string } {
  const { guestHouseId, scope, service = "room", servesMeals, roomType = "double_sharing", date } = q;
  const scopeLabel = describeTariffCategoryScope(scope);
  for (const item of tariffCategoryItems(service, servesMeals)) {
    const row = resolveTariff(tariffs, {
      guest_house_id: guestHouseId,
      item,
      room_type: item === "room" || item === "extra_bed" ? roomType : null,
      booking_type: scope.booking_type,
      requester_role: scope.requester_role,
      date,
    });
    const note = row?.note?.trim();
    if (note) return { label: note, scope_label: scopeLabel };
  }
  return { label: scopeLabel, scope_label: scopeLabel };
}

/** Whether the manager has recorded a category against this booking. */
export function hasChosenTariffCategory(booking: {
  tariff_booking_type?: BookingType | null;
  tariff_requester_role?: Role | null;
}): boolean {
  return Boolean(booking.tariff_booking_type && booking.tariff_requester_role);
}

// ------------------------------------------------------------- the preview

/**
 * The rates shown on the booking form (7 Oct 2026, the office's eighth list:
 * "show the rates for the chosen guest house, using the same rates the
 * invoice uses").
 *
 * It is the **same resolution the invoice performs** - `resolveTariff` with
 * the same query shape `buildInvoiceDocument` builds - rather than a second
 * price list beside it. A requester who is quoted one figure on the form and
 * charged another at check-out has been misled, and the only way to be sure
 * that cannot happen is for both to read one function.
 *
 * Two honest limits, stated on the form rather than papered over: the rate
 * shown is the one in force **today**, and a stay crossing a rate change is
 * priced per night when it is invoiced; and a `null` rate means the office
 * has not set that charge up, which the invoice reports as a problem instead
 * of printing a zero.
 */
export type TariffPreviewLine = {
  item: TariffItem;
  label: string;
  /** Rupees, as the office entered them. Null when no rate covers this charge. */
  rate: number | null;
};

export type TariffPreview = {
  guest_house_id: string;
  booking_type: BookingType;
  lines: TariffPreviewLine[];
};

/**
 * Which charges to quote: the room and an extra bed for a stay, meals where
 * the guest house serves them - and **only** the meals on a dining booking
 * (9 Oct 2026). Nobody takes a room on one, so a room rate and an extra-bed
 * rate on a form for ordering lunch were two figures that could not be
 * charged.
 */
export function previewItemsFor(
  servesMeals: boolean,
  service: ServiceType = "room"
): TariffItem[] {
  if (service === "meals_only") return servesMeals ? MEAL_TARIFF_ITEMS : [];
  return servesMeals ? TARIFF_ITEMS : ["room", "extra_bed"];
}

export function tariffPreviewLines(
  tariffs: Tariff[],
  q: {
    guestHouseId: string;
    bookingType: BookingType;
    role: Role;
    /** Both guest houses are double sharing; `null` would match a room-type-blind rate only. */
    roomType: RoomType;
    servesMeals: boolean;
    /** Institute calendar date the rates are quoted for - today, on the form. */
    date: string;
    /** What is being booked: a dining booking is quoted meals and nothing else. */
    service?: ServiceType;
  }
): TariffPreviewLine[] {
  return previewItemsFor(q.servesMeals, q.service).map((item) => {
    const row = resolveTariff(tariffs, {
      guest_house_id: q.guestHouseId,
      item,
      // Only rooms and extra beds are priced per room type; a meal is a meal.
      room_type: item === "room" || item === "extra_bed" ? q.roomType : null,
      booking_type: q.bookingType,
      requester_role: q.role,
      date: q.date,
    });
    return { item, label: TARIFF_ITEM_LABELS[item], rate: row ? row.rate : null };
  });
}

/**
 * One preview per guest house the requester may book and per booking type
 * they may pick - a handful of rows, computed on the server so the form needs
 * no action of its own and no rate is ever quoted that the caller could not
 * already see on their own invoice.
 */
export function tariffPreviews(
  tariffs: Tariff[],
  guestHouses: { id: string; serves_meals: boolean }[],
  bookingTypes: BookingType[],
  role: Role,
  date: string,
  roomType: RoomType = "double_sharing",
  service: ServiceType = "room"
): TariffPreview[] {
  return guestHouses.flatMap((house) =>
    bookingTypes.map((bookingType) => ({
      guest_house_id: house.id,
      booking_type: bookingType,
      lines: tariffPreviewLines(tariffs, {
        guestHouseId: house.id,
        bookingType,
        role,
        roomType,
        servesMeals: house.serves_meals,
        date,
        service,
      }),
    }))
  );
}
