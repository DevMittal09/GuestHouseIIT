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
  Profile,
  Room,
  RoomHold,
} from "@/lib/types";
import type { Unit } from "@/lib/units";
import type { Project } from "@/lib/projects";

export const GH_BAGESHRI = "gh-bageshri";
export const GH_HAMSANANDI = "gh-hamsanandi";

// Meals are served at Hamsanandi only, as in migration 8 and supabase/seed.sql.
export const seedGuestHouses: GuestHouse[] = [
  { id: GH_BAGESHRI, name: "Bageshri", total_rooms: 20, serves_meals: false },
  { id: GH_HAMSANANDI, name: "Hamsanandi", total_rooms: 16, serves_meals: true },
];

function makeRooms(ghId: string, prefix: string, doubles: number, singles: number): Room[] {
  const rooms: Room[] = [];
  for (let i = 1; i <= doubles; i++) {
    const n = `${prefix}-${100 + i}`;
    rooms.push({ id: `${ghId}-${n}`, guest_house_id: ghId, room_number: n, room_type: "double_sharing", is_active: true });
  }
  for (let i = 1; i <= singles; i++) {
    const n = `${prefix}-${200 + i}`;
    rooms.push({ id: `${ghId}-${n}`, guest_house_id: ghId, room_number: n, room_type: "single", is_active: true });
  }
  return rooms;
}

export const seedRooms: Room[] = [
  ...makeRooms(GH_BAGESHRI, "B", 10, 10),
  ...makeRooms(GH_HAMSANANDI, "H", 8, 8),
];

// `ldap_uid` is each persona's dummy LDAP username — the local part of the
// address, as in the institute directory. Passwords are in
// lib/ldap/mock-directory.ts and .memories/11-ldap-accounts.md.
export const seedProfiles: Profile[] = [
  // ----- Requesters -----
  { id: "student-anjali", email: "112201001@smail.iitpkd.ac.in", full_name: "Anjali Menon", role: "student", hostel_name: "Malhar", department_or_club: null, roll_number: "112201001", ldap_uid: "112201001" },
  { id: "student-rahul", email: "142202014@smail.iitpkd.ac.in", full_name: "Rahul Nair", role: "student", hostel_name: "Saveri", department_or_club: null, roll_number: "142202014", ldap_uid: "142202014" },
  // Faculty in CSE: her official bookings go to the CSE HOD first.
  { id: "employee-priya", email: "priya@iitpkd.ac.in", full_name: "Dr. Priya Sharma", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "priya", unit_id: "unit-cse", staff_category: "faculty" },
  // An officer office: its bookings are debited to the Institute Grant.
  { id: "official-admin", email: "admin@iitpkd.ac.in", full_name: "Director's Office", role: "official", hostel_name: null, department_or_club: "Administration", roll_number: null, ldap_uid: "admin", unit_id: "unit-director-office" },
  // Belongs to Petrichor, which sits under the Cultural Council, so its
  // requests go to the council secretary.
  { id: "club-petrichor", email: "petrichor@iitpkd.ac.in", full_name: "Petrichor Fest Council", role: "club", hostel_name: null, department_or_club: "Petrichor", roll_number: null, ldap_uid: "petrichor", unit_id: "unit-petrichor" },
  // No alumni persona: alumni have no institute login, so the IAR Office and
  // the IAR Student Cell raise those bookings for them (migration 9).
  { id: "iar-student-cell", email: "alumnicell@iitpkd.ac.in", full_name: "IAR Student Cell", role: "iar_student_cell", hostel_name: null, department_or_club: "International & Alumni Relations", roll_number: null, ldap_uid: "alumnicell" },
  // ----- Unit heads (migration 15) -----
  // Approvers by appointment rather than by role: the HOD is an employee, the
  // council secretary a student. Change who heads a unit in the console and
  // their queue moves with it.
  { id: "hod-cse", email: "hod.cse@iitpkd.ac.in", full_name: "Prof. R. Venkatesh (HOD, CSE)", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "hod.cse", unit_id: "unit-cse", staff_category: "faculty" },
  { id: "secretary-cultural", email: "112301045@smail.iitpkd.ac.in", full_name: "Meera Nair (Cultural Secretary)", role: "student", hostel_name: "Malhar", department_or_club: null, roll_number: "112301045", ldap_uid: "112301045" },
  // ----- Reviewers / Admins -----
  { id: "warden-malhar", email: "warden.malhar@iitpkd.ac.in", full_name: "Dr. Suresh Kumar (Assistant Warden, Malhar)", role: "warden", hostel_name: "Malhar", department_or_club: null, roll_number: null, ldap_uid: "warden.malhar" },
  { id: "warden-saveri", email: "warden.saveri@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi (Assistant Warden, Saveri)", role: "warden", hostel_name: "Saveri", department_or_club: null, roll_number: null, ldap_uid: "warden.saveri" },
  { id: "fa-petrichor", email: "fa.petrichor@iitpkd.ac.in", full_name: "Dr. Arun Prasad (FA, Petrichor)", role: "faculty_advisor", hostel_name: null, department_or_club: "Petrichor", roll_number: null, ldap_uid: "fa.petrichor" },
  // A department office (Phase 4): its official bookings go Direct or to
  // the CSE HOD, as the office chooses, and are debited to the Department.
  { id: "office-cse", email: "cse.office@iitpkd.ac.in", full_name: "CSE Department Office", role: "official", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "cse.office", unit_id: "unit-cse-office" },
  // Non-teaching staff in CSE: official bookings go to the HOD too, and are
  // debited to the Department only.
  { id: "staff-ravi", email: "ravi.k@iitpkd.ac.in", full_name: "Ravi K. (Technical Staff, CSE)", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "ravi.k", unit_id: "unit-cse", staff_category: "staff" },
  { id: "iar-cell", email: "iar@iitpkd.ac.in", full_name: "IAR Office", role: "iar_cell", hostel_name: null, department_or_club: "International & Alumni Relations", roll_number: null, ldap_uid: "iar", unit_id: "unit-iar-office" },
  { id: "gh-manager", email: "guesthouse@iitpkd.ac.in", full_name: "Guest House Manager", role: "gh_manager", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "guesthouse" },
  { id: "gh-caretaker", email: "gh.reception@iitpkd.ac.in", full_name: "Guest House Caretaker", role: "gh_caretaker", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "gh.reception" },
  { id: "developer", email: "developer@iitpkd.ac.in", full_name: "Portal Developer", role: "developer", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "developer" },
];

/**
 * The demo units. A department with an HOD, and a club under a council whose
 * secretary approves for it: the two ways approval by appointment works.
 */
export const seedUnits: Unit[] = [
  { id: "unit-cse", name: "Computer Science & Engineering", kind: "department", parent_id: null, head_id: "hod-cse", acting_head_id: null, office_class: null },
  { id: "unit-cultural", name: "Cultural Council", kind: "council", parent_id: null, head_id: "secretary-cultural", acting_head_id: null, office_class: null },
  // No head of its own: the council secretary approves.
  { id: "unit-petrichor", name: "Petrichor", kind: "club", parent_id: "unit-cultural", head_id: null, acting_head_id: null, office_class: null },
  // Officer offices (migration 16): booked against the Institute Grant.
  { id: "unit-director-office", name: "Director's Office", kind: "office", parent_id: null, head_id: null, acting_head_id: null, office_class: "officer" },
  { id: "unit-iar-office", name: "International & Alumni Relations", kind: "office", parent_id: null, head_id: null, acting_head_id: null, office_class: "officer" },
  // A department office under CSE: "Requires HOD approval" goes to the CSE HOD.
  { id: "unit-cse-office", name: "CSE Department Office", kind: "office", parent_id: "unit-cse", head_id: null, acting_head_id: null, office_class: "department" },
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

export const seedTariffs: Tariff[] = [
  tariff("tariff-bageshri-room", GH_BAGESHRI, "room", 750, {}, "Tariff sheet: Bageshri, per room per day"),
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
 * The demo bookings, written without the fields migration 11 added — they are
 * the same on almost every row, so `withDefaults` below fills them in rather
 * than repeating them nine times. A row that differs says so explicitly.
 */
type DemoBooking = Omit<
  Booking,
  | "service_type"
  | "meal_preference"
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
    assigned_room_ids: [`${GH_BAGESHRI}-B-201`, `${GH_BAGESHRI}-B-202`],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: iso(-5, 10),
    updated_at: iso(-4, 16),
  },
  // Meals without a room: a department hosting an examiner for the day. It
  // holds no rooms and no guest rows — the kitchen needs a head count — and
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
    meal_preference: "veg",
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

/** Only the Hamsanandi bookings have meals — Bageshri serves none. */
const DEMO_MEALS: Record<string, (b: Booking) => MealPlan> = {
  // Visiting artists: every meal served during the stay.
  "bk-demo-2": (b) => demoMeals(b, () => true),
  // A collaborator: breakfast every morning, dinner on the day they arrive.
  "bk-demo-4": (b) =>
    demoMeals(b, (meal, day) => meal === "breakfast" || (meal === "dinner" && day === 0)),
  // The meals-only booking: one lunch, which is the whole booking.
  "bk-demo-6": (b) => demoMeals(b, (meal) => meal === "lunch"),
};

/** Veg unless the stay says otherwise — the kitchen's usual default. */
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
  { id: "br-1", booking_id: "bk-demo-1", room_index: 1, room_type: "double_sharing", assigned_room_id: null },
  { id: "br-2", booking_id: "bk-demo-2", room_index: 1, room_type: "single", assigned_room_id: null },
  { id: "br-3", booking_id: "bk-demo-2", room_index: 2, room_type: "single", assigned_room_id: null },
  { id: "br-4", booking_id: "bk-demo-3", room_index: 1, room_type: "single", assigned_room_id: null },
  { id: "br-5", booking_id: "bk-demo-4", room_index: 1, room_type: "double_sharing", assigned_room_id: null },
  { id: "br-6", booking_id: "bk-demo-5", room_index: 1, room_type: "single", assigned_room_id: `${GH_BAGESHRI}-B-201` },
  { id: "br-7", booking_id: "bk-demo-5", room_index: 2, room_type: "single", assigned_room_id: `${GH_BAGESHRI}-B-202` },
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
 * only one holding rooms — the others are still awaiting approval and reserve
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
  { id: "l-6", booking_id: "bk-demo-5", action_by: "gh-manager", action_by_name: "Guest House Manager", previous_status: "PENDING_GH_MANAGER", new_status: "APPROVED", remarks: "Rooms B-201, B-202 allocated", timestamp: iso(-4, 16) },
];
