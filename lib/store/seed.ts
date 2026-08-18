import type {
  Booking,
  BookingGuest,
  BookingLog,
  GuestHouse,
  Profile,
  Room,
} from "@/lib/types";

export const GH_BAGESHRI = "gh-bageshri";
export const GH_HAMSANANDI = "gh-hamsanandi";

export const seedGuestHouses: GuestHouse[] = [
  { id: GH_BAGESHRI, name: "Bageshri", total_rooms: 20 },
  { id: GH_HAMSANANDI, name: "Hamsanandi", total_rooms: 16 },
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

export const seedProfiles: Profile[] = [
  // ----- Requesters -----
  { id: "student-anjali", email: "112201001@smail.iitpkd.ac.in", full_name: "Anjali Menon", role: "student", hostel_name: "Malhar", department_or_club: null, roll_number: "112201001" },
  { id: "student-rahul", email: "142202014@smail.iitpkd.ac.in", full_name: "Rahul Nair", role: "student", hostel_name: "Saveri", department_or_club: null, roll_number: "142202014" },
  { id: "employee-priya", email: "priya@iitpkd.ac.in", full_name: "Dr. Priya Sharma", role: "employee", hostel_name: null, department_or_club: "Computer Science & Engineering", roll_number: null },
  { id: "official-admin", email: "admin@iitpkd.ac.in", full_name: "Director's Office", role: "official", hostel_name: null, department_or_club: "Administration", roll_number: null },
  { id: "club-petrichor", email: "petrichor@iitpkd.ac.in", full_name: "Petrichor Fest Council", role: "club", hostel_name: null, department_or_club: "Petrichor", roll_number: null },
  { id: "alumni-vikram", email: "vikram.iyer@alumni.iitpkd.ac.in", full_name: "Vikram Iyer", role: "alumni", hostel_name: null, department_or_club: null, roll_number: "101601023" },
  // ----- Reviewers / Admins -----
  { id: "warden-malhar", email: "warden.malhar@iitpkd.ac.in", full_name: "Dr. Suresh Kumar (Warden, Malhar)", role: "warden", hostel_name: "Malhar", department_or_club: null, roll_number: null },
  { id: "warden-saveri", email: "warden.saveri@iitpkd.ac.in", full_name: "Dr. Lakshmi Devi (Warden, Saveri)", role: "warden", hostel_name: "Saveri", department_or_club: null, roll_number: null },
  { id: "fa-petrichor", email: "fa.petrichor@iitpkd.ac.in", full_name: "Dr. Arun Prasad (FA, Petrichor)", role: "faculty_advisor", hostel_name: null, department_or_club: "Petrichor", roll_number: null },
  { id: "iar-cell", email: "iar@iitpkd.ac.in", full_name: "IAR Cell Office", role: "iar_cell", hostel_name: null, department_or_club: "International & Alumni Relations", roll_number: null },
  { id: "gh-manager", email: "guesthouse@iitpkd.ac.in", full_name: "Guest House Manager", role: "gh_manager", hostel_name: null, department_or_club: null, roll_number: null },
  { id: "developer", email: "developer@iitpkd.ac.in", full_name: "Portal Developer", role: "developer", hostel_name: null, department_or_club: null, roll_number: null },
];

const now = new Date();
const iso = (daysFromNow: number, hour: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

// Demo bookings so every portal has something in its queue on first run.
export const seedBookings: Booking[] = [
  {
    id: "bk-demo-1",
    booking_reference_id: "IITPKD-GH-2026-DM001",
    user_id: "student-anjali",
    guest_house_id: GH_BAGESHRI,
    user_role: "student",
    status: "PENDING_WARDEN",
    purpose_of_visit: "Parents visiting for convocation",
    check_in: iso(7, 12),
    check_out: iso(9, 10),
    rooms_requested: 1,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
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
    purpose_of_visit: "Pro-show artist accommodation for Petrichor '26",
    check_in: iso(14, 14),
    check_out: iso(16, 11),
    rooms_requested: 2,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    created_at: iso(-2, 15),
    updated_at: iso(-2, 15),
  },
  {
    id: "bk-demo-3",
    booking_reference_id: "IITPKD-GH-2026-DM003",
    user_id: "alumni-vikram",
    guest_house_id: GH_BAGESHRI,
    user_role: "alumni",
    status: "PENDING_IAR",
    purpose_of_visit: "Campus visit for alumni mentorship programme",
    check_in: iso(10, 13),
    check_out: iso(12, 10),
    rooms_requested: 1,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
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
    purpose_of_visit: "Visiting collaborator from IISc for joint project",
    check_in: iso(5, 12),
    check_out: iso(8, 10),
    rooms_requested: 1,
    assigned_room_ids: [],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
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
    purpose_of_visit: "Visit of NIRF inspection committee",
    check_in: iso(6, 12),
    check_out: iso(9, 11),
    rooms_requested: 2,
    assigned_room_ids: [`${GH_BAGESHRI}-B-201`, `${GH_BAGESHRI}-B-202`],
    rejection_reason: null,
    alumni_id_url: null,
    custom_fields: null,
    created_at: iso(-5, 10),
    updated_at: iso(-4, 16),
  },
];

export const seedGuests: BookingGuest[] = [
  { id: "g-1", booking_id: "bk-demo-1", name: "Sunitha Menon", age: 52, gender: "female", relationship: "Mother", id_number: "XXXX-XXXX-4821", id_document_url: null },
  { id: "g-2", booking_id: "bk-demo-1", name: "Ravi Menon", age: 56, gender: "male", relationship: "Father", id_number: "XXXX-XXXX-9130", id_document_url: null },
  { id: "g-3", booking_id: "bk-demo-2", name: "Arjun Das", age: 31, gender: "male", relationship: null, id_number: null, id_document_url: null },
  { id: "g-4", booking_id: "bk-demo-2", name: "Meera Krishnan", age: 28, gender: "female", relationship: null, id_number: null, id_document_url: null },
  { id: "g-5", booking_id: "bk-demo-3", name: "Vikram Iyer", age: 29, gender: "male", relationship: null, id_number: "XXXX-XXXX-7754", id_document_url: null },
  { id: "g-6", booking_id: "bk-demo-4", name: "Prof. Ananya Bose", age: 45, gender: "female", relationship: "Research collaborator", id_number: "XXXX-XXXX-2216", id_document_url: null },
  { id: "g-7", booking_id: "bk-demo-5", name: "NIRF Committee (2 members)", age: null, gender: "male", relationship: null, id_number: null, id_document_url: null },
];

export const seedLogs: BookingLog[] = [
  { id: "l-1", booking_id: "bk-demo-1", action_by: "student-anjali", action_by_name: "Anjali Menon", previous_status: null, new_status: "PENDING_WARDEN", remarks: "Booking submitted", timestamp: iso(-1, 9) },
  { id: "l-2", booking_id: "bk-demo-2", action_by: "club-petrichor", action_by_name: "Petrichor Fest Council", previous_status: null, new_status: "PENDING_FA", remarks: "Booking submitted", timestamp: iso(-2, 15) },
  { id: "l-3", booking_id: "bk-demo-3", action_by: "alumni-vikram", action_by_name: "Vikram Iyer", previous_status: null, new_status: "PENDING_IAR", remarks: "Booking submitted", timestamp: iso(-1, 18) },
  { id: "l-4", booking_id: "bk-demo-4", action_by: "employee-priya", action_by_name: "Dr. Priya Sharma", previous_status: null, new_status: "PENDING_GH_MANAGER", remarks: "Booking submitted", timestamp: iso(-3, 11) },
  { id: "l-5", booking_id: "bk-demo-5", action_by: "official-admin", action_by_name: "Director's Office", previous_status: null, new_status: "PENDING_GH_MANAGER", remarks: "Booking submitted", timestamp: iso(-5, 10) },
  { id: "l-6", booking_id: "bk-demo-5", action_by: "gh-manager", action_by_name: "Guest House Manager", previous_status: "PENDING_GH_MANAGER", new_status: "APPROVED", remarks: "Rooms B-201, B-202 allocated", timestamp: iso(-4, 16) },
];
