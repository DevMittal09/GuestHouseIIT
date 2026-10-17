import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  approverNotApplicable,
  canResolveApprover,
  DEFAULT_APPROVAL_RULES,
  decidesStage,
  hasHostel,
  NO_HOSTEL_REASON,
  stageApproverIds,
} from "@/lib/approval-routes";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { bookingTypesFor } from "@/lib/booking-types";
import { buildDefaultFormConfig, sanitizeFormConfig } from "@/lib/form-config";
import { MEAL_CHANGE_NOTICE } from "@/lib/meals";
import {
  groupMyBookings,
  isFinishedBooking,
  myBookingSection,
  PREVIOUS_BOOKINGS_SHOWN,
} from "@/lib/my-bookings";
import { MEAL_BOOKING_PATH, ROOM_BOOKING_PATH } from "@/lib/routes";
import { DEFAULT_RULES } from "@/lib/settings";
import { seedProfiles, seedUnits } from "@/lib/store/seed";
import type { Unit } from "@/lib/units";
import {
  selectedCategory,
  tariffCategories,
  tariffCategoriesFrom,
  tariffCategoryKey,
} from "@/lib/tariff-categories";
import { tariffPreviews, type Tariff } from "@/lib/tariffs";
import { addDaysToDateValue, toInstituteDateValue } from "@/lib/tz";
import type { BookingStatus, GuestHouse, Profile } from "@/lib/types";
import { canReview, droppedStages, initialStatusFor, routeFor } from "@/lib/workflow";
import { booking, profile } from "./helpers";

/**
 * The owner's fourteenth list (17 Oct 2026):
 *
 * 1. The tariff categories and their rates on the **right-hand side** of the
 *    booking page, selectable, and gone from where they were.
 * 2. **Guest Details before Meal Booking.**
 * 3. A **Yes/No** question for meals, with the section shown only on Yes.
 * 4. The caretaker sentence in the meal section, word for word.
 * 5. **Room Booking** and **Meal Booking** as two nav entries.
 * 6 & 7. My Bookings reduced, and split into upcoming / current / previous.
 * 8 & 9. A student whose **hostel is NULL** goes straight to the Guest House
 *    Manager, and a test account for it.
 *
 * Items 1-5 and 7 are also driven through the browser in
 * `e2e/fourteenth-round.spec.ts`, which is where the ordering of the
 * sections, the radio behaviour and the nav are checked on a real page.
 */

// -------------------------------------------------- 1. the tariff categories

const BAGESHRI: GuestHouse = { id: "gh-b", name: "Bageshri", total_rooms: 10, serves_meals: false };
const HAMSANANDI: GuestHouse = {
  id: "gh-h",
  name: "Hamsanandi",
  total_rooms: 13,
  serves_meals: true,
};

/** The office's own sheet, in the shape migration 19 seeds it. */
const SHEET: Tariff[] = [
  rate("b-room", BAGESHRI.id, "room", 1000),
  rate("h-room", HAMSANANDI.id, "room", 2000),
  rate("h-room-official", HAMSANANDI.id, "room", 4000, { requester_role: "official" }),
  rate("lunch", null, "lunch", 120),
  rate("breakfast", null, "breakfast", 80),
  rate("dinner", null, "dinner", 100),
];

function rate(
  id: string,
  guest_house_id: string | null,
  item: Tariff["item"],
  value: number,
  scope: Partial<Pick<Tariff, "booking_type" | "requester_role">> = {}
): Tariff {
  return {
    id,
    guest_house_id,
    item,
    room_type: null,
    booking_type: scope.booking_type ?? null,
    requester_role: scope.requester_role ?? null,
    rate: value,
    effective_from: "2024-01-01",
    note: null,
    created_at: "2024-01-01T00:00:00.000Z",
    created_by: null,
  };
}

const TODAY = toInstituteDateValue(new Date());

function categoriesFor(
  role: Profile["role"],
  houses: GuestHouse[] = [BAGESHRI, HAMSANANDI],
  service: "room" | "meals_only" = "room"
) {
  return tariffCategoriesFrom(SHEET, {
    guestHouses: houses,
    bookingTypes: bookingTypesFor(role),
    role,
    service,
    date: TODAY,
  });
}

describe("the tariff categories a requester may choose", () => {
  it("gives a student one category - Bageshri, at Bageshri's rate", () => {
    const categories = categoriesFor("student");
    expect(categories).toHaveLength(1);
    expect(categories[0].guest_house_id).toBe(BAGESHRI.id);
    expect(categories[0].booking_type).toBe("personal");
    // One booking type, so the kind is not named: there is nothing to tell apart.
    expect(categories[0].label).toBe("Bageshri");
    expect(categories[0].headline?.rate).toBe(1000);
  });

  it("gives faculty every house and both kinds, each at its own rate", () => {
    const categories = categoriesFor("employee");
    expect(categories.map((c) => c.label)).toEqual([
      "Bageshri - Official booking",
      "Hamsanandi - Official booking",
      "Bageshri - Personal booking",
      "Hamsanandi - Personal booking",
    ]);
    const official = selectedCategory(categories, HAMSANANDI.id, "official");
    expect(official?.headline?.rate).toBe(2000);
    // The meals are quoted too, at a guest house that serves them.
    expect(official?.lines.map((l) => l.item)).toContain("lunch");
    expect(selectedCategory(categories, BAGESHRI.id, "personal")?.lines.map((l) => l.item)).toEqual([
      "room",
      "extra_bed",
    ]);
  });

  /**
   * The office's sheet prices Hamsanandi's rooms at ₹4,000 for government
   * officers - a row scoped by `requester_role`. Nobody picks that: it is
   * what an office's own account resolves to. Which is the point of deriving
   * the categories from the rate sheet rather than listing them by hand.
   */
  it("keeps the rate each requester's own role resolves to", () => {
    const office = categoriesFor("official");
    expect(selectedCategory(office, HAMSANANDI.id, "official")?.headline?.rate).toBe(4000);
    const faculty = categoriesFor("employee");
    expect(selectedCategory(faculty, HAMSANANDI.id, "official")?.headline?.rate).toBe(2000);
  });

  it("narrows an alumni booking to Bageshri, as the booking form does", () => {
    const cell = categoriesFor("iar_student_cell");
    expect(cell.map((c) => c.guest_house_id)).toEqual([BAGESHRI.id]);
    expect(cell[0].booking_type).toBe("alumni");
  });

  it("offers only kitchens on a dining booking, and only where meals are allowed", () => {
    const faculty = categoriesFor("employee", [BAGESHRI, HAMSANANDI], "meals_only");
    expect(faculty.map((c) => c.guest_house_id)).toEqual([HAMSANANDI.id, HAMSANANDI.id]);
    // Meals and nothing else: there is no room on a dining booking to charge.
    expect(faculty[0].lines.map((l) => l.item)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(faculty[0].headline).toBeNull();
    // A student and an alumni booking get no meals at all (7 Oct 2026).
    expect(categoriesFor("student", [BAGESHRI, HAMSANANDI], "meals_only")).toEqual([]);
    expect(categoriesFor("iar_student_cell", [BAGESHRI, HAMSANANDI], "meals_only")).toEqual([]);
  });

  it("lets the desk book outside the guest house and meals policies", () => {
    const desk = tariffCategoriesFrom(SHEET, {
      guestHouses: [BAGESHRI, HAMSANANDI],
      bookingTypes: bookingTypesFor("gh_manager"),
      role: "gh_manager",
      service: "meals_only",
      allowAnyGuestHouse: true,
      date: TODAY,
    });
    // An alumni dining booking is the manager's to make; the policy error is
    // recorded in the booking's log rather than hiding the option.
    expect(desk.some((c) => c.booking_type === "alumni")).toBe(true);
  });

  it("reads the rates the page already resolved, rather than resolving them twice", () => {
    const previews = tariffPreviews(
      SHEET,
      [BAGESHRI, HAMSANANDI],
      bookingTypesFor("employee"),
      "employee",
      TODAY
    );
    const fromPreviews = tariffCategories({
      guestHouses: [BAGESHRI, HAMSANANDI],
      bookingTypes: bookingTypesFor("employee"),
      role: "employee",
      previews,
    });
    expect(fromPreviews).toEqual(categoriesFor("employee"));
    expect(fromPreviews.map((c) => c.key)).toEqual(
      fromPreviews.map((c) => tariffCategoryKey(c.guest_house_id, c.booking_type))
    );
  });

  it("reports a charge with no rate rather than quoting a zero", () => {
    const categories = tariffCategoriesFrom([], {
      guestHouses: [BAGESHRI],
      bookingTypes: ["personal"],
      role: "student",
      date: TODAY,
    });
    expect(categories[0].headline?.rate).toBeNull();
  });

  /**
   * The rates were a numbered card in the middle of the form until this
   * round. The panel is the one place they are drawn now - a second copy on
   * the form is exactly what the owner asked to have removed.
   */
  it("leaves no rate table in the form itself", () => {
    const form = fs.readFileSync("components/booking-form.tsx", "utf8");
    expect(form).not.toContain("<TariffTable");
    expect(form).toContain("<TariffPanel");
    const table = fs.readFileSync("components/tariff-table.tsx", "utf8");
    // The caption is what the end-to-end suite finds the table by.
    expect(table).toContain("in force today");
  });
});

// ------------------------------------- 2, 3, 4. guests, then meals, on a Yes

describe("the meal section", () => {
  it("keeps the owner's sentence exactly as given", () => {
    expect(MEAL_CHANGE_NOTICE).toBe(
      "In any case talk with caretaker for any change in meal booking"
    );
  });

  it("is rendered in the meal section and nowhere else", () => {
    const form = fs.readFileSync("components/booking-form.tsx", "utf8");
    expect(form).toContain("{MEAL_CHANGE_NOTICE}");
    // One use, inside the one card that holds the meal questions.
    expect(form.match(/MEAL_CHANGE_NOTICE/g)).toHaveLength(2); // the import and the use
  });

  it("asks the guests before the meals", () => {
    const form = fs.readFileSync("components/booking-form.tsx", "utf8");
    const guests = form.indexOf("Guests, room by room");
    const meals = form.indexOf('{mealsOnly ? "Days and meals" : "Meals"}');
    expect(guests).toBeGreaterThan(0);
    expect(meals).toBeGreaterThan(0);
    expect(guests).toBeLessThan(meals);
  });

  /**
   * **"No" has to be a submittable answer.** The form sends `parsed.data` and
   * the server re-parses it, so a hidden meal grid must leave behind a
   * payload the schema accepts: no plan, no diet split, and `service_type`
   * back to "room" at a guest house that does serve meals.
   */
  it("accepts a stay at a kitchen with no meals ordered", () => {
    const config = sanitizeFormConfig(buildDefaultFormConfig("employee", [HAMSANANDI]), [
      HAMSANANDI,
    ]);
    const schema = bookingPayloadSchema(config, { mealsAvailable: true, rules: DEFAULT_RULES });
    const from = addDaysToDateValue(TODAY, 3);
    const payload = {
      guest_house_id: HAMSANANDI.id,
      service_type: "room",
      booking_type: "official",
      debit_head: "department_budget",
      fund_declaration: true,
      purpose_of_visit: "A visiting examiner, no meals",
      check_in: `${from}T12:00`,
      check_out: `${addDaysToDateValue(from, 2)}T10:00`,
      rooms_requested: "1",
      rooms: [
        {
          room_type: null,
          guests: [{ name: "Visitor", age: "44", gender: "male", citizenship: "indian" }],
        },
      ],
      meals: [],
      meal_diet_counts: null,
      meal_preference: null,
      copy_to_emails: [],
    };
    const parsed = schema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.service_type).toBe("room");
    expect(parsed.data.meals).toEqual([]);
    expect(parsed.data.meal_diet_counts).toBeNull();
    // And the schema accepts its own output, which is how the server re-reads it.
    expect(schema.safeParse(parsed.data).success).toBe(true);
  });
});

// ---------------------------------------------- 5. the two booking doors

describe("Room Booking and Meal Booking are separate doors", () => {
  it("are two routes over one page", () => {
    expect(ROOM_BOOKING_PATH).toBe("/book");
    expect(MEAL_BOOKING_PATH).toBe("/book/meals");
    expect(fs.existsSync("app/(portal)/book/page.tsx")).toBe(true);
    expect(fs.existsSync("app/(portal)/book/meals/page.tsx")).toBe(true);
    for (const route of ["app/(portal)/book/page.tsx", "app/(portal)/book/meals/page.tsx"]) {
      expect(fs.readFileSync(route, "utf8")).toContain("BookingRequestPage");
    }
  });

  /**
   * The meal door is nested under the room door, so without an exact match
   * the nav would light both items at once - which is the whole reason the
   * door is a route and not a query string.
   */
  it("matches the room door exactly in the nav", () => {
    const layout = fs.readFileSync("app/(portal)/layout.tsx", "utf8");
    expect(MEAL_BOOKING_PATH.startsWith(`${ROOM_BOOKING_PATH}/`)).toBe(true);
    expect(layout).toContain("exact={[ROOM_BOOKING_PATH]}");
    expect(layout).toContain('label: "Room Booking"');
    expect(layout).toContain('label: "Meal Booking"');
    expect(layout).not.toContain('label: "New Booking"');
  });

  it("offers the meal door only where the account could submit one", () => {
    const layout = fs.readFileSync("app/(portal)/layout.tsx", "utf8");
    // Not a role list written out again: the same function the My Bookings
    // tile asks (`serviceTypesFor` with the kitchens the form allows).
    expect(layout).toContain("serviceTypesFor(user.role, kitchens.length > 0)");
    expect(layout).toContain("canBook && canBookMeals");
  });
});

// -------------------------------- 6, 7. upcoming, current and previous

describe("a requester's own list is three sections", () => {
  const NOW = new Date("2026-10-17T06:00:00.000Z");
  const stay = (status: BookingStatus, checkIn: string, checkOut: string, updated = checkOut) =>
    booking({
      id: `${status}-${checkIn}`,
      status,
      check_in: checkIn,
      check_out: checkOut,
      updated_at: updated,
    });

  it("places an open request by its dates", () => {
    expect(myBookingSection(stay("PENDING_WARDEN", "2026-11-01T06:30:00Z", "2026-11-03T04:30:00Z"), NOW)).toBe("upcoming");
    expect(myBookingSection(stay("APPROVED", "2026-10-16T06:30:00Z", "2026-10-19T04:30:00Z"), NOW)).toBe("current");
    // Nobody can approve it now; the nightly sweep will mark it Missed.
    expect(myBookingSection(stay("PENDING_GH_MANAGER", "2026-10-01T06:30:00Z", "2026-10-03T04:30:00Z"), NOW)).toBe("previous");
  });

  it("keeps an occupied stay current however late the check-out is", () => {
    // The desk's own "Awaiting check-out": the guest is in the building until
    // somebody records otherwise.
    expect(myBookingSection(stay("OCCUPIED", "2026-10-01T06:30:00Z", "2026-10-03T04:30:00Z"), NOW)).toBe("current");
  });

  it("files a finished request as previous whatever its dates say", () => {
    for (const status of ["REJECTED", "CANCELLED", "CANCELLATION_APPROVED", "VACATED", "MISSED"] as BookingStatus[]) {
      expect(isFinishedBooking(status)).toBe(true);
      expect(myBookingSection(stay(status, "2026-12-01T06:30:00Z", "2026-12-03T04:30:00Z"), NOW)).toBe("previous");
    }
    // A cancellation nobody has decided is still live, so it is not finished.
    expect(isFinishedBooking("CANCELLATION_REQUESTED")).toBe(false);
  });

  it("puts every booking in exactly one section, in the order each is read in", () => {
    const rows = [
      stay("APPROVED", "2026-11-20T06:30:00Z", "2026-11-22T04:30:00Z"),
      stay("PENDING_WARDEN", "2026-11-01T06:30:00Z", "2026-11-03T04:30:00Z"),
      stay("OCCUPIED", "2026-10-16T06:30:00Z", "2026-10-18T04:30:00Z"),
      stay("VACATED", "2026-09-01T06:30:00Z", "2026-09-03T04:30:00Z", "2026-09-03T05:00:00Z"),
      stay("REJECTED", "2026-12-01T06:30:00Z", "2026-12-03T04:30:00Z", "2026-10-17T05:00:00Z"),
    ];
    const sections = groupMyBookings(rows, NOW);
    expect(sections.upcoming.length + sections.current.length + sections.previous.length).toBe(
      rows.length
    );
    const ids = [...sections.upcoming, ...sections.current, ...sections.previous].map((b) => b.id);
    expect(new Set(ids).size).toBe(rows.length);
    // Next arrival first.
    expect(sections.upcoming.map((b) => b.check_in)).toEqual([
      "2026-11-01T06:30:00Z",
      "2026-11-20T06:30:00Z",
    ]);
    // Most recently touched first - the rejection this morning, then the stay
    // that ended in September.
    expect(sections.previous.map((b) => b.status)).toEqual(["REJECTED", "VACATED"]);
  });

  it("shows a handful of finished bookings and keeps the rest reachable", () => {
    expect(PREVIOUS_BOOKINGS_SHOWN).toBe(5);
    const component = fs.readFileSync("components/my-bookings.tsx", "utf8");
    // The count beside the heading is the whole section, not the slice.
    expect(component).toContain("count={sections.previous.length}");
    // Nothing is unreachable: Show all on the page, and the archive beside it.
    expect(component).toContain("Show all ${sections.previous.length}");
    expect(component).toContain('href="/history"');
  });
});

// ------------------------- 8, 9. a student with no hostel, and the test account

describe("a student with no hostel has no Assistant Warden", () => {
  const profiles = seedProfiles as Profile[];
  const units: Unit[] = seedUnits.map((u) => ({ ...u, hod_unit_id: u.hod_unit_id ?? null }));
  const anjali = profiles.find((p) => p.id === "student-anjali")!;
  const dayScholar = profiles.find((p) => p.id === "student-day-scholar")!;
  const warden = profiles.find((p) => p.id === "warden-malhar")!;
  const directory = { units, profiles };

  it("reads NULL and a blank string alike, and neither as a hostel", () => {
    expect(hasHostel({ hostel_name: "Malhar" })).toBe(true);
    expect(hasHostel({ hostel_name: null })).toBe(false);
    expect(hasHostel({ hostel_name: "" })).toBe(false);
    expect(hasHostel({ hostel_name: "   " })).toBe(false);
  });

  it("drops the warden stage from the route, and enters at the desk", () => {
    const ctx = (requester: Profile) => ({
      bookingType: "personal",
      rules: DEFAULT_APPROVAL_RULES,
      directory,
      requester,
    });
    expect(routeFor("student", "room", ctx(anjali))).toEqual(["PENDING_WARDEN"]);
    expect(initialStatusFor("student", "room", ctx(anjali))).toBe("PENDING_WARDEN");

    expect(routeFor("student", "room", ctx(dayScholar))).toEqual([]);
    expect(initialStatusFor("student", "room", ctx(dayScholar))).toBe("PENDING_GH_MANAGER");
  });

  /**
   * The reason matters: the booking's log says the stage does not apply,
   * rather than reporting a console nobody filled in. A hostel that has no
   * warden appointed is the other case, and still reads that way.
   */
  it("says why, and says something different when a hostel simply has no warden", () => {
    const notApplicable = droppedStages("student", "room", {
      rules: DEFAULT_APPROVAL_RULES,
      directory,
      requester: dayScholar,
    });
    expect(notApplicable.map((d) => [d.stage.status, d.reason])).toEqual([
      ["PENDING_WARDEN", NO_HOSTEL_REASON],
    ]);
    expect(NO_HOSTEL_REASON).toBe("no hostel is recorded on the requester's account");

    const unstaffed = droppedStages("student", "room", {
      rules: DEFAULT_APPROVAL_RULES,
      directory,
      requester: { ...anjali, hostel_name: "Nowhere" },
    });
    expect(unstaffed.map((d) => [d.stage.status, d.reason])).toEqual([["PENDING_WARDEN", null]]);
  });

  /**
   * The mail module and the Copy-to chain call `routeFor` with units but no
   * profiles, where a stage that cannot be counted is assumed staffed. The
   * hostel is a fact about the requester's own account, so it is answered
   * there too - otherwise a warden who does not exist would be copied on
   * every mail about the request.
   */
  it("answers the same with no directory at all", () => {
    expect(canResolveApprover({ kind: "warden" }, { units })).toBe(false);
    expect(routeFor("student", "room", { rules: DEFAULT_APPROVAL_RULES, requester: dayScholar })).toEqual([]);
    expect(routeFor("student", "room", { rules: DEFAULT_APPROVAL_RULES, requester: anjali })).toEqual([
      "PENDING_WARDEN",
    ]);
    // With neither a requester nor a directory nothing is dropped, exactly as
    // the hardcoded pipeline behaved.
    expect(routeFor("student", "room", { rules: DEFAULT_APPROVAL_RULES })).toEqual([
      "PENDING_WARDEN",
    ]);
  });

  it("lets no warden act on the request either", () => {
    expect(approverNotApplicable({ kind: "warden" }, dayScholar)).toBe(NO_HOSTEL_REASON);
    expect(approverNotApplicable({ kind: "warden" }, anjali)).toBeNull();
    // Every other kind of approver is unaffected: "nobody appointed" is the
    // honest reading for a unit or a named person.
    expect(approverNotApplicable({ kind: "hod" }, dayScholar)).toBeNull();
    expect(approverNotApplicable({ kind: "role", role: "iar_cell" }, dayScholar)).toBeNull();

    expect(stageApproverIds({ kind: "warden" }, dayScholar, directory)).toEqual([]);
    expect(stageApproverIds({ kind: "warden" }, anjali, directory)).toEqual([warden.id]);
    expect(decidesStage(warden, { kind: "warden" }, dayScholar, directory)).toBe(false);
    expect(decidesStage(warden, { kind: "warden" }, anjali, directory)).toBe(true);
    // And through `canReview`, with and without the profiles.
    for (const context of [{}, { profiles }]) {
      expect(
        canReview(warden, "PENDING_WARDEN", dayScholar, units, {
          rules: DEFAULT_APPROVAL_RULES,
          ...context,
        })
      ).toBe(false);
    }
  });

  it("does not touch faculty, staff, offices or clubs", () => {
    const hodless = { rules: DEFAULT_APPROVAL_RULES, directory, hasHodApprover: true };
    // None of these routes has a warden stage, and none of these accounts has
    // a hostel - the exception must not become "everyone goes direct".
    const faculty = profiles.find((p) => p.id === "employee-priya")!;
    expect(hasHostel(faculty)).toBe(false);
    expect(routeFor("employee", "room", { ...hodless, requester: faculty, bookingType: "official" })).toEqual([
      "PENDING_HOD",
    ]);
    const office = profiles.find((p) => p.id === "office-cse")!;
    expect(
      routeFor("official", "room", {
        ...hodless,
        requester: office,
        bookingType: "official",
        officeApproval: "hod",
      })
    ).toEqual(["PENDING_HOD"]);
    const cell = profiles.find((p) => p.id === "iar-student-cell")!;
    expect(routeFor("iar_student_cell", "room", { ...hodless, requester: cell, bookingType: "alumni" })).toEqual([
      "PENDING_IAR",
    ]);
  });

  it("seeds a day scholar whose hostel is genuinely null", () => {
    expect(dayScholar).toBeDefined();
    expect(dayScholar.role).toBe("student");
    expect(dayScholar.hostel_name).toBeNull();
    expect(dayScholar.roll_number).toBe("122203099");
    // It signs in like every other persona: a dummy LDAP account whose uid is
    // on the profile (`lib/ldap/mock-directory.ts`).
    expect(dayScholar.ldap_uid).toBe("122203099");
    const directoryFile = fs.readFileSync("lib/ldap/mock-directory.ts", "utf8");
    expect(directoryFile).toContain('uid: "122203099"');
    // And on Supabase, where the hostel column references the hostels table -
    // null is the only way to say "no hostel" there.
    const seed = fs.readFileSync("supabase/seed.sql", "utf8");
    expect(seed).toContain("122203099@smail.iitpkd.ac.in");
    expect(seed).toMatch(/'122203099@smail\.iitpkd\.ac\.in'.*'student', null/);
  });

  it("gives the account a name that says what it is for", () => {
    expect(dayScholar.full_name).toMatch(/no hostel/i);
    // Nobody real: a test account, with no academic record behind it, so the
    // booking form asks for the parents' names rather than locking them.
    expect(dayScholar.email.endsWith("@smail.iitpkd.ac.in")).toBe(true);
  });
});

// The fixture only needs the shape; `profile()` keeps the suite honest about it.
void profile;
