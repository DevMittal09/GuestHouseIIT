import type {
  Booking,
  BookingFilter,
  BookingRoom,
  BookingRoomWithGuests,
  BookingWithDetails,
  GuestHouse,
  NewBookingInput,
  Profile,
  Role,
  Room,
  RoomOccupancySegment,
  RoomType,
} from "@/lib/types";
import { BufferClashError, RoomClashError } from "@/lib/types";
import { parseRuleGroup } from "@/lib/settings";
import { bufferMs } from "@/lib/turnover";
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
import {
  defaultOverride,
  type MailTemplateOverride,
} from "@/lib/mail/template-config";
import { mealsOn, normalizeMeals } from "@/lib/meals";
import { getSupabase } from "@/lib/supabase/client";
import { ROOM_HOLDING_STATUSES } from "@/lib/workflow";
import { deriveFromRooms } from "./derive";
import type { Unit } from "@/lib/units";
import {
  auditMatches,
  type AuditEvent,
  type AuditFilter,
  type NewAuditEvent,
} from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import type { NewProjectInput, Project } from "@/lib/projects";
import type { NewTariffInput, Tariff } from "@/lib/tariffs";
import type { NewRoomBlockInput, RoomBlock } from "@/lib/operations";
import {
  invoiceErrorFrom,
  InvoiceStateError,
  type InvoiceFilter,
  type InvoiceRecord,
  type IssueInvoiceInput,
  type MealCounts,
  type PaymentMode,
} from "@/lib/invoice";
import type {
  BookingDetailsPatch,
  DataStore,
  NewLogInput,
  NewProfileInput,
  StatusUpdate,
} from "./types";

const BOOKING_SELECT = `*,
  requester:profiles!bookings_user_id_fkey(*),
  guest_house:guest_houses(*),
  guests:booking_guests(*),
  booking_rooms(*),
  logs:booking_logs(*)`;

/**
 * Ceiling on rows pulled for one archive search. Keyword matching spans joined
 * tables (guests, rooms, logs), which PostgREST cannot express, so the coarse
 * filters below run in SQL and the rest runs in JS over the result. If a scan
 * hits this cap the result is flagged `truncated` and the UI says so.
 */
const SEARCH_SCAN_LIMIT = 1000;

type BookingRow = Booking & {
  requester: Profile;
  guest_house: GuestHouse;
  guests: BookingWithDetails["guests"];
  /** Named for the table, because PostgREST embeds it under that name. */
  booking_rooms: BookingRoom[] | null;
  logs: BookingWithDetails["logs"];
};

/** A room hold joined to its room, for `hydrate`. */
type HoldRow = { booking_id: string; room_id: string; rooms: Room | null };

/** The `email_outbox` row as PostgREST returns it: `event_key` is plain text. */
type EmailOutboxRow = Omit<EmailMessage, "event_key"> & { event_key: string };

/** A room hold joined to its booking, for `listRoomOccupancy`. */
type OccupancyRow = {
  room_id: string;
  booking_id: string;
  during: string;
  override_by: string | null;
  bookings: {
    booking_reference_id: string;
    status: Booking["status"];
    check_in: string;
    check_out: string;
    purpose_of_visit: string;
    requester: { full_name: string } | null;
  } | null;
};

/**
 * `serves_meals` arrives with migration 8. Until it is applied a guest house
 * serves no meals — the booking form then simply offers none.
 */
function withMealsFlag(row: GuestHouse): GuestHouse {
  return { ...row, serves_meals: row.serves_meals ?? false };
}

/** Postgres `[lower,upper)` tstzrange literal. */
function rangeLiteral(from: string, to: string): string {
  return `["${new Date(from).toISOString()}","${new Date(to).toISOString()}")`;
}

export class SupabaseStore implements DataStore {
  private db = getSupabase();

  /**
   * The turnaround buffer in force, in ms. The holds' guards were built with
   * it (migration 17 rebuilds them whenever it changes), so a requested stay
   * padded by the same amount is compared like for like.
   */
  private async bufferNow(): Promise<number> {
    try {
      return bufferMs(parseRuleGroup("booking", await this.getJsonSetting("rules.booking")).buffer_minutes);
    } catch {
      return bufferMs(parseRuleGroup("booking", null).buffer_minutes);
    }
  }

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.db.from("profiles").select("*").order("role");
    if (error) throw error;
    return data;
  }

  async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await this.db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async listGuestHouses(): Promise<GuestHouse[]> {
    const { data, error } = await this.db.from("guest_houses").select("*").order("name");
    if (error) throw error;
    return data.map(withMealsFlag);
  }

  async getGuestHouse(id: string): Promise<GuestHouse | null> {
    const { data, error } = await this.db
      .from("guest_houses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? withMealsFlag(data) : null;
  }

  async listRooms(guestHouseId: string): Promise<Room[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select("*")
      .eq("guest_house_id", guestHouseId)
      .eq("is_active", true)
      .order("room_number");
    if (error) throw error;
    return data;
  }

  async createBooking(input: NewBookingInput): Promise<Booking> {
    // `submission_remarks` is pulled out with the rest: it belongs to the
    // first log entry, not to the bookings row, and spreading it into the
    // insert would name a column that does not exist.
    const {
      rooms,
      created_by,
      on_behalf_of_name,
      on_behalf_of_email,
      on_behalf_of_phone,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarded on purpose; see above
      submission_remarks: _submissionRemarks,
      ...bookingInput
    } = input;
    // Counted from the room cards rather than taken from the caller — see
    // `deriveFromRooms`.
    const derived = deriveFromRooms(input);
    const nowIso = new Date().toISOString();
    const { data: booking, error } = await this.db
      .from("bookings")
      .insert({
        ...bookingInput,
        ...derived,
        booking_reference_id: makeReference(),
        pets_policy_acknowledged_at: input.pets_policy_acknowledged ? nowIso : null,
        created_by: created_by ?? null,
        on_behalf_of_name: on_behalf_of_name ?? null,
        on_behalf_of_email: on_behalf_of_email ?? null,
        on_behalf_of_phone: on_behalf_of_phone ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Rooms before guests: a guest row names the card it belongs to, and the
    // composite foreign key refuses it if that card is not there yet.
    if (rooms.length > 0) {
      const { data: roomRows, error: roomError } = await this.db
        .from("booking_rooms")
        .insert(
          rooms.map((room, index) => ({
            booking_id: booking.id,
            room_index: index + 1,
            room_type: room.room_type,
          }))
        )
        .select();
      if (roomError) throw roomError;

      const byIndex = new Map((roomRows ?? []).map((r) => [r.room_index, r.id]));
      const guests = rooms.flatMap((room, index) =>
        room.guests.map((g) => ({
          ...g,
          booking_id: booking.id,
          booking_room_id: byIndex.get(index + 1)!,
        }))
      );
      if (guests.length > 0) {
        const { error: guestError } = await this.db.from("booking_guests").insert(guests);
        if (guestError) throw guestError;
      }
    }

    const requester = await this.getProfile(input.user_id);
    const { error: logError } = await this.db.from("booking_logs").insert({
      booking_id: booking.id,
      action_by: input.user_id,
      action_by_name: requester?.full_name ?? "Unknown",
      new_status: input.status,
      remarks: input.submission_remarks ?? "Booking submitted",
    });
    if (logError) throw logError;
    // A fresh booking holds nothing until the manager allocates rooms.
    return { ...booking, meals: normalizeMeals(booking.meals, booking), assigned_room_ids: [] };
  }

  /**
   * Fill in `assigned_room_ids` / `assigned_rooms` from `room_holds`. There is
   * no `assigned_room_ids` column any more — holds are the source of truth, so
   * the two cannot drift apart.
   */
  private async hydrate(rows: BookingRow[]): Promise<BookingWithDetails[]> {
    if (rows.length === 0) return [];

    const { data: holds, error: holdError } = await this.db
      .from("room_holds")
      .select("booking_id, room_id, rooms(*)")
      .in(
        "booking_id",
        rows.map((r) => r.id)
      );
    if (holdError) throw holdError;

    const byBooking = new Map<string, Room[]>();
    for (const hold of (holds ?? []) as unknown as HoldRow[]) {
      const list = byBooking.get(hold.booking_id) ?? [];
      if (hold.rooms) list.push(hold.rooms);
      byBooking.set(hold.booking_id, list);
    }

    const roomsById = new Map<string, Room>();
    for (const hold of (holds ?? []) as unknown as HoldRow[]) {
      if (hold.rooms) roomsById.set(hold.rooms.id, hold.rooms);
    }

    return rows.map((r) => {
      const assignedRooms = (byBooking.get(r.id) ?? []).sort((a, b) =>
        a.room_number.localeCompare(b.room_number)
      );
      const guests = r.guests ?? [];
      const cards = [...(r.booking_rooms ?? [])].sort((a, b) => a.room_index - b.room_index);
      const rooms: BookingRoomWithGuests[] = cards.map((card) => ({
        ...card,
        guests: guests.filter((g) => g.booking_room_id === card.id),
        assigned_room: card.assigned_room_id
          ? (roomsById.get(card.assigned_room_id) ?? null)
          : null,
      }));
      return {
        ...r,
        // Rows written before migration 6 have no `meals`, and rows not yet
        // converted by migration 8 hold the whole-stay object; normalising
        // here means no consumer downstream needs to know either.
        meals: normalizeMeals(r.meals, r),
        guest_house: r.guest_house ? withMealsFlag(r.guest_house) : r.guest_house,
        // Rows read before migration 7 is applied have no `has_infant`; an
        // infant guest row is what the old model used to say the same thing.
        has_infant: r.has_infant ?? r.guests.some((g) => g.is_infant),
        // Likewise before migration 9: the requester category is all the old
        // rows recorded, so derive the booking type from it exactly as the
        // migration's backfill does.
        booking_type:
          r.booking_type ??
          (r.user_role === "student" ? "personal" : r.user_role === "alumni" ? "alumni" : "official"),
        alumni_name: r.alumni_name ?? null,
        alumni_roll_number: r.alumni_roll_number ?? null,
        // Before migration 11 there were no room cards, no citizenship and no
        // service type. A database still on migration 10 reads as a room
        // booking with one unnamed card holding every guest, which is exactly
        // what the migration's backfill produces once it runs.
        service_type: r.service_type ?? ((r.meals?.length ?? 0) > 0 ? "room_meals" : "room"),
        meal_preference: r.meal_preference ?? null,
        meal_guest_count: r.meal_guest_count ?? null,
        pets_policy_acknowledged: r.pets_policy_acknowledged ?? false,
        pets_policy_acknowledged_at: r.pets_policy_acknowledged_at ?? null,
        has_foreign_national:
          r.has_foreign_national ?? guests.some((g) => g.citizenship === "other"),
        created_by: r.created_by ?? null,
        // Before migration 15 there is no debit head; a personal booking was
        // always personal funds, and nothing else is guessed.
        debit_head:
          r.debit_head ?? (r.booking_type === "personal" ? "personal_funds" : null),
        debit_details: r.debit_details ?? null,
        debit_document_url: r.debit_document_url ?? null,
        // Before migration 18: no project, and an office booking was direct.
        project_id: r.project_id ?? null,
        office_approval:
          r.office_approval ??
          (r.user_role === "official" || r.user_role === "iar_cell" ? "direct" : null),
        on_behalf_of_name: r.on_behalf_of_name ?? null,
        on_behalf_of_email: r.on_behalf_of_email ?? null,
        on_behalf_of_phone: r.on_behalf_of_phone ?? null,
        guests,
        rooms,
        assigned_room_ids: assignedRooms.map((room) => room.id),
        logs: [...r.logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        assigned_rooms: assignedRooms,
      };
    });
  }

  async getBooking(id: string): Promise<BookingWithDetails | null> {
    const { data, error } = await this.db
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [hydrated] = await this.hydrate([data as unknown as BookingRow]);
    return hydrated;
  }

  async listBookings(filter: BookingFilter): Promise<BookingWithDetails[]> {
    let query = this.db
      .from("bookings")
      .select(BOOKING_SELECT)
      .order("created_at", { ascending: false });
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.guestHouseId) query = query.eq("guest_house_id", filter.guestHouseId);
    if (filter.userRole) query = query.eq("user_role", filter.userRole);
    const { data, error } = await query;
    if (error) throw error;
    let rows = data as unknown as BookingRow[];
    // Requester-scoped filters resolve via the joined profile.
    if (filter.hostelName) rows = rows.filter((r) => r.requester?.hostel_name === filter.hostelName);
    if (filter.club) rows = rows.filter((r) => r.requester?.department_or_club === filter.club);
    return this.hydrate(rows);
  }

  async listBookingsForUser(userId: string): Promise<BookingWithDetails[]> {
    const { data, error } = await this.db
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return this.hydrate(data as unknown as BookingRow[]);
  }

  async searchBookings(criteria: BookingSearchCriteria): Promise<BookingSearchResult> {
    // Push down what SQL can do cheaply; the shared matcher handles the rest.
    // `statuses` is deliberately NOT pushed down: `runBookingSearch` reports
    // per-status facet counts computed *before* the status filter, so the
    // candidate set has to still contain the other statuses.
    let query = this.db
      .from("bookings")
      .select(BOOKING_SELECT)
      .order("created_at", { ascending: false })
      .limit(SEARCH_SCAN_LIMIT);
    if (criteria.guestHouseId) query = query.eq("guest_house_id", criteria.guestHouseId);
    if (criteria.userRole) query = query.eq("user_role", criteria.userRole);
    if (criteria.userId) query = query.eq("user_id", criteria.userId);
    if (criteria.checkInFrom) query = query.gte("check_in", criteria.checkInFrom);
    if (criteria.checkInTo) query = query.lte("check_in", criteria.checkInTo);

    const { data, error } = await query;
    if (error) throw error;
    const scanned = data as unknown as BookingRow[];
    const candidates = await this.hydrate(scanned);
    return runBookingSearch(candidates, criteria, scanned.length >= SEARCH_SCAN_LIMIT);
  }

  async updateBookingStatus(id: string, update: StatusUpdate, log: NewLogInput): Promise<void> {
    const { data: current, error: readError } = await this.db
      .from("bookings")
      .select("status, check_in, check_out")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    // Rooms first. The exclusion constraint is the only thing here that can
    // fail on a race, and failing before the status moves leaves the booking
    // untouched for the caller to retry against fresh occupancy.
    if (update.assigned_room_ids !== undefined) {
      await this.setRoomHolds(id, update.assigned_room_ids, current.check_in, current.check_out, {
        overrideRoomIds: update.override_room_ids ?? [],
        overrideBy: update.override_by ?? null,
      });
      await this.assignRoomsToCards(id, update.assigned_room_ids);
    }

    const { error } = await this.db
      .from("bookings")
      .update({
        status: update.status,
        ...(update.rejection_reason !== undefined && { rejection_reason: update.rejection_reason }),
        ...(update.no_show_released_at !== undefined && { no_show_released_at: update.no_show_released_at }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;

    // A hold exists exactly while the booking holds the room, so a status that
    // is not in ROOM_HOLDING_STATUSES releases the rooms with no caller
    // involvement — VACATED, CANCELLED, REJECTED and CANCELLATION_APPROVED all
    // free their rooms here rather than at each call site.
    if (!ROOM_HOLDING_STATUSES.includes(update.status)) {
      const { error: releaseError } = await this.db
        .from("room_holds")
        .delete()
        .eq("booking_id", id);
      if (releaseError) throw releaseError;
      await this.assignRoomsToCards(id, []);
    }

    const { error: logError } = await this.db.from("booking_logs").insert({
      booking_id: id,
      action_by: log.action_by,
      action_by_name: log.action_by_name,
      previous_status: current.status,
      new_status: update.status,
      remarks: log.remarks,
    });
    if (logError) throw logError;
  }

  /**
   * Replace a booking's holds in one transaction. Doing the delete and the
   * insert as two PostgREST calls would drop the old holds before finding out
   * the new ones do not fit; the `set_room_holds` function rolls both back on
   * an exclusion violation.
   */
  private async setRoomHolds(
    bookingId: string,
    roomIds: string[],
    checkIn: string,
    checkOut: string,
    override: { overrideRoomIds: string[]; overrideBy: string | null } = {
      overrideRoomIds: [],
      overrideBy: null,
    }
  ): Promise<void> {
    const { error } = await this.db.rpc("set_room_holds", {
      p_booking_id: bookingId,
      p_room_ids: roomIds,
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_override_room_ids: override.overrideRoomIds,
      p_override_by: override.overrideBy,
    });
    if (!error) return;
    // 23P01 = exclusion_violation: someone else holds one of these rooms.
    if (error.code === "23P01") throw new RoomClashError();
    // Migration 20: the room is out of service for maintenance then.
    const blocked = /ROOM_BLOCKED\|([^\n]+)/.exec(error.message);
    if (blocked) throw new RoomClashError(blocked[1]);
    throw error;
  }

  /**
   * Record which room card each allocated room was for, in card order.
   *
   * Runs after `setRoomHolds`, never instead of it: the holds are what stop a
   * double booking, and this is what lets the desk say which party is in
   * which room. A card past the end of `roomIds` is cleared, which is what a
   * release looks like.
   */
  private async assignRoomsToCards(bookingId: string, roomIds: string[]): Promise<void> {
    const { data: cards, error } = await this.db
      .from("booking_rooms")
      .select("id, room_index")
      .eq("booking_id", bookingId)
      .order("room_index");
    if (error) throw error;

    for (const [i, card] of (cards ?? []).entries()) {
      const next = roomIds[i] ?? null;
      const { error: updateError } = await this.db
        .from("booking_rooms")
        .update({ assigned_room_id: next })
        .eq("id", card.id);
      if (updateError) throw updateError;
    }
  }

  async updateBookingDetails(
    id: string,
    patch: BookingDetailsPatch,
    log: NewLogInput
  ): Promise<void> {
    const { data: current, error: readError } = await this.db
      .from("bookings")
      .select("status, check_in, check_out, extension_requested_until")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const checkIn = patch.check_in ?? current.check_in;
    const checkOut = patch.check_out ?? current.check_out;

    // Dates first. The holds carry the period, so moving the stay moves them,
    // and the exclusion constraint decides whether that is allowed — a stay
    // cannot be extended over a room someone else already has. Failing here
    // leaves the booking untouched.
    if (checkIn !== current.check_in || checkOut !== current.check_out) {
      const { data: holds, error: holdError } = await this.db
        .from("room_holds")
        .select("room_id")
        .eq("booking_id", id);
      if (holdError) throw holdError;
      await this.setRoomHolds(
        id,
        (holds ?? []).map((h) => h.room_id),
        checkIn,
        checkOut
      );
    }

    const { error } = await this.db
      .from("bookings")
      .update({
        ...(patch.check_in !== undefined && { check_in: checkIn }),
        ...(patch.check_out !== undefined && { check_out: checkOut }),
        ...(patch.purpose_of_visit !== undefined && {
          purpose_of_visit: patch.purpose_of_visit,
        }),
        ...(patch.meals !== undefined && { meals: patch.meals }),
        ...(patch.meal_preference !== undefined && { meal_preference: patch.meal_preference }),
        // Migration 20: a request is set or cleared explicitly, and one the new
        // check-out already satisfies is settled.
        ...(patch.extension_request !== undefined
          ? {
              extension_requested_until: patch.extension_request?.until ?? null,
              extension_reason: patch.extension_request?.reason ?? null,
              extension_requested_at: patch.extension_request ? new Date().toISOString() : null,
            }
          : current.extension_requested_until && Date.parse(current.extension_requested_until) <= Date.parse(checkOut)
            ? { extension_requested_until: null, extension_reason: null, extension_requested_at: null }
            : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;

    const { error: logError } = await this.db.from("booking_logs").insert({
      booking_id: id,
      action_by: log.action_by,
      action_by_name: log.action_by_name,
      previous_status: current.status,
      new_status: current.status,
      remarks: log.remarks,
    });
    if (logError) throw logError;
  }

  async listBookingsWithMealsOn(
    day: string,
    guestHouseId?: string
  ): Promise<BookingWithDetails[]> {
    // The day is an institute calendar date and `meals` is keyed by the same,
    // so the date is matched inside the jsonb rather than against the stay's
    // timestamps — a stay can span a day it asked for no meals on.
    let query = this.db
      .from("bookings")
      .select(BOOKING_SELECT)
      .contains("meals", JSON.stringify([{ date: day }]))
      .order("check_in");
    if (guestHouseId) query = query.eq("guest_house_id", guestHouseId);
    const { data, error } = await query;
    if (error) throw error;

    const rows = data as unknown as BookingRow[];
    const hydrated = await this.hydrate(rows);
    // `contains` matches the day being present at all; this keeps only the
    // bookings that actually asked for a meal on it.
    return hydrated.filter((b) => mealsOn(b.meals, day).length > 0);
  }

  async getOccupiedRoomIds(
    guestHouseId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): Promise<string[]> {
    // Straight off the holds — no status filter needed, because a hold row
    // only exists while the booking is actually holding the room. Compared on
    // the guard, against the requested stay padded by the turnaround buffer:
    // what the exclusion constraint would compare on allocation.
    const padded = new Date(Date.parse(checkOut) + (await this.bufferNow())).toISOString();
    let query = this.db
      .from("room_holds")
      .select("room_id, rooms!inner(guest_house_id)")
      .eq("rooms.guest_house_id", guestHouseId)
      .overlaps("guard", rangeLiteral(checkIn, padded));
    if (excludeBookingId) query = query.neq("booking_id", excludeBookingId);
    const { data, error } = await query;
    if (error) throw error;
    return [...new Set((data ?? []).map((h) => h.room_id))];
  }

  async listRoomOccupancy(
    guestHouseId: string,
    from: string,
    to: string
  ): Promise<RoomOccupancySegment[]> {
    const select = `room_id, booking_id, during, override_by,
         rooms!inner(guest_house_id),
         bookings!inner(booking_reference_id, status, check_in, check_out, purpose_of_visit,
                        requester:profiles!bookings_user_id_fkey(full_name))`;
    // Two reads rather than one `or`: the turnaround after a stay is drawn
    // too, so a hold is wanted when its stay *or* its guard (the stay plus
    // the buffer) falls in the window, and range literals do not survive
    // PostgREST's `or=` quoting cleanly.
    const window = rangeLiteral(from, to);
    const [byStay, byGuard, buffer] = await Promise.all([
      this.db.from("room_holds").select(select).eq("rooms.guest_house_id", guestHouseId).overlaps("during", window),
      this.db.from("room_holds").select(select).eq("rooms.guest_house_id", guestHouseId).overlaps("guard", window),
      this.bufferNow(),
    ]);
    if (byStay.error) throw byStay.error;
    if (byGuard.error) throw byGuard.error;

    const seen = new Set<string>();
    const rows = [...(byStay.data ?? []), ...(byGuard.data ?? [])] as unknown as OccupancyRow[];
    return rows.flatMap((hold) => {
      const b = hold.bookings;
      const key = `${hold.booking_id}:${hold.room_id}`;
      if (!b || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          room_id: hold.room_id,
          booking_id: hold.booking_id,
          booking_reference_id: b.booking_reference_id,
          status: b.status,
          check_in: b.check_in,
          check_out: b.check_out,
          turnaround_until:
            !hold.override_by && buffer > 0
              ? new Date(Date.parse(b.check_out) + buffer).toISOString()
              : null,
          requester_name: b.requester?.full_name ?? null,
          purpose_of_visit: b.purpose_of_visit,
        },
      ];
    });
  }

  async applyBookingBuffer(minutes: number): Promise<void> {
    // One transaction in Postgres: refuse on a clash, otherwise save the
    // setting and rebuild every hold (migration 17).
    const { error } = await this.db.rpc("set_booking_buffer", { p_minutes: minutes });
    if (!error) return;
    const match = /BUFFER_CLASH\|(\d+)\|(.*)/.exec(error.message);
    if (match) throw new BufferClashError(Number(match[1]), match[2]);
    const blocked = /ROOM_BLOCKED\|([^\n]+)/.exec(error.message);
    if (blocked) throw new RoomClashError(`That buffer would run a stay into a maintenance block: ${blocked[1]}`);
    throw error;
  }

  async saveDocument(file: File, folder: string): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${folder}/${Date.now()}-${safeName}`;
    const { error } = await this.db.storage.from("documents").upload(filePath, file, {
      contentType: file.type,
    });
    if (error) throw error;
    // Private bucket: return a long-lived signed URL. For production, prefer
    // storing the path and signing on demand.
    const { data, error: signError } = await this.db.storage
      .from("documents")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);
    if (signError) throw signError;
    return data.signedUrl;
  }

  // ---- developer / admin operations ----------------------------------
  // Requires SUPABASE_SERVICE_ROLE_KEY (auth.admin API for user lifecycle).

  async createProfile(input: NewProfileInput): Promise<Profile> {
    const { data: created, error: authError } = await this.db.auth.admin.createUser({
      email: input.email,
      password: "password123",
      email_confirm: true,
    });
    if (authError) throw new Error(`Auth user creation failed: ${authError.message}`);
    const { data, error } = await this.db
      .from("profiles")
      .insert({ ...input, id: created.user.id })
      .select()
      .single();
    if (error) {
      // The profile failed, so the auth user it was for must go too, or the
      // email is taken by an account nobody can see in the console.
      await this.db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw profileWriteError(error);
    }
    return data;
  }

  async updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void> {
    const { error } = await this.db.from("profiles").update(patch).eq("id", id);
    if (error) throw profileWriteError(error);
  }

  async deleteProfile(id: string): Promise<void> {
    const { count, error: countError } = await this.db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error("This user has bookings — delete or reassign those first");
    }
    const { error } = await this.db.from("profiles").delete().eq("id", id);
    if (error) throw error;
    await this.db.auth.admin.deleteUser(id).catch(() => undefined);
  }

  async listUnits(): Promise<Unit[]> {
    const { data, error } = await this.db.from("units").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as Unit[];
  }

  async createUnit(input: Omit<Unit, "id">): Promise<Unit> {
    const { data, error } = await this.db.from("units").insert(input).select().single();
    if (error) {
      if (error.code === "23505") throw new Error("A unit with this name already exists");
      throw error;
    }
    return data as Unit;
  }

  async updateUnit(id: string, patch: Partial<Omit<Unit, "id">>): Promise<void> {
    const { error } = await this.db.from("units").update(patch).eq("id", id);
    if (error) throw error;
  }

  async deleteUnit(id: string): Promise<void> {
    const { error } = await this.db.from("units").delete().eq("id", id);
    if (error) {
      // 23503 = foreign_key_violation: people or sub-units still point here.
      if (error.code === "23503") {
        throw new Error("People or other units still belong to this one - move them first");
      }
      throw error;
    }
  }

  async createGuestHouse(name: string): Promise<GuestHouse> {
    const { data, error } = await this.db
      .from("guest_houses")
      .insert({ name, total_rooms: 0 })
      .select()
      .single();
    if (error) throw error;
    return withMealsFlag(data);
  }

  async updateGuestHouse(
    id: string,
    patch: { name?: string; serves_meals?: boolean }
  ): Promise<void> {
    const { error } = await this.db.from("guest_houses").update(patch).eq("id", id);
    if (error) throw error;
  }

  async deleteGuestHouse(id: string): Promise<void> {
    const { count, error: countError } = await this.db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("guest_house_id", id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error("Bookings reference this guest house — delete those first");
    }
    const { error } = await this.db.from("guest_houses").delete().eq("id", id);
    if (error) throw error;
  }

  private async recountRooms(guestHouseId: string): Promise<void> {
    const { count } = await this.db
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("guest_house_id", guestHouseId)
      .eq("is_active", true);
    await this.db.from("guest_houses").update({ total_rooms: count ?? 0 }).eq("id", guestHouseId);
  }

  async listAllRooms(guestHouseId: string): Promise<Room[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select("*")
      .eq("guest_house_id", guestHouseId)
      .order("room_number");
    if (error) throw error;
    return data;
  }

  async createRoom(guestHouseId: string, roomNumber: string, roomType: RoomType): Promise<Room> {
    const { data, error } = await this.db
      .from("rooms")
      .insert({ guest_house_id: guestHouseId, room_number: roomNumber, room_type: roomType })
      .select()
      .single();
    if (error) {
      throw error.code === "23505"
        ? new Error(`Room ${roomNumber} already exists in this guest house`)
        : error;
    }
    await this.recountRooms(guestHouseId);
    return data;
  }

  async updateRoom(
    id: string,
    patch: { is_active?: boolean; room_number?: string; room_type?: RoomType }
  ): Promise<void> {
    const { data, error } = await this.db
      .from("rooms")
      .update(patch)
      .eq("id", id)
      .select("guest_house_id")
      .single();
    if (error) throw error;
    await this.recountRooms(data.guest_house_id);
  }

  async deleteRoom(id: string): Promise<void> {
    const { count, error: countError } = await this.db
      .from("room_holds")
      .select("room_id", { count: "exact", head: true })
      .eq("room_id", id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new Error("This room is assigned to a booking — deactivate it instead");
    }
    const { data, error } = await this.db
      .from("rooms")
      .delete()
      .eq("id", id)
      .select("guest_house_id")
      .single();
    if (error) throw error;
    await this.recountRooms(data.guest_house_id);
  }

  async getFormConfig(role: Role): Promise<RoleFormConfig | null> {
    const { data, error } = await this.db
      .from("form_configs")
      .select("config")
      .eq("role", role)
      .maybeSingle();
    if (error) throw error;
    return data?.config ?? null;
  }

  async saveFormConfig(config: RoleFormConfig): Promise<void> {
    const { error } = await this.db
      .from("form_configs")
      .upsert({ role: config.role, config, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async deleteFormConfig(role: Role): Promise<void> {
    const { error } = await this.db.from("form_configs").delete().eq("role", role);
    if (error) throw error;
  }

  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return typeof data?.value === "string" ? data.value : null;
  }

  async getJsonSetting(key: string): Promise<unknown | null> {
    const { data, error } = await this.db
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  }

  async setJsonSetting(key: string, value: unknown): Promise<void> {
    const { error } = await this.db
      .from("app_settings")
      .upsert({ key, value: value as Json, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async listHostels(): Promise<string[]> {
    const { data, error } = await this.db.from("hostels").select("name").order("name");
    if (error) throw error;
    return (data ?? []).map((r) => r.name);
  }

  async addHostel(name: string): Promise<void> {
    const { error } = await this.db.from("hostels").insert({ name });
    if (error) {
      if (error.code === "23505") throw new Error(`${name} is already on the list`);
      throw error;
    }
  }

  async renameHostel(from: string, to: string): Promise<void> {
    // `profiles_hostel_fk` is `on update cascade`, so every account in the
    // hostel follows the rename inside this one statement.
    const { error } = await this.db.from("hostels").update({ name: to }).eq("name", from);
    if (error) {
      if (error.code === "23505") throw new Error(`${to} is already on the list`);
      throw error;
    }
  }

  async removeHostel(name: string): Promise<void> {
    const { error } = await this.db.from("hostels").delete().eq("name", name);
    if (error) {
      // 23503 = foreign_key_violation: an account still names it.
      if (error.code === "23503") {
        throw new Error(`Accounts still name ${name} — move them first`);
      }
      throw error;
    }
  }

  async listOfficialEmails(): Promise<string[]> {
    const { data, error } = await this.db
      .from("official_email_whitelist")
      .select("email")
      .order("email");
    if (error) throw error;
    return (data ?? []).map((r) => r.email);
  }

  async addOfficialEmail(email: string): Promise<void> {
    const wanted = email.trim().toLowerCase();
    const { error } = await this.db.from("official_email_whitelist").insert({ email: wanted });
    if (error) {
      if (error.code === "23505") throw new Error(`${wanted} is already on the list`);
      throw error;
    }
  }

  async removeOfficialEmail(email: string): Promise<void> {
    const { error } = await this.db
      .from("official_email_whitelist")
      .delete()
      .eq("email", email.trim().toLowerCase());
    if (error) throw error;
  }

  async listProjects(): Promise<Project[]> {
    const { data, error } = await this.db.from("projects").select("*").order("project_number");
    if (error) throw error;
    return (data ?? []) as Project[];
  }

  async createProjects(inputs: NewProjectInput[]): Promise<void> {
    if (inputs.length === 0) return;
    // One statement: the paste import is all or nothing.
    const { error } = await this.db.from("projects").insert(inputs);
    if (error) {
      if (error.code === "23505") throw new Error("One of those project numbers is already on the list");
      throw error;
    }
  }

  async updateProject(id: string, patch: Partial<NewProjectInput>): Promise<void> {
    const { error } = await this.db.from("projects").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("Another project already has that number");
      throw error;
    }
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.db.from("projects").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        throw new Error("A booking is debited to this project — deactivate it instead");
      }
      throw error;
    }
  }

  async appendAudit(event: NewAuditEvent): Promise<void> {
    const { error } = await this.db.from("security_audit").insert({
      ...event,
      details: event.details as Json,
    });
    if (error) throw error;
  }

  async listAudit(filter: AuditFilter): Promise<AuditEvent[]> {
    const limit = filter.limit ?? 200;
    let query = this.db
      .from("security_audit")
      .select("*")
      .order("at", { ascending: false })
      // Free text spans jsonb details, so it is matched after the read; pull
      // a wider page when it is in play so a match is not cut off.
      .limit(filter.q ? Math.max(limit * 5, 1000) : limit);
    if (filter.event) query = query.eq("event", filter.event);
    if (filter.actorId) query = query.eq("actor_id", filter.actorId);
    if (filter.from) query = query.gte("at", filter.from);
    if (filter.to) query = query.lt("at", filter.to);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? [])
      .map(
        (row): AuditEvent => ({
          ...row,
          id: String(row.id),
          event: row.event as AuditEvent["event"],
          details: (row.details ?? {}) as Record<string, unknown>,
        })
      )
      .filter((e) => auditMatches(e, filter))
      .slice(0, limit);
  }

  async setSetting(key: string, value: string): Promise<void> {
    const { error } = await this.db
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  // ---- maintenance blocks and bulk rooms (migration 20) ----------------

  async listRoomBlocks(guestHouseId: string): Promise<RoomBlock[]> {
    // A string, not a literal, so the embedded join is not type-checked
    // against the hand-written schema (as for `room_holds`).
    const select: string = "id, room_id, during, reason, created_by, created_at, rooms!inner(guest_house_id)";
    const { data, error } = await this.db.from("room_blocks").select(select).eq("rooms.guest_house_id", guestHouseId);
    if (error) throw error;
    type Row = { id: string; room_id: string; during: string; reason: string; created_by: string | null; created_at: string };
    return ((data ?? []) as unknown as Row[])
      .map((row) => {
        const [from, to] = parseRange(String(row.during));
        return { id: row.id, room_id: row.room_id, from, to, reason: row.reason, created_by: row.created_by, created_at: row.created_at };
      })
      .sort((a, b) => a.from.localeCompare(b.from));
  }

  async createRoomBlock(input: NewRoomBlockInput): Promise<RoomBlock> {
    const { data, error } = await this.db
      .from("room_blocks")
      .insert({ room_id: input.room_id, during: rangeLiteral(input.from, input.to), reason: input.reason, created_by: input.created_by })
      .select("id, created_at")
      .single();
    if (error) {
      const blocked = /ROOM_BLOCKED\|([^\n]+)/.exec(error.message);
      if (blocked) throw new RoomClashError(blocked[1]);
      if (error.code === "23P01") throw new RoomClashError("That room is already blocked for part of that time");
      throw error;
    }
    return { ...input, id: data.id, created_at: data.created_at };
  }

  async deleteRoomBlock(id: string): Promise<void> {
    const { error } = await this.db.from("room_blocks").delete().eq("id", id);
    if (error) throw error;
  }

  async createRooms(guestHouseId: string, rooms: { room_number: string; room_type: RoomType }[]): Promise<number> {
    if (rooms.length === 0) return 0;
    const { error } = await this.db
      .from("rooms")
      .insert(rooms.map((r) => ({ guest_house_id: guestHouseId, room_number: r.room_number, room_type: r.room_type })));
    if (error) {
      throw error.code === "23505" ? new Error("One of those room numbers already exists in this guest house") : error;
    }
    await this.recountRooms(guestHouseId);
    return rooms.length;
  }

  // ---- tariffs and invoices (migration 19) ----------------------------

  async listTariffs(): Promise<Tariff[]> {
    const { data, error } = await this.db.from("tariffs").select("*").order("effective_from");
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, rate: Number(row.rate) })) as Tariff[];
  }

  async createTariff(input: NewTariffInput): Promise<Tariff> {
    const { data, error } = await this.db.from("tariffs").insert(input).select("*").single();
    if (error) {
      if (error.code === "23505") throw new Error("A rate for exactly this scope already starts on that date");
      throw error;
    }
    return { ...data, rate: Number(data.rate) } as Tariff;
  }

  async deleteTariff(id: string): Promise<void> {
    const { error } = await this.db.from("tariffs").delete().eq("id", id);
    if (error) throw invoiceErrorFrom(error.message) ?? error;
  }

  async listInvoices(filter: InvoiceFilter): Promise<InvoiceRecord[]> {
    let query = this.db.from("invoices").select("*").order("created_at", { ascending: false });
    if (filter.bookingId) query = query.eq("booking_id", filter.bookingId);
    if (filter.bookingIds) query = query.in("booking_id", filter.bookingIds);
    if (filter.issuedFrom) query = query.gte("issued_at", filter.issuedFrom);
    if (filter.issuedTo) query = query.lt("issued_at", filter.issuedTo);
    if (filter.paidFrom) query = query.gte("paid_at", filter.paidFrom);
    if (filter.paidTo) query = query.lt("paid_at", filter.paidTo);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(hydrateInvoice);
  }

  async getInvoice(id: string): Promise<InvoiceRecord | null> {
    const { data, error } = await this.db.from("invoices").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? hydrateInvoice(data) : null;
  }

  async saveInvoiceDraft(bookingId: string, mealCounts: MealCounts | null, userId: string): Promise<InvoiceRecord> {
    const { data: live, error: readError } = await this.db
      .from("invoices")
      .select("*")
      .eq("booking_id", bookingId)
      .neq("status", "cancelled")
      .maybeSingle();
    if (readError) throw readError;
    if (live && live.status !== "draft") {
      throw new InvoiceStateError(`This booking already has invoice ${live.invoice_number} — cancel it first to issue a corrected one.`);
    }
    const write = live
      ? this.db.from("invoices").update({ meal_counts: mealCounts, updated_at: new Date().toISOString() }).eq("id", live.id)
      : this.db.from("invoices").insert({ booking_id: bookingId, meal_counts: mealCounts, created_by: userId });
    const { data, error } = await write.select("*").single();
    if (error) {
      // Two desks saving the first draft at once: the partial unique index
      // lets one win; the other retries as an update.
      if (error.code === "23505") return this.saveInvoiceDraft(bookingId, mealCounts, userId);
      throw error;
    }
    return hydrateInvoice(data);
  }

  async issueInvoice(input: IssueInvoiceInput): Promise<InvoiceRecord> {
    const { data, error } = await this.db.rpc("issue_invoice", {
      p_booking_id: input.bookingId,
      p_fy: input.fy,
      p_prefix: input.prefix,
      p_digits: input.digits,
      p_document: input.document,
      p_meal_counts: input.mealCounts,
      p_issued_by: input.issuedBy,
      p_replaces: input.replaces,
    });
    if (error) {
      if (error.code === "23505") {
        throw new InvoiceStateError("Another invoice was issued for this booking a moment ago — reload to see it.");
      }
      throw invoiceErrorFrom(error.message) ?? error;
    }
    return hydrateInvoice(data);
  }

  async markInvoicePaid(
    id: string,
    payment: { mode: PaymentMode; reference: string | null; paidAt: string; paidBy: string }
  ): Promise<void> {
    const { data, error } = await this.db
      .from("invoices")
      .update({
        status: "paid",
        payment_mode: payment.mode,
        payment_reference: payment.reference?.trim() || null,
        paid_at: payment.paidAt,
        paid_by: payment.paidBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "issued")
      .select("id");
    if (error) throw invoiceErrorFrom(error.message) ?? error;
    if (!data?.length) throw new InvoiceStateError("Only an issued, unpaid invoice can be marked paid — reload to see its state.");
  }

  async cancelInvoice(id: string, cancel: { reason: string; by: string }): Promise<void> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from("invoices")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: cancel.by,
        cancel_reason: cancel.reason.trim(),
        updated_at: now,
      })
      .eq("id", id)
      .in("status", ["issued", "paid"])
      .select("id");
    if (error) throw invoiceErrorFrom(error.message) ?? error;
    if (!data?.length) throw new InvoiceStateError("Only an issued or paid invoice can be cancelled — reload to see its state.");
  }

  async deleteBooking(id: string): Promise<void> {
    // A draft goes with its booking; an issued invoice keeps it (on delete
    // restrict), and the refusal is said in words.
    const { error: draftError } = await this.db
      .from("invoices")
      .delete()
      .eq("booking_id", id)
      .eq("status", "draft");
    if (draftError && draftError.code !== "42P01" && draftError.code !== "PGRST205") throw draftError;
    const { error } = await this.db.from("bookings").delete().eq("id", id);
    if (error) {
      if (error.code === "23503" && /invoices/.test(error.message)) {
        throw new InvoiceStateError("An invoice was issued for this booking, so it cannot be deleted — cancel the booking instead.");
      }
      throw error;
    }
  }

  // ---- email outbox ------------------------------------------------

  async enqueueEmails(inputs: NewEmailInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    // `ignoreDuplicates` makes this `on conflict do nothing` against the
    // unique index on idempotency_key, so a retried action re-queues nothing.
    // The returned rows are the ones that were actually new.
    const { data, error } = await this.db
      .from("email_outbox")
      .upsert(
        inputs.map((input) => ({
          booking_id: input.booking_id,
          event_key: input.event_key,
          idempotency_key: input.idempotency_key,
          to_emails: input.to_emails,
          cc_emails: input.cc_emails,
          subject: input.subject,
          body_html: input.body_html,
          body_text: input.body_text,
          thread_root: input.thread_root,
          is_thread_root: input.is_thread_root,
          // Sent only when there is something to attach, so queueing keeps
          // working on a database without migration 19's column.
          ...(input.attachments?.length ? { attachments: input.attachments } : {}),
          ...(input.scheduled_for ? { scheduled_for: input.scheduled_for } : {}),
        })),
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  async claimQueuedEmails(limit: number, staleAfterMs: number): Promise<EmailMessage[]> {
    // One statement, `for update skip locked` inside: two workers running at
    // once get disjoint batches instead of both sending the same message.
    // Doing this as select-then-update over PostgREST would be exactly the
    // check-then-act race that `room_holds` exists to avoid.
    const { data, error } = await this.db.rpc("claim_queued_emails", {
      p_limit: limit,
      p_stale_after: `${Math.max(1, Math.round(staleAfterMs / 1000))} seconds`,
    });
    if (error) throw error;
    return (data ?? []).map(hydrateEmail);
  }

  async settleEmail(id: string, result: EmailSettlement): Promise<void> {
    const patch = result.ok
      ? { status: "SENT" as MailStatus, sent_at: new Date().toISOString(), last_error: null }
      : {
          // A retry is still QUEUED, due later; only giving up is FAILED.
          status: (result.retryAt ? "QUEUED" : "FAILED") as MailStatus,
          last_error: result.error,
          ...(result.retryAt ? { scheduled_for: result.retryAt } : {}),
        };
    const { error } = await this.db.from("email_outbox").update(patch).eq("id", id);
    if (error) throw error;
  }

  async listEmails(filter: EmailOutboxFilter): Promise<EmailMessage[]> {
    let query = this.db
      .from("email_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 100);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.bookingId) query = query.eq("booking_id", filter.bookingId);
    if (filter.threadRoot) query = query.eq("thread_root", filter.threadRoot);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(hydrateEmail);
  }

  async countEmailsByStatus(): Promise<Record<MailStatus, number>> {
    const counts = Object.fromEntries(MAIL_STATUSES.map((s) => [s, 0])) as Record<MailStatus, number>;
    // `head: true` with an exact count returns the number and no rows, so this
    // stays cheap however large the outbox gets.
    await Promise.all(
      MAIL_STATUSES.map(async (status) => {
        const { count, error } = await this.db
          .from("email_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw error;
        counts[status] = count ?? 0;
      })
    );
    return counts;
  }

  async listMailTemplates(): Promise<MailTemplateOverride[]> {
    const { data, error } = await this.db.from("mail_templates").select("*");
    if (error) throw error;
    // `cc_emails` is a text[] column; everything else maps straight across.
    return (data ?? []).map((row) => ({
      ...defaultOverride(row.event_key as MailEventKey),
      enabled: row.enabled,
      subject: row.subject,
      intro: row.intro,
      outro: row.outro,
      cc: row.cc_emails ?? [],
      updated_at: row.updated_at,
    }));
  }

  async saveMailTemplate(override: MailTemplateOverride): Promise<void> {
    const { error } = await this.db.from("mail_templates").upsert(
      {
        event_key: override.event_key,
        enabled: override.enabled,
        subject: override.subject,
        intro: override.intro,
        outro: override.outro,
        cc_emails: override.cc,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_key" }
    );
    if (error) throw error;
  }

  async resetMailTemplate(key: MailEventKey): Promise<void> {
    // Deleting the row *is* the reset: with nothing stored, the wording falls
    // back to `lib/mail/templates.ts`.
    const { error } = await this.db.from("mail_templates").delete().eq("event_key", key);
    if (error) throw error;
  }

  async requeueEmail(id: string): Promise<void> {
    const { error } = await this.db
      .from("email_outbox")
      .update({
        status: "QUEUED" as MailStatus,
        attempts: 0,
        last_error: null,
        scheduled_for: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  }
}

/**
 * Fill in the defaults Postgres applies, so `EmailMessage` is the same shape
 * from either backend. `cc_emails` defaults to `{}` and `thread_root` is
 * nullable, but a row written before those had values would otherwise reach
 * the dispatcher as undefined.
 */
function hydrateEmail(row: EmailOutboxRow): EmailMessage {
  return {
    ...row,
    attachments: (row as { attachments?: EmailMessage["attachments"] }).attachments ?? [],
    cc_emails: row.cc_emails ?? [],
    to_emails: row.to_emails ?? [],
    event_key: row.event_key as EmailMessage["event_key"],
  };
}

function makeReference(): string {
  const year = new Date().getFullYear();
  const rand = Array.from({ length: 5 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32))
  ).join("");
  return `IITPKD-GH-${year}-${rand}`;
}

/**
 * Migration 12's unique index on `lower(ldap_uid)`, reported the way the mock
 * store reports it rather than as a raw constraint name.
 */
function profileWriteError(error: { code?: string; message: string }): Error | typeof error {
  if (error.code === "23505" && error.message.includes("ldap_uid")) {
    return new Error("Another user already has this LDAP username");
  }
  // Migration 16: `profiles.hostel_name` must name a hostel on the list.
  if (error.code === "23503" && error.message.includes("profiles_hostel_fk")) {
    return new Error("That hostel is not on the list — add it in Settings first");
  }
  return error;
}

/** numeric columns arrive as strings from PostgREST. */
function hydrateInvoice(row: Record<string, unknown>): InvoiceRecord {
  const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const doc = row.document as InvoiceRecord["document"] | Record<string, never> | null;
  return {
    ...(row as unknown as InvoiceRecord),
    document: doc && Object.keys(doc).length > 0 ? (doc as InvoiceRecord["document"]) : null,
    subtotal_rooms: n(row.subtotal_rooms),
    subtotal_dining: n(row.subtotal_dining),
    total: n(row.total),
    gst_percent: n(row.gst_percent),
    gst_amount: n(row.gst_amount),
    grand_total: n(row.grand_total),
  };
}

/** `["2030-01-10 12:00:00+05:30","2030-01-11 12:00:00+05:30")` → ISO bounds. */
function parseRange(literal: string): [string, string] {
  const m = /^[[(]"?([^",]+)"?,"?([^")\]]+)"?[)\]]$/.exec(literal.trim());
  if (!m) return ["", ""];
  return [new Date(m[1]).toISOString(), new Date(m[2]).toISOString()];
}
