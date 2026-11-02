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
import { getPool } from "@/lib/db/client";
import { ROOM_HOLDING_STATUSES } from "@/lib/workflow";
import { deriveFromRooms } from "./derive";
import type { Unit } from "@/lib/units";
import {
  auditMatches,
  type AuditEvent,
  type AuditFilter,
  type NewAuditEvent,
} from "@/lib/audit";
import type { NewProjectInput, Project } from "@/lib/projects";
import type {
  InstituteStudent,
  NewStudentInput,
  InstituteEmployee,
  NewEmployeeInput,
  InstituteOffice,
  NewOfficeInput,
  InstituteFCC,
  NewFCCInput,
  InstituteHostel,
  NewHostelInput,
  InstituteWarden,
  NewWardenInput,
} from "@/lib/institute/types";
import type { NewTariffInput, Tariff } from "@/lib/tariffs";
import type { NewRoomBlockInput, RoomBlock } from "@/lib/operations";
import type { NewSessionInput, Session } from "@/lib/sessions";
import type { NewPrivacyRequest, PrivacyRequest, RateLimitResult, UserMfa } from "@/lib/security";
import type { PreparedUpload } from "@/lib/uploads";
import { decryptValue, encryptValue } from "@/lib/crypto";
import {
  invoiceErrorFrom,
  InvoiceStateError,
  type ExtraCharge,
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
  SeededProfileInput,
  StatusUpdate,
} from "./types";
import type {
  ChangedAccount,
  ImportedAccount,
  NewUserImportBatch,
  UserImportBatch,
  UserImportSettlement,
  UserImportStatus,
} from "@/lib/users-import-undo";
import type { Pool, PoolClient } from "pg";
import * as fs from "fs";
import * as path from "path";

type Queryable = Pick<Pool | PoolClient, "query">;

const SEARCH_SCAN_LIMIT = 1000;

const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

function withMealsFlag(row: GuestHouse): GuestHouse {
  return { ...row, serves_meals: row.serves_meals ?? false };
}

function rangeLiteral(from: string, to: string): string {
  return `["${new Date(from).toISOString()}","${new Date(to).toISOString()}")`;
}

function parseRange(literal: string): [string, string] {
  const m = /^[[(]"?([^",]+)"?,"?([^")\]]+)"?[)\]]$/.exec(literal.trim());
  if (!m) return ["", ""];
  return [new Date(m[1]).toISOString(), new Date(m[2]).toISOString()];
}

function profileWriteError(error: { code?: string; message: string }): Error | typeof error {
  if (error.code === "23503" && error.message.includes("profiles_hostel_fk")) {
    return new Error("That hostel is not on the list - add it in Settings first");
  }
  return error;
}

function importBatchError(error: { code?: string; message: string }): Error {
  if (error.code === "42P01") {
    return new Error(
      "Cannot import accounts until migration 32 is applied " +
        "(scripts/init-postgres.sql, table: user_import_batches) - " +
        "it is the table that records what an import changed, so it can be undone"
    );
  }
  return error instanceof Error ? error : new Error(error.message);
}

function hydrateInvoice(row: Record<string, unknown>): InvoiceRecord {
  const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const doc = row.document as InvoiceRecord["document"] | Record<string, never> | null;
  return {
    ...(row as unknown as InvoiceRecord),
    document: doc && Object.keys(doc).length > 0 ? (doc as InvoiceRecord["document"]) : null,
    extra_charges: Array.isArray(row.extra_charges) ? (row.extra_charges as InvoiceRecord["extra_charges"]) : [],
    subtotal_rooms: n(row.subtotal_rooms),
    subtotal_dining: n(row.subtotal_dining),
    total: n(row.total),
    gst_percent: n(row.gst_percent),
    gst_amount: n(row.gst_amount),
    grand_total: n(row.grand_total),
  };
}

function hydrateEmail(row: Record<string, unknown>): EmailMessage {
  return {
    ...(row as unknown as EmailMessage),
    attachments: (row as { attachments?: EmailMessage["attachments"] }).attachments ?? [],
    cc_emails: (row as { cc_emails?: string[] }).cc_emails ?? [],
    to_emails: (row as { to_emails?: string[] }).to_emails ?? [],
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

function userImportFromRow(row: Record<string, unknown>): UserImportBatch {
  return {
    id: row.id as string,
    at: row.at as string,
    actor_id: (row.actor_id as string | null),
    actor_name: row.actor_name as string,
    status: row.status as UserImportStatus,
    columns_used: row.columns_used as string,
    added: ((row.added ?? []) as unknown as ImportedAccount[]),
    updated: ((row.updated ?? []) as unknown as ChangedAccount[]),
    unchanged_count: row.unchanged_count as number,
    error: (row.error as string | null),
    reverted_at: (row.reverted_at as string | null),
    reverted_by: (row.reverted_by as string | null),
    reverted_actor_name: (row.reverted_actor_name as string | null),
  };
}

export class PostgresStore implements DataStore {
  private pool: Pool = getPool();

  private async withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async bufferNow(): Promise<number> {
    try {
      return bufferMs(parseRuleGroup("booking", await this.getJsonSetting("rules.booking")).buffer_minutes);
    } catch {
      return bufferMs(parseRuleGroup("booking", null).buffer_minutes);
    }
  }

  // ---- profiles ---------------------------------------------------------

  async listProfiles(): Promise<Profile[]> {
    const { rows } = await this.pool.query("SELECT * FROM profiles ORDER BY role");
    return rows;
  }

  async getProfile(id: string): Promise<Profile | null> {
    const { rows } = await this.pool.query("SELECT * FROM profiles WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM profiles WHERE lower(email) = lower($1)",
      [email.trim()]
    );
    return rows[0] ?? null;
  }

  async createProfile(input: NewProfileInput): Promise<Profile> {
    const cols = Object.keys(input);
    const vals = Object.values(input);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO profiles (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      return rows[0];
    } catch (err: unknown) {
      const e = err as { code?: string; message: string };
      throw profileWriteError(e);
    }
  }

  async updateProfile(id: string, patch: Partial<NewProfileInput>): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([col], i) => `${col} = $${i + 2}`);
    const vals = entries.map(([, v]) => v);
    try {
      await this.pool.query(
        `UPDATE profiles SET ${sets.join(", ")} WHERE id = $1`,
        [id, ...vals]
      );
    } catch (err: unknown) {
      const e = err as { code?: string; message: string };
      throw profileWriteError(e);
    }
  }

  async deleteProfile(id: string): Promise<void> {
    const { rows } = await this.pool.query(
      "SELECT count(*)::int AS c FROM bookings WHERE user_id = $1", [id]
    );
    if (rows[0].c > 0) {
      throw new Error("This user has bookings - delete or reassign those first");
    }
    await this.pool.query("DELETE FROM profiles WHERE id = $1", [id]);
  }

  async createProfiles(inputs: SeededProfileInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const cols = Object.keys(inputs[0]);
    const params: unknown[] = [];
    const valueRows: string[] = [];
    for (const input of inputs) {
      const row: string[] = [];
      for (const col of cols) {
        params.push((input as Record<string, unknown>)[col]);
        row.push(`$${params.length}`);
      }
      valueRows.push(`(${row.join(", ")})`);
    }
    try {
      await this.pool.query(
        `INSERT INTO profiles (${cols.join(", ")}) VALUES ${valueRows.join(", ")}`,
        params
      );
    } catch (err: unknown) {
      const e = err as { code?: string; message: string };
      throw profileWriteError(e);
    }
  }

  // ---- guest houses & rooms ---------------------------------------------

  async listGuestHouses(): Promise<GuestHouse[]> {
    const { rows } = await this.pool.query("SELECT * FROM guest_houses ORDER BY name");
    return rows.map(withMealsFlag);
  }

  async getGuestHouse(id: string): Promise<GuestHouse | null> {
    const { rows } = await this.pool.query("SELECT * FROM guest_houses WHERE id = $1", [id]);
    return rows[0] ? withMealsFlag(rows[0]) : null;
  }

  async createGuestHouse(name: string): Promise<GuestHouse> {
    const { rows } = await this.pool.query(
      "INSERT INTO guest_houses (name, total_rooms) VALUES ($1, 0) RETURNING *",
      [name]
    );
    return withMealsFlag(rows[0]);
  }

  async updateGuestHouse(id: string, patch: { name?: string; serves_meals?: boolean }): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([col], i) => `${col} = $${i + 2}`);
    const vals = entries.map(([, v]) => v);
    await this.pool.query(`UPDATE guest_houses SET ${sets.join(", ")} WHERE id = $1`, [id, ...vals]);
  }

  async deleteGuestHouse(id: string): Promise<void> {
    const { rows } = await this.pool.query(
      "SELECT count(*)::int AS c FROM bookings WHERE guest_house_id = $1", [id]
    );
    if (rows[0].c > 0) {
      throw new Error("Bookings reference this guest house - delete those first");
    }
    await this.pool.query("DELETE FROM guest_houses WHERE id = $1", [id]);
  }

  async listRooms(guestHouseId: string): Promise<Room[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM rooms WHERE guest_house_id = $1 AND is_active = true ORDER BY room_number",
      [guestHouseId]
    );
    return rows;
  }

  async listAllRooms(guestHouseId: string): Promise<Room[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM rooms WHERE guest_house_id = $1 ORDER BY room_number",
      [guestHouseId]
    );
    return rows;
  }

  private async recountRooms(guestHouseId: string): Promise<void> {
    await this.pool.query(
      "UPDATE guest_houses SET total_rooms = (SELECT count(*)::int FROM rooms WHERE guest_house_id = $1 AND is_active = true) WHERE id = $1",
      [guestHouseId]
    );
  }

  async createRoom(guestHouseId: string, roomNumber: string, roomType: RoomType): Promise<Room> {
    try {
      const { rows } = await this.pool.query(
        "INSERT INTO rooms (guest_house_id, room_number, room_type) VALUES ($1, $2, $3) RETURNING *",
        [guestHouseId, roomNumber, roomType]
      );
      await this.recountRooms(guestHouseId);
      return rows[0];
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error(`Room ${roomNumber} already exists in this guest house`);
      throw err;
    }
  }

  async createRooms(guestHouseId: string, rooms: { room_number: string; room_type: RoomType }[]): Promise<number> {
    if (rooms.length === 0) return 0;
    const params: unknown[] = [];
    const valueRows: string[] = [];
    for (const r of rooms) {
      params.push(guestHouseId, r.room_number, r.room_type);
      const base = params.length - 2;
      valueRows.push(`($${base}, $${base + 1}, $${base + 2})`);
    }
    try {
      await this.pool.query(
        `INSERT INTO rooms (guest_house_id, room_number, room_type) VALUES ${valueRows.join(", ")}`,
        params
      );
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error("One of those room numbers already exists in this guest house");
      throw err;
    }
    await this.recountRooms(guestHouseId);
    return rooms.length;
  }

  async updateRoom(id: string, patch: { is_active?: boolean; room_number?: string; room_type?: RoomType }): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([col], i) => `${col} = $${i + 2}`);
    const vals = entries.map(([, v]) => v);
    const { rows } = await this.pool.query(
      `UPDATE rooms SET ${sets.join(", ")} WHERE id = $1 RETURNING guest_house_id`,
      [id, ...vals]
    );
    if (rows[0]) await this.recountRooms(rows[0].guest_house_id);
  }

  async deleteRoom(id: string): Promise<void> {
    const { rows: holds } = await this.pool.query(
      "SELECT count(*)::int AS c FROM room_holds WHERE room_id = $1", [id]
    );
    if (holds[0].c > 0) {
      throw new Error("This room is assigned to a booking - deactivate it instead");
    }
    const { rows } = await this.pool.query(
      "DELETE FROM rooms WHERE id = $1 RETURNING guest_house_id", [id]
    );
    if (rows[0]) await this.recountRooms(rows[0].guest_house_id);
  }

  // ---- bookings ---------------------------------------------------------

  async createBooking(input: NewBookingInput): Promise<Booking> {
    const {
      rooms,
      created_by,
      on_behalf_of_name,
      on_behalf_of_email,
      on_behalf_of_phone,
      copy_to_emails,
      debit_subhead,
      fund_declaration,
      meal_diet_counts,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      submission_remarks: _submissionRemarks,
      ...bookingInput
    } = input;
    const derived = deriveFromRooms(input);
    const nowIso = new Date().toISOString();
    const bookingData: Record<string, unknown> = {
      ...bookingInput,
      ...derived,
      booking_reference_id: makeReference(),
      created_at: nowIso,
      updated_at: nowIso,
      ...(created_by ? { created_by } : {}),
      ...(on_behalf_of_name ? { on_behalf_of_name } : {}),
      ...(on_behalf_of_email ? { on_behalf_of_email } : {}),
      ...(on_behalf_of_phone ? { on_behalf_of_phone } : {}),
      ...(copy_to_emails?.length ? { copy_to_emails } : {}),
      ...(debit_subhead ? { debit_subhead } : {}),
      ...(fund_declaration ? { fund_declaration_at: nowIso } : {}),
      ...(meal_diet_counts ? { meal_diet_counts } : {}),
    };

    const cols = Object.keys(bookingData);
    const vals = Object.values(bookingData);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");

    return this.withTx(async (client) => {
      const { rows: [booking] } = await client.query(
        `INSERT INTO bookings (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        vals
      );

      for (let ri = 0; ri < rooms.length; ri++) {
        const roomInput = rooms[ri];
        const { rows: [card] } = await client.query(
          `INSERT INTO booking_rooms (booking_id, room_index) VALUES ($1, $2) RETURNING id`,
          [booking.id, ri]
        );
        if (roomInput.guests.length > 0) {
          const guestCols = [
            "booking_id", "booking_room_id", "name", "gender", "age",
            "relationship", "id_number", "id_document_url", "passport_number",
            "citizenship", "nationality", "is_infant",
          ];
          const guestParams: unknown[] = [];
          const guestRows: string[] = [];
          for (const guest of roomInput.guests) {
            const rowVals = [
              booking.id, card.id, guest.name, guest.gender ?? null,
              guest.age ?? null, guest.relationship ?? null,
              encryptValue(guest.id_number ?? null), guest.id_document_url ?? null,
              encryptValue(guest.passport_number ?? null),
              guest.citizenship ?? "indian", guest.nationality ?? null,
              guest.is_infant ?? false,
            ];
            const offset = guestParams.length;
            guestRows.push(`(${rowVals.map((_, i) => `$${offset + i + 1}`).join(", ")})`);
            guestParams.push(...rowVals);
          }
          await client.query(
            `INSERT INTO booking_guests (${guestCols.join(", ")}) VALUES ${guestRows.join(", ")}`,
            guestParams
          );
        }
      }

      await client.query(
        `INSERT INTO booking_logs (booking_id, action_by, action_by_name, previous_status, new_status, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [booking.id, input.created_by ?? input.user_id, on_behalf_of_name ?? null,
         null, booking.status, input.submission_remarks ?? null]
      );

      return booking;
    });
  }

  private async hydrate(bookingRows: Record<string, unknown>[]): Promise<BookingWithDetails[]> {
    if (bookingRows.length === 0) return [];
    const ids = bookingRows.map((b) => b.id as string);
    const userIds = [...new Set(bookingRows.map((b) => b.user_id as string))];
    const ghIds = [...new Set(bookingRows.map((b) => b.guest_house_id as string).filter(Boolean))];

    const [profilesRes, ghRes, guestsRes, cardsRes, logsRes, holdsRes] = await Promise.all([
      this.pool.query("SELECT * FROM profiles WHERE id = ANY($1)", [userIds]),
      ghIds.length > 0
        ? this.pool.query("SELECT * FROM guest_houses WHERE id = ANY($1)", [ghIds])
        : { rows: [] as Record<string, unknown>[] },
      this.pool.query("SELECT * FROM booking_guests WHERE booking_id = ANY($1)", [ids]),
      this.pool.query("SELECT * FROM booking_rooms WHERE booking_id = ANY($1) ORDER BY room_index", [ids]),
      this.pool.query("SELECT * FROM booking_logs WHERE booking_id = ANY($1) ORDER BY timestamp", [ids]),
      this.pool.query(
        `SELECT rh.booking_id, rh.room_id, r.* FROM room_holds rh
         JOIN rooms r ON r.id = rh.room_id
         WHERE rh.booking_id = ANY($1)`,
        [ids]
      ),
    ]);

    const profilesById = new Map<string, Profile>(profilesRes.rows.map((p: Profile) => [p.id, p]));
    const ghById = new Map<string, GuestHouse>(ghRes.rows.map((g: Record<string, unknown>) => [(g as unknown as GuestHouse).id, withMealsFlag(g as unknown as GuestHouse)]));
    const guestsByBooking = new Map<string, Record<string, unknown>[]>();
    for (const g of guestsRes.rows) {
      const arr = guestsByBooking.get(g.booking_id) ?? [];
      arr.push(g);
      guestsByBooking.set(g.booking_id, arr);
    }
    const cardsByBooking = new Map<string, BookingRoom[]>();
    for (const c of cardsRes.rows) {
      const arr = cardsByBooking.get(c.booking_id) ?? [];
      arr.push(c);
      cardsByBooking.set(c.booking_id, arr);
    }
    const logsByBooking = new Map<string, BookingWithDetails["logs"]>();
    for (const l of logsRes.rows) {
      const arr = logsByBooking.get(l.booking_id) ?? [];
      arr.push(l);
      logsByBooking.set(l.booking_id, arr);
    }

    // Room holds: grouped by booking
    const holdsByBooking = new Map<string, Room[]>();
    for (const h of holdsRes.rows) {
      const arr = holdsByBooking.get(h.booking_id) ?? [];
      const room: Room = {
        id: h.room_id,
        guest_house_id: h.guest_house_id,
        room_number: h.room_number,
        room_type: h.room_type,
        is_active: h.is_active,
      };
      arr.push(room);
      holdsByBooking.set(h.booking_id, arr);
    }

    const roomsById = new Map<string, Room>();
    for (const h of holdsRes.rows) {
      const room: Room = {
        id: h.room_id,
        guest_house_id: h.guest_house_id,
        room_number: h.room_number,
        room_type: h.room_type,
        is_active: h.is_active,
      };
      roomsById.set(room.id, room);
    }
    const cardRoomIds = [
      ...new Set(
        cardsRes.rows
          .map((c: BookingRoom) => c.assigned_room_id)
          .filter((id: string | null): id is string => Boolean(id) && !roomsById.has(id!))
      ),
    ];
    if (cardRoomIds.length > 0) {
      const { rows: cardRooms } = await this.pool.query(
        "SELECT * FROM rooms WHERE id = ANY($1)", [cardRoomIds]
      );
      for (const room of cardRooms) roomsById.set(room.id, room);
    }

    return bookingRows.map((r) => {
      const bookingId = r.id as string;
      const held = (holdsByBooking.get(bookingId) ?? []).sort(
        (a, b) => a.room_number.localeCompare(b.room_number)
      );
      const assignedRooms =
        held.length > 0 || r.status !== "VACATED"
          ? held
          : (cardsByBooking.get(bookingId) ?? [])
              .map((c) => (c.assigned_room_id ? roomsById.get(c.assigned_room_id) : null))
              .filter((room): room is Room => Boolean(room))
              .sort((a, b) => a.room_number.localeCompare(b.room_number));

      const rawGuests = (guestsByBooking.get(bookingId) ?? []).map((g) => {
        const guest = g as unknown as import("@/lib/types").BookingGuest;
        return {
          ...guest,
          id_number: decryptValue(guest.id_number),
          passport_number: decryptValue(guest.passport_number),
        };
      });
      const cards = [...(cardsByBooking.get(bookingId) ?? [])].sort(
        (a, b) => a.room_index - b.room_index
      );
      const rooms: BookingRoomWithGuests[] = cards.map((card) => ({
        ...card,
        guests: rawGuests.filter((g) => g.booking_room_id === card.id),
        assigned_room: card.assigned_room_id
          ? (roomsById.get(card.assigned_room_id) ?? null)
          : null,
      }));
      const requester = profilesById.get(r.user_id as string) ?? null;
      const guestHouse = ghById.get(r.guest_house_id as string) ?? null;
      const logs = logsByBooking.get(bookingId) ?? [];

      return {
        ...r,
        meals: normalizeMeals(r.meals, r as unknown as Booking),
        guest_house: guestHouse,
        requester,
        has_infant: r.has_infant ?? rawGuests.some((g: Record<string, unknown>) => g.is_infant),
        booking_type:
          r.booking_type ??
          ((r as Record<string, unknown>).user_role === "student"
            ? "personal"
            : (r as Record<string, unknown>).user_role === "alumni"
              ? "alumni"
              : "official"),
        alumni_name: r.alumni_name ?? null,
        alumni_roll_number: r.alumni_roll_number ?? null,
        service_type: r.service_type ?? (((r.meals as unknown[])?.length ?? 0) > 0 ? "room_meals" : "room"),
        meal_preference: r.meal_preference ?? null,
        meal_diet_counts: r.meal_diet_counts ?? null,
        meal_guest_count: r.meal_guest_count ?? null,
        pets_policy_acknowledged: r.pets_policy_acknowledged ?? false,
        pets_policy_acknowledged_at: r.pets_policy_acknowledged_at ?? null,
        has_foreign_national:
          r.has_foreign_national ?? rawGuests.some((g: Record<string, unknown>) => g.citizenship === "other"),
        created_by: r.created_by ?? null,
        debit_head:
          r.debit_head ?? (r.booking_type === "personal" ? "personal_funds" : null),
        debit_details: r.debit_details ?? null,
        debit_document_url: r.debit_document_url ?? null,
        debit_subhead: r.debit_subhead ?? null,
        copy_to_emails: r.copy_to_emails ?? [],
        project_id: r.project_id ?? null,
        office_approval:
          r.office_approval ??
          (r.user_role === "official" || r.user_role === "iar_cell" ? "direct" : null),
        on_behalf_of_name: r.on_behalf_of_name ?? null,
        on_behalf_of_email: r.on_behalf_of_email ?? null,
        on_behalf_of_phone: r.on_behalf_of_phone ?? null,
        guests: rawGuests,
        rooms,
        assigned_room_ids: assignedRooms.map((room) => room.id),
        logs: [...logs].sort(
          (a, b) => ((a as Record<string, string>).timestamp ?? (a as Record<string, string>).created_at)
            .localeCompare((b as Record<string, string>).timestamp ?? (b as Record<string, string>).created_at)
        ),
        assigned_rooms: assignedRooms,
      } as unknown as BookingWithDetails;
    });
  }

  async getBooking(id: string): Promise<BookingWithDetails | null> {
    const { rows } = await this.pool.query("SELECT * FROM bookings WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    const [hydrated] = await this.hydrate(rows);
    return hydrated;
  }

  async listBookings(filter: BookingFilter): Promise<BookingWithDetails[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filter.ids) { conditions.push(`id = ANY($${i})`); params.push(filter.ids); i++; }
    if (filter.status) { conditions.push(`status = $${i}`); params.push(filter.status); i++; }
    if (filter.guestHouseId) { conditions.push(`guest_house_id = $${i}`); params.push(filter.guestHouseId); i++; }
    if (filter.userRole) { conditions.push(`user_role = $${i}`); params.push(filter.userRole); i++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM bookings ${where} ORDER BY created_at DESC`,
      params
    );
    let result = rows;
    if (filter.hostelName) {
      const profileIds = result.map((r: Booking) => r.user_id);
      if (profileIds.length > 0) {
        const { rows: profiles } = await this.pool.query(
          "SELECT id, hostel_name FROM profiles WHERE id = ANY($1)", [profileIds]
        );
        const hostelByProfile = new Map(profiles.map((p: { id: string; hostel_name: string }) => [p.id, p.hostel_name]));
        result = result.filter((r: Booking) => hostelByProfile.get(r.user_id) === filter.hostelName);
      }
    }
    if (filter.club) {
      const profileIds = result.map((r: Booking) => r.user_id);
      if (profileIds.length > 0) {
        const { rows: profiles } = await this.pool.query(
          "SELECT id, department_or_club FROM profiles WHERE id = ANY($1)", [profileIds]
        );
        const clubByProfile = new Map(profiles.map((p: { id: string; department_or_club: string }) => [p.id, p.department_or_club]));
        result = result.filter((r: Booking) => clubByProfile.get(r.user_id) === filter.club);
      }
    }
    return this.hydrate(result);
  }

  async listBookingsForUser(userId: string): Promise<BookingWithDetails[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM bookings WHERE user_id = $1 OR created_by = $1 ORDER BY created_at DESC",
      [userId]
    );
    return this.hydrate(rows);
  }

  async searchBookings(criteria: BookingSearchCriteria): Promise<BookingSearchResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (criteria.guestHouseId) { conditions.push(`guest_house_id = $${i}`); params.push(criteria.guestHouseId); i++; }
    if (criteria.userRole) { conditions.push(`user_role = $${i}`); params.push(criteria.userRole); i++; }
    if (criteria.userId) { conditions.push(`user_id = $${i}`); params.push(criteria.userId); i++; }
    if (criteria.checkInFrom) { conditions.push(`check_in >= $${i}`); params.push(criteria.checkInFrom); i++; }
    if (criteria.checkInTo) { conditions.push(`check_in <= $${i}`); params.push(criteria.checkInTo); i++; }

    const keyword = criteria.query?.trim();
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let rows: Record<string, unknown>[];
    if (keyword) {
      const keywordWhere = conditions.length > 0
        ? `${where} AND search_text @@ websearch_to_tsquery('simple', $${i})`
        : `WHERE search_text @@ websearch_to_tsquery('simple', $${i})`;
      try {
        const result = await this.pool.query(
          `SELECT * FROM bookings ${keywordWhere} ORDER BY created_at DESC LIMIT ${SEARCH_SCAN_LIMIT}`,
          [...params, keyword]
        );
        rows = result.rows;
      } catch {
        rows = [];
      }
      if (rows.length === 0) {
        const result = await this.pool.query(
          `SELECT * FROM bookings ${where} ORDER BY created_at DESC LIMIT ${SEARCH_SCAN_LIMIT}`,
          params
        );
        rows = result.rows;
      }
    } else {
      const result = await this.pool.query(
        `SELECT * FROM bookings ${where} ORDER BY created_at DESC LIMIT ${SEARCH_SCAN_LIMIT}`,
        params
      );
      rows = result.rows;
    }
    const candidates = await this.hydrate(rows);
    return runBookingSearch(candidates, criteria, rows.length >= SEARCH_SCAN_LIMIT);
  }

  async updateBookingStatus(id: string, update: StatusUpdate, log: NewLogInput): Promise<void> {
    await this.withTx(async (client) => {
      const { rows: [current] } = await client.query(
        "SELECT status, check_in, check_out FROM bookings WHERE id = $1",
        [id]
      );
      if (!current) throw new Error("Booking not found");

      if (update.assigned_room_ids !== undefined) {
        await this.setRoomHolds(client, id, update.assigned_room_ids, current.check_in, current.check_out, {
          overrideRoomIds: update.override_room_ids ?? [],
          overrideBy: update.override_by ?? null,
        });
        await this.assignRoomsToCards(client, id, update.assigned_room_ids);
      }

      const sets: string[] = ["status = $2", "updated_at = $3"];
      const vals: unknown[] = [id, update.status, new Date().toISOString()];
      let pi = 4;
      if (update.rejection_reason !== undefined) {
        sets.push(`rejection_reason = $${pi}`); vals.push(update.rejection_reason); pi++;
      }
      if (update.no_show_released_at !== undefined) {
        sets.push(`no_show_released_at = $${pi}`); vals.push(update.no_show_released_at); pi++;
      }
      await client.query(`UPDATE bookings SET ${sets.join(", ")} WHERE id = $1`, vals);

      if (!ROOM_HOLDING_STATUSES.includes(update.status)) {
        await client.query("DELETE FROM room_holds WHERE booking_id = $1", [id]);
        if (update.status !== "VACATED") await this.assignRoomsToCards(client, id, []);
      }

      await client.query(
        `INSERT INTO booking_logs (booking_id, action_by, action_by_name, previous_status, new_status, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, log.action_by, log.action_by_name, current.status, update.status, log.remarks]
      );
    });
  }

  private async setRoomHolds(
    q: Queryable,
    bookingId: string,
    roomIds: string[],
    checkIn: string,
    checkOut: string,
    override: { overrideRoomIds: string[]; overrideBy: string | null } = {
      overrideRoomIds: [],
      overrideBy: null,
    }
  ): Promise<void> {
    try {
      await q.query(
        "SELECT set_room_holds($1, $2, $3, $4, $5, $6)",
        [bookingId, roomIds, checkIn, checkOut, override.overrideRoomIds, override.overrideBy]
      );
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === "23P01") throw new RoomClashError();
      const blocked = /ROOM_BLOCKED\|([^\n]+)/.exec(e.message ?? "");
      if (blocked) throw new RoomClashError(blocked[1]);
      throw err;
    }
  }

  private async assignRoomsToCards(q: Queryable, bookingId: string, roomIds: string[]): Promise<void> {
    const { rows: cards } = await q.query(
      "SELECT id, room_index FROM booking_rooms WHERE booking_id = $1 ORDER BY room_index",
      [bookingId]
    );
    if (cards.length === 0) return;
    const params: unknown[] = [];
    const cases: string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      const next = roomIds[i] ?? null;
      params.push(cards[i].id, next);
      cases.push(`WHEN id = $${params.length - 1} THEN $${params.length}`);
      ids.push(cards[i].id);
    }
    params.push(ids);
    await q.query(
      `UPDATE booking_rooms SET assigned_room_id = CASE ${cases.join(" ")} END WHERE id = ANY($${params.length})`,
      params
    );
  }

  async updateBookingDetails(id: string, patch: BookingDetailsPatch, log: NewLogInput): Promise<void> {
    await this.withTx(async (client) => {
      const { rows: [current] } = await client.query(
        "SELECT status, check_in, check_out, extension_requested_until FROM bookings WHERE id = $1",
        [id]
      );
      if (!current) throw new Error("Booking not found");

      const checkIn = patch.check_in ?? current.check_in;
      const checkOut = patch.check_out ?? current.check_out;

      if (checkIn !== current.check_in || checkOut !== current.check_out) {
        const { rows: holds } = await client.query(
          "SELECT room_id FROM room_holds WHERE booking_id = $1", [id]
        );
        await this.setRoomHolds(client, id, holds.map((h: { room_id: string }) => h.room_id), checkIn, checkOut);
      }

      const sets: string[] = ["updated_at = $2"];
      const vals: unknown[] = [id, new Date().toISOString()];
      let pi = 3;
      if (patch.check_in !== undefined) { sets.push(`check_in = $${pi}`); vals.push(checkIn); pi++; }
      if (patch.check_out !== undefined) { sets.push(`check_out = $${pi}`); vals.push(checkOut); pi++; }
      if (patch.purpose_of_visit !== undefined) { sets.push(`purpose_of_visit = $${pi}`); vals.push(patch.purpose_of_visit); pi++; }
      if (patch.meals !== undefined) { sets.push(`meals = $${pi}`); vals.push(JSON.stringify(patch.meals)); pi++; }
      if (patch.meal_preference !== undefined) { sets.push(`meal_preference = $${pi}`); vals.push(patch.meal_preference); pi++; }
      if (patch.meal_diet_counts !== undefined) { sets.push(`meal_diet_counts = $${pi}`); vals.push(JSON.stringify(patch.meal_diet_counts)); pi++; }

      if (patch.extension_request !== undefined) {
        sets.push(`extension_requested_until = $${pi}`); vals.push(patch.extension_request?.until ?? null); pi++;
        sets.push(`extension_reason = $${pi}`); vals.push(patch.extension_request?.reason ?? null); pi++;
        sets.push(`extension_requested_at = $${pi}`); vals.push(patch.extension_request ? new Date().toISOString() : null); pi++;
      } else if (current.extension_requested_until && Date.parse(current.extension_requested_until) <= Date.parse(checkOut)) {
        sets.push(`extension_requested_until = $${pi}`); vals.push(null); pi++;
        sets.push(`extension_reason = $${pi}`); vals.push(null); pi++;
        sets.push(`extension_requested_at = $${pi}`); vals.push(null); pi++;
      }

      await client.query(`UPDATE bookings SET ${sets.join(", ")} WHERE id = $1`, vals);

      await client.query(
        `INSERT INTO booking_logs (booking_id, action_by, action_by_name, previous_status, new_status, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, log.action_by, log.action_by_name, current.status, current.status, log.remarks]
      );
    });
  }

  async listBookingsWithMealsOn(day: string, guestHouseId?: string): Promise<BookingWithDetails[]> {
    let query = "SELECT * FROM bookings WHERE meals @> $1::jsonb";
    const params: unknown[] = [JSON.stringify([{ date: day }])];
    if (guestHouseId) {
      query += " AND guest_house_id = $2";
      params.push(guestHouseId);
    }
    query += " ORDER BY check_in";
    const { rows } = await this.pool.query(query, params);
    const hydrated = await this.hydrate(rows);
    return hydrated.filter((b) => mealsOn(b.meals, day).length > 0);
  }

  async getOccupiedRoomIds(
    guestHouseId: string,
    checkIn: string,
    checkOut: string,
    excludeBookingId?: string
  ): Promise<string[]> {
    const padded = new Date(Date.parse(checkOut) + (await this.bufferNow())).toISOString();
    let query = `
      SELECT DISTINCT rh.room_id FROM room_holds rh
      JOIN rooms r ON r.id = rh.room_id
      WHERE r.guest_house_id = $1
        AND rh.guard && $2::tstzrange`;
    const params: unknown[] = [guestHouseId, rangeLiteral(checkIn, padded)];
    if (excludeBookingId) {
      query += " AND rh.booking_id != $3";
      params.push(excludeBookingId);
    }
    const { rows } = await this.pool.query(query, params);
    return rows.map((r: { room_id: string }) => r.room_id);
  }

  async listRoomOccupancy(guestHouseId: string, from: string, to: string): Promise<RoomOccupancySegment[]> {
    const window = rangeLiteral(from, to);
    const query = `
      SELECT rh.room_id, rh.booking_id, rh.during::text, rh.override_by,
        b.booking_reference_id, b.status, b.check_in, b.check_out, b.purpose_of_visit,
        p.full_name AS requester_name
      FROM room_holds rh
      JOIN rooms r ON r.id = rh.room_id
      JOIN bookings b ON b.id = rh.booking_id
      LEFT JOIN profiles p ON p.id = b.user_id
      WHERE r.guest_house_id = $1
        AND (rh.during && $2::tstzrange OR rh.guard && $2::tstzrange)`;
    const [{ rows }, buffer] = await Promise.all([
      this.pool.query(query, [guestHouseId, window]),
      this.bufferNow(),
    ]);

    const seen = new Set<string>();
    return rows.flatMap((hold: Record<string, unknown>) => {
      const key = `${hold.booking_id}:${hold.room_id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        room_id: hold.room_id as string,
        booking_id: hold.booking_id as string,
        booking_reference_id: hold.booking_reference_id as string,
        status: hold.status as Booking["status"],
        check_in: hold.check_in as string,
        check_out: hold.check_out as string,
        turnaround_until:
          !hold.override_by && buffer > 0
            ? new Date(Date.parse(hold.check_out as string) + buffer).toISOString()
            : null,
        requester_name: (hold.requester_name as string) ?? null,
        purpose_of_visit: hold.purpose_of_visit as string,
      }];
    });
  }

  async applyBookingBuffer(minutes: number): Promise<void> {
    try {
      await this.pool.query("SELECT set_booking_buffer($1)", [minutes]);
    } catch (err: unknown) {
      const e = err as { message?: string };
      const msg = e.message ?? "";
      const match = /BUFFER_CLASH\|(\d+)\|(.*)/.exec(msg);
      if (match) throw new BufferClashError(Number(match[1]), match[2]);
      const blocked = /ROOM_BLOCKED\|([^\n]+)/.exec(msg);
      if (blocked) throw new RoomClashError(`That buffer would run a stay into a maintenance block: ${blocked[1]}`);
      throw err;
    }
  }

  // ---- documents (local filesystem) -------------------------------------

  async saveDocument(file: PreparedUpload, folder: string): Promise<string> {
    const dir = path.join(UPLOAD_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file.name), Buffer.from(file.bytes));
    return `${folder}/${file.name}`;
  }

  async documentUrl(storedPath: string, _seconds: number): Promise<string | null> {
    void _seconds;
    const onDisk = path.join(UPLOAD_DIR, storedPath);
    return fs.existsSync(onDisk) ? `/api/documents/${storedPath}` : null;
  }

  async findDocumentOwner(storedPath: string): Promise<{ bookingId: string } | null> {
    const { rows: guests } = await this.pool.query(
      "SELECT booking_id FROM booking_guests WHERE id_document_url = $1 LIMIT 1",
      [storedPath]
    );
    if (guests.length > 0) return { bookingId: guests[0].booking_id };
    const { rows: bookings } = await this.pool.query(
      "SELECT id FROM bookings WHERE alumni_id_url = $1 OR debit_document_url = $1 LIMIT 1",
      [storedPath]
    );
    return bookings.length > 0 ? { bookingId: bookings[0].id } : null;
  }

  async deleteDocument(storedPath: string): Promise<void> {
    const onDisk = path.join(UPLOAD_DIR, storedPath);
    try { fs.rmSync(onDisk, { force: true }); } catch { /* already gone */ }
  }

  // ---- settings ---------------------------------------------------------

  async getSetting(key: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      "SELECT value FROM app_settings WHERE key = $1", [key]
    );
    return typeof rows[0]?.value === "string" ? rows[0].value : null;
  }

  async getJsonSetting(key: string): Promise<unknown | null> {
    const { rows } = await this.pool.query(
      "SELECT value FROM app_settings WHERE key = $1", [key]
    );
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
      [key, value, new Date().toISOString()]
    );
  }

  async setJsonSetting(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = $3`,
      [key, JSON.stringify(value), new Date().toISOString()]
    );
  }

  async listHostels(): Promise<string[]> {
    const { rows } = await this.pool.query("SELECT hostel_name FROM institute_hostels ORDER BY hostel_name");
    return rows.map((r: { hostel_name: string }) => r.hostel_name);
  }

  async addHostel(name: string): Promise<void> {
    try {
      const baseId = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "HOS";
      let hostelId = baseId;
      let counter = 1;
      while (true) {
        const { rows } = await this.pool.query("SELECT 1 FROM institute_hostels WHERE hostel_id = $1", [hostelId]);
        if (rows.length === 0) break;
        counter++;
        hostelId = `${baseId}${counter}`;
      }
      await this.pool.query(
        "INSERT INTO institute_hostels (hostel_id, hostel_name) VALUES ($1, $2)",
        [hostelId, name]
      );
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error(`${name} is already on the list`);
      throw err;
    }
  }

  async renameHostel(from: string, to: string): Promise<void> {
    try {
      await this.pool.query("UPDATE institute_hostels SET hostel_name = $1 WHERE hostel_name = $2", [to, from]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error(`${to} is already on the list`);
      throw err;
    }
  }

  async removeHostel(name: string): Promise<void> {
    try {
      await this.pool.query("DELETE FROM institute_hostels WHERE hostel_name = $1", [name]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23503") throw new Error(`Accounts still name ${name} - move them first`);
      throw err;
    }
  }

  async listOfficialEmails(): Promise<string[]> {
    const { rows } = await this.pool.query(
      "SELECT email FROM official_email_whitelist ORDER BY email"
    );
    return rows.map((r: { email: string }) => r.email);
  }

  async addOfficialEmail(email: string): Promise<void> {
    const wanted = email.trim().toLowerCase();
    try {
      await this.pool.query("INSERT INTO official_email_whitelist (email) VALUES ($1)", [wanted]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error(`${wanted} is already on the list`);
      throw err;
    }
  }

  async removeOfficialEmail(email: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM official_email_whitelist WHERE email = $1",
      [email.trim().toLowerCase()]
    );
  }

  // ---- units ------------------------------------------------------------

  async listUnits(): Promise<Unit[]> {
    const { rows } = await this.pool.query("SELECT * FROM units ORDER BY name");
    return rows as Unit[];
  }

  async createUnit(input: Omit<Unit, "id">): Promise<Unit> {
    const { faculty_advisor_id, secretary_email, ...rest } = input;
    const row: Record<string, unknown> = {
      ...rest,
      ...(faculty_advisor_id ? { faculty_advisor_id } : {}),
      ...(secretary_email ? { secretary_email } : {}),
    };
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO units (${cols.join(", ")}) VALUES (${ph}) RETURNING *`, vals
      );
      return rows[0] as Unit;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error("A unit with this name already exists");
      throw err;
    }
  }

  async updateUnit(id: string, patch: Partial<Omit<Unit, "id">>): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([col], i) => `${col} = $${i + 2}`);
    const vals = entries.map(([, v]) => v);
    await this.pool.query(`UPDATE units SET ${sets.join(", ")} WHERE id = $1`, [id, ...vals]);
  }

  async deleteUnit(id: string): Promise<void> {
    try {
      await this.pool.query("DELETE FROM units WHERE id = $1", [id]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23503") throw new Error("People or other units still belong to this one - move them first");
      throw err;
    }
  }

  // ---- form config ------------------------------------------------------

  async getFormConfig(role: Role): Promise<RoleFormConfig | null> {
    const { rows } = await this.pool.query(
      "SELECT config FROM form_configs WHERE role = $1", [role]
    );
    return rows[0]?.config ?? null;
  }

  async saveFormConfig(config: RoleFormConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO form_configs (role, config, updated_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (role) DO UPDATE SET config = $2::jsonb, updated_at = $3`,
      [config.role, JSON.stringify(config), new Date().toISOString()]
    );
  }

  async deleteFormConfig(role: Role): Promise<void> {
    await this.pool.query("DELETE FROM form_configs WHERE role = $1", [role]);
  }

  // ---- projects ---------------------------------------------------------

  async listProjects(): Promise<Project[]> {
    const { rows } = await this.pool.query("SELECT * FROM projects ORDER BY project_number");
    return rows as Project[];
  }

  async createProjects(inputs: NewProjectInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const cols = Object.keys(inputs[0]);
    const params: unknown[] = [];
    const valueRows: string[] = [];
    for (const input of inputs) {
      const row: string[] = [];
      for (const col of cols) {
        params.push((input as Record<string, unknown>)[col]);
        row.push(`$${params.length}`);
      }
      valueRows.push(`(${row.join(", ")})`);
    }
    try {
      await this.pool.query(
        `INSERT INTO projects (${cols.join(", ")}) VALUES ${valueRows.join(", ")}`, params
      );
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error("One of those project numbers is already on the list");
      throw err;
    }
  }

  async updateProject(id: string, patch: Partial<NewProjectInput>): Promise<void> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([col], i) => `${col} = $${i + 2}`);
    const vals = entries.map(([, v]) => v);
    try {
      await this.pool.query(`UPDATE projects SET ${sets.join(", ")} WHERE id = $1`, [id, ...vals]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error("Another project already has that number");
      throw err;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await this.pool.query("DELETE FROM projects WHERE id = $1", [id]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23503") throw new Error("A booking is debited to this project - deactivate it instead");
      throw err;
    }
  }

  // ---- institute data tables (migration 35) --------------------------------

  private async instituteFind<T>(table: string, emailCol: string, email: string): Promise<T | null> {
    try {
      const { rows } = await this.pool.query(
        `SELECT * FROM ${table} WHERE lower(${emailCol}) = lower($1)`,
        [email.trim()]
      );
      return (rows[0] as T) ?? null;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "42P01") return null;
      throw err;
    }
  }

  private async instituteList<T>(table: string, orderBy: string): Promise<T[]> {
    try {
      const { rows } = await this.pool.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      return rows as T[];
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "42P01") return [];
      throw err;
    }
  }

  private async instituteSave<I>(
    table: string,
    emailCol: string,
    added: I[],
    updated: { id: string; input: I }[],
    rowOf: (input: I) => Record<string, unknown>
  ): Promise<void> {
    await this.withTx(async (client) => {
      if (added.length > 0) {
        const firstRow = rowOf(added[0]);
        const cols = Object.keys(firstRow);
        const params: unknown[] = [];
        const valueRows: string[] = [];
        for (const input of added) {
          const row = rowOf(input);
          const placeholders: string[] = [];
          for (const col of cols) {
            params.push(row[col]);
            placeholders.push(`$${params.length}`);
          }
          valueRows.push(`(${placeholders.join(", ")})`);
        }
        try {
          await client.query(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${valueRows.join(", ")}`,
            params
          );
        } catch (err: unknown) {
          const e = err as { code?: string };
          if (e.code === "23505") throw new Error(`A record with that ${emailCol} is already stored`);
          throw err;
        }
      }
      for (const { id, input } of updated) {
        const row = rowOf(input);
        const entries = Object.entries(row);
        const sets = entries.map(([col], i) => `${col} = $${i + 2}`);
        const vals = entries.map(([, v]) => v);
        await client.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1`, [id, ...vals]);
      }
    });
  }

  private async instituteDelete(table: string, id: string): Promise<void> {
    try {
      await this.pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "42P01") return;
      throw err;
    }
  }

  private async instituteDeleteAll(table: string): Promise<number> {
    try {
      const { rowCount } = await this.pool.query(`DELETE FROM ${table}`);
      return rowCount ?? 0;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "42P01") return 0;
      throw err;
    }
  }

  private studentRowOf(input: NewStudentInput): Record<string, unknown> {
    return {
      email: input.email,
      batch_year: input.batch_year ?? null,
      roll_number: input.roll_number ?? null,
      full_name: input.full_name ?? null,
      programme: input.programme ?? null,
      faculty_advisor_guide_name: input.faculty_advisor_guide_name ?? null,
      department: input.department ?? null,
      year_of_admission: input.year_of_admission ?? null,
      phone: input.phone ?? null,
      aadhar_number: input.aadhar_number ? encryptValue(input.aadhar_number) : null,
      father_name: input.father_name ?? null,
      father_aadhar_number: input.father_aadhar_number ? encryptValue(input.father_aadhar_number) : null,
      father_phone_number: input.father_phone_number ?? null,
      mother_name: input.mother_name ?? null,
      mother_aadhar_number: input.mother_aadhar_number ? encryptValue(input.mother_aadhar_number) : null,
      mother_phone_number: input.mother_phone_number ?? null,
      spouse_name: input.spouse_name ?? null,
      spouse_aadhar_number: input.spouse_aadhar_number ? encryptValue(input.spouse_aadhar_number) : null,
      spouse_phone_number: input.spouse_phone_number ?? null,
      guardian_name: input.guardian_name ?? null,
      guardian_aadhar_number: input.guardian_aadhar_number ? encryptValue(input.guardian_aadhar_number) : null,
      guardian_phone_number: input.guardian_phone_number ?? null,
      hostel: input.hostel ?? null,
      imported_by: input.imported_by ?? null,
    };
  }

  private hydrateStudent(row: Record<string, unknown>): InstituteStudent {
    return {
      ...row,
      aadhar_number: row.aadhar_number ? decryptValue(row.aadhar_number as string) : null,
      father_aadhar_number: row.father_aadhar_number ? decryptValue(row.father_aadhar_number as string) : null,
      mother_aadhar_number: row.mother_aadhar_number ? decryptValue(row.mother_aadhar_number as string) : null,
      spouse_aadhar_number: row.spouse_aadhar_number ? decryptValue(row.spouse_aadhar_number as string) : null,
      guardian_aadhar_number: row.guardian_aadhar_number ? decryptValue(row.guardian_aadhar_number as string) : null,
    } as InstituteStudent;
  }

  async findStudent(email: string): Promise<InstituteStudent | null> {
    try {
      const { rows } = await this.pool.query(
        "SELECT * FROM institute_students WHERE lower(email) = lower($1)", [email.trim()]
      );
      return rows[0] ? this.hydrateStudent(rows[0] as Record<string, unknown>) : null;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "42P01") return null;
      throw err;
    }
  }

  async listStudents(): Promise<InstituteStudent[]> {
    try {
      const { rows } = await this.pool.query("SELECT * FROM institute_students ORDER BY email");
      return (rows as Record<string, unknown>[]).map((r) => this.hydrateStudent(r));
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "42P01") return [];
      throw err;
    }
  }

  async saveStudents(
    added: NewStudentInput[],
    updated: { id: string; input: NewStudentInput }[]
  ): Promise<void> {
    return this.instituteSave("institute_students", "email", added, updated, (i) => this.studentRowOf(i));
  }

  async deleteStudent(id: string): Promise<void> {
    return this.instituteDelete("institute_students", id);
  }

  async deleteAllStudents(): Promise<number> {
    return this.instituteDeleteAll("institute_students");
  }

  private employeeRowOf(input: NewEmployeeInput): Record<string, unknown> {
    return {
      email: input.email,
      employee_id: input.employee_id ?? null,
      full_name: input.full_name ?? null,
      department: input.department ?? null,
      employee_type: input.employee_type ?? null,
      designation: input.designation ?? null,
      phone: input.phone ?? null,
      office_number: input.office_number ?? null,
      gender: input.gender ?? null,
      imported_by: input.imported_by ?? null,
    };
  }

  async findEmployee(email: string): Promise<InstituteEmployee | null> {
    return this.instituteFind("institute_employees", "email", email);
  }

  async listEmployees(): Promise<InstituteEmployee[]> {
    return this.instituteList("institute_employees", "email");
  }

  async saveEmployees(
    added: NewEmployeeInput[],
    updated: { id: string; input: NewEmployeeInput }[]
  ): Promise<void> {
    return this.instituteSave("institute_employees", "email", added, updated, (i) => this.employeeRowOf(i));
  }

  async deleteEmployee(id: string): Promise<void> {
    return this.instituteDelete("institute_employees", id);
  }

  async deleteAllEmployees(): Promise<number> {
    return this.instituteDeleteAll("institute_employees");
  }

  private officeRowOf(input: NewOfficeInput): Record<string, unknown> {
    return {
      office_email: input.office_email,
      office_name: input.office_name ?? null,
      office_class: input.office_class ?? null,
      phone: input.phone ?? null,
      department_head: input.department_head ?? null,
      head_name: input.head_name ?? null,
      head_email: input.head_email ?? null,
      imported_by: input.imported_by ?? null,
    };
  }

  async findOffice(email: string): Promise<InstituteOffice | null> {
    return this.instituteFind("institute_offices", "office_email", email);
  }

  async listOffices(): Promise<InstituteOffice[]> {
    return this.instituteList("institute_offices", "office_email");
  }

  async saveOffices(
    added: NewOfficeInput[],
    updated: { id: string; input: NewOfficeInput }[]
  ): Promise<void> {
    return this.instituteSave("institute_offices", "office_email", added, updated, (i) => this.officeRowOf(i));
  }

  async deleteOffice(id: string): Promise<void> {
    return this.instituteDelete("institute_offices", id);
  }

  async deleteAllOffices(): Promise<number> {
    return this.instituteDeleteAll("institute_offices");
  }

  private fccRowOf(input: NewFCCInput): Record<string, unknown> {
    return {
      council_email: input.council_email,
      council_name: input.council_name ?? null,
      event_or_council: input.event_or_council ?? null,
      faculty_advisor_email: input.faculty_advisor_email ?? null,
      imported_by: input.imported_by ?? null,
    };
  }

  async findFCC(email: string): Promise<InstituteFCC | null> {
    return this.instituteFind("institute_fcc", "council_email", email);
  }

  async listFCCs(): Promise<InstituteFCC[]> {
    return this.instituteList("institute_fcc", "council_email");
  }

  async saveFCCs(
    added: NewFCCInput[],
    updated: { id: string; input: NewFCCInput }[]
  ): Promise<void> {
    return this.instituteSave("institute_fcc", "council_email", added, updated, (i) => this.fccRowOf(i));
  }

  async deleteFCC(id: string): Promise<void> {
    return this.instituteDelete("institute_fcc", id);
  }

  async deleteAllFCCs(): Promise<number> {
    return this.instituteDeleteAll("institute_fcc");
  }

  private hostelRowOf(input: NewHostelInput): Record<string, unknown> {
    return {
      hostel_id: input.hostel_id,
      hostel_name: input.hostel_name,
    };
  }

  async listInstituteHostels(): Promise<InstituteHostel[]> {
    return this.instituteList("institute_hostels", "hostel_id");
  }

  async saveInstituteHostels(
    added: NewHostelInput[],
    updated: { id: string; input: NewHostelInput }[]
  ): Promise<void> {
    return this.instituteSave("institute_hostels", "hostel_id", added, updated, (i) => this.hostelRowOf(i));
  }

  async deleteInstituteHostel(id: string): Promise<void> {
    try {
      return await this.instituteDelete("institute_hostels", id);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23503") throw new Error("This hostel is assigned to user accounts - move them first");
      throw err;
    }
  }

  async deleteAllInstituteHostels(): Promise<number> {
    const inUse = await this.pool.query("SELECT DISTINCT hostel_name FROM profiles WHERE hostel_name IS NOT NULL");
    if (inUse.rows.length > 0) {
      const names = inUse.rows.map((r: { hostel_name: string }) => r.hostel_name).join(", ");
      throw new Error(`Cannot clear hostels: accounts still reference ${names}`);
    }
    return this.instituteDeleteAll("institute_hostels");
  }

  private wardenRowOf(input: NewWardenInput): Record<string, unknown> {
    return {
      warden_email: input.warden_email,
      full_name: input.full_name ?? null,
      warden_phone: input.warden_phone ?? null,
      warden_role: input.warden_role ?? null,
      hostel_id: input.hostel_id ?? null,
      imported_by: input.imported_by ?? null,
    };
  }

  async findWarden(email: string): Promise<InstituteWarden | null> {
    return this.instituteFind("institute_wardens", "warden_email", email);
  }

  async listWardens(): Promise<InstituteWarden[]> {
    return this.instituteList("institute_wardens", "warden_email");
  }

  async saveWardens(
    added: NewWardenInput[],
    updated: { id: string; input: NewWardenInput }[]
  ): Promise<void> {
    return this.instituteSave("institute_wardens", "warden_email", added, updated, (i) => this.wardenRowOf(i));
  }

  async deleteWarden(id: string): Promise<void> {
    return this.instituteDelete("institute_wardens", id);
  }

  async deleteAllWardens(): Promise<number> {
    return this.instituteDeleteAll("institute_wardens");
  }

  // ---- audit ------------------------------------------------------------

  async appendAudit(event: NewAuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO security_audit (event, actor_id, actor_name, actor_role, target, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [event.event, event.actor_id, event.actor_name, event.actor_role ?? null,
       event.target ?? null, JSON.stringify(event.details),
       event.ip ?? null, event.user_agent ?? null]
    );
  }

  async listAudit(filter: AuditFilter): Promise<AuditEvent[]> {
    const limit = filter.limit ?? 200;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filter.event) { conditions.push(`event = $${i}`); params.push(filter.event); i++; }
    if (filter.actorId) { conditions.push(`actor_id = $${i}`); params.push(filter.actorId); i++; }
    if (filter.from) { conditions.push(`at >= $${i}`); params.push(filter.from); i++; }
    if (filter.to) { conditions.push(`at < $${i}`); params.push(filter.to); i++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const fetchLimit = filter.q ? Math.max(limit * 5, 1000) : limit;
    const { rows } = await this.pool.query(
      `SELECT * FROM security_audit ${where} ORDER BY at DESC LIMIT ${fetchLimit}`,
      params
    );
    return rows
      .map((row: Record<string, unknown>): AuditEvent => ({
        ...row,
        id: String(row.id),
        event: row.event as AuditEvent["event"],
        details: (row.details ?? {}) as Record<string, unknown>,
      }) as AuditEvent)
      .filter((e: AuditEvent) => auditMatches(e, filter))
      .slice(0, limit);
  }

  async purgeAudit(days: number): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT purge_security_audit($1) AS count", [Math.max(180, days)]
    );
    return Number(rows[0]?.count ?? 0);
  }

  // ---- purge guest identities -------------------------------------------

  async purgeGuestIdentities(before: string): Promise<{ bookings: number; documents: string[] }> {
    const { rows: stays } = await this.pool.query(
      "SELECT id, alumni_id_url FROM bookings WHERE check_out < $1", [before]
    );
    const ids = stays.map((b: { id: string }) => b.id);
    if (ids.length === 0) return { bookings: 0, documents: [] };

    const { rows: guests } = await this.pool.query(
      `SELECT id, booking_id, id_document_url FROM booking_guests
       WHERE booking_id = ANY($1)
         AND (id_number IS NOT NULL OR passport_number IS NOT NULL OR id_document_url IS NOT NULL)`,
      [ids]
    );

    const documents = [
      ...guests.map((g: { id_document_url: string | null }) => g.id_document_url).filter((u: string | null): u is string => Boolean(u)),
      ...stays.map((b: { alumni_id_url: string | null }) => b.alumni_id_url).filter((u: string | null): u is string => Boolean(u)),
    ];
    const touched = new Set<string>(guests.map((g: { booking_id: string }) => g.booking_id));

    await this.withTx(async (client) => {
      if (guests.length > 0) {
        const guestIds = guests.map((g: { id: string }) => g.id);
        await client.query(
          "UPDATE booking_guests SET id_number = NULL, passport_number = NULL, id_document_url = NULL WHERE id = ANY($1)",
          [guestIds]
        );
      }
      const withCards = stays.filter((b: { alumni_id_url: string | null }) => b.alumni_id_url).map((b: { id: string }) => b.id);
      if (withCards.length > 0) {
        await client.query(
          "UPDATE bookings SET alumni_id_url = NULL WHERE id = ANY($1)", [withCards]
        );
        for (const id of withCards) touched.add(id);
      }
    });
    return { bookings: touched.size, documents };
  }

  // ---- tariffs and invoices ---------------------------------------------

  async listTariffs(): Promise<Tariff[]> {
    const { rows } = await this.pool.query("SELECT * FROM tariffs ORDER BY effective_from");
    return rows.map((row: Record<string, unknown>) => ({ ...row, rate: Number(row.rate) })) as Tariff[];
  }

  async createTariff(input: NewTariffInput): Promise<Tariff> {
    const cols = Object.keys(input);
    const vals = Object.values(input);
    const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO tariffs (${cols.join(", ")}) VALUES (${ph}) RETURNING *`, vals
      );
      return { ...rows[0], rate: Number(rows[0].rate) } as Tariff;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") throw new Error("A rate for exactly this scope already starts on that date");
      throw err;
    }
  }

  async deleteTariff(id: string): Promise<void> {
    try {
      await this.pool.query("DELETE FROM tariffs WHERE id = $1", [id]);
    } catch (err: unknown) {
      const e = err as { message?: string };
      throw invoiceErrorFrom(e.message ?? "") ?? err;
    }
  }

  async listInvoices(filter: InvoiceFilter): Promise<InvoiceRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filter.bookingId) { conditions.push(`booking_id = $${i}`); params.push(filter.bookingId); i++; }
    if (filter.bookingIds) { conditions.push(`booking_id = ANY($${i})`); params.push(filter.bookingIds); i++; }
    if (filter.statuses) { conditions.push(`status = ANY($${i})`); params.push(filter.statuses); i++; }
    if (filter.issuedFrom) { conditions.push(`issued_at >= $${i}`); params.push(filter.issuedFrom); i++; }
    if (filter.issuedTo) { conditions.push(`issued_at < $${i}`); params.push(filter.issuedTo); i++; }
    if (filter.paidFrom) { conditions.push(`paid_at >= $${i}`); params.push(filter.paidFrom); i++; }
    if (filter.paidTo) { conditions.push(`paid_at < $${i}`); params.push(filter.paidTo); i++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM invoices ${where} ORDER BY created_at DESC`, params
    );
    return rows.map(hydrateInvoice);
  }

  async getInvoice(id: string): Promise<InvoiceRecord | null> {
    const { rows } = await this.pool.query("SELECT * FROM invoices WHERE id = $1", [id]);
    return rows[0] ? hydrateInvoice(rows[0]) : null;
  }

  async saveInvoiceDraft(
    bookingId: string,
    mealCounts: MealCounts | null,
    userId: string,
    extraCharges?: ExtraCharge[]
  ): Promise<InvoiceRecord> {
    const { rows: [live] } = await this.pool.query(
      "SELECT * FROM invoices WHERE booking_id = $1 AND status != 'cancelled' LIMIT 1",
      [bookingId]
    );
    if (live && live.status !== "draft") {
      throw new InvoiceStateError(
        `This booking already has invoice ${live.invoice_number} - cancel it first to issue a corrected one.`
      );
    }
    const hadCharges = Array.isArray(live?.extra_charges) && live.extra_charges.length > 0;
    const includeCharges =
      extraCharges !== undefined && (extraCharges.length > 0 || hadCharges);

    if (live) {
      const sets: string[] = ["meal_counts = $2::jsonb", "updated_at = $3"];
      const vals: unknown[] = [live.id, JSON.stringify(mealCounts), new Date().toISOString()];
      if (includeCharges) {
        sets.push(`extra_charges = $${vals.length + 1}::jsonb`);
        vals.push(JSON.stringify(extraCharges));
      }
      const { rows } = await this.pool.query(
        `UPDATE invoices SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals
      );
      return hydrateInvoice(rows[0]);
    }

    const insertCols = ["booking_id", "meal_counts", "created_by"];
    const insertVals: unknown[] = [bookingId, JSON.stringify(mealCounts), userId];
    if (includeCharges) {
      insertCols.push("extra_charges");
      insertVals.push(JSON.stringify(extraCharges));
    }
    const ph = insertVals.map((_, i) => `$${i + 1}`).join(", ");
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO invoices (${insertCols.join(", ")}) VALUES (${ph}) RETURNING *`,
        insertVals
      );
      return hydrateInvoice(rows[0]);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "23505") return this.saveInvoiceDraft(bookingId, mealCounts, userId, extraCharges);
      throw err;
    }
  }

  async issueInvoice(input: IssueInvoiceInput): Promise<InvoiceRecord> {
    if ((input.extraCharges ?? []).length > 0) {
      await this.saveInvoiceDraft(input.bookingId, input.mealCounts, input.issuedBy, input.extraCharges);
    }
    try {
      const { rows } = await this.pool.query(
        `SELECT issue_invoice($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) AS result`,
        [
          input.bookingId, input.fy, input.prefix, input.digits,
          JSON.stringify(input.document), JSON.stringify(input.mealCounts),
          input.issuedBy, input.replaces,
        ]
      );
      // The RPC returns the invoice row; if it returns JSON, parse and hydrate
      const result = rows[0]?.result;
      if (typeof result === "object" && result !== null) return hydrateInvoice(result);
      // Fallback: read the invoice
      const { rows: invoices } = await this.pool.query(
        "SELECT * FROM invoices WHERE booking_id = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1",
        [input.bookingId]
      );
      return hydrateInvoice(invoices[0]);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === "23505") {
        throw new InvoiceStateError("Another invoice was issued for this booking a moment ago - reload to see it.");
      }
      throw invoiceErrorFrom(e.message ?? "") ?? err;
    }
  }

  async markInvoicePaid(
    id: string,
    payment: { mode: PaymentMode; reference: string | null; paidAt: string; paidBy: string }
  ): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE invoices SET status = 'paid', payment_mode = $2, payment_reference = $3,
       paid_at = $4, paid_by = $5, updated_at = $6
       WHERE id = $1 AND status = 'issued'`,
      [id, payment.mode, payment.reference?.trim() || null, payment.paidAt, payment.paidBy, new Date().toISOString()]
    );
    if (!rowCount) throw new InvoiceStateError("Only an issued, unpaid invoice can be marked paid - reload to see its state.");
  }

  async cancelInvoice(id: string, cancel: { reason: string; by: string }): Promise<void> {
    const now = new Date().toISOString();
    const { rowCount } = await this.pool.query(
      `UPDATE invoices SET status = 'cancelled', cancelled_at = $2, cancelled_by = $3,
       cancel_reason = $4, updated_at = $5
       WHERE id = $1 AND status IN ('issued', 'paid')`,
      [id, now, cancel.by, cancel.reason.trim(), now]
    );
    if (!rowCount) throw new InvoiceStateError("Only an issued or paid invoice can be cancelled - reload to see its state.");
  }

  async deleteBooking(id: string): Promise<void> {
    await this.withTx(async (client) => {
      await client.query(
        "DELETE FROM invoices WHERE booking_id = $1 AND status = 'draft'", [id]
      ).catch((e: { code?: string }) => {
        if (e.code !== "42P01") throw e;
      });
      try {
        await client.query("DELETE FROM bookings WHERE id = $1", [id]);
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e.code === "23503" && /invoices/.test(e.message ?? "")) {
          throw new InvoiceStateError("An invoice was issued for this booking, so it cannot be deleted - cancel the booking instead.");
        }
        throw err;
      }
    });
  }

  // ---- sessions, 2FA and throttles (migration 21) -----------------------

  async createSession(input: NewSessionInput): Promise<Session> {
    const cols = Object.keys(input);
    const vals = Object.values(input);
    const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await this.pool.query(
      `INSERT INTO sessions (${cols.join(", ")}) VALUES (${ph}) RETURNING *`, vals
    );
    return rows[0] as Session;
  }

  async getSessionByToken(tokenHash: string): Promise<Session | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM sessions WHERE token_hash = $1", [tokenHash]
    );
    return (rows[0] as Session) ?? null;
  }

  async touchSession(id: string, lastSeenAt: string, idleExpiresAt: string): Promise<void> {
    await this.pool.query(
      "UPDATE sessions SET last_seen_at = $2, idle_expires_at = $3 WHERE id = $1",
      [id, lastSeenAt, idleExpiresAt]
    );
  }

  async revokeSession(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL",
      [id, new Date().toISOString()]
    );
  }

  async revokeUserSessions(userId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      "UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
      [userId, new Date().toISOString()]
    );
    return rowCount ?? 0;
  }

  async markSessionVerified(id: string, at: string): Promise<void> {
    await this.pool.query("UPDATE sessions SET verified_at = $2 WHERE id = $1", [id, at]);
  }

  async listUserSessions(userId: string): Promise<Session[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM sessions WHERE user_id = $1 AND revoked_at IS NULL
       AND absolute_expires_at > $2 ORDER BY created_at DESC`,
      [userId, new Date().toISOString()]
    );
    return rows as Session[];
  }

  async purgeExpiredSessions(): Promise<number> {
    const { rows } = await this.pool.query("SELECT purge_expired_sessions() AS count");
    return Number(rows[0]?.count ?? 0);
  }

  async getUserMfa(userId: string): Promise<UserMfa | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM user_mfa WHERE user_id = $1", [userId]
    );
    return (rows[0] as UserMfa) ?? null;
  }

  async saveUserMfa(record: UserMfa): Promise<void> {
    const cols = Object.keys(record);
    const vals = Object.values(record);
    const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
    const sets = cols.filter((c) => c !== "user_id").map((col, idx) => `${col} = $${idx + 2}`);
    await this.pool.query(
      `INSERT INTO user_mfa (${cols.join(", ")}) VALUES (${ph})
       ON CONFLICT (user_id) DO UPDATE SET ${sets.join(", ")}, updated_at = $${vals.length + 1}`,
      [...vals, new Date().toISOString()]
    );
  }

  async deleteUserMfa(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM user_mfa WHERE user_id = $1", [userId]);
  }

  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const { rows } = await this.pool.query(
      "SELECT * FROM hit_rate_limit($1, $2, $3)",
      [key, limit, windowSeconds]
    );
    const row = rows[0];
    return {
      allowed: Boolean(row?.allowed ?? true),
      attempts: Number(row?.attempts ?? 0),
      retryAfter: Number(row?.retry_after ?? 0),
    };
  }

  // ---- privacy requests (migration 21) ----------------------------------

  async createPrivacyRequest(input: NewPrivacyRequest): Promise<PrivacyRequest> {
    const cols = Object.keys(input);
    const vals = Object.values(input);
    const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await this.pool.query(
      `INSERT INTO privacy_requests (${cols.join(", ")}) VALUES (${ph}) RETURNING *`, vals
    );
    return rows[0] as PrivacyRequest;
  }

  async listPrivacyRequests(filter: { userId?: string; status?: PrivacyRequest["status"] }): Promise<PrivacyRequest[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filter.userId) { conditions.push(`user_id = $${i}`); params.push(filter.userId); i++; }
    if (filter.status) { conditions.push(`status = $${i}`); params.push(filter.status); i++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM privacy_requests ${where} ORDER BY created_at DESC`, params
    );
    return rows as PrivacyRequest[];
  }

  async resolvePrivacyRequest(
    id: string,
    patch: { status: PrivacyRequest["status"]; response: string; handledBy: string }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE privacy_requests SET status = $2, response = $3, handled_at = $4, handled_by = $5
       WHERE id = $1`,
      [id, patch.status, patch.response, new Date().toISOString(), patch.handledBy]
    );
  }

  // ---- room blocks (migration 20) ---------------------------------------

  async listRoomBlocks(guestHouseId: string): Promise<RoomBlock[]> {
    const { rows } = await this.pool.query(
      `SELECT rb.id, rb.room_id, rb.during::text, rb.reason, rb.created_by, rb.created_at
       FROM room_blocks rb
       JOIN rooms r ON r.id = rb.room_id
       WHERE r.guest_house_id = $1`,
      [guestHouseId]
    );
    return rows
      .map((row: Record<string, unknown>) => {
        const [from, to] = parseRange(String(row.during));
        return {
          id: row.id as string,
          room_id: row.room_id as string,
          from, to,
          reason: row.reason as string,
          created_by: row.created_by as string | null,
          created_at: row.created_at as string,
        };
      })
      .sort((a: RoomBlock, b: RoomBlock) => a.from.localeCompare(b.from));
  }

  async createRoomBlock(input: NewRoomBlockInput): Promise<RoomBlock> {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO room_blocks (room_id, during, reason, created_by)
         VALUES ($1, $2::tstzrange, $3, $4) RETURNING id, created_at`,
        [input.room_id, rangeLiteral(input.from, input.to), input.reason, input.created_by]
      );
      return { ...input, id: rows[0].id, created_at: rows[0].created_at };
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const blocked = /ROOM_BLOCKED\|([^\n]+)/.exec(e.message ?? "");
      if (blocked) throw new RoomClashError(blocked[1]);
      if (e.code === "23P01") throw new RoomClashError("That room is already blocked for part of that time");
      throw err;
    }
  }

  async deleteRoomBlock(id: string): Promise<void> {
    await this.pool.query("DELETE FROM room_blocks WHERE id = $1", [id]);
  }

  // ---- user import batches (migration 32) -------------------------------

  async recordUserImport(input: NewUserImportBatch): Promise<UserImportBatch> {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO user_import_batches (actor_id, actor_name, status, columns_used, added, updated, unchanged_count, error)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) RETURNING *`,
        [input.actor_id, input.actor_name, input.status, input.columns_used,
         JSON.stringify(input.added), JSON.stringify(input.updated),
         input.unchanged_count, input.error]
      );
      return userImportFromRow(rows[0]);
    } catch (err: unknown) {
      const e = err as { code?: string; message: string };
      throw importBatchError(e);
    }
  }

  async settleUserImport(id: string, patch: UserImportSettlement): Promise<void> {
    const now = new Date().toISOString();
    const sets: string[] = ["status = $2"];
    const vals: unknown[] = [id, patch.status];
    let pi = 3;
    if (patch.error !== undefined) { sets.push(`error = $${pi}`); vals.push(patch.error); pi++; }
    if (patch.status === "applied") { sets.push(`applied_at = $${pi}`); vals.push(now); pi++; }
    if (patch.status === "reverted") {
      sets.push(`reverted_at = $${pi}`); vals.push(now); pi++;
      sets.push(`reverted_by = $${pi}`); vals.push(patch.reverted_by ?? null); pi++;
      sets.push(`reverted_actor_name = $${pi}`); vals.push(patch.reverted_actor_name ?? null); pi++;
    }
    try {
      await this.pool.query(`UPDATE user_import_batches SET ${sets.join(", ")} WHERE id = $1`, vals);
    } catch (err: unknown) {
      const e = err as { code?: string; message: string };
      throw importBatchError(e);
    }
  }

  async listUserImports(limit = 20): Promise<UserImportBatch[]> {
    try {
      const { rows } = await this.pool.query(
        "SELECT * FROM user_import_batches ORDER BY at DESC LIMIT $1", [limit]
      );
      return rows.map(userImportFromRow);
    } catch {
      return [];
    }
  }

  async getUserImport(id: string): Promise<UserImportBatch | null> {
    try {
      const { rows } = await this.pool.query(
        "SELECT * FROM user_import_batches WHERE id = $1", [id]
      );
      return rows[0] ? userImportFromRow(rows[0]) : null;
    } catch (err: unknown) {
      const e = err as { code?: string; message: string };
      throw importBatchError(e);
    }
  }

  // ---- email outbox -----------------------------------------------------

  async enqueueEmails(inputs: NewEmailInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const params: unknown[] = [];
    const valueRows: string[] = [];
    for (const input of inputs) {
      const base = params.length;
      params.push(
        input.booking_id, input.event_key, input.idempotency_key,
        input.to_emails, input.cc_emails, input.subject,
        input.body_html, input.body_text, input.thread_root,
        input.is_thread_root,
        input.attachments?.length ? JSON.stringify(input.attachments) : null,
        input.scheduled_for ?? null
      );
      valueRows.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::jsonb, $${base + 12})`
      );
    }
    const { rowCount } = await this.pool.query(
      `INSERT INTO email_outbox (booking_id, event_key, idempotency_key, to_emails, cc_emails, subject, body_html, body_text, thread_root, is_thread_root, attachments, scheduled_for)
       VALUES ${valueRows.join(", ")}
       ON CONFLICT (idempotency_key) DO NOTHING`,
      params
    );
    return rowCount ?? 0;
  }

  async claimQueuedEmails(limit: number, staleAfterMs: number): Promise<EmailMessage[]> {
    const interval = `${Math.max(1, Math.round(staleAfterMs / 1000))} seconds`;
    const { rows } = await this.pool.query(
      "SELECT * FROM claim_queued_emails($1, $2::interval)",
      [limit, interval]
    );
    return rows.map(hydrateEmail);
  }

  async settleEmail(id: string, result: EmailSettlement): Promise<void> {
    if (result.ok) {
      await this.pool.query(
        "UPDATE email_outbox SET status = 'SENT', sent_at = $2, last_error = NULL WHERE id = $1",
        [id, new Date().toISOString()]
      );
    } else {
      const status = result.retryAt ? "QUEUED" : "FAILED";
      const sets: string[] = ["status = $2", "last_error = $3"];
      const vals: unknown[] = [id, status, result.error];
      if (result.retryAt) {
        sets.push("scheduled_for = $4");
        vals.push(result.retryAt);
      }
      await this.pool.query(`UPDATE email_outbox SET ${sets.join(", ")} WHERE id = $1`, vals);
    }
  }

  async listEmails(filter: EmailOutboxFilter): Promise<EmailMessage[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filter.status) { conditions.push(`status = $${i}`); params.push(filter.status); i++; }
    if (filter.bookingId) { conditions.push(`booking_id = $${i}`); params.push(filter.bookingId); i++; }
    if (filter.threadRoot) { conditions.push(`thread_root = $${i}`); params.push(filter.threadRoot); i++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT * FROM email_outbox ${where} ORDER BY created_at DESC LIMIT $${i}`,
      [...params, filter.limit ?? 100]
    );
    return rows.map(hydrateEmail);
  }

  async countEmailsByStatus(): Promise<Record<MailStatus, number>> {
    const counts = Object.fromEntries(MAIL_STATUSES.map((s) => [s, 0])) as Record<MailStatus, number>;
    const { rows } = await this.pool.query(
      "SELECT status, count(*)::int AS count FROM email_outbox GROUP BY status"
    );
    for (const row of rows) {
      if (row.status in counts) counts[row.status as MailStatus] = row.count;
    }
    return counts;
  }

  async requeueEmail(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE email_outbox SET status = 'QUEUED', attempts = 0, last_error = NULL, scheduled_for = $2 WHERE id = $1",
      [id, new Date().toISOString()]
    );
  }

  // ---- mail templates ---------------------------------------------------

  async listMailTemplates(): Promise<MailTemplateOverride[]> {
    const { rows } = await this.pool.query("SELECT * FROM mail_templates");
    return rows.map((row: Record<string, unknown>) => ({
      ...defaultOverride(row.event_key as MailEventKey),
      enabled: row.enabled as boolean,
      subject: row.subject as string,
      intro: row.intro as string,
      outro: row.outro as string,
      cc: (row.cc_emails as string[]) ?? [],
      updated_at: row.updated_at as string,
    }));
  }

  async saveMailTemplate(override: MailTemplateOverride): Promise<void> {
    await this.pool.query(
      `INSERT INTO mail_templates (event_key, enabled, subject, intro, outro, cc_emails, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_key) DO UPDATE SET enabled = $2, subject = $3, intro = $4, outro = $5, cc_emails = $6, updated_at = $7`,
      [override.event_key, override.enabled, override.subject, override.intro, override.outro, override.cc, new Date().toISOString()]
    );
  }

  async resetMailTemplate(key: MailEventKey): Promise<void> {
    await this.pool.query("DELETE FROM mail_templates WHERE event_key = $1", [key]);
  }
}
