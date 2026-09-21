import type {
  Booking,
  BookingGuest,
  BookingLog,
  BookingRoom,
  GuestHouse,
  MealKey,
  MealPreference,
  Profile,
  Role,
  Room,
} from "@/lib/types";
import type { RoleFormConfig } from "@/lib/form-config";
import type { EmailMessage } from "@/lib/mail/types";
import type { Unit } from "@/lib/units";
import type { AuditEvent } from "@/lib/audit";

/** Any value a jsonb column can hold. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type FormConfigRow = {
  role: Role;
  config: RoleFormConfig;
  updated_at: string;
};

type Insertable<T, Generated extends keyof T> = Omit<T, Generated> &
  Partial<Pick<T, Generated>>;

/** The bookings table as it really is: no `assigned_room_ids` column. */
type BookingRow = Omit<Booking, "assigned_room_ids">;

/** `booking_rooms` (migration 11), plus the flag the backfill set. */
type BookingRoomRow = BookingRoom & { is_legacy: boolean };

/**
 * The `booking_meals` view (migration 11): one row per booking, date and meal
 * actually asked for. Read-only — `bookings.meals` is the source of truth.
 */
type BookingMealRow = {
  booking_id: string;
  guest_house_id: string;
  status: Booking["status"];
  meal_preference: MealPreference | null;
  meal_date: string;
  meal_type: MealKey;
  guest_count: number;
};

/** `during` is a tstzrange, written and read as a `[lower,upper)` literal. */
type RoomHoldRow = {
  booking_id: string;
  room_id: string;
  during: string;
  /** Migration 14: the manager who accepted a turnover overlap, if any. */
  override_by: string | null;
  /** Maintained by a trigger; never written from the app. */
  guard: string;
};

/**
 * `value` is jsonb. The console password hash is stored as a plain string;
 * the Settings groups (`rules.<group>`, migration 16) as objects.
 */
type AppSettingRow = {
  key: string;
  value: Json;
  updated_at: string;
};

/** `hostels` (migration 16). `profiles.hostel_name` references `name`. */
type HostelRow = { name: string; created_at: string };

/** `official_email_whitelist` (migration 16). Stored lowercased. */
type OfficialEmailRow = { email: string; created_at: string };

/** `security_audit` (migration 16). `id` is a bigint identity, read as a string. */
type SecurityAuditRow = Omit<AuditEvent, "event" | "details"> & {
  event: string;
  details: Json;
};

/**
 * `email_outbox` (migration 10). `event_key` is a plain text column rather
 * than an enum, so a new notification kind needs no migration — the union in
 * `lib/mail/types.ts` is where it is constrained.
 */
type EmailOutboxRow = Omit<EmailMessage, "event_key"> & { event_key: string };

/**
 * `mail_templates` (migration 13). Only edited events have a row; `cc_emails`
 * is a text[] column, which is why this is not `MailTemplateOverride` itself.
 */
type MailTemplateRow = {
  event_key: string;
  enabled: boolean;
  subject: string | null;
  intro: string | null;
  outro: string | null;
  cc_emails: string[];
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Insertable<Profile, "hostel_name" | "department_or_club" | "roll_number" | "ldap_uid">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      guest_houses: {
        Row: GuestHouse;
        Insert: Insertable<GuestHouse, "id" | "serves_meals">;
        Update: Partial<GuestHouse>;
        Relationships: [];
      };
      rooms: {
        Row: Room;
        Insert: Insertable<Room, "id" | "is_active">;
        Update: Partial<Room>;
        Relationships: [];
      };
      bookings: {
        // `assigned_room_ids` is NOT a column — it is derived from room_holds
        // on read (migration 3). Omitted here so a stray write cannot compile.
        Row: BookingRow;
        Insert: Insertable<
          BookingRow,
          | "id"
          | "rejection_reason"
          | "booking_type"
          | "alumni_name"
          | "alumni_roll_number"
          | "alumni_id_url"
          | "custom_fields"
          | "meals"
          | "has_infant"
          | "service_type"
          | "meal_preference"
          | "meal_guest_count"
          | "pets_policy_acknowledged"
          | "pets_policy_acknowledged_at"
          | "has_foreign_national"
          | "created_by"
          | "on_behalf_of_name"
          | "on_behalf_of_email"
          | "on_behalf_of_phone"
          | "debit_head"
          | "debit_details"
          | "debit_document_url"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<BookingRow>;
        Relationships: [];
      };
      booking_rooms: {
        Row: BookingRoomRow;
        Insert: Insertable<BookingRoomRow, "id" | "room_type" | "assigned_room_id" | "is_legacy">;
        Update: Partial<BookingRoomRow>;
        Relationships: [];
      };
      room_holds: {
        Row: RoomHoldRow;
        Insert: Insertable<RoomHoldRow, "override_by" | "guard">;
        Update: Partial<RoomHoldRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
        Insert: Insertable<AppSettingRow, "updated_at">;
        Update: Partial<AppSettingRow>;
        Relationships: [];
      };
      email_outbox: {
        Row: EmailOutboxRow;
        Insert: Insertable<
          EmailOutboxRow,
          | "id"
          | "cc_emails"
          | "thread_root"
          | "is_thread_root"
          | "status"
          | "attempts"
          | "last_error"
          | "scheduled_for"
          | "sent_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<EmailOutboxRow>;
        Relationships: [];
      };
      mail_templates: {
        Row: MailTemplateRow;
        Insert: Insertable<MailTemplateRow, "enabled" | "cc_emails" | "updated_at">;
        Update: Partial<MailTemplateRow>;
        Relationships: [];
      };
      units: {
        Row: Unit;
        Insert: Insertable<Unit, "id" | "parent_id" | "head_id" | "acting_head_id" | "office_class">;
        Update: Partial<Unit>;
        Relationships: [];
      };
      hostels: {
        Row: HostelRow;
        Insert: Insertable<HostelRow, "created_at">;
        Update: Partial<HostelRow>;
        Relationships: [];
      };
      official_email_whitelist: {
        Row: OfficialEmailRow;
        Insert: Insertable<OfficialEmailRow, "created_at">;
        Update: Partial<OfficialEmailRow>;
        Relationships: [];
      };
      security_audit: {
        Row: SecurityAuditRow;
        Insert: Insertable<
          SecurityAuditRow,
          "id" | "at" | "actor_id" | "actor_role" | "target" | "details" | "ip" | "user_agent"
        >;
        Update: Partial<SecurityAuditRow>;
        Relationships: [];
      };
      form_configs: {
        Row: FormConfigRow;
        Insert: Insertable<FormConfigRow, "updated_at">;
        Update: Partial<FormConfigRow>;
        Relationships: [];
      };
      booking_guests: {
        Row: BookingGuest;
        Insert: Insertable<
          BookingGuest,
          | "id"
          | "age"
          | "relationship"
          | "id_number"
          | "id_document_url"
          | "is_infant"
          | "booking_room_id"
          | "citizenship"
          | "nationality"
          | "passport_number"
        >;
        Update: Partial<BookingGuest>;
        Relationships: [];
      };
      booking_logs: {
        Row: BookingLog;
        Insert: Insertable<BookingLog, "id" | "previous_status" | "remarks" | "timestamp">;
        Update: Partial<BookingLog>;
        Relationships: [];
      };
    };
    Views: {
      booking_meals: {
        Row: BookingMealRow;
        Relationships: [];
      };
    };
    Functions: {
      /** Replaces a booking's room holds transactionally (migration 3). */
      set_room_holds: {
        Args: {
          p_booking_id: string;
          p_room_ids: string[];
          p_check_in: string;
          p_check_out: string;
          p_override_room_ids?: string[];
          p_override_by?: string | null;
        };
        Returns: undefined;
      };
      /**
       * Changes the turnaround buffer and rebuilds every hold (migration 17).
       * Raises `BUFFER_CLASH|count|listing` when stays would clash.
       */
      set_booking_buffer: {
        Args: { p_minutes: number };
        Returns: number;
      };
      /**
       * Claims due outbox rows with `for update skip locked` (migration 10),
       * so two dispatchers cannot send the same message.
       */
      claim_queued_emails: {
        Args: {
          p_limit: number;
          /** A Postgres interval literal, e.g. `"300 seconds"`. */
          p_stale_after: string;
        };
        Returns: EmailOutboxRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
