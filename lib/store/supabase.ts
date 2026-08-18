import type {
  Booking,
  BookingFilter,
  BookingWithDetails,
  GuestHouse,
  NewBookingInput,
  Profile,
  Role,
  Room,
  RoomType,
} from "@/lib/types";
import type { RoleFormConfig } from "@/lib/form-config";
import { getSupabase } from "@/lib/supabase/client";
import type { DataStore, NewLogInput, NewProfileInput, StatusUpdate } from "./types";

const BOOKING_SELECT = `*,
  requester:profiles!bookings_user_id_fkey(*),
  guest_house:guest_houses(*),
  guests:booking_guests(*),
  logs:booking_logs(*)`;

type BookingRow = Booking & {
  requester: Profile;
  guest_house: GuestHouse;
  guests: BookingWithDetails["guests"];
  logs: BookingWithDetails["logs"];
};

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
    return data;
  }

  async getGuestHouse(id: string): Promise<GuestHouse | null> {
    const { data, error } = await this.db
      .from("guest_houses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
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
    return booking;
  }

  private async hydrate(rows: BookingRow[]): Promise<BookingWithDetails[]> {
    const roomIds = [...new Set(rows.flatMap((r) => r.assigned_room_ids ?? []))];
    let roomsById = new Map<string, Room>();
    if (roomIds.length > 0) {
      const { data, error } = await this.db.from("rooms").select("*").in("id", roomIds);
      if (error) throw error;
      roomsById = new Map(data.map((r) => [r.id, r]));
    }
    return rows.map((r) => ({
      ...r,
      assigned_room_ids: r.assigned_room_ids ?? [],
      logs: [...r.logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      assigned_rooms: (r.assigned_room_ids ?? [])
        .map((id) => roomsById.get(id))
        .filter((room): room is Room => Boolean(room)),
    }));
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

  async updateBookingStatus(id: string, update: StatusUpdate, log: NewLogInput): Promise<void> {
    const { data: current, error: readError } = await this.db
      .from("bookings")
      .select("status")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const { error } = await this.db
      .from("bookings")
      .update({
        status: update.status,
        ...(update.rejection_reason !== undefined && { rejection_reason: update.rejection_reason }),
        ...(update.assigned_room_ids !== undefined && { assigned_room_ids: update.assigned_room_ids }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;

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

  async getOccupiedRoomIds(
    guestHouseId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): Promise<string[]> {
    let query = this.db
      .from("bookings")
      .select("id, assigned_room_ids")
      .eq("guest_house_id", guestHouseId)
      .eq("status", "APPROVED")
      .lt("check_in", checkOut)
      .gt("check_out", checkIn);
    if (excludeBookingId) query = query.neq("id", excludeBookingId);
    const { data, error } = await query;
    if (error) throw error;
    return [...new Set(data.flatMap((b) => b.assigned_room_ids ?? []))];
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
    if (error) throw error;
    return data;
  }

  async updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void> {
    const { error } = await this.db.from("profiles").update(patch).eq("id", id);
    if (error) throw error;
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
    return data;
  }

  async updateGuestHouse(id: string, patch: { name?: string }): Promise<void> {
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
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .contains("assigned_room_ids", [id]);
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

  async deleteBooking(id: string): Promise<void> {
    const { error } = await this.db.from("bookings").delete().eq("id", id);
    if (error) throw error;
  }
}

function makeReference(): string {
  const year = new Date().getFullYear();
  const rand = Array.from({ length: 5 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32))
  ).join("");
  return `IITPKD-GH-${year}-${rand}`;
}
