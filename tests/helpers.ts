import fs from "fs";
import os from "os";
import path from "path";
import type {
  BookingGuest,
  BookingRoomWithGuests,
  BookingWithDetails,
  GuestHouse,
  Profile,
  Room,
} from "@/lib/types";

/**
 * Fixtures for the test suite. Everything here is plain data — no store, no
 * clock — so a test says exactly what state it starts from.
 */

export const GH: GuestHouse = { id: "gh-1", name: "Test House", total_rooms: 4, serves_meals: true };

export function profile(patch: Partial<Profile> = {}): Profile {
  return {
    id: "p-1",
    email: "person@iitpkd.ac.in",
    full_name: "Test Person",
    role: "employee",
    hostel_name: null,
    department_or_club: null,
    roll_number: null,
    ldap_uid: null,
    unit_id: null,
    staff_category: null,
    ...patch,
  };
}

export function room(patch: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    guest_house_id: GH.id,
    room_number: "T-101",
    room_type: "double_sharing",
    is_active: true,
    ...patch,
  };
}

export function guest(patch: Partial<BookingGuest> = {}): BookingGuest {
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    booking_id: "b-1",
    booking_room_id: "card-1",
    name: "Guest",
    age: 30,
    gender: "other",
    relationship: null,
    id_number: null,
    id_document_url: null,
    is_infant: false,
    citizenship: "indian",
    nationality: null,
    passport_number: null,
    ...patch,
  };
}

/** A booking with one room card per entry of `cards` (guests, and the room allocated to it). */
export function booking(
  patch: Partial<BookingWithDetails> = {},
  cards: { guests: BookingGuest[]; assigned?: Room | null }[] = [{ guests: [guest()] }]
): BookingWithDetails {
  const id = patch.id ?? "b-1";
  const rooms: BookingRoomWithGuests[] = cards.map((c, i) => ({
    id: `card-${i + 1}`,
    booking_id: id,
    room_index: i + 1,
    room_type: null,
    assigned_room_id: c.assigned?.id ?? null,
    assigned_room: c.assigned ?? null,
    guests: c.guests.map((g) => ({ ...g, booking_id: id, booking_room_id: `card-${i + 1}` })),
  }));
  const assigned = cards.map((c) => c.assigned).filter((r): r is Room => Boolean(r));
  return {
    id,
    booking_reference_id: `REF-${id}`,
    user_id: "p-1",
    guest_house_id: GH.id,
    user_role: "employee",
    status: "PENDING_GH_MANAGER",
    purpose_of_visit: "Visit",
    check_in: "2030-01-10T06:30:00.000Z",
    check_out: "2030-01-12T04:30:00.000Z",
    rooms_requested: rooms.length,
    assigned_room_ids: assigned.map((r) => r.id),
    rejection_reason: null,
    service_type: "room",
    meal_preference: null,
    meal_guest_count: null,
    pets_policy_acknowledged: true,
    pets_policy_acknowledged_at: null,
    has_foreign_national: false,
    created_by: null,
    on_behalf_of_name: null,
    on_behalf_of_email: null,
    on_behalf_of_phone: null,
    booking_type: "official",
    debit_head: null,
    debit_details: null,
    debit_document_url: null,
    alumni_name: null,
    alumni_roll_number: null,
    alumni_id_url: null,
    custom_fields: null,
    meals: [],
    has_infant: false,
    created_at: "2029-12-01T00:00:00.000Z",
    updated_at: "2029-12-01T00:00:00.000Z",
    requester: profile(),
    guest_house: GH,
    guests: rooms.flatMap((r) => r.guests),
    rooms,
    logs: [],
    assigned_rooms: assigned,
    ...patch,
  };
}

/**
 * Point the mock store at a fresh throwaway file for this test file, and
 * remove it afterwards. Must run before the store module is first used.
 */
export function useThrowawayMockDb(seed?: unknown): { file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-test-"));
  const file = path.join(dir, "db.json");
  if (seed !== undefined) fs.writeFileSync(file, JSON.stringify(seed));
  process.env.MOCK_DB_PATH = file;
  return {
    file,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
