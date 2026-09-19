import type {
  Booking,
  BookingFilter,
  BookingWithDetails,
  GuestHouse,
  NewBookingInput,
  Profile,
  Role,
  Room,
  RoomOccupancySegment,
  RoomType,
} from "@/lib/types";
import { RoomClashError } from "@/lib/types";
import type { BookingSearchCriteria, BookingSearchResult } from "@/lib/booking-search";
import { runBookingSearch } from "@/lib/booking-search";
import type { RoleFormConfig } from "@/lib/form-config";
import type {
  EmailMessage,
  EmailOutboxFilter,
  EmailSettlement,
  MailStatus,
  NewEmailInput,
} from "@/lib/mail/types";
import { MAIL_STATUSES } from "@/lib/mail/types";
import { normalizeMeals } from "@/lib/meals";
import { getSupabase } from "@/lib/supabase/client";
import { ROOM_HOLDING_STATUSES } from "@/lib/workflow";
import type { DataStore, NewLogInput, NewProfileInput, StatusUpdate } from "./types";

const BOOKING_SELECT = `*,
  requester:profiles!bookings_user_id_fkey(*),
  guest_house:guest_houses(*),
  guests:booking_guests(*),
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
    const { guests, ...bookingInput } = input;
    const { data: booking, error } = await this.db
      .from("bookings")
      .insert({ ...bookingInput, booking_reference_id: makeReference() })
      .select()
      .single();
    if (error) throw error;

    if (guests.length > 0) {
      const { error: guestError } = await this.db
        .from("booking_guests")
        .insert(guests.map((g) => ({ ...g, booking_id: booking.id })));
      if (guestError) throw guestError;
    }

    const requester = await this.getProfile(input.user_id);
    const { error: logError } = await this.db.from("booking_logs").insert({
      booking_id: booking.id,
      action_by: input.user_id,
      action_by_name: requester?.full_name ?? "Unknown",
      new_status: input.status,
      remarks: "Booking submitted",
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

    return rows.map((r) => {
      const assignedRooms = (byBooking.get(r.id) ?? []).sort((a, b) =>
        a.room_number.localeCompare(b.room_number)
      );
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
      await this.setRoomHolds(id, update.assigned_room_ids, current.check_in, current.check_out);
    }

    const { error } = await this.db
      .from("bookings")
      .update({
        status: update.status,
        ...(update.rejection_reason !== undefined && { rejection_reason: update.rejection_reason }),
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
    checkOut: string
  ): Promise<void> {
    const { error } = await this.db.rpc("set_room_holds", {
      p_booking_id: bookingId,
      p_room_ids: roomIds,
      p_check_in: checkIn,
      p_check_out: checkOut,
    });
    if (!error) return;
    // 23P01 = exclusion_violation: someone else holds one of these rooms.
    if (error.code === "23P01") throw new RoomClashError();
    throw error;
  }

  async getOccupiedRoomIds(
    guestHouseId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): Promise<string[]> {
    // Straight off the holds — no status filter needed, because a hold row
    // only exists while the booking is actually holding the room.
    let query = this.db
      .from("room_holds")
      .select("room_id, rooms!inner(guest_house_id)")
      .eq("rooms.guest_house_id", guestHouseId)
      .overlaps("during", rangeLiteral(checkIn, checkOut));
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
    const { data, error } = await this.db
      .from("room_holds")
      .select(
        `room_id, booking_id, during,
         rooms!inner(guest_house_id),
         bookings!inner(booking_reference_id, status, check_in, check_out, purpose_of_visit,
                        requester:profiles!bookings_user_id_fkey(full_name))`
      )
      .eq("rooms.guest_house_id", guestHouseId)
      .overlaps("during", rangeLiteral(from, to));
    if (error) throw error;

    const rows = (data ?? []) as unknown as OccupancyRow[];
    return rows.flatMap((hold) => {
      const b = hold.bookings;
      if (!b) return [];
      return [
        {
          room_id: hold.room_id,
          booking_id: hold.booking_id,
          booking_reference_id: b.booking_reference_id,
          status: b.status,
          check_in: b.check_in,
          check_out: b.check_out,
          requester_name: b.requester?.full_name ?? null,
          purpose_of_visit: b.purpose_of_visit,
        },
      ];
    });
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
    return data?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const { error } = await this.db
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async deleteBooking(id: string): Promise<void> {
    const { error } = await this.db.from("bookings").delete().eq("id", id);
    if (error) throw error;
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
 * Migration 11's unique index on `lower(ldap_uid)`, reported the way the mock
 * store reports it rather than as a raw constraint name.
 */
function profileWriteError(error: { code?: string; message: string }): Error | typeof error {
  if (error.code === "23505" && error.message.includes("ldap_uid")) {
    return new Error("Another user already has this LDAP username");
  }
  return error;
}
