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
  /** A faculty member's official booking, awaiting their HOD (migration 15). */
  | "PENDING_HOD"
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
  // A student whose parents have both died, or are abroad and cannot travel,
  // is accompanied by the guardian the institute already holds on record (the
  // academic database's `guardian_name`). The guardian stands in for a parent
  // in the relationship dependency too — see `STUDENT_PARENT_RELATIONSHIPS` —
  // so siblings and grandparents are not locked out of a booking that no
  // parent can ever be on.
  "Guardian",
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
  /**
   * The department, club or office this person belongs to (migration 15). It
   * is what their approver is found through — see `lib/units.ts`. Optional
   * because profiles written before migration 15 have none.
   */
  unit_id?: string | null;
  /**
   * Faculty or non-teaching staff, for employees only. Both need their
   * HOD's approval for an official booking (Phase 4); the category decides
   * the debitable heads offered (faculty: Department / Project / PDF; staff:
   * Department).
   */
  staff_category?: StaffCategory | null;
}

export type StaffCategory = "faculty" | "staff";

export const STAFF_CATEGORY_LABELS: Record<StaffCategory, string> = {
  faculty: "Faculty",
  staff: "Non-teaching staff",
};

/**
 * Where the money for a stay comes from.
 *
 * Recorded on every booking so the accounts section knows which budget to
 * debit. A student's booking is always `personal_funds` — the guest settles
 * at checkout; everyone else chooses one of these when it is made.
 */
export type DebitHead =
  | "institute_grant"
  | "professional_development_fund"
  | "project_grant"
  | "department_budget"
  | "special_budget"
  | "personal_funds"
  | "alumni_fund"
  | "student_fund"
  | "hostel_funds";

export const DEBIT_HEAD_LABELS: Record<DebitHead, string> = {
  institute_grant: "Institute Grant",
  professional_development_fund: "Professional Development Fund",
  project_grant: "Project Grant",
  department_budget: "Department Budget",
  // Stored as `special_budget` since migration 15; the office calls it
  // Special Funds (24 Sep 2026), offered to everyone except students
  // (25 Sep 2026).
  special_budget: "Special Funds",
  personal_funds: "Personal Funds",
  alumni_fund: "Alumni Fund",
  student_fund: "Student Fund",
  hostel_funds: "Hostel Funds",
};

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
   * Guest House Manager booking on someone's behalf, or a club's faculty
   * in-charge booking for the club (24 Sep 2026: a club cannot book for
   * itself — `lib/club-booking.ts`). Null on a booking the requester raised
   * themselves.
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
  /**
   * The budget this stay is charged to (migration 15). Null only on bookings
   * made before the question existed.
   */
  debit_head: DebitHead | null;
  /**
   * What the debit head needs to be traced: the project for a Project Grant,
   * the justification for a Special Budget. Null otherwise.
   */
  debit_details: string | null;
  /** The sanction for Special Funds, when the requester uploaded one. */
  debit_document_url: string | null;
  /**
   * The project's sub-head, typed by the requester when the head is Project
   * (migration 24) — "Travel", "Contingency". Null otherwise, and on every
   * booking made before the question existed.
   */
  debit_subhead: string | null;
  /**
   * Extra addresses the requester asked to be copied on every mail sent to
   * them about this booking (migration 24). Always an array downstream —
   * empty when nobody was added, and on older rows.
   */
  copy_to_emails: string[];
  /**
   * The project debited when the head is Project (migration 18). The
   * project's number and title are also kept in `debit_details` as they were
   * at booking, so a later edit to the project list does not rewrite it.
   */
  project_id: string | null;
  /**
   * An office's choice for this booking (migration 18): straight to the
   * Guest House Manager ("direct") or through its HOD first ("hod"). Null
   * for anyone who is not an office.
   */
  office_approval: "direct" | "hod" | null;
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
  /**
   * A requester's request to stay longer (migration 20), awaiting the
   * manager. Null — or absent on an older mock row — when nothing is asked.
   */
  extension_requested_until?: string | null;
  extension_reason?: string | null;
  extension_requested_at?: string | null;
  /** Set when the stay was released because the guest never arrived (migration 20). */
  no_show_released_at?: string | null;
  /** The privacy notice the requester agreed to when submitting (Phase 8, DPDP). */
  privacy_notice_version?: string | null;
  privacy_consent_at?: string | null;
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
  /**
   * When the room is ready again: check-out plus the turnaround buffer
   * (Phase 3). The booked bar still ends at `check_out`; the charts draw
   * `[check_out, turnaround_until)` separately, hatched. Null when there is no
   * buffer — none configured, or a turnover the manager accepted.
   */
  turnaround_until: string | null;
  requester_name: string | null;
  purpose_of_visit: string | null;
  /**
   * "maintenance" for a room block (Phase 7), drawn distinctly and never
   * allocatable; absent for a stay. A block's `purpose_of_visit` is its reason.
   */
  kind?: "stay" | "maintenance";
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
  debit_head: DebitHead | null;
  debit_details: string | null;
  debit_document_url: string | null;
  /** The project's sub-head, only with a Project head (migration 24). */
  debit_subhead?: string | null;
  /** Addresses copied on the requester's mail about this booking (migration 24). */
  copy_to_emails?: string[];
  project_id?: string | null;
  office_approval?: "direct" | "hod" | null;
  meal_preference: MealPreference | null;
  /** Only on a meals-only booking, which has no guest rows to count. */
  meal_guest_count: number | null;
  pets_policy_acknowledged: boolean;
  /** The privacy notice version the requester agreed to (Phase 8, DPDP). */
  privacy_notice_version?: string | null;
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
  /**
   * Set only when someone booked on another person's behalf: the Guest House
   * Manager at the desk (then it equals `user_id`), or a club's faculty
   * in-charge booking for the club (then `user_id` is the club's account).
   */
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
  /**
   * The manager who accepted a turnover overlap on this hold (migration 14).
   * Null on an ordinary hold, which is almost all of them.
   */
  override_by?: string | null;
  check_in: string;
  check_out: string;
}

/**
 * Raised when a new turnaround buffer would make stays already allocated
 * clash (Phase 3). The change is refused and nothing moves; `clashes` names
 * them, one line per pair of bookings.
 */
export class BufferClashError extends Error {
  constructor(
    readonly count: number,
    readonly clashes: string
  ) {
    super(
      `A turnaround buffer that long would make ${count} pair${count === 1 ? "" : "s"} of allocated stays clash: ${clashes}. Move or reallocate them first, or choose a shorter buffer.`
    );
    this.name = "BufferClashError";
  }
}

/** Raised when a hold collides with one written by someone else. */
export class RoomClashError extends Error {
  constructor(message = "Those rooms were just taken for these dates — refresh the grid") {
    super(message);
    this.name = "RoomClashError";
  }
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_WARDEN: "Pending Assistant Warden Review",
  PENDING_FA: "Pending Club Approval",
  PENDING_HOD: "Pending HOD Approval",
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
  warden: "Assistant Warden",
  faculty_advisor: "Faculty Advisor",
  iar_cell: "IAR Office",
  iar_student_cell: "IAR Student Cell",
  gh_manager: "Guest House Manager",
  gh_caretaker: "Guest House Caretaker",
  developer: "Developer (Superadmin)",
};
