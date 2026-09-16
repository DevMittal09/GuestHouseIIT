import type {
  Booking,
  BookingGuest,
  BookingLog,
  GuestHouse,
  Profile,
  Role,
  Room,
} from "@/lib/types";
import type { RoleFormConfig } from "@/lib/form-config";

type FormConfigRow = {
  role: Role;
  config: RoleFormConfig;
  updated_at: string;
};

type Insertable<T, Generated extends keyof T> = Omit<T, Generated> &
  Partial<Pick<T, Generated>>;

/** The bookings table as it really is: no `assigned_room_ids` column. */
type BookingRow = Omit<Booking, "assigned_room_ids">;

/** `during` is a tstzrange, written and read as a `[lower,upper)` literal. */
type RoomHoldRow = {
  booking_id: string;
  room_id: string;
  during: string;
};

/** `value` is jsonb; the app stores plain strings in it. */
type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Insertable<Profile, "hostel_name" | "department_or_club" | "roll_number">;
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
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<BookingRow>;
        Relationships: [];
      };
      room_holds: {
        Row: RoomHoldRow;
        Insert: RoomHoldRow;
        Update: Partial<RoomHoldRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
        Insert: Insertable<AppSettingRow, "updated_at">;
        Update: Partial<AppSettingRow>;
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
          "id" | "age" | "relationship" | "id_number" | "id_document_url" | "is_infant"
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
    Views: Record<string, never>;
    Functions: {
      /** Replaces a booking's room holds transactionally (migration 3). */
      set_room_holds: {
        Args: {
          p_booking_id: string;
          p_room_ids: string[];
          p_check_in: string;
          p_check_out: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
