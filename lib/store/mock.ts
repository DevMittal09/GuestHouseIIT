import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Booking,
  BookingFilter,
  BookingGuest,
  BookingLog,
  BookingWithDetails,
  GuestHouse,
  NewBookingInput,
  Profile,
  Room,
  RoomHold,
  RoomOccupancySegment,
} from "@/lib/types";
import { RoomClashError } from "@/lib/types";
import type { Role, RoomType } from "@/lib/types";
import type { BookingSearchCriteria, BookingSearchResult } from "@/lib/booking-search";
import { runBookingSearch } from "@/lib/booking-search";
import type { RoleFormConfig } from "@/lib/form-config";
import { ROOM_HOLDING_STATUSES } from "@/lib/workflow";
import type { DataStore, NewLogInput, NewProfileInput, StatusUpdate } from "./types";
import {
  seedBookings,
  seedGuestHouses,
  seedGuests,
  seedLogs,
  seedProfiles,
  seedRoomHolds,
  seedRooms,
} from "./seed";

interface Db {
  profiles: Profile[];
  guest_houses: GuestHouse[];
  rooms: Room[];
  bookings: Booking[];
  booking_guests: BookingGuest[];
  booking_logs: BookingLog[];
  form_configs: RoleFormConfig[];
  /** Source of truth for occupancy; `Booking.assigned_room_ids` is derived. */
  room_holds: RoomHold[];
}

const DB_PATH = path.join(process.cwd(), ".local-db.json");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function loadDb(): Db {
  if (fs.existsSync(DB_PATH)) {
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as Db;
    // Self-heal databases created before newer features existed.
    let dirty = false;
    if (!db.form_configs) {
      db.form_configs = [];
      dirty = true;
    }
    if (!db.room_holds) {
      // Same backfill as migration 3: rebuild holds from the old array field,
      // for the statuses that actually hold a room.
      db.room_holds = [];
      for (const b of db.bookings) {
        if (!ROOM_HOLDING_STATUSES.includes(b.status)) continue;
        for (const roomId of b.assigned_room_ids ?? []) {
          db.room_holds.push({
            booking_id: b.id,
            room_id: roomId,
            check_in: b.check_in,
            check_out: b.check_out,
          });
        }
      }
      dirty = true;
    }
    for (const g of db.booking_guests) {
      if (g.is_infant === undefined) {
        g.is_infant = false;
        dirty = true;
      }
    }
    for (const seeded of seedProfiles) {
      if (!db.profiles.some((p) => p.id === seeded.id || p.email === seeded.email)) {
        db.profiles.push(seeded);
        dirty = true;
      }
    }
    if (dirty) saveDb(db);
    return db;
  }
  const db: Db = {
    profiles: seedProfiles,
    guest_houses: seedGuestHouses,
    rooms: seedRooms,
    bookings: seedBookings,
    booking_guests: seedGuests,
    booking_logs: seedLogs,
    form_configs: [],
    room_holds: seedRoomHolds,
  };
  saveDb(db);
  return db;
}

/** Strict overlap, the same rule the database's `&&` on a `[)` range applies. */
function holdOverlaps(hold: RoomHold, from: string, to: string): boolean {
  return hold.check_in < to && hold.check_out > from;
}

/**
 * The mock's stand-in for the `room_holds_no_overlap` exclusion constraint.
 * Node is single-threaded and `saveDb` writes synchronously, so a check
 * immediately before the write is genuinely atomic here — unlike the old
 * check-then-act against Postgres.
 */
function assertNoClash(db: Db, bookingId: string, roomIds: string[], from: string, to: string) {
  const clash = db.room_holds.find(
    (h) =>
      h.booking_id !== bookingId && roomIds.includes(h.room_id) && holdOverlaps(h, from, to)
  );
  if (clash) {
    const room = db.rooms.find((r) => r.id === clash.room_id);
    throw new RoomClashError(
      `Room ${room?.room_number ?? clash.room_id} was just taken for these dates — refresh the grid`
    );
  }
}

function saveDb(db: Db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export class MockStore implements DataStore {
  async listProfiles(): Promise<Profile[]> {
    return loadDb().profiles;
  }

  async getProfile(id: string): Promise<Profile | null> {
    return loadDb().profiles.find((p) => p.id === id) ?? null;
  }

  async listGuestHouses(): Promise<GuestHouse[]> {
    return loadDb().guest_houses;
  }

  async getGuestHouse(id: string): Promise<GuestHouse | null> {
    return loadDb().guest_houses.find((g) => g.id === id) ?? null;
  }

  async listRooms(guestHouseId: string): Promise<Room[]> {
    return loadDb()
      .rooms.filter((r) => r.guest_house_id === guestHouseId && r.is_active)
      .sort((a, b) => a.room_number.localeCompare(b.room_number));
  }

  async createBooking(input: NewBookingInput): Promise<Booking> {
    const db = loadDb();
    const nowIso = new Date().toISOString();
    const booking: Booking = {
      id: randomUUID(),
      booking_reference_id: makeReference(),
      user_id: input.user_id,
      guest_house_id: input.guest_house_id,
      user_role: input.user_role,
      status: input.status,
      purpose_of_visit: input.purpose_of_visit,
      check_in: input.check_in,
      check_out: input.check_out,
      rooms_requested: input.rooms_requested,
      assigned_room_ids: [],
      rejection_reason: null,
      alumni_id_url: input.alumni_id_url,
      custom_fields: input.custom_fields,
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.bookings.push(booking);
    for (const g of input.guests) {
      db.booking_guests.push({ ...g, id: randomUUID(), booking_id: booking.id });
    }
    const requester = db.profiles.find((p) => p.id === input.user_id);
    db.booking_logs.push({
      id: randomUUID(),
      booking_id: booking.id,
      action_by: input.user_id,
      action_by_name: requester?.full_name ?? "Unknown",
      previous_status: null,
      new_status: input.status,
      remarks: "Booking submitted",
      timestamp: nowIso,
    });
    saveDb(db);
    return booking;
  }

  private hydrate(db: Db, b: Booking): BookingWithDetails {
    // Holds are the source of truth; any `assigned_room_ids` left on an old
    // stored booking is ignored so the two cannot drift.
    const assignedRoomIds = db.room_holds
      .filter((h) => h.booking_id === b.id)
      .map((h) => h.room_id);
    return {
      ...b,
      assigned_room_ids: assignedRoomIds,
      requester: db.profiles.find((p) => p.id === b.user_id)!,
      guest_house: db.guest_houses.find((g) => g.id === b.guest_house_id)!,
      guests: db.booking_guests.filter((g) => g.booking_id === b.id),
      logs: db.booking_logs
        .filter((l) => l.booking_id === b.id)
        .sort((a, c) => a.timestamp.localeCompare(c.timestamp)),
      assigned_rooms: assignedRoomIds
        .map((id) => db.rooms.find((r) => r.id === id))
        .filter((r): r is Room => Boolean(r)),
    };
  }

  async getBooking(id: string): Promise<BookingWithDetails | null> {
    const db = loadDb();
    const b = db.bookings.find((x) => x.id === id);
    return b ? this.hydrate(db, b) : null;
  }

  async listBookings(filter: BookingFilter): Promise<BookingWithDetails[]> {
    const db = loadDb();
    return db.bookings
      .filter((b) => {
        if (filter.status && b.status !== filter.status) return false;
        if (filter.guestHouseId && b.guest_house_id !== filter.guestHouseId) return false;
        if (filter.userRole && b.user_role !== filter.userRole) return false;
        const requester = db.profiles.find((p) => p.id === b.user_id);
        if (filter.hostelName && requester?.hostel_name !== filter.hostelName) return false;
        if (filter.club && requester?.department_or_club !== filter.club) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((b) => this.hydrate(db, b));
  }

  async listBookingsForUser(userId: string): Promise<BookingWithDetails[]> {
    const db = loadDb();
    return db.bookings
      .filter((b) => b.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((b) => this.hydrate(db, b));
  }

  async searchBookings(criteria: BookingSearchCriteria): Promise<BookingSearchResult> {
    const db = loadDb();
    // The whole file is in memory already, so there is nothing to push down —
    // hydrate everything and let the shared matcher do the work.
    const candidates = db.bookings.map((b) => this.hydrate(db, b));
    return runBookingSearch(candidates, criteria);
  }

  async updateBookingStatus(id: string, update: StatusUpdate, log: NewLogInput): Promise<void> {
    const db = loadDb();
    const b = db.bookings.find((x) => x.id === id);
    if (!b) throw new Error("Booking not found");

    // Rooms first: a clash must abort before the status moves, so a failed
    // allocation leaves the booking exactly as it was.
    if (update.assigned_room_ids !== undefined) {
      assertNoClash(db, id, update.assigned_room_ids, b.check_in, b.check_out);
      db.room_holds = db.room_holds.filter((h) => h.booking_id !== id);
      for (const roomId of update.assigned_room_ids) {
        db.room_holds.push({
          booking_id: id,
          room_id: roomId,
          check_in: b.check_in,
          check_out: b.check_out,
        });
      }
    }

    const previous = b.status;
    b.status = update.status;
    if (update.rejection_reason !== undefined) b.rejection_reason = update.rejection_reason;
    // A hold exists exactly while the booking holds the room, so leaving
    // ROOM_HOLDING_STATUSES releases the rooms with no caller involvement.
    if (!ROOM_HOLDING_STATUSES.includes(update.status)) {
      db.room_holds = db.room_holds.filter((h) => h.booking_id !== id);
    }
    b.updated_at = new Date().toISOString();
    db.booking_logs.push({
      ...log,
      id: randomUUID(),
      booking_id: id,
      previous_status: previous,
      timestamp: b.updated_at,
    });
    saveDb(db);
  }

  async getOccupiedRoomIds(
    guestHouseId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): Promise<string[]> {
    const db = loadDb();
    // Straight off the holds — no status filtering needed, because a hold row
    // only exists while the booking is actually holding the room.
    const roomsHere = new Set(
      db.rooms.filter((r) => r.guest_house_id === guestHouseId).map((r) => r.id)
    );
    const occupied = new Set<string>();
    for (const hold of db.room_holds) {
      if (hold.booking_id === excludeBookingId) continue;
      if (!roomsHere.has(hold.room_id)) continue;
      if (!holdOverlaps(hold, checkIn, checkOut)) continue;
      occupied.add(hold.room_id);
    }
    return [...occupied];
  }

  async listRoomOccupancy(
    guestHouseId: string,
    from: string,
    to: string
  ): Promise<RoomOccupancySegment[]> {
    const db = loadDb();
    const roomsHere = new Set(
      db.rooms.filter((r) => r.guest_house_id === guestHouseId).map((r) => r.id)
    );
    const segments: RoomOccupancySegment[] = [];
    for (const hold of db.room_holds) {
      if (!roomsHere.has(hold.room_id)) continue;
      if (!holdOverlaps(hold, from, to)) continue;
      const b = db.bookings.find((x) => x.id === hold.booking_id);
      if (!b) continue;
      const requester = db.profiles.find((p) => p.id === b.user_id);
      segments.push({
        room_id: hold.room_id,
        booking_id: b.id,
        booking_reference_id: b.booking_reference_id,
        status: b.status,
        check_in: hold.check_in,
        check_out: hold.check_out,
        requester_name: requester?.full_name ?? null,
        purpose_of_visit: b.purpose_of_visit,
      });
    }
    return segments;
  }

  async saveDocument(file: File, folder: string): Promise<string> {
    const dir = path.join(UPLOAD_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, fileName), buffer);
    return `/uploads/${folder}/${fileName}`;
  }

  // ---- developer / admin operations ----------------------------------

  async createProfile(input: NewProfileInput): Promise<Profile> {
    const db = loadDb();
    if (db.profiles.some((p) => p.email.toLowerCase() === input.email.toLowerCase())) {
      throw new Error("A user with this email already exists");
    }
    const profile: Profile = { ...input, id: randomUUID() };
    db.profiles.push(profile);
    saveDb(db);
    return profile;
  }

  async updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void> {
    const db = loadDb();
    const p = db.profiles.find((x) => x.id === id);
    if (!p) throw new Error("User not found");
    if (
      patch.email &&
      db.profiles.some((x) => x.id !== id && x.email.toLowerCase() === patch.email!.toLowerCase())
    ) {
      throw new Error("A user with this email already exists");
    }
    Object.assign(p, patch);
    saveDb(db);
  }

  async deleteProfile(id: string): Promise<void> {
    const db = loadDb();
    if (db.bookings.some((b) => b.user_id === id)) {
      throw new Error("This user has bookings — delete or reassign those first");
    }
    db.profiles = db.profiles.filter((p) => p.id !== id);
    saveDb(db);
  }

  async createGuestHouse(name: string): Promise<GuestHouse> {
    const db = loadDb();
    if (db.guest_houses.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A guest house with this name already exists");
    }
    const gh: GuestHouse = { id: randomUUID(), name, total_rooms: 0 };
    db.guest_houses.push(gh);
    saveDb(db);
    return gh;
  }

  async updateGuestHouse(id: string, patch: { name?: string }): Promise<void> {
    const db = loadDb();
    const gh = db.guest_houses.find((g) => g.id === id);
    if (!gh) throw new Error("Guest house not found");
    if (patch.name) gh.name = patch.name;
    saveDb(db);
  }

  async deleteGuestHouse(id: string): Promise<void> {
    const db = loadDb();
    if (db.bookings.some((b) => b.guest_house_id === id)) {
      throw new Error("Bookings reference this guest house — delete those first");
    }
    db.guest_houses = db.guest_houses.filter((g) => g.id !== id);
    db.rooms = db.rooms.filter((r) => r.guest_house_id !== id);
    saveDb(db);
  }

  private static recountRooms(db: Db, guestHouseId: string) {
    const gh = db.guest_houses.find((g) => g.id === guestHouseId);
    if (gh) gh.total_rooms = db.rooms.filter((r) => r.guest_house_id === guestHouseId && r.is_active).length;
  }

  async listAllRooms(guestHouseId: string): Promise<Room[]> {
    return loadDb()
      .rooms.filter((r) => r.guest_house_id === guestHouseId)
      .sort((a, b) => a.room_number.localeCompare(b.room_number));
  }

  async createRoom(guestHouseId: string, roomNumber: string, roomType: RoomType): Promise<Room> {
    const db = loadDb();
    if (!db.guest_houses.some((g) => g.id === guestHouseId)) throw new Error("Guest house not found");
    if (db.rooms.some((r) => r.guest_house_id === guestHouseId && r.room_number === roomNumber)) {
      throw new Error(`Room ${roomNumber} already exists in this guest house`);
    }
    const room: Room = {
      id: randomUUID(),
      guest_house_id: guestHouseId,
      room_number: roomNumber,
      room_type: roomType,
      is_active: true,
    };
    db.rooms.push(room);
    MockStore.recountRooms(db, guestHouseId);
    saveDb(db);
    return room;
  }

  async updateRoom(
    id: string,
    patch: { is_active?: boolean; room_number?: string; room_type?: RoomType }
  ): Promise<void> {
    const db = loadDb();
    const room = db.rooms.find((r) => r.id === id);
    if (!room) throw new Error("Room not found");
    Object.assign(room, patch);
    MockStore.recountRooms(db, room.guest_house_id);
    saveDb(db);
  }

  async deleteRoom(id: string): Promise<void> {
    const db = loadDb();
    const room = db.rooms.find((r) => r.id === id);
    if (!room) return;
    if (db.room_holds.some((h) => h.room_id === id)) {
      throw new Error(`Room ${room.room_number} is assigned to a booking — deactivate it instead`);
    }
    db.rooms = db.rooms.filter((r) => r.id !== id);
    MockStore.recountRooms(db, room.guest_house_id);
    saveDb(db);
  }

  async getFormConfig(role: Role): Promise<RoleFormConfig | null> {
    return loadDb().form_configs.find((c) => c.role === role) ?? null;
  }

  async saveFormConfig(config: RoleFormConfig): Promise<void> {
    const db = loadDb();
    db.form_configs = db.form_configs.filter((c) => c.role !== config.role);
    db.form_configs.push(config);
    saveDb(db);
  }

  async deleteFormConfig(role: Role): Promise<void> {
    const db = loadDb();
    db.form_configs = db.form_configs.filter((c) => c.role !== role);
    saveDb(db);
  }

  async deleteBooking(id: string): Promise<void> {
    const db = loadDb();
    db.bookings = db.bookings.filter((b) => b.id !== id);
    db.booking_guests = db.booking_guests.filter((g) => g.booking_id !== id);
    db.booking_logs = db.booking_logs.filter((l) => l.booking_id !== id);
    // Matches `on delete cascade` on room_holds.booking_id.
    db.room_holds = db.room_holds.filter((h) => h.booking_id !== id);
    saveDb(db);
  }
}

function makeReference(): string {
  const year = new Date().getFullYear();
  const rand = Array.from({ length: 5 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32))
  ).join("");
  return `IITPKD-GH-${year}-${rand}`;
}
