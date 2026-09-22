import type {
  Booking,
  BookingFilter,
  BookingLog,
  BookingStatus,
  BookingWithDetails,
  GuestHouse,
  MealPlan,
  MealPreference,
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
  MailEventKey,
  MailStatus,
  NewEmailInput,
} from "@/lib/mail/types";
import type { MailTemplateOverride } from "@/lib/mail/template-config";
import type { Role } from "@/lib/types";
import type { Unit } from "@/lib/units";
import type { AuditEvent, AuditFilter, NewAuditEvent } from "@/lib/audit";
import type { NewProjectInput, Project } from "@/lib/projects";
import type { NewTariffInput, Tariff } from "@/lib/tariffs";
import type {
  InvoiceFilter,
  InvoiceRecord,
  IssueInvoiceInput,
  MealCounts,
  PaymentMode,
} from "@/lib/invoice";

export type NewProfileInput = Omit<Profile, "id">;

export interface StatusUpdate {
  status: BookingStatus;
  rejection_reason?: string | null;
  /**
   * The physical rooms this booking holds, **in room-card order**: the first
   * id is for Room 1, the second for Room 2, and so on. The store writes both
   * the `room_holds` rows (which are what prevent a double booking) and each
   * `booking_rooms.assigned_room_id` (which is what tells the desk who is in
   * which room) from this one array, so the two cannot disagree.
   *
   * An empty array releases every room.
   */
  assigned_room_ids?: string[];
  /**
   * Rooms among `assigned_room_ids` where the manager accepted a turnover
   * overlap. The database relaxes its no-overlap rule for these by at most
   * two hours and records who accepted it — see migration 14.
   */
  override_room_ids?: string[];
  /** Who accepted those overrides. Required when `override_room_ids` is set. */
  override_by?: string | null;
}

/**
 * Fields the Guest House Manager can change on a booking that already exists.
 *
 * Moving the dates moves the room holds with them, and the exclusion
 * constraint decides whether that is allowed — so a stay cannot be extended
 * over a room someone else already has.
 */
export interface BookingDetailsPatch {
  check_in?: string;
  check_out?: string;
  purpose_of_visit?: string;
  meals?: MealPlan;
  meal_preference?: MealPreference | null;
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

  /**
   * Change a stored booking's dates, purpose or meals — the Guest House
   * Manager fixing a booking rather than deciding on it. Room holds follow
   * the dates, so this throws `RoomClashError` if the new dates collide with
   * a room someone else holds.
   */
  updateBookingDetails(
    id: string,
    patch: BookingDetailsPatch,
    log: NewLogInput
  ): Promise<void>;

  /**
   * Bookings with at least one meal on `day` ("yyyy-MM-dd"), for the kitchen's
   * head count. Pass a guest house to narrow it to one kitchen.
   */
  listBookingsWithMealsOn(day: string, guestHouseId?: string): Promise<BookingWithDetails[]>;

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

  /**
   * Change the turnaround buffer (Phase 3, migration 17): save
   * `rules.booking.buffer_minutes` and rebuild every hold's guard with it, in
   * one transaction. Throws `BufferClashError`, naming the stays, when the new
   * buffer would make allocated stays clash — and then changes nothing.
   */
  applyBookingBuffer(minutes: number): Promise<void>;

  /** Persist an uploaded document, returning a browser-loadable URL. */
  saveDocument(file: File, folder: string): Promise<string>;

  // ---- developer / admin operations ----------------------------------
  createProfile(input: NewProfileInput): Promise<Profile>;
  updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void>;
  /** Throws if the user still has bookings. */
  deleteProfile(id: string): Promise<void>;

  // ---- departments, clubs, councils and offices (migration 15) ----
  listUnits(): Promise<Unit[]>;
  createUnit(input: Omit<Unit, "id">): Promise<Unit>;
  updateUnit(id: string, patch: Partial<Omit<Unit, "id">>): Promise<void>;
  /** Throws while people or sub-units still belong to it. */
  deleteUnit(id: string): Promise<void>;

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

  // ---- Settings (migration 16) ----------------------------------------
  //
  // The rules the console can change. Scalar groups are jsonb rows in
  // `app_settings` (`rules.<group>`), read through `lib/settings-server.ts`;
  // lists have tables of their own. Validation — including refusing a change
  // that would break stored data — is the action's job, not the store's.

  /** A jsonb setting as stored, or null when no row exists. */
  getJsonSetting(key: string): Promise<unknown | null>;
  setJsonSetting(key: string, value: unknown): Promise<void>;

  listHostels(): Promise<string[]>;
  addHostel(name: string): Promise<void>;
  /** Renames the hostel and every profile in it, in one step. */
  renameHostel(from: string, to: string): Promise<void>;
  /** Throws while any profile still names the hostel. */
  removeHostel(name: string): Promise<void>;

  /** Accounts allowed to submit Official / Dignitary bookings, lowercased. */
  listOfficialEmails(): Promise<string[]>;
  addOfficialEmail(email: string): Promise<void>;
  removeOfficialEmail(email: string): Promise<void>;

  // ---- projects (migration 18) ----------------------------------------

  /** Every project, active or not, by number. */
  listProjects(): Promise<Project[]>;
  /** Add several at once — the paste import. Throws on a duplicate number. */
  createProjects(inputs: NewProjectInput[]): Promise<void>;
  updateProject(id: string, patch: Partial<NewProjectInput>): Promise<void>;
  /** Throws while any booking is debited to it — deactivate it instead. */
  deleteProject(id: string): Promise<void>;

  // ---- security audit log (migration 16) ------------------------------

  /** Append one event. The table refuses updates, so this is the only write. */
  appendAudit(event: NewAuditEvent): Promise<void>;
  /** Newest first. */
  listAudit(filter: AuditFilter): Promise<AuditEvent[]>;

  // ---- tariffs and invoices (migration 19) ----------------------------

  /** Every rate, in force or future. */
  listTariffs(): Promise<Tariff[]>;
  /** Throws on a second rate for the same scope and date. */
  createTariff(input: NewTariffInput): Promise<Tariff>;
  /** Throws `InvoiceStateError` for a rate already in force (institute date). */
  deleteTariff(id: string): Promise<void>;

  /** Newest first. */
  listInvoices(filter: InvoiceFilter): Promise<InvoiceRecord[]>;
  getInvoice(id: string): Promise<InvoiceRecord | null>;
  /**
   * Save the desk's meal-count correction on the booking's draft, creating
   * the draft if there is none. Throws `InvoiceStateError` once the booking
   * has a live issued invoice.
   */
  saveInvoiceDraft(bookingId: string, mealCounts: MealCounts | null, userId: string): Promise<InvoiceRecord>;
  /**
   * Number and issue the booking's invoice in one step: the financial year's
   * next serial and the snapshot are written together (`issue_invoice()`),
   * so numbers are consecutive with no gaps. Promotes the draft if there is
   * one. Throws `InvoiceStateError` when a live invoice is already issued.
   */
  issueInvoice(input: IssueInvoiceInput): Promise<InvoiceRecord>;
  /** issued → paid. Throws `InvoiceStateError` from any other state. */
  markInvoicePaid(
    id: string,
    payment: { mode: PaymentMode; reference: string | null; paidAt: string; paidBy: string }
  ): Promise<void>;
  /** issued / paid → cancelled, with a reason. Frees the booking for a corrected invoice. */
  cancelInvoice(id: string, cancel: { reason: string; by: string }): Promise<void>;

  /**
   * Deletes the booking outright (developer console). Its draft invoice goes
   * with it; a booking with an issued invoice cannot be deleted.
   */
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

  // ---- editable mail templates -------------------------------------
  //
  // Only the rows that have actually been edited are stored; everything else
  // falls back to the wording in `lib/mail/templates.ts`. So an empty table
  // means "nothing has been customised", not "no mail is configured".

  listMailTemplates(): Promise<MailTemplateOverride[]>;
  saveMailTemplate(override: MailTemplateOverride): Promise<void>;
  /** Drop the override, restoring the built-in wording for that event. */
  resetMailTemplate(key: MailEventKey): Promise<void>;
}
