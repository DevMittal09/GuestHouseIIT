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
  RoomOccupancySegment,
  RoomType,
} from "@/lib/types";
import type { BookingSearchCriteria, BookingSearchResult } from "@/lib/booking-search";
import type { RoleFormConfig } from "@/lib/form-config";
import type {
  EmailMessage,
  EmailOutboxFilter,
  EmailSettlement,
  MailStatus,
  NewEmailInput,
} from "@/lib/mail/types";
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

  /**
   * One segment per (room, booking) held over [from, to), for the availability
   * grid. Same ROOM_HOLDING_STATUSES and strict-overlap rule as
   * `getOccupiedRoomIds`, but it keeps the period and the booking so the grid
   * can draw when each room is taken. Identifying fields are populated here
   * and stripped per viewer in `app/actions/availability.ts`.
   */
  listRoomOccupancy(
    guestHouseId: string,
    from: string,
    to: string
  ): Promise<RoomOccupancySegment[]>;

  /** Persist an uploaded document, returning a browser-loadable URL. */
  saveDocument(file: File, folder: string): Promise<string>;

  // ---- developer / admin operations ----------------------------------
  createProfile(input: NewProfileInput): Promise<Profile>;
  updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void>;
  /** Throws if the user still has bookings. */
  deleteProfile(id: string): Promise<void>;

  createGuestHouse(name: string): Promise<GuestHouse>;
  updateGuestHouse(id: string, patch: { name?: string; serves_meals?: boolean }): Promise<void>;
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

  /**
   * Runtime key/value settings (`app_settings`). Holds the developer console
   * password hash, so values must never be sent to the client — read them
   * inside a server action and return a verdict, not the value.
   */
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  deleteBooking(id: string): Promise<void>;

  // ---- email outbox ------------------------------------------------
  //
  // Notifications are queued by the action that caused them and sent by the
  // worker in `lib/mail/dispatch.ts`. Nothing sends inside a server action: a
  // slow SMTP host would make the requester wait for it, and a failed send
  // must not fail a booking.

  /**
   * Queue messages, skipping any whose `idempotency_key` is already stored.
   * Returns how many rows were actually new — a retried action or two racing
   * dispatchers must not mail the same parent twice.
   */
  enqueueEmails(inputs: NewEmailInput[]): Promise<number>;

  /**
   * Atomically take up to `limit` messages that are due, marking them
   * `SENDING` and counting the attempt. Only the caller that wins the claim
   * gets the row, so two workers never send the same message. Messages stuck
   * in `SENDING` past `staleAfterMs` are reclaimed — a process that died
   * mid-send must not strand them forever.
   */
  claimQueuedEmails(limit: number, staleAfterMs: number): Promise<EmailMessage[]>;

  /** Record the outcome of a send: `SENT`, or `FAILED`/re-`QUEUED` with a reason. */
  settleEmail(id: string, result: EmailSettlement): Promise<void>;

  /** Outbox rows, newest first — the developer console's mail log. */
  listEmails(filter: EmailOutboxFilter): Promise<EmailMessage[]>;

  countEmailsByStatus(): Promise<Record<MailStatus, number>>;

  /** Put a failed message back in the queue, due now, with its attempts reset. */
  requeueEmail(id: string): Promise<void>;
}
