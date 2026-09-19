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
 * A guest's citizenship, asked per guest because one room can hold an Indian
 * host and a foreign collaborator. "other" makes nationality and passport
 * number mandatory — the register the guest house keeps for foreign nationals
 * needs both, and nothing else on the form supplies them.
 */
export type Citizenship = "indian" | "other";

export const CITIZENSHIP_LABELS: Record<Citizenship, string> = {
  indian: "Indian",
  other: "Other",
};

/**
 * What is actually being booked.
 *
 * Distinct from `BookingType`, which says *why* the stay was booked. A stay
 * can be official and room-only, or personal with meals; the two answer
 * different questions and are approved differently — `meals_only` skips the
 * room approval chain entirely.
 */
export type ServiceType = "room" | "room_meals" | "meals_only";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  room: "Room booking",
  room_meals: "Room + Meals",
  meals_only: "Meals only",
};

/** Whether a service type needs rooms at all. */
export function needsRooms(service: ServiceType): boolean {
  return service !== "meals_only";
}

/** Whether a service type includes meals. */
export function includesMeals(service: ServiceType): boolean {
  return service !== "room";
}

/** Kitchen preference for the whole booking. */
export type MealPreference = "veg" | "non_veg";

export const MEAL_PREFERENCE_LABELS: Record<MealPreference, string> = {
  veg: "Vegetarian",
  non_veg: "Non-Vegetarian",
};

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
   * The person's institute LDAP username (migration 12) — what the LDAP
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
  /** Always equal to the number of `booking_rooms` rows. Zero on a meals-only booking. */
  rooms_requested: number;
  /**
   * Derived from `room_holds` on read — there is no such column. Holds are the
   * source of truth for which rooms a booking occupies; see
   * `supabase/migrations/00000000000003_room_holds_and_infants.sql`.
   */
  assigned_room_ids: string[];
  rejection_reason: string | null;
  /**
   * What is being booked: a room, a room with meals, or meals alone. Rows
   * predating migration 11 are backfilled from whether they had meals, so
   * this is never null downstream.
   */
  service_type: ServiceType;
  /**
   * The kitchen's veg / non-veg preference for the party, null when no meals
   * were asked for. One answer for the booking: the kitchen cooks to a head
   * count per type, not per person.
   */
  meal_preference: MealPreference | null;
  /**
   * Head count for a meals-only booking, which has no rooms and no guest
   * rows — the kitchen wants a number, not a register. Null on every other
   * kind of booking, where the guest rows are the count.
   */
  meal_guest_count: number | null;
  /**
   * Whether the requester acknowledged that pets are not allowed. Always true
   * on a booking made after migration 11 — the schema refuses the submission
   * otherwise. Bookings made before it are false, meaning "never asked".
   */
  pets_policy_acknowledged: boolean;
  pets_policy_acknowledged_at: string | null;
  /**
   * Whether any guest on the booking is a foreign national. Derived from the
   * guest rows on write, and kept as a column so the desk can find those
   * bookings without opening each one — the guest house has to report them.
   */
  has_foreign_national: boolean;
  /**
   * Who actually submitted the booking, when that is not the requester — the
   * Guest House Manager booking on someone's behalf. Null on a booking the
   * requester raised themselves.
   */
  created_by: string | null;
  /**
   * The person the manager booked for when they have no portal account. The
   * booking still hangs off the manager's `user_id` for referential integrity;
   * these name the guest the stay is actually for.
   */
  on_behalf_of_name: string | null;
  on_behalf_of_email: string | null;
  on_behalf_of_phone: string | null;
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
   * Whether any infant is on the booking. Derived from the guest rows on
   * write and kept as a column so a list of bookings can show it without
   * loading every guest. Migration 7 made this the *only* record of an
   * infant; migration 11 gave infants their rows back, so it now summarises
   * them.
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

/**
 * One room card on the booking form — "Room 1", "Room 2" — and, once the
 * manager has allocated, the physical room it maps to.
 *
 * Guests are entered inside a card rather than in one flat list, because the
 * occupancy rule is per room (`ROOM_OCCUPANCY_NOTICE`) and a flat list cannot
 * say who is sharing with whom. Added by migration 11; bookings made before it
 * were migrated into a single card holding all their guests.
 */
export type BookingRoom = {
  id: string;
  booking_id: string;
  /** 1-based position, which is the "Room N" the requester filled in. */
  room_index: number;
  /** The requester's preference, or null when they had none. */
  room_type: RoomType | null;
  /**
   * The physical room the manager gave this card. `room_holds` remains the
   * authority on *whether* a room is held and for when — this only records
   * which card it was held for, so the desk knows which party is in which room.
   */
  assigned_room_id: string | null;
}

export type BookingRoomWithGuests = BookingRoom & {
  guests: BookingGuest[];
  assigned_room: Room | null;
}

export type BookingGuest = {
  id: string;
  booking_id: string;
  /**
   * The room card this guest was entered in. Null only on a booking written
   * before migration 11 whose backfill has not run.
   */
  booking_room_id: string | null;
  name: string;
  age: number | null;
  gender: Gender;
  relationship: string | null;
  id_number: string | null;
  id_document_url: string | null;
  /**
   * Derived from `age` on write (`isInfantAge`), never asked for directly.
   * Stored rather than generated because the threshold has already changed
   * once — re-deriving would reclassify guests whose stay was agreed under
   * the old rule. Infants share a guardian's bed and are kept out of capacity
   * by `countBedGuests`.
   */
  is_infant: boolean;
  /** Asked per guest: one room can mix Indian and foreign nationals. */
  citizenship: Citizenship;
  /** ISO 3166-1 alpha-2 code. Required when `citizenship` is "other", else null. */
  nationality: string | null;
  /** Required when `citizenship` is "other", else null. Stored uppercase. */
  passport_number: string | null;
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
  /**
   * Every guest on the booking, flat and in room order. Kept alongside `rooms`
   * because most readers — the register, the search index, the exports — want
   * the whole party and do not care who shares with whom.
   */
  guests: BookingGuest[];
  /** The room cards, in `room_index` order, each with its own guests. */
  rooms: BookingRoomWithGuests[];
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

/** A guest as submitted, before the store gives it an id and a room. */
export type NewBookingGuestInput = Omit<BookingGuest, "id" | "booking_id" | "booking_room_id">;

/** One room card as submitted, with the guests entered inside it. */
export interface NewBookingRoomInput {
  room_type: RoomType | null;
  guests: NewBookingGuestInput[];
}

export interface NewBookingInput {
  user_id: string;
  guest_house_id: string;
  user_role: Role;
  status: BookingStatus;
  purpose_of_visit: string;
  check_in: string;
  check_out: string;
  booking_type: BookingType;
  service_type: ServiceType;
  meal_preference: MealPreference | null;
  /** Only on a meals-only booking, which has no guest rows to count. */
  meal_guest_count: number | null;
  pets_policy_acknowledged: boolean;
  alumni_name: string | null;
  alumni_roll_number: string | null;
  alumni_id_url: string | null;
  custom_fields: CustomFieldValue[] | null;
  meals: MealPlan;
  /**
   * The room cards and their guests. `rooms_requested`, `has_infant` and
   * `has_foreign_national` are all derived from this by the store, so a
   * caller cannot store a count that disagrees with the rows. Empty on a
   * meals-only booking.
   */
  rooms: NewBookingRoomInput[];
  /**
   * What the booking's first log entry says, when "Booking submitted" is not
   * the whole truth — a manager overriding a policy, for instance. The
   * override has to be in the audit trail from the moment the booking exists,
   * not added afterwards as a status change that never happened.
   */
  submission_remarks?: string | null;
  /** Set only when someone booked on another person's behalf. */
  created_by?: string | null;
  on_behalf_of_name?: string | null;
  on_behalf_of_email?: string | null;
  on_behalf_of_phone?: string | null;
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
