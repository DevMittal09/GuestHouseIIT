import type {
  Booking,
  BookingFilter,
  BookingLog,
  BookingStatus,
  BookingWithDetails,
  GuestHouse,
  NewBookingInput,
  Profile,
  Room,
  RoomType,
} from "@/lib/types";
import type { BookingSearchCriteria, BookingSearchResult } from "@/lib/booking-search";
import type { RoleFormConfig } from "@/lib/form-config";
import type { Role } from "@/lib/types";

export type NewProfileInput = Omit<Profile, "id">;

export interface StatusUpdate {
  status: BookingStatus;
  rejection_reason?: string | null;
  assigned_room_ids?: string[];
}

export type NewLogInput = Omit<BookingLog, "id" | "booking_id" | "timestamp" | "previous_status">;

/**
 * Storage abstraction. `MockStore` (JSON file, zero setup) is used when no
 * Supabase env vars are present; `SupabaseStore` otherwise.
 */
export interface DataStore {
  listProfiles(): Promise<Profile[]>;
  getProfile(id: string): Promise<Profile | null>;

  listGuestHouses(): Promise<GuestHouse[]>;
  getGuestHouse(id: string): Promise<GuestHouse | null>;
  listRooms(guestHouseId: string): Promise<Room[]>;

  createBooking(input: NewBookingInput): Promise<Booking>;
  getBooking(id: string): Promise<BookingWithDetails | null>;
  listBookings(filter: BookingFilter): Promise<BookingWithDetails[]>;
  listBookingsForUser(userId: string): Promise<BookingWithDetails[]>;

  /**
   * Keyword + filter search across the booking archive, used by the approval
   * log at `/history`. Authorization is the caller's job: pass the reviewer's
   * `historyScope()` criteria (see lib/workflow.ts) so results stay inside it.
   */
  searchBookings(criteria: BookingSearchCriteria): Promise<BookingSearchResult>;
  updateBookingStatus(id: string, update: StatusUpdate, log: NewLogInput): Promise<void>;

  /** Room ids held by bookings in ROOM_HOLDING_STATUSES overlapping [checkIn, checkOut). */
  getOccupiedRoomIds(
    guestHouseId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): Promise<string[]>;

  /** Persist an uploaded document, returning a browser-loadable URL. */
  saveDocument(file: File, folder: string): Promise<string>;

  // ---- developer / admin operations ----------------------------------
  createProfile(input: NewProfileInput): Promise<Profile>;
  updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void>;
  /** Throws if the user still has bookings. */
  deleteProfile(id: string): Promise<void>;

  createGuestHouse(name: string): Promise<GuestHouse>;
  updateGuestHouse(id: string, patch: { name?: string }): Promise<void>;
  /** Throws if bookings reference the guest house. */
  deleteGuestHouse(id: string): Promise<void>;

  /** All rooms of a guest house, including inactive ones (admin view). */
  listAllRooms(guestHouseId: string): Promise<Room[]>;
  createRoom(guestHouseId: string, roomNumber: string, roomType: RoomType): Promise<Room>;
  updateRoom(id: string, patch: { is_active?: boolean; room_number?: string; room_type?: RoomType }): Promise<void>;
  /** Throws if the room is assigned to any booking. */
  deleteRoom(id: string): Promise<void>;

  getFormConfig(role: Role): Promise<RoleFormConfig | null>;
  saveFormConfig(config: RoleFormConfig): Promise<void>;
  deleteFormConfig(role: Role): Promise<void>;

  deleteBooking(id: string): Promise<void>;
}
