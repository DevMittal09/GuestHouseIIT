"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { validateCustomValue } from "@/lib/form-config";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { OFFICIAL_EMAIL_WHITELIST } from "@/lib/routes";
import { getStore } from "@/lib/store";
import type { BookingGuest, CustomFieldValue, Gender } from "@/lib/types";
import { REQUESTER_ROLES } from "@/lib/types";
import { canReview, initialStatusForRole, nextStatusOnApprove } from "@/lib/workflow";

export type ActionResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function validFile(file: File): string | null {
  if (file.size === 0) return "Uploaded file is empty";
  if (file.size > MAX_FILE_BYTES) return `${file.name} exceeds the 5 MB limit`;
  if (!ALLOWED_FILE_TYPES.includes(file.type))
    return `${file.name}: only JPG, PNG, WEBP or PDF files are accepted`;
  return null;
}

function toIso(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

export async function createBooking(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!REQUESTER_ROLES.includes(user.role)) {
      return { ok: false, error: "Your role cannot submit booking requests" };
    }
    if (user.role === "official" && !OFFICIAL_EMAIL_WHITELIST.includes(user.email)) {
      return { ok: false, error: "This account is not whitelisted for official bookings" };
    }

    const config = await getEffectiveFormConfig(user.role);

    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") return { ok: false, error: "Malformed submission" };
    const parsed = bookingPayloadSchema(config).safeParse(JSON.parse(rawPayload));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
    }
    const payload = parsed.data;
    const store = getStore();

    const guestHouse = await store.getGuestHouse(payload.guest_house_id);
    if (!guestHouse) return { ok: false, error: "Unknown guest house" };
    if (!config.allowed_guest_house_ids.includes(guestHouse.id)) {
      return { ok: false, error: `Your role cannot book ${guestHouse.name}` };
    }

    // Admin-defined custom fields.
    const customValues: CustomFieldValue[] = [];
    for (const field of config.custom_fields) {
      const [fieldError, value] = validateCustomValue(field, payload.custom?.[field.id]);
      if (fieldError) return { ok: false, error: fieldError };
      if (value !== undefined) {
        customValues.push({ id: field.id, label: field.label, type: field.type, value });
      }
    }

    // Per-guest ID documents.
    const guests: Omit<BookingGuest, "id" | "booking_id">[] = [];
    for (let i = 0; i < payload.guests.length; i++) {
      const g = payload.guests[i];
      const file = formData.get(`guest_doc_${i}`);
      let documentUrl: string | null = null;
      if (file instanceof File && file.size > 0) {
        const fileError = validFile(file);
        if (fileError) return { ok: false, error: fileError };
        documentUrl = await store.saveDocument(file, "guest-ids");
      } else if (config.guest_fields.id_document === "required") {
        return { ok: false, error: `ID document upload is required for guest ${i + 1}` };
      }
      guests.push({
        name: g.name || "Guest",
        age: g.age ?? null,
        gender: (g.gender as Gender | undefined) ?? "other",
        relationship: g.relationship ?? null,
        id_number: g.id_number ?? null,
        id_document_url: documentUrl,
      });
    }

    // Alumni ID card (mode set by form config; "required" for alumni by default).
    let alumniIdUrl: string | null = null;
    const alumniCard = formData.get("alumni_card");
    if (alumniCard instanceof File && alumniCard.size > 0 && config.alumni_card !== "hidden") {
      const fileError = validFile(alumniCard);
      if (fileError) return { ok: false, error: fileError };
      alumniIdUrl = await store.saveDocument(alumniCard, "alumni-cards");
    } else if (config.alumni_card === "required") {
      return { ok: false, error: "Alumni ID card upload is mandatory" };
    }

    const booking = await store.createBooking({
      user_id: user.id,
      guest_house_id: payload.guest_house_id,
      user_role: user.role,
      status: initialStatusForRole(user.role),
      purpose_of_visit: payload.purpose_of_visit,
      check_in: toIso(payload.check_in),
      check_out: toIso(payload.check_out),
      rooms_requested: payload.rooms_requested,
      alumni_id_url: alumniIdUrl,
      custom_fields: customValues.length > 0 ? customValues : null,
      guests,
    });

    revalidatePath("/", "layout");
    return { ok: true, reference: booking.booking_reference_id };
  } catch (e) {
    console.error("createBooking failed", e);
    return { ok: false, error: "Something went wrong while submitting the booking" };
  }
}

/** Warden / FA / IAR approve-or-reject. GH manager rejection also lands here. */
export async function reviewBooking(
  bookingId: string,
  action: "approve" | "reject",
  reason?: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (!canReview(user, booking.status, booking.requester)) {
      return { ok: false, error: "You are not authorised to review this booking" };
    }
    if (action === "reject" && !reason?.trim()) {
      return { ok: false, error: "A rejection reason is mandatory" };
    }
    if (action === "approve" && user.role === "gh_manager") {
      return { ok: false, error: "GH Manager approval happens through room allocation" };
    }

    if (action === "reject") {
      await store.updateBookingStatus(
        bookingId,
        { status: "REJECTED", rejection_reason: reason!.trim() },
        {
          action_by: user.id,
          action_by_name: user.full_name,
          new_status: "REJECTED",
          remarks: reason!.trim(),
        }
      );
    } else {
      const next = nextStatusOnApprove(booking.status);
      await store.updateBookingStatus(
        bookingId,
        { status: next },
        {
          action_by: user.id,
          action_by_name: user.full_name,
          new_status: next,
          remarks: next === "PENDING_GH_MANAGER" ? "Approved and forwarded to Guest House Manager" : "Approved",
        }
      );
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("reviewBooking failed", e);
    return { ok: false, error: "Something went wrong while reviewing the booking" };
  }
}

/** GH Manager: confirm allocation — assigns rooms and marks APPROVED. */
export async function allocateRooms(bookingId: string, roomIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "gh_manager") return { ok: false, error: "Only the GH Manager can allocate rooms" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (booking.status !== "PENDING_GH_MANAGER") {
      return { ok: false, error: "This booking is not awaiting allocation" };
    }
    if (roomIds.length === 0) return { ok: false, error: "Select at least one room" };
    if (roomIds.length > booking.rooms_requested) {
      return { ok: false, error: `The request is for ${booking.rooms_requested} room(s)` };
    }

    const rooms = await store.listRooms(booking.guest_house_id);
    const roomsById = new Map(rooms.map((r) => [r.id, r]));
    if (roomIds.some((id) => !roomsById.has(id))) {
      return { ok: false, error: "Selected rooms do not belong to this guest house" };
    }

    // Re-check clashes at confirm time to avoid double allocation.
    const occupied = new Set(
      await store.getOccupiedRoomIds(
        booking.guest_house_id,
        booking.check_in,
        booking.check_out,
        booking.id
      )
    );
    const clash = roomIds.find((id) => occupied.has(id));
    if (clash) {
      return {
        ok: false,
        error: `Room ${roomsById.get(clash)?.room_number} was just booked for these dates — refresh the grid`,
      };
    }

    const roomNumbers = roomIds.map((id) => roomsById.get(id)!.room_number).join(", ");
    await store.updateBookingStatus(
      bookingId,
      { status: "APPROVED", assigned_room_ids: roomIds },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "APPROVED",
        remarks: `Rooms allocated: ${roomNumbers}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("allocateRooms failed", e);
    return { ok: false, error: "Something went wrong while allocating rooms" };
  }
}

/** Requester cancels their own booking while it is still in the pipeline. */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking || booking.user_id !== user.id) return { ok: false, error: "Booking not found" };
    if (booking.status === "REJECTED" || booking.status === "CANCELLED") {
      return { ok: false, error: "This booking is already closed" };
    }
    await store.updateBookingStatus(
      bookingId,
      { status: "CANCELLED" },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "CANCELLED",
        remarks: "Cancelled by requester",
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("cancelBooking failed", e);
    return { ok: false, error: "Something went wrong while cancelling" };
  }
}

/** Occupancy lookup for the manager's room grid date selector. */
export async function getOccupancy(
  guestHouseId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Promise<string[]> {
  const user = await requireUser();
  if (user.role !== "gh_manager") throw new Error("Not authorised");
  return getStore().getOccupiedRoomIds(guestHouseId, checkIn, checkOut, excludeBookingId);
}
