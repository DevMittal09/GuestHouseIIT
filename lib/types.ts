export type Role =
  | "student"
  | "employee"
  | "official"
  | "club"
  | "alumni"
  | "warden"
  | "faculty_advisor"
  | "iar_cell"
  | "gh_manager"
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

export const REQUESTER_ROLES: Role[] = ["student", "employee", "official", "club", "alumni"];
export const REVIEWER_ROLES: Role[] = ["warden", "faculty_advisor", "iar_cell", "gh_manager"];

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
}

export type GuestHouse = {
  id: string;
  name: string;
  total_rooms: number;
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
  assigned_room_ids: string[];
  rejection_reason: string | null;
  alumni_id_url: string | null;
  custom_fields: CustomFieldValue[] | null;
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
  alumni_id_url: string | null;
  custom_fields: CustomFieldValue[] | null;
  guests: Omit<BookingGuest, "id" | "booking_id">[];
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
  alumni: "Alumni",
  warden: "Hostel Warden",
  faculty_advisor: "Faculty Advisor",
  iar_cell: "IAR Cell",
  gh_manager: "Guest House Manager",
  developer: "Developer (Superadmin)",
};
