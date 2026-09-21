import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Booking,
  BookingFilter,
  BookingGuest,
  BookingLog,
  BookingRoom,
  BookingRoomWithGuests,
  BookingWithDetails,
  GuestHouse,
  NewBookingInput,
  Profile,
  Room,
  RoomHold,
  RoomOccupancySegment,
} from "@/lib/types";
import { BufferClashError, RoomClashError } from "@/lib/types";
import type { Role, RoomType } from "@/lib/types";
import { mealsOn, normalizeMeals } from "@/lib/meals";
import { isInfantAge } from "@/lib/occupancy";
import { bufferMs, holdGuard, rangesOverlap } from "@/lib/turnover";
import { deriveFromRooms } from "./derive";
import type { BookingSearchCriteria, BookingSearchResult } from "@/lib/booking-search";
import { runBookingSearch } from "@/lib/booking-search";
import type { RoleFormConfig } from "@/lib/form-config";
import type {
  EmailMessage,
  EmailOutboxFilter,
  EmailSettlement,
  MailEventKey,
  MailStatus,
  NewEmailInput,
} from "@/lib/mail/types";
import { MAIL_STATUSES } from "@/lib/mail/types";
import type { MailTemplateOverride } from "@/lib/mail/template-config";
import { ROOM_HOLDING_STATUSES } from "@/lib/workflow";
import type {
  BookingDetailsPatch,
  DataStore,
  NewLogInput,
  NewProfileInput,
  StatusUpdate,
} from "./types";
import {
  seedBookingRooms,
  seedBookings,
  seedGuestHouses,
  seedGuests,
  seedLogs,
  seedProfiles,
  seedRoomHolds,
  seedHostels,
  seedRooms,
  seedUnits,
} from "./seed";
import type { Unit } from "@/lib/units";
import { auditMatches, type AuditEvent, type AuditFilter, type NewAuditEvent } from "@/lib/audit";
import { DEFAULT_OFFICIAL_EMAILS, parseRuleGroup } from "@/lib/settings";

interface Db {
  profiles: Profile[];
  guest_houses: GuestHouse[];
  rooms: Room[];
  bookings: Booking[];
  /** Migration 11's counterpart: one row per room card on a booking. */
  booking_rooms?: BookingRoom[];
  booking_guests: BookingGuest[];
  booking_logs: BookingLog[];
  form_configs: RoleFormConfig[];
  /** Source of truth for occupancy; `Booking.assigned_room_ids` is derived. */
  room_holds: RoomHold[];
  /**
   * Runtime settings: the developer console password hash (a string) and,
   * since migration 16, the `rules.<group>` Settings (objects).
   */
  app_settings?: Record<string, unknown>;
  /** Migration 16: hostels, which `profiles.hostel_name` must name. */
  hostels?: string[];
  /** Migration 16: accounts allowed to submit official bookings, lowercased. */
  official_emails?: string[];
  /** Migration 16: the append-only security audit log. */
  security_audit?: AuditEvent[];
  /** Queued notifications; see `lib/mail/dispatch.ts`. */
  email_outbox?: EmailMessage[];
  /** Only the mails whose wording has actually been edited (migration 13). */
  mail_templates?: MailTemplateOverride[];
  /** Departments, clubs, councils and offices, and who heads each (migration 15). */
  units?: Unit[];
}

// `MOCK_DB_PATH` lets the test suite run against a throwaway file instead of
// the developer's working data.
const DB_PATH = process.env.MOCK_DB_PATH || path.join(process.cwd(), ".local-db.json");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function loadDb(): Db {
  if (fs.existsSync(/*turbopackIgnore: true*/ DB_PATH)) {
    const db = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ DB_PATH, "utf8")) as Db;
    // Self-heal databases created before newer features existed.
    let dirty = false;
    if (!db.form_configs) {
      db.form_configs = [];
      dirty = true;
    }
    // Migration 10's counterpart: databases written before notifications
    // existed simply have no outbox yet.
    if (!db.email_outbox) {
      db.email_outbox = [];
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
    for (const gh of db.guest_houses) {
      // Migration 8's counterpart: when the flag arrived, meals were served at
      // Hamsanandi only. From then on the stored flag is the truth.
      if (gh.serves_meals === undefined) {
        gh.serves_meals = gh.name === "Hamsanandi";
        dirty = true;
      }
    }
    for (const b of db.bookings) {
      // Migrations 6 and 8: no answer at all is "none requested", and the old
      // whole-stay object is expanded into one entry per day of the stay.
      if (!Array.isArray(b.meals)) {
        b.meals = normalizeMeals(b.meals, b);
        dirty = true;
      }
      // Migration 7's counterpart: infants moved from guest rows to one flag
      // on the booking, set wherever an infant row exists.
      if (b.has_infant === undefined) {
        b.has_infant = db.booking_guests.some((g) => g.booking_id === b.id && g.is_infant);
        dirty = true;
      }
      // Migration 9's counterpart: why a stay was booked. Old rows recorded
      // only the requester category, so derive it the same way the SQL does.
      if (b.booking_type === undefined) {
        b.booking_type =
          b.user_role === "student" ? "personal" : b.user_role === "alumni" ? "alumni" : "official";
        dirty = true;
      }
      if (b.alumni_name === undefined) {
        b.alumni_name = null;
        dirty = true;
      }
      if (b.alumni_roll_number === undefined) {
        b.alumni_roll_number = null;
        dirty = true;
      }
      // Migration 11's counterpart. A booking made before rooms had cards was
      // a room booking, unless it had meals.
      if (b.service_type === undefined) {
        b.service_type = (b.meals?.length ?? 0) > 0 ? "room_meals" : "room";
        dirty = true;
      }
      if (b.meal_preference === undefined) {
        // Old bookings recorded meals without a preference. "Unknown" is the
        // honest answer, and the kitchen asks rather than assuming veg.
        b.meal_preference = null;
        dirty = true;
      }
      if (b.pets_policy_acknowledged === undefined) {
        // False means "never asked", not "refused" — the question did not
        // exist when these were submitted.
        b.pets_policy_acknowledged = false;
        b.pets_policy_acknowledged_at = null;
        dirty = true;
      }
      if (b.has_foreign_national === undefined) {
        b.has_foreign_national = false;
        dirty = true;
      }
      // Migration 15's counterpart: a personal booking was always paid
      // personally; the budget of an older official one is not guessed at.
      if (b.debit_head === undefined) {
        b.debit_head = b.booking_type === "personal" ? "personal_funds" : null;
        b.debit_details = null;
        b.debit_document_url = null;
        dirty = true;
      }
      if (b.created_by === undefined) {
        b.created_by = null;
        b.on_behalf_of_name = null;
        b.on_behalf_of_email = null;
        b.on_behalf_of_phone = null;
        dirty = true;
      }
    }
    // Migration 11's backfill: one synthetic room per booking, holding every
    // guest it already had. Those rooms can hold more than the per-room limit
    // allows — the limit is enforced when a booking is submitted, so a stay
    // the office already honoured is never retroactively invalid.
    if (!db.booking_rooms) {
      const bookingRooms: BookingRoom[] = [];
      for (const b of db.bookings) {
        if (b.service_type === "meals_only") continue;
        const room: BookingRoom = {
          id: `${b.id}-room-1`,
          booking_id: b.id,
          room_index: 1,
          room_type: null,
          assigned_room_id: db.room_holds.find((h) => h.booking_id === b.id)?.room_id ?? null,
        };
        bookingRooms.push(room);
        for (const g of db.booking_guests) {
          if (g.booking_id === b.id) g.booking_room_id = room.id;
        }
        b.rooms_requested = 1;
      }
      db.booking_rooms = bookingRooms;
      dirty = true;
    }
    for (const g of db.booking_guests) {
      // Citizenship is new; everything already stored was entered on a form
      // that could only express an Indian citizen.
      if (g.citizenship === undefined) {
        g.citizenship = "indian";
        g.nationality = null;
        g.passport_number = null;
        dirty = true;
      }
      if (g.booking_room_id === undefined) {
        g.booking_room_id = null;
        dirty = true;
      }
    }
    for (const seeded of seedProfiles) {
      if (!db.profiles.some((p) => p.id === seeded.id || p.email === seeded.email)) {
        db.profiles.push(seeded);
        dirty = true;
      }
    }
    // Migration 12's counterpart: LDAP usernames. Seeded personas get theirs
    // back (matched by email, as `supabase/seed.sql` does); anyone else starts
    // without one, as they would in Postgres.
    for (const p of db.profiles) {
      if (p.ldap_uid === undefined) {
        p.ldap_uid = seedProfiles.find((s) => s.email === p.email)?.ldap_uid ?? null;
        dirty = true;
      }
      // Migration 15's counterpart: demo personas get their unit back; anyone
      // else starts in none, as they would in Postgres.
      if (p.unit_id === undefined) {
        const seeded = seedProfiles.find((s) => s.email === p.email);
        p.unit_id = seeded?.unit_id ?? null;
        p.staff_category = seeded?.staff_category ?? null;
        dirty = true;
      }
    }
    if (!db.units) {
      db.units = seedUnits;
      dirty = true;
    }
    // Migration 16's counterparts. A seeded unit added since the file was
    // written (the demo offices) is added, as seeded profiles are; a unit
    // from before office classes existed has none.
    for (const seeded of seedUnits) {
      if (!db.units.some((u) => u.id === seeded.id)) {
        db.units.push(seeded);
        dirty = true;
      }
    }
    for (const u of db.units) {
      if (u.office_class === undefined) {
        u.office_class = seedUnits.find((s) => s.id === u.id)?.office_class ?? null;
        dirty = true;
      }
    }
    // Demo personas that gained a unit since (the Director's and IAR
    // offices). Only a *null* unit is filled, and only for a seeded persona,
    // so a unit someone chose in the console is never overwritten.
    for (const p of db.profiles) {
      const seeded = seedProfiles.find((s) => s.id === p.id);
      if (seeded?.unit_id && p.unit_id === null) {
        p.unit_id = seeded.unit_id;
        dirty = true;
      }
    }
    if (!db.hostels) {
      // Seeded from what the profiles already say, exactly as the migration
      // does, so no stored account is left naming a hostel that is not there.
      const named = db.profiles
        .map((p) => p.hostel_name?.trim())
        .filter((h): h is string => Boolean(h));
      db.hostels = [...new Set([...seedHostels, ...named])].sort();
      dirty = true;
    }
    if (!db.official_emails) {
      db.official_emails = [...DEFAULT_OFFICIAL_EMAILS];
      dirty = true;
    }
    if (!db.security_audit) {
      db.security_audit = [];
      dirty = true;
    }
    if (dirty) saveDb(db);
    return db;
  }
  const db: Db = {
    profiles: seedProfiles,
    guest_houses: seedGuestHouses,
    rooms: seedRooms,
    bookings: seedBookings,
    booking_rooms: seedBookingRooms,
    booking_guests: seedGuests,
    booking_logs: seedLogs,
    form_configs: [],
    room_holds: seedRoomHolds,
    email_outbox: [],
    units: seedUnits,
    hostels: [...seedHostels],
    official_emails: [...DEFAULT_OFFICIAL_EMAILS],
    security_audit: [],
  };
  saveDb(db);
  return db;
}

/** Strict overlap, the same rule the database's `&&` on a `[)` range applies. */
function holdOverlaps(hold: RoomHold, from: string, to: string): boolean {
  return hold.check_in < to && hold.check_out > from;
}

/** The turnaround buffer in force (`rules.booking.buffer_minutes`), in ms. */
function currentBuffer(db: Db): number {
  return bufferMs(parseRuleGroup("booking", db.app_settings?.["rules.booking"]).buffer_minutes);
}

/** A stored hold's guard — `room_hold_guard()` from migration 17, in JS. */
function guardOf(hold: RoomHold, buffer: number) {
  return holdGuard({ from: hold.check_in, to: hold.check_out }, Boolean(hold.override_by), buffer);
}

/**
 * The mock's stand-in for the `room_holds_no_overlap_guard` exclusion
 * constraint: every hold is compared on its *guard* — the stay padded by the
 * turnaround buffer, or shrunk for a turnover the manager accepted — exactly
 * as Postgres does (`lib/turnover.ts` `holdGuard`). Node is single-threaded
 * and `saveDb` writes synchronously, so a check immediately before the write
 * is genuinely atomic here.
 */
function assertNoClash(
  db: Db,
  bookingId: string,
  roomIds: string[],
  from: string,
  to: string,
  overrideRoomIds: string[] = []
) {
  const buffer = currentBuffer(db);
  const clash = db.room_holds.find((h) => {
    if (h.booking_id === bookingId || !roomIds.includes(h.room_id)) return false;
    const incoming = holdGuard({ from, to }, overrideRoomIds.includes(h.room_id), buffer);
    return rangesOverlap(incoming, guardOf(h, buffer));
  });
  if (clash) {
    const room = db.rooms.find((r) => r.id === clash.room_id);
    throw new RoomClashError(
      `Room ${room?.room_number ?? clash.room_id} was just taken for these dates — refresh the grid`
    );
  }
}

/**
 * Spread the allocated rooms across the booking's room cards, in card order:
 * the first id is Room 1's, the second Room 2's. Cards past the end of the
 * list are cleared, which is what releasing rooms looks like.
 *
 * `room_holds` is still the authority on whether a room is held; this only
 * records which card each hold was for, so the desk can tell one party from
 * another when a booking has more than one room.
 */
function assignRoomsToCards(db: Db, bookingId: string, roomIds: string[]) {
  const cards = (db.booking_rooms ?? [])
    .filter((r) => r.booking_id === bookingId)
    .sort((a, b) => a.room_index - b.room_index);
  cards.forEach((card, i) => {
    card.assigned_room_id = roomIds[i] ?? null;
  });
}

function saveDb(db: Db) {
  fs.writeFileSync(/*turbopackIgnore: true*/ DB_PATH, JSON.stringify(db, null, 2));
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
    const derived = deriveFromRooms(input);
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
      // Counted from the room cards, never passed in: a count beside the rows
      // is a count that can disagree with them.
      rooms_requested: derived.rooms_requested,
      assigned_room_ids: [],
      rejection_reason: null,
      booking_type: input.booking_type,
      service_type: input.service_type,
      debit_head: input.debit_head,
      debit_details: input.debit_details,
      debit_document_url: input.debit_document_url,
      meal_preference: input.meal_preference,
      meal_guest_count: derived.meal_guest_count,
      pets_policy_acknowledged: input.pets_policy_acknowledged,
      pets_policy_acknowledged_at: input.pets_policy_acknowledged ? nowIso : null,
      has_foreign_national: derived.has_foreign_national,
      created_by: input.created_by ?? null,
      on_behalf_of_name: input.on_behalf_of_name ?? null,
      on_behalf_of_email: input.on_behalf_of_email ?? null,
      on_behalf_of_phone: input.on_behalf_of_phone ?? null,
      alumni_name: input.alumni_name,
      alumni_roll_number: input.alumni_roll_number,
      alumni_id_url: input.alumni_id_url,
      custom_fields: input.custom_fields,
      meals: normalizeMeals(input.meals),
      has_infant: derived.has_infant,
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.bookings.push(booking);
    const bookingRooms = db.booking_rooms ?? (db.booking_rooms = []);
    input.rooms.forEach((room, index) => {
      const roomRow: BookingRoom = {
        id: randomUUID(),
        booking_id: booking.id,
        room_index: index + 1,
        room_type: room.room_type,
        assigned_room_id: null,
      };
      bookingRooms.push(roomRow);
      for (const g of room.guests) {
        db.booking_guests.push({
          ...g,
          id: randomUUID(),
          booking_id: booking.id,
          booking_room_id: roomRow.id,
          // The database derives this in a trigger; the mock derives it here,
          // from the same rule, so the two backends classify identically.
          is_infant: isInfantAge(g.age),
        });
      }
    });
    const requester = db.profiles.find((p) => p.id === input.user_id);
    db.booking_logs.push({
      id: randomUUID(),
      booking_id: booking.id,
      action_by: input.user_id,
      action_by_name: requester?.full_name ?? "Unknown",
      previous_status: null,
      new_status: input.status,
      remarks: input.submission_remarks ?? "Booking submitted",
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
    const roomCards = (db.booking_rooms ?? [])
      .filter((r) => r.booking_id === b.id)
      .sort((a, c) => a.room_index - c.room_index);
    const guests = db.booking_guests.filter((g) => g.booking_id === b.id);
    const rooms: BookingRoomWithGuests[] = roomCards.map((card) => ({
      ...card,
      guests: guests.filter((g) => g.booking_room_id === card.id),
      assigned_room: db.rooms.find((r) => r.id === card.assigned_room_id) ?? null,
    }));
    return {
      ...b,
      meals: normalizeMeals(b.meals, b),
      assigned_room_ids: assignedRoomIds,
      requester: db.profiles.find((p) => p.id === b.user_id)!,
      guest_house: db.guest_houses.find((g) => g.id === b.guest_house_id)!,
      // Room order first, then any guest whose room card is missing — a
      // hand-edited mock database should still show its guests.
      guests: [...rooms.flatMap((r) => r.guests), ...guests.filter((g) => !g.booking_room_id)],
      rooms,
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
      const overrides = update.override_room_ids ?? [];
      assertNoClash(db, id, update.assigned_room_ids, b.check_in, b.check_out, overrides);
      db.room_holds = db.room_holds.filter((h) => h.booking_id !== id);
      for (const roomId of update.assigned_room_ids) {
        db.room_holds.push({
          booking_id: id,
          room_id: roomId,
          check_in: b.check_in,
          check_out: b.check_out,
          override_by: overrides.includes(roomId) ? (update.override_by ?? null) : null,
        });
      }
      assignRoomsToCards(db, id, update.assigned_room_ids);
    }

    const previous = b.status;
    b.status = update.status;
    if (update.rejection_reason !== undefined) b.rejection_reason = update.rejection_reason;
    // A hold exists exactly while the booking holds the room, so leaving
    // ROOM_HOLDING_STATUSES releases the rooms with no caller involvement.
    if (!ROOM_HOLDING_STATUSES.includes(update.status)) {
      db.room_holds = db.room_holds.filter((h) => h.booking_id !== id);
      assignRoomsToCards(db, id, []);
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

  async updateBookingDetails(
    id: string,
    patch: BookingDetailsPatch,
    log: NewLogInput
  ): Promise<void> {
    const db = loadDb();
    const b = db.bookings.find((x) => x.id === id);
    if (!b) throw new Error("Booking not found");

    const checkIn = patch.check_in ?? b.check_in;
    const checkOut = patch.check_out ?? b.check_out;
    const movingDates = checkIn !== b.check_in || checkOut !== b.check_out;
    if (movingDates) {
      // The holds carry the period, so moving the stay moves them — and the
      // move has to be refused if the rooms are not free over the new dates.
      // Checked before anything is written, so a clash leaves the booking as
      // it was.
      const held = db.room_holds.filter((h) => h.booking_id === id).map((h) => h.room_id);
      assertNoClash(db, id, held, checkIn, checkOut);
      for (const hold of db.room_holds) {
        if (hold.booking_id !== id) continue;
        hold.check_in = checkIn;
        hold.check_out = checkOut;
        // A turnover the manager accepted was a judgement about the old
        // dates; `set_room_holds` rewrites the rows without it, and so does
        // this.
        hold.override_by = null;
      }
      b.check_in = checkIn;
      b.check_out = checkOut;
    }
    if (patch.purpose_of_visit !== undefined) b.purpose_of_visit = patch.purpose_of_visit;
    if (patch.meals !== undefined) b.meals = normalizeMeals(patch.meals);
    if (patch.meal_preference !== undefined) b.meal_preference = patch.meal_preference;

    b.updated_at = new Date().toISOString();
    db.booking_logs.push({
      ...log,
      id: randomUUID(),
      booking_id: id,
      previous_status: b.status,
      timestamp: b.updated_at,
    });
    saveDb(db);
  }

  async listBookingsWithMealsOn(day: string, guestHouseId?: string): Promise<BookingWithDetails[]> {
    const db = loadDb();
    return db.bookings
      .filter((b) => {
        if (guestHouseId && b.guest_house_id !== guestHouseId) return false;
        return mealsOn(normalizeMeals(b.meals, b), day).length > 0;
      })
      .sort((a, b) => a.check_in.localeCompare(b.check_in))
      .map((b) => this.hydrate(db, b));
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
    // A room is taken when its guard meets the requested stay's guard — the
    // stay plus the turnaround buffer — which is what the constraint would
    // compare if the room were allocated.
    const buffer = currentBuffer(db);
    const wanted = holdGuard({ from: checkIn, to: checkOut }, false, buffer);
    const occupied = new Set<string>();
    for (const hold of db.room_holds) {
      if (hold.booking_id === excludeBookingId) continue;
      if (!roomsHere.has(hold.room_id)) continue;
      if (!rangesOverlap(wanted, guardOf(hold, buffer))) continue;
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
    const buffer = currentBuffer(db);
    const segments: RoomOccupancySegment[] = [];
    for (const hold of db.room_holds) {
      if (!roomsHere.has(hold.room_id)) continue;
      // The turnaround after a stay is drawn too, so a hold is wanted when
      // either the stay or its buffer falls in the window.
      const turnaroundUntil =
        !hold.override_by && buffer > 0
          ? new Date(Date.parse(hold.check_out) + buffer).toISOString()
          : null;
      if (!holdOverlaps(hold, from, to) && !(turnaroundUntil && hold.check_out < to && turnaroundUntil > from)) {
        continue;
      }
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
        turnaround_until: turnaroundUntil,
        requester_name: requester?.full_name ?? null,
        purpose_of_visit: b.purpose_of_visit,
      });
    }
    return segments;
  }

  async applyBookingBuffer(minutes: number): Promise<void> {
    const db = loadDb();
    const buffer = bufferMs(minutes);
    // `buffer_clashes()` from migration 17: every pair of holds on one room
    // whose guards would meet under the new buffer.
    const clashes: string[] = [];
    const holds = [...db.room_holds].sort((a, b) => a.check_in.localeCompare(b.check_in));
    holds.forEach((a, i) => {
      for (const b of holds.slice(i + 1)) {
        if (b.room_id !== a.room_id || b.booking_id === a.booking_id) continue;
        if (!rangesOverlap(guardOf(a, buffer), guardOf(b, buffer))) continue;
        const ref = (id: string) => db.bookings.find((x) => x.id === id)?.booking_reference_id ?? id;
        const room = db.rooms.find((r) => r.id === a.room_id)?.room_number ?? a.room_id;
        clashes.push(`${room}: ${ref(a.booking_id)} and ${ref(b.booking_id)}`);
      }
    });
    if (clashes.length > 0) {
      throw new BufferClashError(clashes.length, clashes.slice(0, 10).join("; "));
    }
    // Guards are computed from the setting on every read here, so saving it
    // *is* the rebuild.
    const current = parseRuleGroup("booking", db.app_settings?.["rules.booking"]);
    db.app_settings = {
      ...(db.app_settings ?? {}),
      "rules.booking": { ...current, buffer_minutes: minutes },
    };
    saveDb(db);
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
    assertLdapUidFree(db, input.ldap_uid, null);
    assertHostelExists(db, input.hostel_name);
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
    if (patch.ldap_uid !== undefined) assertLdapUidFree(db, patch.ldap_uid, id);
    if (patch.hostel_name !== undefined) assertHostelExists(db, patch.hostel_name);
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

  async listUnits(): Promise<Unit[]> {
    return [...(loadDb().units ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }

  async createUnit(input: Omit<Unit, "id">): Promise<Unit> {
    const db = loadDb();
    const units = db.units ?? (db.units = []);
    if (units.some((u) => u.name.toLowerCase() === input.name.toLowerCase())) {
      throw new Error("A unit with this name already exists");
    }
    const unit: Unit = { ...input, id: randomUUID() };
    units.push(unit);
    saveDb(db);
    return unit;
  }

  async updateUnit(id: string, patch: Partial<Omit<Unit, "id">>): Promise<void> {
    const db = loadDb();
    const unit = (db.units ?? []).find((u) => u.id === id);
    if (!unit) throw new Error("Unit not found");
    Object.assign(unit, patch);
    saveDb(db);
  }

  async deleteUnit(id: string): Promise<void> {
    const db = loadDb();
    if (db.profiles.some((p) => p.unit_id === id)) {
      throw new Error("People still belong to this unit - move them first");
    }
    if ((db.units ?? []).some((u) => u.parent_id === id)) {
      throw new Error("Other units sit under this one - move them first");
    }
    db.units = (db.units ?? []).filter((u) => u.id !== id);
    saveDb(db);
  }

  async createGuestHouse(name: string): Promise<GuestHouse> {
    const db = loadDb();
    if (db.guest_houses.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A guest house with this name already exists");
    }
    const gh: GuestHouse = { id: randomUUID(), name, total_rooms: 0, serves_meals: false };
    db.guest_houses.push(gh);
    saveDb(db);
    return gh;
  }

  async updateGuestHouse(
    id: string,
    patch: { name?: string; serves_meals?: boolean }
  ): Promise<void> {
    const db = loadDb();
    const gh = db.guest_houses.find((g) => g.id === id);
    if (!gh) throw new Error("Guest house not found");
    if (patch.name) gh.name = patch.name;
    if (patch.serves_meals !== undefined) gh.serves_meals = patch.serves_meals;
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

  async getSetting(key: string): Promise<string | null> {
    const value = loadDb().app_settings?.[key];
    return typeof value === "string" ? value : null;
  }

  async getJsonSetting(key: string): Promise<unknown | null> {
    return loadDb().app_settings?.[key] ?? null;
  }

  async setJsonSetting(key: string, value: unknown): Promise<void> {
    const db = loadDb();
    db.app_settings = { ...(db.app_settings ?? {}), [key]: value };
    saveDb(db);
  }

  async listHostels(): Promise<string[]> {
    return [...(loadDb().hostels ?? [])].sort((a, b) => a.localeCompare(b));
  }

  async addHostel(name: string): Promise<void> {
    const db = loadDb();
    const hostels = (db.hostels ??= []);
    if (hostels.some((h) => h.toLowerCase() === name.toLowerCase())) {
      throw new Error(`${name} is already on the list`);
    }
    hostels.push(name);
    saveDb(db);
  }

  async renameHostel(from: string, to: string): Promise<void> {
    const db = loadDb();
    const hostels = (db.hostels ??= []);
    const at = hostels.indexOf(from);
    if (at < 0) throw new Error(`${from} is not on the list`);
    if (hostels.some((h) => h !== from && h.toLowerCase() === to.toLowerCase())) {
      throw new Error(`${to} is already on the list`);
    }
    hostels[at] = to;
    // `on update cascade`, as the foreign key does in Postgres.
    for (const p of db.profiles) if (p.hostel_name === from) p.hostel_name = to;
    saveDb(db);
  }

  async removeHostel(name: string): Promise<void> {
    const db = loadDb();
    // `on delete restrict`: a hostel someone still lives in stays.
    const inUse = db.profiles.filter((p) => p.hostel_name === name);
    if (inUse.length > 0) {
      throw new Error(
        `${inUse.length} account${inUse.length === 1 ? "" : "s"} still name ${name} — move ${inUse.length === 1 ? "it" : "them"} first`
      );
    }
    db.hostels = (db.hostels ?? []).filter((h) => h !== name);
    saveDb(db);
  }

  async listOfficialEmails(): Promise<string[]> {
    return [...(loadDb().official_emails ?? [])].sort();
  }

  async addOfficialEmail(email: string): Promise<void> {
    const db = loadDb();
    const list = (db.official_emails ??= []);
    const wanted = email.trim().toLowerCase();
    if (list.includes(wanted)) throw new Error(`${wanted} is already on the list`);
    list.push(wanted);
    saveDb(db);
  }

  async removeOfficialEmail(email: string): Promise<void> {
    const db = loadDb();
    const wanted = email.trim().toLowerCase();
    db.official_emails = (db.official_emails ?? []).filter((e) => e !== wanted);
    saveDb(db);
  }

  async appendAudit(event: NewAuditEvent): Promise<void> {
    const db = loadDb();
    (db.security_audit ??= []).push({
      ...event,
      id: randomUUID(),
      at: new Date().toISOString(),
    });
    saveDb(db);
  }

  async listAudit(filter: AuditFilter): Promise<AuditEvent[]> {
    return (loadDb().security_audit ?? [])
      .filter((e) => auditMatches(e, filter))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, filter.limit ?? 200);
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = loadDb();
    db.app_settings = { ...(db.app_settings ?? {}), [key]: value };
    saveDb(db);
  }

  async deleteBooking(id: string): Promise<void> {
    const db = loadDb();
    db.bookings = db.bookings.filter((b) => b.id !== id);
    db.booking_guests = db.booking_guests.filter((g) => g.booking_id !== id);
    db.booking_logs = db.booking_logs.filter((l) => l.booking_id !== id);
    // Matches `on delete cascade` on room_holds.booking_id.
    db.room_holds = db.room_holds.filter((h) => h.booking_id !== id);
    // Matches `on delete set null` on email_outbox.booking_id: the mail was
    // still sent, so the record of it outlives the booking.
    for (const mail of db.email_outbox ?? []) {
      if (mail.booking_id === id) mail.booking_id = null;
    }
    saveDb(db);
  }

  // ---- email outbox ------------------------------------------------

  async enqueueEmails(inputs: NewEmailInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const db = loadDb();
    const outbox = (db.email_outbox ??= []);
    const seen = new Set(outbox.map((m) => m.idempotency_key));
    const nowIso = new Date().toISOString();
    let added = 0;
    for (const input of inputs) {
      // The mock's stand-in for the unique index on idempotency_key.
      if (seen.has(input.idempotency_key)) continue;
      seen.add(input.idempotency_key);
      outbox.push({
        ...input,
        id: randomUUID(),
        status: "QUEUED",
        attempts: 0,
        last_error: null,
        scheduled_for: input.scheduled_for ?? nowIso,
        sent_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
      added++;
    }
    if (added > 0) saveDb(db);
    return added;
  }

  async claimQueuedEmails(limit: number, staleAfterMs: number): Promise<EmailMessage[]> {
    const db = loadDb();
    const outbox = (db.email_outbox ??= []);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    // Single-threaded and `saveDb` is synchronous, so selecting and marking
    // here is genuinely atomic — the same reason `assertNoClash` is safe.
    const claimed = outbox
      .filter((m) => {
        if (new Date(m.scheduled_for).getTime() > now) return false;
        if (m.status === "QUEUED") return true;
        // Reclaim a row whose worker died mid-send.
        return m.status === "SENDING" && now - new Date(m.updated_at).getTime() > staleAfterMs;
      })
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
      .slice(0, limit);
    for (const mail of claimed) {
      mail.status = "SENDING";
      mail.attempts += 1;
      mail.updated_at = nowIso;
    }
    if (claimed.length > 0) saveDb(db);
    // Copies, so a caller mutating what it got cannot corrupt the store.
    return claimed.map((m) => ({ ...m }));
  }

  async settleEmail(id: string, result: EmailSettlement): Promise<void> {
    const db = loadDb();
    const mail = (db.email_outbox ??= []).find((m) => m.id === id);
    if (!mail) return;
    const nowIso = new Date().toISOString();
    if (result.ok) {
      mail.status = "SENT";
      mail.sent_at = nowIso;
      mail.last_error = null;
    } else {
      // A retry is still QUEUED, due later; only giving up is FAILED.
      mail.status = result.retryAt ? "QUEUED" : "FAILED";
      mail.last_error = result.error;
      if (result.retryAt) mail.scheduled_for = result.retryAt;
    }
    mail.updated_at = nowIso;
    saveDb(db);
  }

  async listEmails(filter: EmailOutboxFilter): Promise<EmailMessage[]> {
    const outbox = loadDb().email_outbox ?? [];
    return outbox
      .filter((m) => {
        if (filter.status && m.status !== filter.status) return false;
        if (filter.bookingId && m.booking_id !== filter.bookingId) return false;
        if (filter.threadRoot && m.thread_root !== filter.threadRoot) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, filter.limit ?? 100);
  }

  async countEmailsByStatus(): Promise<Record<MailStatus, number>> {
    const outbox = loadDb().email_outbox ?? [];
    const counts = Object.fromEntries(MAIL_STATUSES.map((s) => [s, 0])) as Record<MailStatus, number>;
    for (const mail of outbox) counts[mail.status] += 1;
    return counts;
  }

  async listMailTemplates(): Promise<MailTemplateOverride[]> {
    return loadDb().mail_templates ?? [];
  }

  async saveMailTemplate(override: MailTemplateOverride): Promise<void> {
    const db = loadDb();
    const rows = db.mail_templates ?? (db.mail_templates = []);
    const at = rows.findIndex((r) => r.event_key === override.event_key);
    const row = { ...override, updated_at: new Date().toISOString() };
    if (at >= 0) rows[at] = row;
    else rows.push(row);
    saveDb(db);
  }

  async resetMailTemplate(key: MailEventKey): Promise<void> {
    const db = loadDb();
    db.mail_templates = (db.mail_templates ?? []).filter((r) => r.event_key !== key);
    saveDb(db);
  }

  async requeueEmail(id: string): Promise<void> {
    const db = loadDb();
    const mail = (db.email_outbox ??= []).find((m) => m.id === id);
    if (!mail) return;
    mail.status = "QUEUED";
    mail.attempts = 0;
    mail.last_error = null;
    mail.scheduled_for = new Date().toISOString();
    mail.updated_at = mail.scheduled_for;
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

/**
 * `profiles_hostel_fk` (migration 16), emulated: an account can only name a
 * hostel that is on the list.
 */
function assertHostelExists(db: Db, hostel: string | null | undefined): void {
  if (!hostel) return;
  if (!(db.hostels ?? []).includes(hostel)) {
    throw new Error(`${hostel} is not a hostel on the list — add it in Settings first`);
  }
}

/**
 * The unique index on `lower(ldap_uid)` (migration 12), emulated. Two profiles
 * sharing a uid would make LDAP sign-in pick one of them arbitrarily.
 */
function assertLdapUidFree(db: Db, uid: string | null | undefined, exceptId: string | null): void {
  if (!uid) return;
  const wanted = uid.toLowerCase();
  if (db.profiles.some((p) => p.id !== exceptId && p.ldap_uid?.toLowerCase() === wanted)) {
    throw new Error("Another user already has this LDAP username");
  }
}
