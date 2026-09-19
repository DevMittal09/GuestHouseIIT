export type Role =
  | "student"
  | "employee"
  | "official"
  | "club"
  /**
   * Legacy. Alumni have no institute login, so they can no longer sign in or
   * submit anything themselves — the IAR Office and the IAR Student Cell book
   * on their behalf (`booking_type: "alumni"`). The role is kept because
   * bookings made before that change still carry it.
   */
  | "alumni"
  | "warden"
  | "faculty_advisor"
  /** The IAR Office: approves IAR Student Cell requests, and books directly. */
  | "iar_cell"
  /** The IAR Student Cell: books for its office or for an alumnus, via the IAR Office. */
  | "iar_student_cell"
  | "gh_manager"
  /** Guest house reception: a subset of the manager's console. */
  | "gh_caretaker"
  | "developer";

export type BookingStatus =
  | "PENDING_WARDEN"
  | "PENDING_FA"
  | "PENDING_IAR"
  | "PENDING_GH_MANAGER"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "OCCUPIED"
  | "VACATED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLATION_APPROVED";

export type RoomType = "single" | "double_sharing";
export type Gender = "male" | "female" | "other";

/**
 * Why the stay is being booked, chosen at the top of the booking form.
 *
 * This is a property of the *request*, not of the requester: the same member
 * of staff books officially for a visiting collaborator one week and privately
 * for their own family the next, and the two are billed and approved
 * differently. Roles that only ever book one way (a club, a dignitary's
 * office) are not asked — see `bookingTypesFor` in `lib/booking-types.ts`.
 *
 * `alumni` means "on behalf of an alumnus", who has no login of their own; it
 * carries the alumnus's name, student id and ID card on the booking.
 */
export type BookingType = "official" | "personal" | "alumni";

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  official: "Official",
  personal: "Personal",
  alumni: "On behalf of an alumnus",
};

/** Meals the guest house can lay on for a booking. See `lib/meals.ts`. */
export type MealKey = "breakfast" | "lunch" | "dinner";
export type MealPreferences = Record<MealKey, boolean>;
/** The meals asked for on one institute calendar day ("yyyy-MM-dd") of a stay. */
export type MealDay = { date: string } & MealPreferences;
/**
 * Meals for a stay, day by day: one entry per day that has at least one meal,
 * in date order. Read it only through `normalizeMeals` (`lib/meals.ts`).
 */
export type MealPlan = MealDay[];

/**
 * Roles that can sign in and submit a booking today.
 *
 * `alumni` is deliberately absent: alumni have no institute login, so nobody
 * signs in as one any more. The IAR Office (`iar_cell`) and the IAR Student
 * Cell book for them instead. Both of those also submit bookings for their own
 * office, which is why a reviewer role appears in this list — `iar_cell`
 * reviews the Student Cell's requests *and* raises its own.
 */
export const REQUESTER_ROLES: Role[] = [
  "student",
  "employee",
  "official",
  "club",
  "iar_cell",
  "iar_student_cell",
];

/**
 * Requester roles that exist only on stored bookings. They are not offered
 * anywhere a new booking is made, but the archive still has to name and filter
 * them, so history and reports read from `BOOKING_CATEGORY_ROLES` below.
 */
export const ARCHIVED_REQUESTER_ROLES: Role[] = ["alumni"];

/** Every role a stored booking's `user_role` can be — current or retired. */
export const BOOKING_CATEGORY_ROLES: Role[] = [
  ...REQUESTER_ROLES,
  ...ARCHIVED_REQUESTER_ROLES,
];

export const REVIEWER_ROLES: Role[] = [
  "warden",
  "faculty_advisor",
  "iar_cell",
  "gh_manager",
  "gh_caretaker",
];

export const STUDENT_RELATIONSHIPS = [
  "Mother",
  "Father",
  "Grandmother",
  "Grandfather",
  "Siblings",
] as const;

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  hostel_name: string | null;
  department_or_club: string | null;
  roll_number: string | null;
  /**
   * The person's institute LDAP username (migration 11) — what the LDAP
   * sign-in form matches against. `null` means they cannot sign in with LDAP
   * until a developer sets it. Unique, compared lowercased.
   */
  ldap_uid: string | null;
}

export type GuestHouse = {
  id: string;
  name: string;
  total_rooms: number;
  /**
   * Whether requesters may choose meals here (migration 8). Hamsanandi only by
   * default; changed from the developer console, never inferred from the name.
   */
  serves_meals: boolean;
}

export type Room = {
  id: string;
  guest_house_id: string;
  room_number: string;
  room_type: RoomType;
  is_active: boolean;
}

export type Booking = {
  id: string;
  booking_reference_id: string;
  user_id: string;
  guest_house_id: string;
  user_role: Role;
  status: BookingStatus;
  purpose_of_visit: string;
  check_in: string; // ISO datetime
  check_out: string; // ISO datetime
  rooms_requested: number;
  /**
   * Derived from `room_holds` on read — there is no such column. Holds are the
   * source of truth for which rooms a booking occupies; see
   * `supabase/migrations/00000000000003_room_holds_and_infants.sql`.
   */
  assigned_room_ids: string[];
  rejection_reason: string | null;
  /**
   * Why the stay was booked. Drives the approval route and, for `alumni`, the
   * three fields below. Bookings made before migration 9 are backfilled from
   * `user_role`, so this is never null downstream.
   */
  booking_type: BookingType;
  /** The alumnus this stay is for — only on `booking_type: "alumni"`. */
  alumni_name: string | null;
  /** That alumnus's student / roll number, for the IAR Office to verify against. */
  alumni_roll_number: string | null;
  alumni_id_url: string | null;
  custom_fields: CustomFieldValue[] | null;
  /**
   * The meals the requester asked for, per day of the stay. Always a clean
   * plan — bookings predating the field, and the old whole-stay object, are
   * normalised on read, so no consumer needs a null check.
   */
  meals: MealPlan;
  /**
   * Whether one or more infants (under `INFANT_AGE_LIMIT`) are coming. One
   * yes/no for the booking however many: they share a guardian's bed and need
   * no ID, so they are not guest rows. Added by migration 7.
   */
  has_infant: boolean;
  created_at: string;
  updated_at: string;
}

/** Snapshot of an admin-defined custom form field's value at submission time. */
export type CustomFieldValue = {
  id: string;
  label: string;
  type: string;
  value: string | number | boolean;
}

export type BookingGuest = {
  id: string;
  booking_id: string;
  name: string;
  age: number | null;
  gender: Gender;
  relationship: string | null;
  id_number: string | null;
  id_document_url: string | null;
  /**
   * Legacy. Before migration 7 an infant was a guest row carrying this flag;
   * new bookings record infants as `Booking.has_infant` and always write false
   * here. Old infant rows still share a guardian's bed, so `countBedGuests`
   * keeps them out of capacity.
   */
  is_infant: boolean;
}

export type BookingLog = {
  id: string;
  booking_id: string;
  action_by: string | null;
  action_by_name: string;
  previous_status: BookingStatus | null;
  new_status: BookingStatus;
  remarks: string | null;
  timestamp: string;
}

export type BookingWithDetails = Booking & {
  requester: Profile;
  guest_house: GuestHouse;
  guests: BookingGuest[];
  logs: BookingLog[];
  assigned_rooms: Room[];
}

/**
 * One room held by one booking over a period, for the public availability
 * grid. `requester_name` and `purpose_of_visit` are filled by the store but
 * stripped for viewers who may not see who booked — see
 * `app/actions/availability.ts`.
 */
export type RoomOccupancySegment = {
  room_id: string;
  booking_id: string;
  booking_reference_id: string;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  requester_name: string | null;
  purpose_of_visit: string | null;
}

export interface BookingFilter {
  status?: BookingStatus;
  guestHouseId?: string;
  hostelName?: string;
  club?: string;
  userRole?: Role;
}

export interface NewBookingInput {
  user_id: string;
  guest_house_id: string;
  user_role: Role;
  status: BookingStatus;
  purpose_of_visit: string;
  check_in: string;
  check_out: string;
  rooms_requested: number;
  booking_type: BookingType;
  alumni_name: string | null;
  alumni_roll_number: string | null;
  alumni_id_url: string | null;
  custom_fields: CustomFieldValue[] | null;
  meals: MealPlan;
  has_infant: boolean;
  guests: Omit<BookingGuest, "id" | "booking_id">[];
}

/**
 * One room held by one booking for a period. The database enforces that two
 * holds on the same room cannot overlap, which is what makes double-booking
 * unrepresentable rather than merely unlikely.
 */
export type RoomHold = {
  booking_id: string;
  room_id: string;
  check_in: string;
  check_out: string;
}

/** Raised when a hold collides with one written by someone else. */
export class RoomClashError extends Error {
  constructor(message = "Those rooms were just taken for these dates — refresh the grid") {
    super(message);
    this.name = "RoomClashError";
  }
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_WARDEN: "Pending Warden Review",
  PENDING_FA: "Pending Faculty Advisor Review",
  PENDING_IAR: "Pending IAR Cell Review",
  PENDING_GH_MANAGER: "Pending GH Manager",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  OCCUPIED: "Occupied",
  VACATED: "Vacated",
  CANCELLATION_REQUESTED: "Cancellation Requested",
  CANCELLATION_APPROVED: "Cancellation Approved",
};

export const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  employee: "Employee (Faculty & Staff)",
  official: "Official / Dignitary",
  club: "Club / Fest Council",
  // Named as retired so an old booking in the archive is not mistaken for a
  // category anyone can still submit under.
  alumni: "Alumni (via IAR, legacy)",
  warden: "Hostel Warden",
  faculty_advisor: "Faculty Advisor",
  iar_cell: "IAR Office",
  iar_student_cell: "IAR Student Cell",
  gh_manager: "Guest House Manager",
  gh_caretaker: "Guest House Caretaker",
  developer: "Developer (Superadmin)",
};
