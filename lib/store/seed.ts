import type { UserGroup } from "../user-groups";
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
  { id: GH_HAMSANANDI, name: "Hamsanandi", total_rooms: 10, serves_meals: true },
];

/**
 * **The naming convention of 4 Nov 2026** (the owner's sixteenth list):
 * Bageshri is **B1-B10**; Hamsanandi is **A1-A4 and D1-D4**, with **C1 and
 * C2** the VIP rooms. It replaced the numbers of 23 Sep 2026 (Bageshri
 * 201-307 by floor, Hamsanandi A4, B1-B4, C1-C4, D1-D4); a database seeded
 * with those is renamed by `supabase/repairs/2026-11-04-room-naming.sql`.
 *
 * Both guest houses are **all double sharing** - the office confirmed there is
 * no single room, which is why the booking form and the developer console no
 * longer ask for a type. `room_type` stays on the row because the tariffs and
 * the invoice are priced per type, and a stored booking may still point at a
 * single created before this.
 */
export const BAGESHRI_ROOM_NUMBERS = [
  "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10",
];

/** C1 and C2 are the default VIP rooms (`DEFAULT_VIP_ROOM_NUMBERS`, `lib/vip.ts`). */
export const HAMSANANDI_ROOM_NUMBERS = [
  "A1", "A2", "A3", "A4",
  "C1", "C2",
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

export const seedProfiles: SeededProfileInput[] = [
  // ----- Requesters -----
  { id: "student-anjali", email: "112201001@smail.iitpkd.ac.in", full_name: "Anjali Menon", role: "student", hostel_name: "Malhar", department_or_club: null, roll_number: "112201001", ldap_uid: "112201001", group_id: "group-btech-2022" },
  { id: "student-rahul", email: "142202014@smail.iitpkd.ac.in", full_name: "Rahul Nair", role: "student", hostel_name: "Saveri", department_or_club: null, roll_number: "142202014", ldap_uid: "142202014", group_id: "group-mtech-2022" },
  /**
   * A day scholar: hostel is **genuinely null** in `institute_students`, which
   * is what makes this persona the test of the 17 Oct 2026 rule - a student
   * with no hostel has no Assistant Warden, so their request enters at the
   * Guest House Manager (`approverNotApplicable`).
   */
  { id: "student-day-scholar", email: "122203099@smail.iitpkd.ac.in", full_name: "Devika Iyer (day scholar - no hostel)", role: "student", hostel_name: null, department_or_club: null, roll_number: "122203099", ldap_uid: "122203099", group_id: "group-ms-2022" },
  // Faculty in CSE: her official bookings go to the CSE HOD first.
  { id: "employee-priya", email: "priya@iitpkd.ac.in", full_name: "Dr. Priya Sharma", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "priya", unit_id: "unit-cse", staff_category: "faculty", group_id: "group-faculty" },
  // An officer office: its bookings are debited to the Institute Grant.
  { id: "official-admin", email: "admin@iitpkd.ac.in", full_name: "Director's Office", role: "official", hostel_name: null, department_or_club: "Administration", roll_number: null, ldap_uid: "admin", unit_id: "unit-director-office" },
  // Belongs to Petrichor, which sits under the Cultural Affairs Council. It
  // raises no bookings itself: its Faculty Advisor books for it (24 Sep 2026).
  { id: "club-petrichor", email: "petrichor@iitpkd.ac.in", full_name: "Petrichor Fest Council", role: "club", hostel_name: null, department_or_club: "Petrichor", roll_number: null, ldap_uid: "petrichor", unit_id: "unit-petrichor" },
  // The council's own account is its secretary's mailbox, which outlives any
  // one secretary. Like a club, it is booked for by the council's Faculty
  // Advisor, and it is the address copied on the council's clubs' bookings.
  { id: "council-cultural", email: "sec_arts@iitpkd.ac.in", full_name: "Cultural Affairs Council", role: "club", hostel_name: null, department_or_club: "Cultural Affairs", roll_number: null, ldap_uid: "sec_arts", unit_id: "unit-cultural" },
  // No alumni persona: alumni have no institute login, so the IAR Office and
  // the IAR Student Cell raise those bookings for them (migration 9).
  { id: "iar-student-cell", email: "alumnicell@iitpkd.ac.in", full_name: "IAR Student Cell", role: "iar_student_cell", hostel_name: null, department_or_club: "International & Alumni Relations", roll_number: null, ldap_uid: "alumnicell" },
  // ----- Unit heads (migration 15) -----
  // Approvers by appointment rather than by role: the HOD is an employee, the
  // council secretary a student. Change who heads a unit in the console and
  // their queue moves with it.
  // Faculty in CSE, and Faculty Advisor of the Cultural Affairs Council and
  // of Petrichor - an appointment in Departments & Clubs, not an account of
  // its own, so New Booking offers him "Book as Faculty Advisor" beside his
  // own bookings, and naming someone else there moves it to them.
  { id: "faculty-arun", email: "arun.prasad@iitpkd.ac.in", full_name: "Dr. Arun Prasad", role: "employee", unit_id: "unit-cse" },
  { id: "hod-cse", email: "hod.cse@iitpkd.ac.in", full_name: "Prof. R. Venkatesh (HOD, CSE)", role: "employee", unit_id: "unit-cse" },
  { id: "secretary-cultural", email: "112301045@smail.iitpkd.ac.in", full_name: "Meera Nair (Cultural Secretary)", role: "student" },
  // ----- Reviewers / Admins -----
  { id: "warden-malhar", email: "warden.malhar@iitpkd.ac.in", full_name: "Dr. Suresh Kumar (Assistant Warden, Malhar)", role: "warden" },
  { id: "warden-saveri", email: "warden.saveri@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi (Assistant Warden, Saveri)", role: "warden" },
  { id: "office-cse", email: "cse.office@iitpkd.ac.in", full_name: "CSE Department Office", role: "official", unit_id: "unit-cse-office" },
  { id: "staff-ravi", email: "ravi.k@iitpkd.ac.in", full_name: "Ravi K. (Technical Staff, CSE)", role: "employee", unit_id: "unit-cse" },
  { id: "iar-cell", email: "iar@iitpkd.ac.in", full_name: "IAR Office", role: "iar_cell", unit_id: "unit-iar-office" },
  { id: "gh-manager", email: "guesthouse@iitpkd.ac.in", full_name: "Guest House Manager", role: "gh_manager" },
  { id: "gh-caretaker", email: "gh.reception@iitpkd.ac.in", full_name: "Guest House Caretaker", role: "gh_caretaker" },
  { id: "developer", email: "developer@iitpkd.ac.in", full_name: "Portal Developer", role: "developer" },
];

/**
 * The demo units. A department with an HOD, and a council with its Faculty
 * Advisor, its secretary and a fest under it - the student bodies' hierarchy
 * (migration 25).
 */
export const seedUnits: Unit[] = [
  { id: "unit-cse", name: "Computer Science & Engineering", category: "department", parent_department_id: null, head_id: "hod-cse", acting_head_id: null, office_type: null },
  // Its head is the student secretary (who approved club requests stored
  // before 24 Sep 2026); its Faculty Advisor books for it and its clubs, and
  // its secretary's mailbox is copied on those bookings.
  { id: "unit-cultural", name: "Cultural Affairs Council", category: "council", parent_department_id: null, head_id: "secretary-cultural", acting_head_id: null, office_type: null, faculty_advisor_id: "faculty-arun", secretary_email: "sec_arts@iitpkd.ac.in" },
  // The fest has a Faculty Advisor of its own; with no secretary's mailbox of
  // its own, its bookings copy the council's.
  { id: "unit-petrichor", name: "Petrichor", category: "club", parent_department_id: "unit-cultural", head_id: null, acting_head_id: null, office_type: null, faculty_advisor_id: "faculty-arun", secretary_email: null },
  // Officer offices (migration 16): booked against the Institute Grant.
  { id: "unit-director-office", name: "Director's Office", category: "office", parent_department_id: null, head_id: null, acting_head_id: null, office_type: "officer" },
  { id: "unit-iar-office", name: "International & Alumni Relations", category: "office", parent_department_id: null, head_id: null, acting_head_id: null, office_type: "officer" },
  // A department office under CSE: "Requires HOD approval" goes to the CSE HOD.
  { id: "unit-cse-office", name: "CSE Department Office", category: "office", parent_department_id: "unit-cse", head_id: null, acting_head_id: null, office_type: "department" },
];

/**
 * The whitelist the mock store starts with: the three formerly hardcoded
 * addresses (`DEFAULT_OFFICIAL_EMAILS`) plus the demo department office.
 */
export const seedOfficialEmails: string[] = [
  "admin@iitpkd.ac.in",
  "cse.office@iitpkd.ac.in",
  "director.office@iitpkd.ac.in",
  "registrar@iitpkd.ac.in",
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

/** The office's three categories, as each row's note names them. */
export const TARIFF_CATEGORY_NOTES = {
  I: "Category I: guests and relatives of employees, parents of students on a personal visit",
  II: "Category II: institute guests on official duty - ministers, directors, BOG, selection committees, external examiners, official guests",
  III: "Category III: academic visitors",
} as const;

export const seedTariffs: Tariff[] = [
  // **Categories I, II and III** (4 Nov 2026, the owner's sixteenth list,
  // from the official policy). Each category is a row's note, which is what
  // the booking page's sheet and the desk's list both read. Category I is
  // the house-wide rate, so a personal or alumni stay resolves to it; II and
  // III are official, told apart by the requester-role pseudo-scope the desk
  // chooses (`deskTariffCategories`): an office's own account reads as II, a
  // department's as III, and the manager picks whichever the visit is.
  ...([
    [GH_HAMSANANDI, "hamsanandi", 1500, 2000, 2500],
    [GH_BAGESHRI, "bageshri", 1000, 1500, 2000],
  ] as const).flatMap(([gh, slug, one, two, three]) => [
    tariff(`tariff-${slug}-cat1`, gh, "room", one, {}, TARIFF_CATEGORY_NOTES.I),
    tariff(`tariff-${slug}-cat2`, gh, "room", two, { booking_type: "official" }, TARIFF_CATEGORY_NOTES.II),
    tariff(`tariff-${slug}-cat2-office`, gh, "room", two, { booking_type: "official", requester_role: "official" }, TARIFF_CATEGORY_NOTES.II),
    tariff(`tariff-${slug}-cat3`, gh, "room", three, { booking_type: "official", requester_role: "employee" }, TARIFF_CATEGORY_NOTES.III),
  ]),
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

/**
 * Demo user groups (migration 36). The students' are their batches; the digits
 * after the first two of a roll number happen to be the year here, but nothing
 * reads them: membership is `profiles.group_id`.
 */
const demoGroup = (id: string, name: string, role: UserGroup["role"], programme: UserGroup["programme"], batch_year: number | null, intake: UserGroup["intake"] = null): UserGroup => ({
  id,
  name,
  role,
  programme,
  batch_year,
  intake,
  prefill_copy_to: [],
  allowed_copy_to: [],
  created_at: "2026-11-05T00:00:00.000Z",
});

export const seedUserGroups: UserGroup[] = [
  demoGroup("group-btech-2022", "B.Tech 2022 batch", "student", "BTech", 2022),
  demoGroup("group-mtech-2022", "M.Tech 2022 batch", "student", "MTech", 2022),
  demoGroup("group-ms-2022", "MS Aug 2022 batch", "student", "MS", 2022, "aug"),
  demoGroup("group-faculty", "Faculty", "employee", null, null),
];

/** Hostels the demo personas live in (migration 16's `hostels` table). */
export const seedHostels: string[] = ["Malhar", "Saveri"];

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
    user_id: "student-anjali",
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
    user_id: "employee-priya",
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
    user_id: "official-admin",
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
    assigned_room_ids: [`${GH_BAGESHRI}-B1`, `${GH_BAGESHRI}-B2`],
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
    user_id: "employee-priya",
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
  { id: "br-6", booking_id: "bk-demo-5", room_index: 1, room_type: null, assigned_room_id: `${GH_BAGESHRI}-B1` },
  { id: "br-7", booking_id: "bk-demo-5", room_index: 2, room_type: null, assigned_room_id: `${GH_BAGESHRI}-B2` },
];

export const seedGuests: BookingGuest[] = [
  { id: "g-1", booking_id: "bk-demo-1", booking_room_id: "br-1", name: "Sunitha Menon", age: 52, gender: "female", relationship: "Mother", id_number: "XXXX-XXXX-4821", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
  { id: "g-2", booking_id: "bk-demo-1", booking_room_id: "br-1", name: "Ravi Menon", age: 56, gender: "male", relationship: "Father", id_number: "XXXX-XXXX-9130", id_document_url: null, is_infant: false, citizenship: "indian", nationality: null, passport_number: null },
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
  { id: "l-1", booking_id: "bk-demo-1", action_by: "student-anjali", action_by_name: "Anjali Menon", previous_status: null, new_status: "PENDING_WARDEN", remarks: "Booking submitted", timestamp: iso(-1, 9) },
  { id: "l-2", booking_id: "bk-demo-2", action_by: "club-petrichor", action_by_name: "Petrichor Fest Council", previous_status: null, new_status: "PENDING_FA", remarks: "Booking submitted", timestamp: iso(-2, 15) },
  { id: "l-3", booking_id: "bk-demo-3", action_by: "iar-student-cell", action_by_name: "IAR Student Cell", previous_status: null, new_status: "PENDING_IAR", remarks: "Booking submitted", timestamp: iso(-1, 18) },
  { id: "l-4", booking_id: "bk-demo-4", action_by: "employee-priya", action_by_name: "Dr. Priya Sharma", previous_status: null, new_status: "PENDING_GH_MANAGER", remarks: "Booking submitted", timestamp: iso(-3, 11) },
  { id: "l-5", booking_id: "bk-demo-5", action_by: "official-admin", action_by_name: "Director's Office", previous_status: null, new_status: "PENDING_GH_MANAGER", remarks: "Booking submitted", timestamp: iso(-5, 10) },
  { id: "l-6", booking_id: "bk-demo-5", action_by: "gh-manager", action_by_name: "Guest House Manager", previous_status: "PENDING_GH_MANAGER", new_status: "APPROVED", remarks: "Rooms 201, 202 allocated", timestamp: iso(-4, 16) },
];

// ---- Institute data tables (migration 35) ----------------------------------

const seedTs = "2026-11-01T00:00:00.000Z";

export const seedInstituteStudents: InstituteStudent[] = [
  { id: "is-anjali", email: "112201001@smail.iitpkd.ac.in", batch_year: "2022", roll_number: "112201001", full_name: "Anjali Menon", programme: "B.Tech", faculty_advisor_guide_name: "Dr. Arun Prasad", department: "Computer Science and Engineering", phone: "+91 90000 00101", aadhar_number: null, father_name: "Ramesh Menon", father_aadhar_number: null, father_phone_number: null, mother_name: "Sreeja Menon", mother_aadhar_number: null, mother_phone_number: null, spouse_name: null, spouse_aadhar_number: null, spouse_phone_number: null, guardian_name: null, guardian_aadhar_number: null, guardian_phone_number: null, hostel: "Malhar", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "is-rahul", email: "142202014@smail.iitpkd.ac.in", batch_year: "2022", roll_number: "142202014", full_name: "Rahul Nair", programme: "M.Tech", faculty_advisor_guide_name: null, department: "Electrical Engineering", phone: "+91 90000 00102", aadhar_number: null, father_name: null, father_aadhar_number: null, father_phone_number: null, mother_name: null, mother_aadhar_number: null, mother_phone_number: null, spouse_name: null, spouse_aadhar_number: null, spouse_phone_number: null, guardian_name: "Gopinath Nair", guardian_aadhar_number: null, guardian_phone_number: null, hostel: "Saveri", imported_by: null, created_at: seedTs, updated_at: seedTs },
    // The day scholar: `hostel` is null, which is the point of her - a student
  // with no hostel has no Assistant Warden, so her request goes straight to
  // the desk. Her **parents are named**, deliberately: `guestNameRule`
  // withholds Father and Mother entirely where the record names neither
  // (there would be no name to lock them to), so a row with null parents
  // would leave her unable to book for one - and the demo day scholar needs
  // to be able to.
  { id: "is-devika", email: "122203099@smail.iitpkd.ac.in", batch_year: "2022", roll_number: "122203099", full_name: "Devika Iyer", programme: "B.Tech", faculty_advisor_guide_name: null, department: "Mechanical Engineering", phone: "+91 90000 00103", aadhar_number: null, father_name: "Mohan Iyer", father_aadhar_number: null, father_phone_number: null, mother_name: "Latha Iyer", mother_aadhar_number: null, mother_phone_number: null, spouse_name: null, spouse_aadhar_number: null, spouse_phone_number: null, guardian_name: null, guardian_aadhar_number: null, guardian_phone_number: null, hostel: null, imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "is-meera", email: "112301045@smail.iitpkd.ac.in", batch_year: "2023", roll_number: "112301045", full_name: "Meera Nair", programme: "B.Tech", faculty_advisor_guide_name: null, department: "Computer Science and Engineering", phone: "+91 90000 00104", aadhar_number: null, father_name: null, father_aadhar_number: null, father_phone_number: null, mother_name: null, mother_aadhar_number: null, mother_phone_number: null, spouse_name: null, spouse_aadhar_number: null, spouse_phone_number: null, guardian_name: null, guardian_aadhar_number: null, guardian_phone_number: null, hostel: "Malhar", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

export const seedInstituteEmployees: InstituteEmployee[] = [
  { id: "ie-priya", email: "priya@iitpkd.ac.in", employee_id: "EMP001", full_name: "Dr. Priya Sharma", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Assistant Professor", phone: "9876543230", office_number: "A-201", gender: "Female", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-arun", email: "arun.prasad@iitpkd.ac.in", employee_id: "EMP002", full_name: "Dr. Arun Prasad", department: "Computer Science & Engineering", employee_type: "Teaching Staff", designation: "Associate Professor", phone: "9876543231", office_number: "A-202", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "ie-ravi", email: "ravi.k@iitpkd.ac.in", employee_id: "EMP010", full_name: "Ravi K.", department: "Computer Science & Engineering", employee_type: "Non Teaching Staff", designation: "Technical Staff", phone: "9876543240", office_number: "A-105", gender: "Male", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

export const seedInstituteOffices: InstituteOffice[] = [
  { id: "io-director", office_email: "admin@iitpkd.ac.in", office_name: "Director's Office", office_type: "officer", phone: "04923-226000", department_head: "Yes", head_name: "Director", head_email: "director@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "io-cse", office_email: "cse.office@iitpkd.ac.in", office_name: "CSE Department Office", office_type: "department", phone: "04923-226100", department_head: "Yes", head_name: "Prof. R. Venkatesh", head_email: "hod.cse@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

export const seedInstituteFCCs: InstituteFCC[] = [
  { id: "if-cultural", council_email: "sec_arts@iitpkd.ac.in", council_name: "Cultural Affairs Council", event_or_council: "Council", faculty_advisor_email: "arun.prasad@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "if-petrichor", council_email: "petrichor@iitpkd.ac.in", council_name: "Petrichor", event_or_council: "Fest", faculty_advisor_email: "arun.prasad@iitpkd.ac.in", imported_by: null, created_at: seedTs, updated_at: seedTs },
];

export const seedInstituteHostels: InstituteHostel[] = [
  { id: "ih-malhar", hostel_id: "HOS1", hostel_name: "Malhar", created_at: seedTs, updated_at: seedTs },
  { id: "ih-saveri", hostel_id: "HOS2", hostel_name: "Saveri", created_at: seedTs, updated_at: seedTs },
];

export const seedInstituteWardens: InstituteWarden[] = [
  { id: "iw-malhar", warden_email: "warden.malhar@iitpkd.ac.in", full_name: "Dr. Suresh Kumar", warden_phone: "9876543250", warden_role: "Asst Warden", hostel_id: "HOS1", imported_by: null, created_at: seedTs, updated_at: seedTs },
  { id: "iw-saveri", warden_email: "warden.saveri@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi", warden_phone: "9876543251", warden_role: "Asst Warden", hostel_id: "HOS2", imported_by: null, created_at: seedTs, updated_at: seedTs },
];
