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

// `ldap_uid` is each persona's dummy LDAP username - the local part of the
// address, as in the institute directory. Passwords are in
// lib/ldap/mock-directory.ts and .memories/05-credentials-and-security.md.
// `password_hash` is a pre-computed scrypt hash of each persona's password,
// so the email+password sign-in works out of the box in development.
export const seedProfiles: Profile[] = [
  // ----- Requesters -----
  { id: "student-anjali", email: "112201001@smail.iitpkd.ac.in", full_name: "Anjali Menon", role: "student", hostel_name: "Malhar", department_or_club: null, roll_number: "112201001", ldap_uid: "112201001", password_hash: "f1cb701751db82af4445c63677f6406d:2a9973e4ea9e1c635cdb6a69fa14b78a655aba67bc610d9ad1af981d1d3b1b513ee62c86f49d7cf3eabdf484352cc9cf1abd744c431ffd3a925b62cc6caeacec" },
  { id: "student-rahul", email: "142202014@smail.iitpkd.ac.in", full_name: "Rahul Nair", role: "student", hostel_name: "Saveri", department_or_club: null, roll_number: "142202014", ldap_uid: "142202014", password_hash: "b61fb20ab6aab5973d9384ba7c98dc7e:e5ce4ca41daa40c80256855cd723f90ebb910559363ba8ff367e052c73fce4b483bf5dbc6771b4247d699703e732edc260f57ebb412d1986782a29ec5e6fd7ed" },
  /**
   * A day scholar: `hostel_name` is **genuinely null**, which is what makes
   * this persona the test of the 17 Oct 2026 rule - a student with no hostel
   * has no Assistant Warden, so their request enters at the Guest House
   * Manager (`approverNotApplicable`). Named so the condition is visible in
   * every queue and list it appears in; the booking's own log says why it
   * skipped the warden.
   */
  { id: "student-day-scholar", email: "122203099@smail.iitpkd.ac.in", full_name: "Devika Iyer (day scholar - no hostel)", role: "student", hostel_name: null, department_or_club: null, roll_number: "122203099", ldap_uid: "122203099", password_hash: "b5754f4e78bb3cb7c9acb2b9e5d0d985:98323afd6ddb76fa5614c29e3cde61d0600320203176f772917277af58f7525e1508bdd034c9b51ee50062cc174c7f632900beaf3b9198cca201d9249d0687b0" },
  { id: "employee-priya", email: "priya@iitpkd.ac.in", full_name: "Dr. Priya Sharma", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "priya", unit_id: "unit-cse", staff_category: "faculty", password_hash: "93a5cb619e7a40442f41645f79390871:857e12cfc5db2600fc9199f5d90790984de2c017d5a9c1ac8947db541590e6d58f7c627d33aea0518d0299c1b8a6323a82a126790c61b3a0959be35eca310df7" },
  { id: "official-admin", email: "admin@iitpkd.ac.in", full_name: "Director's Office", role: "official", hostel_name: null, department_or_club: "Administration", roll_number: null, ldap_uid: "admin", unit_id: "unit-director-office", password_hash: "f6d23983b2c744827683bc51a4fbefa4:28a82b08c7f70ef90bafb57f791efa97a6c8f051b500efb72b93ed0f81ff4abb4cd5c42d6e7058272ad105037b4d404afa8a2c63f455304ae0b5fe32bb491787" },
  { id: "club-petrichor", email: "petrichor@iitpkd.ac.in", full_name: "Petrichor Fest Council", role: "club", hostel_name: null, department_or_club: "Petrichor", roll_number: null, ldap_uid: "petrichor", unit_id: "unit-petrichor", password_hash: "b81b6055ba585fc2a49621d221e62051:4f2b238212723ba19706e37b4edfd9c523a30796dd43569f29bcd297e500d6ba457d443f59c2f33bae41583ad02f08ee9c72533715f801fa7e6bf7310051458b" },
  { id: "council-cultural", email: "sec_arts@iitpkd.ac.in", full_name: "Cultural Affairs Council", role: "club", hostel_name: null, department_or_club: "Cultural Affairs", roll_number: null, ldap_uid: "sec_arts", unit_id: "unit-cultural", password_hash: "c1da2f119deeb0d7b7d3248c4a8f9354:34c33597737c852dbeffa103e85e3f7247354ecd6858ab6400015cee96c9d3c817885b3b7266204608e0caf84a26e431635c454df25c2a5863a19b989c95c4db" },
  { id: "iar-student-cell", email: "alumnicell@iitpkd.ac.in", full_name: "IAR Student Cell", role: "iar_student_cell", hostel_name: null, department_or_club: "International & Alumni Relations", roll_number: null, ldap_uid: "alumnicell", password_hash: "6f3bad73241791a2a270073c51863d27:61efe77695cc944c59fefeca4c5911005b66633cc94cc35c7a6c6c4a18f73d0242635fa0cd5c1cc1f969ec54e9c4d279e0f28447f8aeae0d7622ffbb38470f38" },
  // ----- Unit heads (migration 15) -----
  // Approvers by appointment rather than by role: the HOD is an employee, the
  // council secretary a student. Change who heads a unit in the console and
  // their queue moves with it.
  // Faculty in CSE, and Faculty Advisor of the Cultural Affairs Council and
  // of Petrichor - an appointment in Departments & Clubs, not an account of
  // its own, so New Booking offers him "Book as Faculty Advisor" beside his
  // own bookings, and naming someone else there moves it to them.
  { id: "faculty-arun", email: "arun.prasad@iitpkd.ac.in", full_name: "Dr. Arun Prasad", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "arun.prasad", unit_id: "unit-cse", staff_category: "faculty", password_hash: "d14ef55b046be291f52f0d6c393af423:2e1b2c801c331c29748cdb76b8fb9fa6ab8c78c915bb88619fadef1fc7318f6cb77c6b50813fc7d30cf6f1a7e874d3d032d473128b2873c8e862dc3e66e459b7" },
  { id: "hod-cse", email: "hod.cse@iitpkd.ac.in", full_name: "Prof. R. Venkatesh (HOD, CSE)", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "hod.cse", unit_id: "unit-cse", staff_category: "faculty", password_hash: "39e0c3160d746a4420ac176fe3a33bdd:a140b2decce6efa36bb1f1fc238e30850d04d3c8c4ad84de7f8b4991c596a8cbc6708d65a213b94633148bad68d0d8bc868c9ac120cb3b1252cc952e58df5be7" },
  { id: "secretary-cultural", email: "112301045@smail.iitpkd.ac.in", full_name: "Meera Nair (Cultural Secretary)", role: "student", hostel_name: "Malhar", department_or_club: null, roll_number: "112301045", ldap_uid: "112301045", password_hash: "fe27b3ab0f365923476e2ccc7a1d93c6:128542b56fda7755150ed2d36cd96bac48a1e5671702b2a9d563fabf7cd840f25fcc584a95d948457036982ec8341b219fbf9b11f704efdb26b408eb830fab96" },
  // ----- Reviewers / Admins -----
  { id: "warden-malhar", email: "warden.malhar@iitpkd.ac.in", full_name: "Dr. Suresh Kumar (Assistant Warden, Malhar)", role: "warden", hostel_name: "Malhar", department_or_club: null, roll_number: null, ldap_uid: "warden.malhar", password_hash: "f4e0ce15b1fe7e145b4c9f1d3f4dbdac:62153839363a3c608fddf6fc4121616a1d84e1d4f64b7a6c8987819f1218f241657d9ed3ffb082b42e7ce0692ee674bd961239ac0fc59698828b3ba500ded8ff" },
  { id: "warden-saveri", email: "warden.saveri@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi (Assistant Warden, Saveri)", role: "warden", hostel_name: "Saveri", department_or_club: null, roll_number: null, ldap_uid: "warden.saveri", password_hash: "d3475d1cbb929892b32817e388324488:d73592e4c98ba3a36f1eceeb1319e849d5a1113a00d307fa8d51d3966ba7a8b690a889cb498383fe2fddd4c926051e82411a22fbce83af5697fc96268e893ed0" },
  { id: "office-cse", email: "cse.office@iitpkd.ac.in", full_name: "CSE Department Office", role: "official", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "cse.office", unit_id: "unit-cse-office", password_hash: "e5211e3b8cb33bd9732653d1551093cb:9b3eb09bbbbb57e62a94c04f85e148fc4999b76bf13697ab97592853b7a44a865531589c23cc53182e7ffa5130e43c0c33ceffccd1bb0d4fcca67b1f847ee09a" },
  { id: "staff-ravi", email: "ravi.k@iitpkd.ac.in", full_name: "Ravi K. (Technical Staff, CSE)", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null, ldap_uid: "ravi.k", unit_id: "unit-cse", staff_category: "staff", password_hash: "905d262bd204d2b62d37b0a9d255396d:bfbcfc04a182c104582637b18f0452eacf4b26de80800e3ea9fb603a7783a8df41696c9c4afe531bb4005fa9188bc6676d1023d4cb7e739696a173c182f1c223" },
  { id: "iar-cell", email: "iar@iitpkd.ac.in", full_name: "IAR Office", role: "iar_cell", hostel_name: null, department_or_club: "International & Alumni Relations", roll_number: null, ldap_uid: "iar", unit_id: "unit-iar-office", password_hash: "6e4fcfc7c4a1d2c4fcbee7a0691b47d0:084190b6ee96f50b142c4fe1cadc376a34b912fc3c99dff33cd19a3a3cb1a2462b6cf7e8525284080c1bb216cce79261f0c47e517ffb6f11d7a4586103bc5375" },
  { id: "gh-manager", email: "guesthouse@iitpkd.ac.in", full_name: "Guest House Manager", role: "gh_manager", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "guesthouse", password_hash: "9cebc84de7db94a347aa96df00d3a00b:6b8209d6f76dda193fd8e8c27154ae6d2690b0f7fe61ccd22bb24037324ae34f4e9f755f45d2d540e4174372de2a2fb3a1028464c73926ec82d7cd73e4d04002" },
  { id: "gh-caretaker", email: "gh.reception@iitpkd.ac.in", full_name: "Guest House Caretaker", role: "gh_caretaker", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "gh.reception", password_hash: "97faeea7471eebaf0a69e03c284f4617:e1ddd860448350e7bf254a008e661501cf868845ded7dd1b8ad13e456117f104a12f9a41d8207b92129e9d3a4f224680923ec9ec0bb7dc08c042b5e7669ff2a5" },
  { id: "developer", email: "developer@iitpkd.ac.in", full_name: "Portal Developer", role: "developer", hostel_name: null, department_or_club: null, roll_number: null, ldap_uid: "developer", password_hash: "7daa8fdc2cb3c1dd4755618707e350f6:81a644aa7479374d204219220651a595985107f9e91588c0be0535ca9e32598877aed5724aae51032e7269ad22cbfb6f95d8ce57ed30f5f1bf551e45cf6a6008" },
];

/**
 * The demo units. A department with an HOD, and a council with its Faculty
 * Advisor, its secretary and a fest under it - the student bodies' hierarchy
 * (migration 25).
 */
export const seedUnits: Unit[] = [
  { id: "unit-cse", name: "Computer Science & Engineering", kind: "department", parent_id: null, head_id: "hod-cse", acting_head_id: null, office_class: null },
  // Its head is the student secretary (who approved club requests stored
  // before 24 Sep 2026); its Faculty Advisor books for it and its clubs, and
  // its secretary's mailbox is copied on those bookings.
  { id: "unit-cultural", name: "Cultural Affairs Council", kind: "council", parent_id: null, head_id: "secretary-cultural", acting_head_id: null, office_class: null, faculty_advisor_id: "faculty-arun", secretary_email: "sec_arts@iitpkd.ac.in" },
  // The fest has a Faculty Advisor of its own; with no secretary's mailbox of
  // its own, its bookings copy the council's.
  { id: "unit-petrichor", name: "Petrichor", kind: "club", parent_id: "unit-cultural", head_id: null, acting_head_id: null, office_class: null, faculty_advisor_id: "faculty-arun", secretary_email: null },
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
  { id: "br-6", booking_id: "bk-demo-5", room_index: 1, room_type: null, assigned_room_id: `${GH_BAGESHRI}-201` },
  { id: "br-7", booking_id: "bk-demo-5", room_index: 2, room_type: null, assigned_room_id: `${GH_BAGESHRI}-202` },
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
