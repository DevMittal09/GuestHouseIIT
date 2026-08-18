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
        Insert: Insertable<GuestHouse, "id">;
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
        Row: Booking;
        Insert: Insertable<
          Booking,
          | "id"
          | "assigned_room_ids"
          | "rejection_reason"
          | "alumni_id_url"
          | "custom_fields"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<Booking>;
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
          "id" | "age" | "relationship" | "id_number" | "id_document_url"
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
