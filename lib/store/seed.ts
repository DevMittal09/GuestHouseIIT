import type { Tariff } from "@/lib/tariffs";
import { normalizeMeals, stayMealDays } from "@/lib/meals";
import type {
  Booking,
  BookingGuest,
  BookingLog,
  BookingRoom,
  GuestHouse,
  MealKey,
  MealPlan,
  Room,
  RoomHold,
} from "@/lib/types";
import type { SeededProfileInput } from "./types";
import type { Unit } from "@/lib/units";
import type { Project } from "@/lib/projects";
import type {
  InstituteStudent,
  InstituteEmployee,
  InstituteOffice,
  InstituteFCC,
  InstituteHostel,
  InstituteWarden,
} from "@/lib/institute/types";

export const GH_BAGESHRI = "gh-bageshri";
export const GH_HAMSANANDI = "gh-hamsanandi";

// Meals are served at Hamsanandi only, as in migration 8.
export const seedGuestHouses: GuestHouse[] = [
  { id: GH_BAGESHRI, name: "Bageshri", total_rooms: 10, serves_meals: false },
  { id: GH_HAMSANANDI, name: "Hamsanandi", total_rooms: 13, serves_meals: true },
];

/**
 * The rooms the office actually has (23 Sep 2026) - these replaced the dummy
 * B-101…/H-101… blocks. Bageshri numbers its rooms by floor and skips 205,
 * 301 and 304; Hamsanandi is four blocks, A to D, and only A4 exists in A.
 *
 * Both guest houses are **all double sharing** - the office confirmed there is
 * no single room, which is why the booking form and the developer console no
 * longer ask for a type. `room_type` stays on the row because the tariffs and
 * the invoice are priced per type, and a stored booking may still point at a
 * single created before this.
 */
export const BAGESHRI_ROOM_NUMBERS = [
  "201", "202", "203", "204", "206",
  "302", "303", "305", "306", "307",
];

export const HAMSANANDI_ROOM_NUMBERS = [
  "A4",
  "B1", "B2", "B3", "B4",
  "C1", "C2", "C3", "C4",
  "D1", "D2", "D3", "D4",
];

function makeRooms(ghId: string, roomNumbers: readonly string[]): Room[] {
  return roomNumbers.map((n) => ({
    id: `${ghId}-${n}`,
    guest_house_id: ghId,
    room_number: n,
    room_type: "double_sharing" as const,
    is_active: true,
  }));
}

export const seedRooms: Room[] = [
  ...makeRooms(GH_BAGESHRI, BAGESHRI_ROOM_NUMBERS),
  ...makeRooms(GH_HAMSANANDI, HAMSANANDI_ROOM_NUMBERS),
];


/**
 * **One account per kind of user** (7 Nov 2026, the owner: "accounts such
 * that we can test all kinds of users which have some difference in
 * workflows").
 *
 * Every persona below exists because it takes a route no other persona
 * takes. The grouping the account picker shows is `lib/mock-personas.ts`;
 * the route each one takes is computed from the configured rules, not
 * written down here. `hostel_name`, `department_or_club`, `roll_number` and
 * `staff_category` are resolved at read time from the institute tables
 * (`profiles_v` / `withComputed`), so a persona's hostel is set by giving it
 * a row in `seedInstituteStudents` or `seedInstituteWardens`, never here.
 */
export const seedProfiles: SeededProfileInput[] = [
  // ---------------------------------------------------------- students
  // A personal stay at Bageshri, no meals, parents locked to the record.
  // Saveri Boys has all three appointments, so the Assistant Warden decides
  // and the Warden and Deputy Warden are copied.
  { id: "student-btech-saveri", email: "btech.saveri@smail.iitpkd.ac.in", full_name: "Arjun Pillai", role: "student" },
  // Malhar Boys, likewise - a research student rather than an undergraduate,
  // so the tariff and the programme on the record differ.
  { id: "student-phd-malhar", email: "phd.malhar@smail.iitpkd.ac.in", full_name: "Nikhil Varma", role: "student" },
  /**
   * Tilang A Girls has **no Assistant Warden**, so her request falls to the
   * Warden (`hostelWardenApproverIds` reads `HOSTEL_WARDEN_ROLES` in order).
   * The persona exists to keep that fallback honest.
   */
  { id: "student-ms-tilang", email: "ms.tilang@smail.iitpkd.ac.in", full_name: "Fathima Rasheed", role: "student" },
  /**
   * A day scholar: hostel is **genuinely null** in `institute_students`,
   * which is what makes this persona the test of the 17 Oct 2026 rule - a
   * student with no hostel has no Assistant Warden, so their request enters
   * at the Guest House Manager (`approverNotApplicable`).
   */
  { id: "student-day-scholar", email: "dayscholar@smail.iitpkd.ac.in", full_name: "Devika Iyer (day scholar - no hostel)", role: "student" },
  // Heads the Cultural Affairs Council, which is an appointment rather than
  // a role: she decides the legacy club stage a stored club request waits at.
  { id: "student-secretary", email: "secretary.arts@smail.iitpkd.ac.in", full_name: "Meera Nair (Cultural Secretary)", role: "student" },

  // ------------------------------------------------- faculty and staff
  // Teaching staff: an official booking goes to the CSE HOD, a personal one
  // straight to the desk, and the debitable heads are the faculty list.
  { id: "faculty-cse", email: "faculty.cse@iitpkd.ac.in", full_name: "Dr. Priya Sharma", role: "employee", unit_id: "unit-cse" },
  // The HOD of CSE. Her own official booking has no HOD stage - the rule
  // excludes the requester - so it enters at the desk and the log says why.
  { id: "hod-cse", email: "hod.cse@iitpkd.ac.in", full_name: "Prof. R. Venkatesh (HOD, CSE)", role: "employee", unit_id: "unit-cse" },
  // The HOD of Data Science, for the Data Science department office's
  // "Requires HOD approval" route.
  { id: "hod-dse", email: "hod.dse@iitpkd.ac.in", full_name: "Prof. S. Anand (HOD, Data Science)", role: "employee", unit_id: "unit-dse" },
  // Non-teaching staff: the same HOD route, but Personal Funds is the only
  // head they may debit (`DEFAULT_DEBIT_RULES`).
  { id: "staff-cse", email: "staff.cse@iitpkd.ac.in", full_name: "Ravi Kumar (Technical Staff, CSE)", role: "employee", unit_id: "unit-cse" },
  // Faculty Advisor of the Cultural Affairs Council and of Petrichor - an
  // appointment in Departments & Clubs, not an account of its own, so New
  // Booking offers him "Book as Faculty Advisor" beside his own bookings.
  { id: "faculty-advisor", email: "advisor.cultural@iitpkd.ac.in", full_name: "Dr. Arun Prasad", role: "employee", unit_id: "unit-cse" },
  // Heads the Registrar's Office, which is what makes that office's Direct /
  // Requires HOD approval question appear at all (`asksOfficeApproval`).
  { id: "registrar", email: "registrar@iitpkd.ac.in", full_name: "Dr. Mohan Das (Registrar)", role: "employee", unit_id: "unit-registrar-office" },

  // --------------------------------------------------- institute offices
  // An officer office with **nobody appointed as its head**: it is never
  // asked Direct or HOD, and its bookings enter at the desk (11 Oct 2026).
  { id: "office-director", email: "director_iitpkd@iitpkd.ac.in", full_name: "Director's Office", role: "official", unit_id: "unit-director-office" },
  // An officer office that **does** have a head, so the question is asked.
  { id: "office-registrar", email: "ro@iitpkd.ac.in", full_name: "Registrar's Office", role: "official", unit_id: "unit-registrar-office" },
  // Two department offices, whose HOD approval comes from their department.
  { id: "office-cse", email: "office_cs@iitpkd.ac.in", full_name: "CSE Department Office", role: "official", unit_id: "unit-cse-office" },
  { id: "office-dse", email: "office_ds@iitpkd.ac.in", full_name: "Data Science Department Office", role: "official", unit_id: "unit-dse-office" },

  // ------------------------------------------------------------ the IAR
  // Books for itself or for an alumnus, and decides the Student Cell's
  // requests. Never `PENDING_IAR` on its own booking: it *is* that approver.
  { id: "iar-cell", email: "iar@iitpkd.ac.in", full_name: "IAR Office", role: "iar_cell", unit_id: "unit-iar-office" },
  // Books for an alumnus only, through the IAR Office.
  { id: "iar-student-cell", email: "alumnicell@iitpkd.ac.in", full_name: "IAR Student Cell", role: "iar_student_cell" },

  // ------------------------------------------------- clubs and councils
  // Neither account ever submits (`createBooking` refuses it): their Faculty
  // Advisor books for them and they are copied on the mail.
  { id: "club-cultural", email: "sec_arts@iitpkd.ac.in", full_name: "Cultural Affairs Council", role: "club", unit_id: "unit-cultural" },
  { id: "club-petrichor", email: "petrichor@iitpkd.ac.in", full_name: "Petrichor Fest Council", role: "club", unit_id: "unit-petrichor" },

  // ----------------------------------------------------- hostel wardens
  // Two hostels with the full office, so the "Assistant Warden decides, the
  // other two are copied" rule can be seen from both sides, and one with
  // only a Warden, so the fallback can.
  { id: "warden-malhar", email: "warden.malharboys@iitpkd.ac.in", full_name: "Dr. Suresh Kumar", role: "warden" },
  { id: "dwarden-malhar", email: "dwarden.malharboys@iitpkd.ac.in", full_name: "Dr. Geetha Menon", role: "deputy_warden" },
  { id: "awarden-malhar", email: "awarden.malharboys@iitpkd.ac.in", full_name: "Mr. Sajeev Thomas", role: "assistant_warden" },
  { id: "warden-saveri", email: "warden.saveriboys@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi", role: "warden" },
  { id: "dwarden-saveri", email: "dwarden.saveriboys@iitpkd.ac.in", full_name: "Dr. Vinod Raj", role: "deputy_warden" },
  { id: "awarden-saveri", email: "awarden.saveriboys@iitpkd.ac.in", full_name: "Ms. Anu George", role: "assistant_warden" },
  { id: "warden-tilang", email: "warden.tilangagirls@iitpkd.ac.in", full_name: "Dr. Shalini Rao", role: "warden" },

  // ------------------------------------------------------------ the desk
  { id: "gh-manager", email: "guesthouse@iitpkd.ac.in", full_name: "Guest House Manager", role: "gh_manager" },
  { id: "gh-caretaker", email: "gh.reception@iitpkd.ac.in", full_name: "Guest House Caretaker", role: "gh_caretaker" },
  { id: "developer", email: "developer@iitpkd.ac.in", full_name: "Portal Developer", role: "developer" },
];

/**
 * The demo units: two departments with HODs, the student bodies' hierarchy
 * (migration 25), and four offices - one officer office with **no** head
 * (never asked for HOD approval), one with a head, and two department
 * offices whose HOD approval comes from their department.
 */
export const seedUnits: Unit[] = [
  { id: "unit-cse", name: "Computer Science & Engineering", category: "department", parent_department_id: null, head_id: "hod-cse", acting_head_id: null, office_type: null },
  { id: "unit-dse", name: "Data Science & Engineering", category: "department", parent_department_id: null, head_id: "hod-dse", acting_head_id: null, office_type: null },
  // Its head is the student secretary (who decides club requests stored
  // before 24 Sep 2026); its Faculty Advisor books for it and its clubs, and
  // its secretary's mailbox is copied on those bookings.
  { id: "unit-cultural", name: "Cultural Affairs Council", category: "council", parent_department_id: null, head_id: "student-secretary", acting_head_id: null, office_type: null, faculty_advisor_id: "faculty-advisor", secretary_email: "sec_arts@iitpkd.ac.in" },
  // The fest has a Faculty Advisor of its own; with no secretary's mailbox of
  // its own, its bookings copy the council's.
  { id: "unit-petrichor", name: "Petrichor", category: "club", parent_department_id: "unit-cultural", head_id: null, acting_head_id: null, office_type: null, faculty_advisor_id: "faculty-advisor", secretary_email: null },
  // **No head on purpose**: the Director's Office has no HOD, so the form
  // withholds the Approval card entirely (`asksOfficeApproval`, 11 Oct 2026).
  { id: "unit-director-office", name: "Director's Office", category: "office", parent_department_id: null, head_id: null, acting_head_id: null, office_type: "officer" },
  // An officer office that is its own HOD unit, with the Registrar heading it.
  { id: "unit-registrar-office", name: "Registrar's Office", category: "office", parent_department_id: null, head_id: "registrar", acting_head_id: null, office_type: "officer" },
  { id: "unit-iar-office", name: "International & Alumni Relations", category: "office", parent_department_id: null, head_id: null, acting_head_id: null, office_type: "officer" },
  // Department offices: "Requires HOD approval" goes to their department's HOD.
  { id: "unit-cse-office", name: "CSE Department Office", category: "office", parent_department_id: "unit-cse", head_id: null, acting_head_id: null, office_type: "department" },
  { id: "unit-dse-office", name: "Data Science Department Office", category: "office", parent_department_id: "unit-dse", head_id: null, acting_head_id: null, office_type: "department" },
];

/**
 * The whitelist the demo build starts with - the four office mailboxes above,
 * which are the addresses `isWhitelistedOfficial` lets book as `official`.
 * Each is also a row on the office debitable-heads spreadsheet
 * (`OFFICE_DEBIT_HEADS`), so each is narrowed to a different budget.
 */
export const seedOfficialEmails: string[] = [
  "director_iitpkd@iitpkd.ac.in",
  "ro@iitpkd.ac.in",
  "office_cs@iitpkd.ac.in",
  "office_ds@iitpkd.ac.in",
];

/**
 * The office's tariff sheet, as migration 19 seeds it. No extra-bed rate: the
 * sheet has none, so an invoice with an extra bed cannot be issued until the
 * office adds one in Tariffs & Invoicing.
 */
function tariff(
  id: string,
  guest_house_id: string | null,
  item: Tariff["item"],
  rate: number,
  scope: Partial<Pick<Tariff, "booking_type" | "requester_role">> = {},
  note: string
): Tariff {
  return {
    id,
    guest_house_id,
    item,
    room_type: null,
    booking_type: scope.booking_type ?? null,
    requester_role: scope.requester_role ?? null,
    rate,
    effective_from: "2024-01-01",
    note,
    created_at: "2024-01-01T00:00:00.000Z",
    created_by: null,
  };
}

export const seedTariffs: Tariff[] = [
  tariff("tariff-bageshri-room", GH_BAGESHRI, "room", 1000, {}, "Tariff sheet: Bageshri, per room per day"),
  tariff("tariff-hamsanandi-room", GH_HAMSANANDI, "room", 2000, {}, "Tariff sheet: Hamsanandi types 1 and 2"),
  tariff("tariff-hamsanandi-official", GH_HAMSANANDI, "room", 4000, { requester_role: "official" }, "Tariff sheet: Hamsanandi type 3, government officers"),
  tariff("tariff-breakfast", null, "breakfast", 80, {}, "Tariff sheet: per head"),
  tariff("tariff-lunch", null, "lunch", 120, {}, "Tariff sheet: per head"),
  tariff("tariff-dinner", null, "dinner", 100, {}, "Tariff sheet: per head"),
  ...(["breakfast", "lunch", "dinner"] as const).flatMap((meal) => [
    tariff(`tariff-${meal}-student`, null, meal, 0, { requester_role: "student" }, "Tariff sheet: meals free to students"),
    tariff(`tariff-${meal}-alumni`, null, meal, 0, { booking_type: "alumni" }, "Tariff sheet: meals free to alumni"),
  ]),
];

/** Demo projects for the Project debitable head (migration 18). */
export const seedProjects: Project[] = [
  { id: "proj-storage", project_number: "SP/2025/017", title: "Grid-scale energy storage", pi_name: "Dr. Priya Sharma", active: true },
  { id: "proj-vision", project_number: "CP/2026/004", title: "Machine vision for crop health", pi_name: "Prof. R. Venkatesh", active: true },
  { id: "proj-old", project_number: "SP/2022/031", title: "Completed: water quality sensors", pi_name: null, active: false },
];

const now = new Date();
const iso = (daysFromNow: number, hour: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/**
 * The demo bookings, written without the fields migration 11 added - they are
 * the same on almost every row, so `withDefaults` below fills them in rather
 * than repeating them nine times. A row that differs says so explicitly.
 */
type DemoBooking = Omit<
  Booking,
  | "service_type"
  | "meal_preference"
  | "meal_diet_counts"
  | "meal_guest_count"
  | "pets_policy_acknowledged"
  | "pets_policy_acknowledged_at"
  | "has_foreign_national"
  | "created_by"
  | "on_behalf_of_name"
  | "on_behalf_of_email"
  | "on_behalf_of_phone"
  | "debit_head"
  | "debit_details"
  | "debit_document_url"
  | "debit_subhead"
  | "copy_to_emails"
  | "project_id"
  | "office_approval"
> &
  Partial<Booking>;

// Demo bookings so every portal has something in its queue on first run.
// Meals are filled in below, from the stay dates.
const demoBookings: DemoBooking[] = [
  {
    id: "bk-demo-1",
    booking_reference_id: "IITPKD-GH-2026-DM001",
    user_id: "student-btech-saveri",
    guest_house_id: GH_BAGESHRI,
    user_role: "student",
    status: "PENDING_WARDEN",
    booking_type: "personal",
    alumni_name: null,
    alumni_roll_number: null,
    purpose_of_visit: "Parents visiting for convocation",
    check_in: iso(7, 12),
    check_out: iso(9, 10),
    rooms_requested: 1,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: iso(-1, 9),
    updated_at: iso(-1, 9),
  },
  {
    id: "bk-demo-2",
    booking_reference_id: "IITPKD-GH-2026-DM002",
    user_id: "club-petrichor",
    guest_house_id: GH_HAMSANANDI,
    user_role: "club",
    status: "PENDING_FA",
    booking_type: "official",
    alumni_name: null,
    alumni_roll_number: null,
    purpose_of_visit: "Pro-show artist accommodation for Petrichor '26",
    check_in: iso(14, 14),
    check_out: iso(16, 11),
    rooms_requested: 2,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: iso(-2, 15),
    updated_at: iso(-2, 15),
  },
  {
    id: "bk-demo-3",
    booking_reference_id: "IITPKD-GH-2026-DM003",
    user_id: "iar-student-cell",
    guest_house_id: GH_BAGESHRI,
    user_role: "iar_student_cell",
    status: "PENDING_IAR",
    booking_type: "alumni",
    alumni_name: "Vikram Iyer",
    alumni_roll_number: "101601023",
    purpose_of_visit: "Campus visit for alumni mentorship programme",
    check_in: iso(10, 13),
    check_out: iso(12, 10),
    rooms_requested: 1,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: iso(-1, 18),
    updated_at: iso(-1, 18),
  },
  {
    id: "bk-demo-4",
    booking_reference_id: "IITPKD-GH-2026-DM004",
    user_id: "faculty-cse",
    guest_house_id: GH_HAMSANANDI,
    user_role: "employee",
    status: "PENDING_GH_MANAGER",
    booking_type: "official",
    alumni_name: null,
    alumni_roll_number: null,
    purpose_of_visit: "Visiting collaborator from IISc for joint project",
    check_in: iso(5, 12),
    check_out: iso(8, 10),
    rooms_requested: 1,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    // The one demo booking with an infant, so the manager console shows the flag.
    has_infant: true,
    created_at: iso(-3, 11),
    updated_at: iso(-2, 9),
  },
  {
    id: "bk-demo-5",
    booking_reference_id: "IITPKD-GH-2026-DM005",
    user_id: "office-director",
    guest_house_id: GH_BAGESHRI,
    user_role: "official",
    status: "APPROVED",
    booking_type: "official",
    alumni_name: null,
    alumni_roll_number: null,
    purpose_of_visit: "Visit of NIRF inspection committee",
    // One committee member is a foreign national, so the desk's report has
    // something in it on first run.
    has_foreign_national: true,
    check_in: iso(6, 12),
    check_out: iso(9, 11),
    rooms_requested: 2,
    assigned_room_ids: [`${GH_BAGESHRI}-201`, `${GH_BAGESHRI}-202`],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: iso(-5, 10),
    updated_at: iso(-4, 16),
  },
  // Meals without a room: a department hosting an examiner for the day. It
  // holds no rooms and no guest rows - the kitchen needs a head count - and
  // goes straight to the manager rather than through an approval chain.
  {
    id: "bk-demo-6",
    booking_reference_id: "IITPKD-GH-2026-DM006",
    user_id: "faculty-cse",
    guest_house_id: GH_HAMSANANDI,
    user_role: "employee",
    status: "PENDING_GH_MANAGER",
    booking_type: "official",
    service_type: "meals_only",
    // Each person's own preference (migration 27): the committee is eight,
    // five of them vegetarian. The other two demo bookings with meals keep
    // only the old whole-party `meal_preference`, so the kitchen console and
    // the invoice are seen reading a legacy row as well as a new one.
    meal_diet_counts: { veg: 5, non_veg: 3 },
    meal_guest_count: 8,
    alumni_name: null,
    alumni_roll_number: null,
    purpose_of_visit: "Lunch for the PhD thesis examination committee",
    check_in: iso(4, 0),
    check_out: iso(4, 23),
    rooms_requested: 0,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: iso(-1, 12),
    updated_at: iso(-1, 12),
  },
];

/**
 * Fields every demo booking shares. Pets were acknowledged because the form
 * will not submit without it; `has_foreign_national` is recomputed from the
 * guest rows below, so it is not guessed here.
 */
const DEMO_DEBIT_HEADS: Partial<Record<Booking["user_role"], Booking["debit_head"]>> = {
  student: "personal_funds",
  club: "department_budget",
  employee: "department_budget",
  official: "institute_grant",
  iar_student_cell: "institute_grant",
};

function withDefaults(b: DemoBooking): Booking {
  return {
    service_type: "room",
    meal_preference: null,
    meal_diet_counts: null,
    meal_guest_count: null,
    pets_policy_acknowledged: true,
    pets_policy_acknowledged_at: b.created_at,
    has_foreign_national: false,
    created_by: null,
    on_behalf_of_name: null,
    on_behalf_of_email: null,
    on_behalf_of_phone: null,
    // Each demo booking names the head its requester would choose today, so
    // the consoles, exports and invoices have something to show.
    debit_head: DEMO_DEBIT_HEADS[b.user_role] ?? (b.booking_type === "personal" ? "personal_funds" : null),
    debit_details: null,
    debit_document_url: null,
    debit_subhead: null,
    copy_to_emails: [],
    project_id: null,
    office_approval: b.user_role === "official" || b.user_role === "iar_cell" ? "direct" : null,
    ...b,
  } as Booking;
}

/**
 * A meal plan for a demo stay, built day by day so the manager console shows a
 * real per-day plan. `pick` is asked about each meal served during the stay,
 * with the day's position in it (0 = arrival day).
 */
function demoMeals(b: Booking, pick: (meal: MealKey, dayIndex: number) => boolean): MealPlan {
  return normalizeMeals(
    stayMealDays(new Date(b.check_in), new Date(b.check_out)).map(({ date, available }, i) => ({
      date,
      breakfast: available.breakfast && pick("breakfast", i),
      lunch: available.lunch && pick("lunch", i),
      dinner: available.dinner && pick("dinner", i),
    }))
  );
}

/** Only the Hamsanandi bookings have meals - Bageshri serves none. */
const DEMO_MEALS: Record<string, (b: Booking) => MealPlan> = {
  // Visiting artists: every meal served during the stay.
  "bk-demo-2": (b) => demoMeals(b, () => true),
  // A collaborator: breakfast every morning, dinner on the day they arrive.
  "bk-demo-4": (b) =>
    demoMeals(b, (meal, day) => meal === "breakfast" || (meal === "dinner" && day === 0)),
  // The meals-only booking: one lunch, which is the whole booking.
  "bk-demo-6": (b) => demoMeals(b, (meal) => meal === "lunch"),
};

/** Veg unless the stay says otherwise - the kitchen's usual default. */
const DEMO_MEAL_PREFERENCE: Record<string, "veg" | "non_veg"> = {
  "bk-demo-2": "non_veg",
  "bk-demo-4": "veg",
};

export const seedBookings: Booking[] = demoBookings.map(withDefaults).map((b) => {
  const meals = DEMO_MEALS[b.id]?.(b) ?? [];
  // A booking with meals and a room is a room-and-meals booking; the
  // meals-only one already says what it is.
  const service_type = b.service_type === "meals_only" || meals.length === 0 ? b.service_type : "room_meals";
  return {
    ...b,
    meals,
    service_type,
    meal_preference: b.meal_preference ?? DEMO_MEAL_PREFERENCE[b.id] ?? null,
  };
});

/**
 * The room cards for the demo bookings. Guests are entered inside a card, so
 * a two-room booking has two cards and its guests are split between them.
 * bk-demo-6 has none: it is meals-only.
 */
export const seedBookingRooms: BookingRoom[] = [
  { id: "br-1", booking_id: "bk-demo-1", room_index: 1, room_type: null, assigned_room_id: null },
  { id: "br-2", booking_id: "bk-demo-2", room_index: 1, room_type: null, assigned_room_id: null },
  { id: "br-3", booking_id: "bk-demo-2", room_index: 2, room_type: null, assigned_room_id: null },
  { id: "br-4", booking_id: "bk-demo-3", room_index: 1, room_type: null, assigned_room_id: null },
  { id: "br-5", booking_id: "bk-demo-4", room_index: 1, room_type: null, assigned_room_id: null },
  { id: "br-6", booking_id: "bk-demo-5", room_index: 1, room_type: null, assigned_room_id: `${GH_BAGESHRI}-201` },
  { id: "br-7", booking_id: "bk-demo-5", room_index: 2, room_type: null, assigned_room_id: `${GH_BAGESHRI}-202` },
];

export const seedGuests: BookingGuest[] = [
  { id: "g-1", booking_id: "bk-demo-1", booking_room_id: "br-1", name: "Radhika Pillai", age: 52, gender: "female", relationship: "Mother", id_number: "XXXX-XXXX-4821", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-2", booking_id: "bk-demo-1", booking_room_id: "br-1", name: "Mohanan Pillai", age: 56, gender: "male", relationship: "Father", id_number: "XXXX-XXXX-9130", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-3", booking_id: "bk-demo-2", booking_room_id: "br-2", name: "Arjun Das", age: 31, gender: "male", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-4", booking_id: "bk-demo-2", booking_room_id: "br-3", name: "Meera Krishnan", age: 28, gender: "female", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-5", booking_id: "bk-demo-3", booking_room_id: "br-4", name: "Vikram Iyer", age: 29, gender: "male", relationship: null, id_number: "XXXX-XXXX-7754", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-6", booking_id: "bk-demo-4", booking_room_id: "br-5", name: "Prof. Ananya Bose", age: 45, gender: "female", relationship: "Research collaborator", id_number: "XXXX-XXXX-2216", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  // Under five, so the age alone makes this row an infant: no bed, no ID.
  { id: "g-8", booking_id: "bk-demo-4", booking_room_id: "br-5", name: "Ishaan Bose", age: 3, gender: "male", relationship: "Son", id_number: null, id_document_url: null, is_infant: true, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-7", booking_id: "bk-demo-5", booking_room_id: "br-6", name: "Dr. R. Subramanian", age: 61, gender: "male", relationship: null, id_number: "XXXX-XXXX-5540", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  // A foreign national on the committee, so the register and the admin views
  // have a passport to show on first run.
  { id: "g-9", booking_id: "bk-demo-5", booking_room_id: "br-7", name: "Dr. Kenji Sato", age: 54, gender: "male", relationship: null, id_number: null, id_document_url: null, is_infant: false, citizenship: "other", nationality: "JP", passport_number: "TK1234567" },
];

/**
 * Occupancy for the seeded bookings. Only bk-demo-5 is approved, so it is the
 * only one holding rooms - the others are still awaiting approval and reserve
 * nothing. Derived from the bookings above so the two cannot disagree.
 */
export const seedRoomHolds: RoomHold[] = seedBookings.flatMap((b) =>
  b.assigned_room_ids.map((room_id) => ({
    booking_id: b.id,
    room_id,
    check_in: b.check_in,
    check_out: b.check_out,
  }))
);

export const seedLogs: BookingLog[] = [
  { id: "l-1", booking_id: "bk-demo-1", action_by: "student-btech-saveri", action_by_name: "Arjun Pillai", previous_status: null, new_status: "PENDING_WARDEN", remarks: "Booking submitted", timestamp: iso(-1, 9) },
  { id: "l-2", booking_id: "bk-demo-2", action_by: "club-petrichor", action_by_name: "Petrichor Fest Council", previous_status: null, new_status: "PENDING_FA", remarks: "Booking submitted", timestamp: iso(-2, 15) },
  { id: "l-3", booking_id: "bk-demo-3", action_by: "iar-student-cell", action_by_name: "IAR Student Cell", previous_status: null, new_status: "PENDING_IAR", remarks: "Booking submitted", timestamp: iso(-1, 18) },
  { id: "l-4", booking_id: "bk-demo-4", action_by: "faculty-cse", action_by_name: "Dr. Priya Sharma", previous_status: null, new_status: "PENDING_GH_MANAGER", remarks: "Booking submitted", timestamp: iso(-3, 11) },
  { id: "l-5", booking_id: "bk-demo-5", action_by: "office-director", action_by_name: "Director's Office", previous_status: null, new_status: "PENDING_GH_MANAGER", remarks: "Booking submitted", timestamp: iso(-5, 10) },
  { id: "l-6", booking_id: "bk-demo-5", action_by: "gh-manager", action_by_name: "Guest House Manager", previous_status: "PENDING_GH_MANAGER", new_status: "APPROVED", remarks: "Rooms 201, 202 allocated", timestamp: iso(-4, 16) },
];

// ---- Institute data tables (migration 35) ----------------------------------
//
// These are what the computed profile fields are read from: a student's
// hostel and roll number, a warden's hostel, an employee's teaching /
// non-teaching category. Change a persona's hostel here, not on the profile.

const seedTs = "2026-11-01T00:00:00.000Z";

/** A student's record, with the fields no demo row fills left null. */
function student(
  id: string,
  email: string,
  full_name: string,
  roll_number: string,
  programme: string,
  department: string,
  hostel: string | null,
  family: Partial<Pick<InstituteStudent, "father_name" | "mother_name" | "guardian_name" | "father_phone_number" | "mother_phone_number" | "guardian_phone_number">> = {},
  batch_year = "2023"
): InstituteStudent {
  return {
    id,
    email,
    batch_year,
    roll_number,
    full_name,
    programme,
    faculty_advisor_guide_name: null,
    department,
    phone: null,
    aadhar_number: null,
    father_name: null,
    father_aadhar_number: null,
    father_phone_number: null,
    mother_name: null,
    mother_aadhar_number: null,
    mother_phone_number: null,
    spouse_name: null,
    spouse_aadhar_number: null,
    spouse_phone_number: null,
    guardian_name: null,
    guardian_aadhar_number: null,
    guardian_phone_number: null,
    hostel,
    imported_by: null,
    created_at: seedTs,
    updated_at: seedTs,
    ...family,
  };
}

export const seedInstituteStudents: InstituteStudent[] = [
  // Both parents on record, so the booking form offers **and locks** Father
  // and Mother and asks for no ID for either (`guestNameRule`).
  student("is-arjun", "btech.saveri@smail.iitpkd.ac.in", "Arjun Pillai", "112301007", "B.Tech", "Computer Science and Engineering", "Saveri Boys", {
    father_name: "Mohanan Pillai",
    father_phone_number: "+91 90000 00201",
    mother_name: "Radhika Pillai",
    mother_phone_number: "+91 90000 00202",
  }),
  // Father only: Mother is **not offered at all** - there would be no name
  // to lock it to - and Guardian is not offered either, because a parent is.
  student("is-nikhil", "phd.malhar@smail.iitpkd.ac.in", "Nikhil Varma", "202104003", "PhD", "Chemistry", "Malhar Boys", {
    father_name: "Sudhakara Varma",
    father_phone_number: "+91 90000 00203",
  }, "2021"),
  // Neither parent on record, so Guardian is offered - the one case where it
  // is, and the reason a student with no parents can still bring a sibling.
  student("is-fathima", "ms.tilang@smail.iitpkd.ac.in", "Fathima Rasheed", "142303011", "MS", "Data Science and Engineering", "Tilang A Girls", {
    guardian_name: "Abdul Rasheed",
    guardian_phone_number: "+91 90000 00204",
  }),
  // **Hostel null**: a day scholar has no Assistant Warden, so the request
  // enters at the Guest House Manager and the log says why.
  student("is-devika", "dayscholar@smail.iitpkd.ac.in", "Devika Iyer", "122303099", "B.Tech", "Mechanical Engineering", null, {
    father_name: "Krishnan Iyer",
    mother_name: "Sudha Iyer",
  }),
  student("is-meera", "secretary.arts@smail.iitpkd.ac.in", "Meera Nair", "112301045", "B.Tech", "Computer Science and Engineering", "Malhar Girls", {
    father_name: "Rajan Nair",
    mother_name: "Bindu Nair",
  }),
];

export const seedInstituteEmployees: InstituteEmployee[] = [
  // `employee_type` is what `staff_category` is computed from: anything
  // matching "non ... teaching" is `staff`, everything else `faculty`. That
  // is the one difference between the two employee personas' debitable heads.
  { id: "ie-priya", email: "faculty.cse@iitpkd.ac.in", employee_id: "EMP001", full_name: "Dr. Priya Sharma", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Assistant Professor", phone: "9876543230", office_number: "A-201", gender: "Female", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-venkatesh", email: "hod.cse@iitpkd.ac.in", employee_id: "EMP002", full_name: "Prof. R. Venkatesh", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Professor", phone: "9876543231", office_number: "A-101", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-anand", email: "hod.dse@iitpkd.ac.in", employee_id: "EMP003", full_name: "Prof. S. Anand", department: "Data Science & Engineering", employee_type: "Teaching Staff", designation: "Professor", phone: "9876543232", office_number: "B-101", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-arun", email: "advisor.cultural@iitpkd.ac.in", employee_id: "EMP004", full_name: "Dr. Arun Prasad", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Associate Professor", phone: "9876543233", office_number: "A-202", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-ravi", email: "staff.cse@iitpkd.ac.in", employee_id: "EMP010", full_name: "Ravi Kumar", department: "Computer Science & Engineering", employee_type: "Non Teaching Staff", designation: "Junior Technical Superintendent", phone: "9876543240", office_number: "A-105", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-mohan", email: "registrar@iitpkd.ac.in", employee_id: "EMP011", full_name: "Dr. Mohan Das", department: "Administration", employee_type: "Non Teaching Staff", designation: "Registrar", phone: "9876543241", office_number: "Admin-01", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

/**
 * The four office mailboxes, each a different row on the debitable-heads
 * spreadsheet: the Director's Office and the Registrar's Office spend the
 * Institute Grant, the two department offices their department's budget
 * (`OFFICE_DEBIT_HEADS`, keyed on the mailbox before the `@`).
 */
export const seedInstituteOffices: InstituteOffice[] = [
  { id: "io-director", office_email: "director_iitpkd@iitpkd.ac.in", office_name: "Office of the Director", office_type: "officer", phone: "04923-226000", department_head: "Yes", head_name: "Director", head_email: "director@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "io-registrar", office_email: "ro@iitpkd.ac.in", office_name: "Office of the Registrar", office_type: "officer", phone: "04923-226001", department_head: "Yes", head_name: "Dr. Mohan Das", head_email: "registrar@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "io-cse", office_email: "office_cs@iitpkd.ac.in", office_name: "CSE Department Office", office_type: "department", phone: "04923-226100", department_head: "Yes", head_name: "Prof. R. Venkatesh", head_email: "hod.cse@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "io-dse", office_email: "office_ds@iitpkd.ac.in", office_name: "Data Science Department Office", office_type: "department", phone: "04923-226200", department_head: "Yes", head_name: "Prof. S. Anand", head_email: "hod.dse@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

export const seedInstituteFCCs: InstituteFCC[] = [
  { id: "if-cultural", council_email: "sec_arts@iitpkd.ac.in", council_name: "Cultural Affairs Council", event_or_council: "Council", faculty_advisor_email: "advisor.cultural@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "if-petrichor", council_email: "petrichor@iitpkd.ac.in", council_name: "Petrichor", event_or_council: "Fest", faculty_advisor_email: "advisor.cultural@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

/** The institute's seven hostels, with the ids `institute_wardens` points at. */
export const seedInstituteHostels: InstituteHostel[] = [
  { id: "ih-hos1", hostel_id: "HOS1", hostel_name: "Malhar Girls", created_at: seedTs, updated_at: seedTs },
  { id: "ih-hos2", hostel_id: "HOS2", hostel_name: "Malhar Boys", created_at: seedTs, updated_at: seedTs },
  { id: "ih-hos3", hostel_id: "HOS3", hostel_name: "Saveri Boys", created_at: seedTs, updated_at: seedTs },
  { id: "ih-hos4", hostel_id: "HOS4", hostel_name: "Saveri Girls", created_at: seedTs, updated_at: seedTs },
  { id: "ih-hos5", hostel_id: "HOS5", hostel_name: "Tilang A Girls", created_at: seedTs, updated_at: seedTs },
  { id: "ih-hos6", hostel_id: "HOS6", hostel_name: "Tilang B", created_at: seedTs, updated_at: seedTs },
  { id: "ih-hos7", hostel_id: "HOS7", hostel_name: "Brindavani", created_at: seedTs, updated_at: seedTs },
];

/**
 * Who is appointed to which hostel. This is the **only** place a warden
 * persona's hostel is set - `profiles_v` reads it back onto the profile.
 *
 * Malhar Boys and Saveri Boys have all three appointments; Tilang A Girls
 * has only a Warden, which is what makes it the test of the fallback in
 * `hostelWardenApproverIds`. The four remaining hostels have nobody, so a
 * student in one of them would enter at the desk with the stage skipped and
 * the reason logged - also worth being able to see.
 */
export const seedInstituteWardens: InstituteWarden[] = [
  { id: "iw-malhar-w", warden_email: "warden.malharboys@iitpkd.ac.in", full_name: "Dr. Suresh Kumar", warden_phone: "9876543250", warden_role: "Warden", hostel_id: "HOS2", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-malhar-dw", warden_email: "dwarden.malharboys@iitpkd.ac.in", full_name: "Dr. Geetha Menon", warden_phone: "9876543251", warden_role: "Deputy Warden", hostel_id: "HOS2", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-malhar-aw", warden_email: "awarden.malharboys@iitpkd.ac.in", full_name: "Mr. Sajeev Thomas", warden_phone: "9876543252", warden_role: "Assistant Warden", hostel_id: "HOS2", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-saveri-w", warden_email: "warden.saveriboys@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi", warden_phone: "9876543253", warden_role: "Warden", hostel_id: "HOS3", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-saveri-dw", warden_email: "dwarden.saveriboys@iitpkd.ac.in", full_name: "Dr. Vinod Raj", warden_phone: "9876543254", warden_role: "Deputy Warden", hostel_id: "HOS3", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-saveri-aw", warden_email: "awarden.saveriboys@iitpkd.ac.in", full_name: "Ms. Anu George", warden_phone: "9876543255", warden_role: "Assistant Warden", hostel_id: "HOS3", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-tilang-w", warden_email: "warden.tilangagirls@iitpkd.ac.in", full_name: "Dr. Shalini Rao", warden_phone: "9876543256", warden_role: "Warden", hostel_id: "HOS5", imported_by: null, created_at: seedTs, updated_at: seedTs },
];
