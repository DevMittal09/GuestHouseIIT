import fs from "fs";
import { describe, expect, it } from "vitest";
import { buildInvoiceDocument, invoiceFacts } from "@/lib/invoice";
import { DEFAULT_RULES } from "@/lib/settings";
import { deskCategoryFor, deskTariffCategories } from "@/lib/tariff-categories";
import {
  describeTariffCategoryScope,
  hasChosenTariffCategory,
  parseTariffScope,
  pricingScopeFor,
  tariffCategoryItems,
  tariffScopeKey,
  type Tariff,
} from "@/lib/tariffs";
import type { GuestHouse } from "@/lib/types";
import { booking, guest, room } from "./helpers";

/**
 * **The owner's fifteenth list (31 October 2026): who decides the tariff.**
 *
 * 1. The New Booking page's tariff table is **informational** - it lists every
 *    category and its prices and selects nothing.
 * 2. The **Guest House Manager** chooses the category when they approve, from
 *    the office's own rate sheet.
 * 3. The **invoice is priced at what they chose**, and records it.
 *
 * The rule the whole round turns on: a tariff is scoped by guest house, room
 * type, booking type and requester role. The first two are facts (where the
 * guest sleeps, which room they were given); the last two are a judgement
 * about the visit, and the requester was making it by answering the form.
 */

const BAGESHRI: GuestHouse = { id: "gh-bageshri", name: "Bageshri", total_rooms: 10, serves_meals: false };
const HAMSANANDI: GuestHouse = { id: "gh-hamsanandi", name: "Hamsanandi", total_rooms: 13, serves_meals: true };

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

/** The office's sheet, as `lib/store/seed.ts` seeds it - notes included. */
const SHEET: Tariff[] = [
  t({ guest_house_id: BAGESHRI.id, item: "room", rate: 1000, note: "Tariff sheet: Bageshri, per room per day" }),
  t({ guest_house_id: HAMSANANDI.id, item: "room", rate: 2000, note: "Tariff sheet: Hamsanandi types 1 and 2" }),
  t({
    guest_house_id: HAMSANANDI.id,
    item: "room",
    requester_role: "official",
    rate: 4000,
    note: "Tariff sheet: Hamsanandi type 3, government officers",
  }),
  t({ item: "breakfast", rate: 80, note: "Tariff sheet: per head" }),
  t({ item: "lunch", rate: 120, note: "Tariff sheet: per head" }),
  t({ item: "dinner", rate: 100, note: "Tariff sheet: per head" }),
  t({ item: "breakfast", requester_role: "student", rate: 0, note: "Tariff sheet: meals free to students" }),
  t({ item: "lunch", requester_role: "student", rate: 0, note: "Tariff sheet: meals free to students" }),
  t({ item: "dinner", requester_role: "student", rate: 0, note: "Tariff sheet: meals free to students" }),
];

const TODAY = "2026-11-02";

function desk(
  guestHouse: GuestHouse,
  bookingFacts: { booking_type: "official" | "personal" | "alumni"; user_role: Parameters<typeof describeTariffCategoryScope>[0]["requester_role"] },
  service: "room" | "meals_only" = "room",
  sheet: Tariff[] = SHEET
) {
  return deskTariffCategories(sheet, {
    guestHouse,
    booking: bookingFacts,
    service,
    date: TODAY,
  });
}

// ------------------------------------------------- 2. the desk's categories

describe("the categories the Guest House Manager chooses from", () => {
  /**
   * The point of the round. The office prices Hamsanandi's rooms at ₹2,000
   * generally and ₹4,000 "for government officers" - a row scoped by
   * `requester_role`. Before this, nobody could pick the second: it was only
   * ever what an office's *own account* happened to resolve to, so a
   * dignitary booked for by a department's faculty was charged ₹2,000.
   */
  it("offers an employee's Hamsanandi stay both of the office's rates", () => {
    const categories = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" });
    expect(categories.map((c) => c.label)).toEqual([
      "Tariff sheet: Hamsanandi types 1 and 2",
      "Tariff sheet: Hamsanandi type 3, government officers",
    ]);
    expect(categories.map((c) => c.headline?.rate)).toEqual([2000, 4000]);
    // The booking's own category is first and marked: it is the answer in
    // most cases, and it is what the invoice was priced at until this round.
    expect(categories[0].requesters).toBe(true);
    expect(categories[0].scope).toEqual({ booking_type: "official", requester_role: "employee" });
    expect(categories[1].requesters).toBe(false);
    expect(categories[1].scope).toEqual({ booking_type: "official", requester_role: "official" });
  });

  /** The name is the office's own words, off the row that prices it. */
  it("names a category from the rate sheet, falling back to the scope", () => {
    const [general] = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" });
    expect(general.label).toBe("Tariff sheet: Hamsanandi types 1 and 2");
    expect(general.scope_label).toBe("Official · Employee (Faculty & Staff)");

    const unnamed = desk(
      HAMSANANDI,
      { booking_type: "official", user_role: "employee" },
      "room",
      [t({ guest_house_id: HAMSANANDI.id, item: "room", rate: 2000 })]
    );
    expect(unnamed).toHaveLength(1);
    expect(unnamed[0].label).toBe("Official · Employee (Faculty & Staff)");
  });

  /**
   * One category is stated, not asked - the same rule as the guest house and
   * the booking type on the form. Bageshri has one room rate, and Hamsanandi's
   * two rows collapse to one for an office, whose own role already resolves
   * the government-officer rate.
   */
  it("gives one category where the sheet draws no distinction", () => {
    const bageshri = desk(BAGESHRI, { booking_type: "personal", user_role: "student" });
    expect(bageshri).toHaveLength(1);
    expect(bageshri[0].headline?.rate).toBe(1000);

    const office = desk(HAMSANANDI, { booking_type: "official", user_role: "official" });
    expect(office).toHaveLength(1);
    expect(office[0].headline?.rate).toBe(4000);
    expect(office[0].requesters).toBe(true);
  });

  /**
   * A category is about the charge it prices: the room on a stay, the meals
   * on a dining booking. Were every item's rows enumerated, a faculty stay at
   * Hamsanandi would offer "meals free to students" as a category.
   */
  it("enumerates from the room rows on a stay and the meal rows on a dining booking", () => {
    expect(tariffCategoryItems("room", true)).toEqual(["room"]);
    expect(tariffCategoryItems("meals_only", true)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(tariffCategoryItems("meals_only", false)).toEqual([]);

    const stay = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" });
    expect(stay.map((c) => c.label)).not.toContain("Tariff sheet: meals free to students");

    const dining = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" }, "meals_only");
    expect(dining.map((c) => c.label)).toEqual([
      "Tariff sheet: per head",
      "Tariff sheet: meals free to students",
    ]);
    // Meals and nothing else: a dining booking holds no room to charge.
    expect(dining[0].lines.map((l) => l.item)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(dining[0].headline).toBeNull();
  });

  /** No kitchen, no dining charge, so no category - and no invoice section. */
  it("has nothing to choose for a dining booking at a guest house with no kitchen", () => {
    expect(desk(BAGESHRI, { booking_type: "official", user_role: "employee" }, "meals_only")).toEqual([]);
  });

  /** Two scopes that price identically are one category to the eye. */
  it("drops a scope that resolves to the same figures as one already listed", () => {
    const categories = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" }, "room", [
      ...SHEET,
      // Scoped by booking type, at the rate the general row already gives.
      t({ guest_house_id: HAMSANANDI.id, item: "room", booking_type: "official", rate: 2000 }),
    ]);
    expect(categories).toHaveLength(2);
  });

  /** Nothing published is still a category: the invoice reports the gap. */
  it("keeps the booking's own category when no rate covers it", () => {
    const categories = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" }, "room", []);
    expect(categories).toHaveLength(1);
    expect(categories[0].requesters).toBe(true);
    expect(categories[0].headline?.rate ?? null).toBeNull();
  });
});

// --------------------------------------------- the key, stored and read back

describe("a category as it is stored", () => {
  it("round-trips through its key", () => {
    const scope = { booking_type: "official", requester_role: "official" } as const;
    expect(tariffScopeKey(scope)).toBe("official:official");
    expect(parseTariffScope("official:official")).toEqual(scope);
  });

  /**
   * The key arrives from the desk's radio, so it is checked against the
   * unions themselves - and then against the rate sheet, in the action. A
   * crafted scope the office never published must not price a stay.
   */
  it("refuses anything that is not a scope", () => {
    for (const bad of ["", null, undefined, "official", "official:", ":official", "official:ghost", "ghost:official", "official:official:official"]) {
      expect(parseTariffScope(bad)).toBeNull();
    }
  });

  it("only answers a key the sheet actually publishes", () => {
    const categories = desk(HAMSANANDI, { booking_type: "official", user_role: "employee" });
    expect(deskCategoryFor(categories, "official:official")?.headline?.rate).toBe(4000);
    // A real scope, just not one of this booking's categories.
    expect(deskCategoryFor(categories, "alumni:student")).toBeNull();
    expect(deskCategoryFor(categories, "nonsense")).toBeNull();
  });

  /**
   * The fallback is the whole compatibility story: a booking approved before
   * the manager was asked has no category, and is priced exactly as it was -
   * from its own facts. Inventing one for it would be the "default tariff"
   * this round exists to rule out.
   */
  it("prices from the booking's own facts until a category is chosen", () => {
    const own = { booking_type: "official", user_role: "employee" } as const;
    expect(hasChosenTariffCategory({})).toBe(false);
    expect(pricingScopeFor(own)).toEqual({ booking_type: "official", requester_role: "employee" });
    const chosen = { ...own, tariff_booking_type: "official", tariff_requester_role: "official" } as const;
    expect(hasChosenTariffCategory(chosen)).toBe(true);
    expect(pricingScopeFor(chosen)).toEqual({ booking_type: "official", requester_role: "official" });
    // Half a category prices nothing - the database refuses it too.
    expect(pricingScopeFor({ ...own, tariff_requester_role: "official" })).toEqual({
      booking_type: "official",
      requester_role: "employee",
    });
  });
});

// ------------------------------------------------ 3. the invoice that follows

describe("the invoice is priced at the category the manager chose", () => {
  const CTX = { rules: DEFAULT_RULES.invoice, capacity: DEFAULT_RULES.capacity, tariffs: SHEET };
  const ROOM = room({ id: "h-201", guest_house_id: HAMSANANDI.id, room_number: "201" });
  /** Two nights at Hamsanandi, booked officially by an ordinary employee. */
  const stay = (patch: Record<string, unknown> = {}) =>
    booking(
      {
        guest_house_id: HAMSANANDI.id,
        guest_house: HAMSANANDI,
        user_role: "employee",
        booking_type: "official",
        status: "VACATED",
        ...patch,
      },
      [{ guests: [guest({ name: "Visitor", age: 54 })], assigned: ROOM }]
    );

  it("charges the government-officer rate when that is the category", () => {
    const asRequested = buildInvoiceDocument(stay(), CTX);
    // The office's rates include GST by default, so `rate_incl` is the figure
    // off the sheet and `rate` is what the Tariff column prints.
    expect(asRequested.room_lines[0].rate_incl).toBe(200_000);
    expect(asRequested.tariff_category).toBeNull();

    const asOfficer = buildInvoiceDocument(
      stay({ tariff_booking_type: "official", tariff_requester_role: "official" }),
      CTX
    );
    expect(asOfficer.room_lines[0].rate_incl).toBe(400_000);
    expect(asOfficer.grand_total).toBe(asRequested.grand_total * 2);
  });

  /** The snapshot keeps the office's words, so a renaming cannot rewrite it. */
  it("records the category it was priced at, and prints it", () => {
    const doc = buildInvoiceDocument(
      stay({ tariff_booking_type: "official", tariff_requester_role: "official" }),
      CTX
    );
    expect(doc.tariff_category).toBe("Tariff sheet: Hamsanandi type 3, government officers");
    const printed = invoiceFacts(doc).left.map(([label, value]) => `${label}${value}`);
    expect(printed).toContain(
      "Tariff category: Tariff sheet: Hamsanandi type 3, government officers"
    );
  });

  /**
   * An invoice issued before the question existed must reprint unchanged, so
   * the line is conditional rather than a new document version - `version`
   * governs the lettering of the money table, which this round did not touch.
   */
  it("prints no category line where none was recorded", () => {
    const doc = buildInvoiceDocument(stay(), CTX);
    expect(doc.version).toBe(5);
    expect(invoiceFacts(doc).left.some(([label]) => label.startsWith("Tariff category"))).toBe(false);
  });
});

// ------------------------------------- 1. the requester reads, and chooses nothing

describe("the tariff panel on the booking form", () => {
  const panel = fs.readFileSync("components/tariff-panel.tsx", "utf8");

  it("has no control in it at all", () => {
    expect(panel).not.toContain("<input");
    expect(panel).not.toContain("onSelect");
    // The word "radio" survives in the comment that records what was there.
    expect(panel).not.toContain('type="radio"');
    // With nothing to select it needs no state, so it is a server component.
    expect(panel.startsWith('"use client"')).toBe(false);
  });

  /** The form still asks the guest house and the kind of booking itself. */
  it("no longer writes the form's own fields", () => {
    const form = fs.readFileSync("components/booking-form.tsx", "utf8");
    expect(form).toContain("<TariffPanel");
    expect(form).not.toContain("chooseCategory");
    expect(form).toContain('register("guest_house_id")');
    expect(form).toContain('register("booking_type")');
  });

  /** And the desk's own question is a different component, on the desk. */
  it("puts the question in the approval dialogs", () => {
    const choice = fs.readFileSync("components/tariff-category-choice.tsx", "utf8");
    expect(choice).toContain("Tariff category");
    for (const file of ["components/room-grid.tsx", "components/manager-queue.tsx"]) {
      expect(fs.readFileSync(file, "utf8")).toContain("TariffCategoryChoice");
    }
  });
});
