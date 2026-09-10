"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { validateCustomValue } from "@/lib/form-config";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { OFFICIAL_EMAIL_WHITELIST } from "@/lib/routes";
import { getStore } from "@/lib/store";
import { instituteIso } from "@/lib/tz";
import type { BookingGuest, BookingStatus, CustomFieldValue, Gender } from "@/lib/types";
import { REQUESTER_ROLES, RoomClashError } from "@/lib/types";
import { allocationCapacityError, countBedGuests } from "@/lib/occupancy";
import {
  canReview,
  initialStatusForRole,
  nextStatusOnApprove,
  occupancyNotStartedError,
} from "@/lib/workflow";

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

/**
 * The form sends a wall-clock string ("2026-09-15T12:00"). Resolve it in the
 * institute's timezone rather than the server's — `new Date()` on a naked
 * datetime string uses the *process* zone, so a booking for 12:00 was stored
 * as 12:00 UTC on a UTC host and read back as 5:30 PM.
 */
function toIso(datetimeLocal: string): string {
  return instituteIso(datetimeLocal);
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

    // Room limit enforcement: check against total active rooms and date-range availability.
    const activeRooms = await store.listRooms(payload.guest_house_id);
    if (payload.rooms_requested > activeRooms.length) {
      return {
        ok: false,
        error: `${guestHouse.name} only has ${activeRooms.length} room(s) available. You requested ${payload.rooms_requested}.`,
      };
    }

    const checkInIso = toIso(payload.check_in);
    const checkOutIso = toIso(payload.check_out);
    const occupiedIds = await store.getOccupiedRoomIds(
      payload.guest_house_id,
      checkInIso,
      checkOutIso
    );
    const freeRoomCount = activeRooms.length - occupiedIds.length;
    if (payload.rooms_requested > freeRoomCount) {
      return {
        ok: false,
        error: `Only ${freeRoomCount} room(s) are available at ${guestHouse.name} for the requested dates. You requested ${payload.rooms_requested}.`,
      };
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

    // Per-guest ID documents. Infants are exempt: they are on the register by
    // name and age, but an under-10 has no ID to upload.
    const guests: Omit<BookingGuest, "id" | "booking_id">[] = [];
    for (let i = 0; i < payload.guests.length; i++) {
      const g = payload.guests[i];
      const file = formData.get(`guest_doc_${i}`);
      let documentUrl: string | null = null;
      if (file instanceof File && file.size > 0) {
        const fileError = validFile(file);
        if (fileError) return { ok: false, error: fileError };
        documentUrl = await store.saveDocument(file, "guest-ids");
      } else if (config.guest_fields.id_document === "required" && !g.is_infant) {
        return { ok: false, error: `ID document upload is required for guest ${i + 1}` };
      }
      guests.push({
        name: g.name || "Guest",
        age: g.age ?? null,
        gender: (g.gender as Gender | undefined) ?? "other",
        relationship: g.relationship ?? null,
        id_number: g.is_infant ? null : (g.id_number ?? null),
        id_document_url: documentUrl,
        is_infant: g.is_infant,
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
      check_in: checkInIso,
      check_out: checkOutIso,
      rooms_requested: payload.rooms_requested,
      alumni_id_url: alumniIdUrl,
      custom_fields: customValues.length > 0 ? customValues : null,
      meals: payload.meals,
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

    // Do the picked rooms actually sleep the party? Infants share with their
    // guardians, so they need no bed and are excluded from the head count.
    const selectedRooms = roomIds.map((id) => roomsById.get(id)!);
    const capacityProblem = allocationCapacityError(
      countBedGuests(booking.guests),
      selectedRooms
    );
    if (capacityProblem) return { ok: false, error: capacityProblem };

    // No pre-flight occupancy check: the room_holds exclusion constraint is
    // the authority, and checking first would only reintroduce the
    // check-then-act race this replaced. A loser gets RoomClashError below.
    const roomNumbers = selectedRooms.map((r) => r.room_number).join(", ");
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
    if (e instanceof RoomClashError) return { ok: false, error: e.message };
    console.error("allocateRooms failed", e);
    return { ok: false, error: "Something went wrong while allocating rooms" };
  }
}

/**
 * Requester cancels their own booking.
 * - Pending bookings are cancelled directly.
 * - Approved or Occupied bookings become CANCELLATION_REQUESTED (needs manager approval).
 * A reason is always required.
 */
export async function cancelBooking(bookingId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking || booking.user_id !== user.id) return { ok: false, error: "Booking not found" };
    if (!reason?.trim()) return { ok: false, error: "A cancellation reason is required" };

    const TERMINAL_STATUSES: BookingStatus[] = [
      "REJECTED", "CANCELLED", "VACATED", "CANCELLATION_REQUESTED", "CANCELLATION_APPROVED",
    ];
    if (TERMINAL_STATUSES.includes(booking.status)) {
      return { ok: false, error: "This booking is already closed or has a pending cancellation" };
    }

    // Approved or Occupied bookings need manager approval for cancellation.
    const NEEDS_APPROVAL: BookingStatus[] = ["APPROVED", "OCCUPIED"];
    if (NEEDS_APPROVAL.includes(booking.status)) {
      await store.updateBookingStatus(
        bookingId,
        { status: "CANCELLATION_REQUESTED", rejection_reason: reason.trim() },
        {
          action_by: user.id,
          action_by_name: user.full_name,
          new_status: "CANCELLATION_REQUESTED",
          remarks: `Cancellation requested: ${reason.trim()}`,
        }
      );
    } else {
      // Pending bookings can be cancelled directly.
      await store.updateBookingStatus(
        bookingId,
        { status: "CANCELLED", rejection_reason: reason.trim() },
        {
          action_by: user.id,
          action_by_name: user.full_name,
          new_status: "CANCELLED",
          remarks: `Cancelled by requester: ${reason.trim()}`,
        }
      );
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("cancelBooking failed", e);
    return { ok: false, error: "Something went wrong while cancelling" };
  }
}

/** Valid lifecycle transitions for the GH Manager. */
const LIFECYCLE_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus>> = {
  APPROVED: "OCCUPIED",
  OCCUPIED: "VACATED",
};

/** GH Manager: advance a booking through its lifecycle (Approved → Occupied → Vacated). */
export async function updateBookingLifecycle(bookingId: string, targetStatus: BookingStatus): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "gh_manager") return { ok: false, error: "Only the GH Manager can update booking status" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };

    const expected = LIFECYCLE_TRANSITIONS[booking.status];
    if (!expected || expected !== targetStatus) {
      return { ok: false, error: `Cannot change status from ${booking.status} to ${targetStatus}` };
    }

    // "Occupied" means the guest is physically in the room. A stay that has
    // not started cannot be one, and marking it early makes the manager's
    // "current occupants" list and the availability grid lie about who is in
    // the building right now.
    if (targetStatus === "OCCUPIED") {
      const tooEarly = occupancyNotStartedError(booking);
      if (tooEarly) return { ok: false, error: tooEarly };
    }

    const remarkMap: Record<string, string> = {
      OCCUPIED: "Guest checked in — marked as Occupied",
      VACATED: "Guest checked out — marked as Vacated",
    };

    await store.updateBookingStatus(
      bookingId,
      { status: targetStatus },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: targetStatus,
        remarks: remarkMap[targetStatus] ?? `Status updated to ${targetStatus}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("updateBookingLifecycle failed", e);
    return { ok: false, error: "Something went wrong while updating the booking" };
  }
}

/** GH Manager: approve a cancellation request — releases rooms and finalises cancellation. */
export async function approveCancellation(bookingId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "gh_manager") return { ok: false, error: "Only the GH Manager can approve cancellations" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (booking.status !== "CANCELLATION_REQUESTED") {
      return { ok: false, error: "This booking does not have a pending cancellation request" };
    }

    await store.updateBookingStatus(
      bookingId,
      { status: "CANCELLATION_APPROVED", assigned_room_ids: [] },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "CANCELLATION_APPROVED",
        remarks: "Cancellation approved — rooms released",
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("approveCancellation failed", e);
    return { ok: false, error: "Something went wrong while approving cancellation" };
  }
}

/** GH Manager: reject a cancellation request — booking returns to its previous state. */
export async function rejectCancellation(bookingId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "gh_manager") return { ok: false, error: "Only the GH Manager can reject cancellations" };
    if (!reason?.trim()) return { ok: false, error: "A reason for rejecting the cancellation is required" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (booking.status !== "CANCELLATION_REQUESTED") {
      return { ok: false, error: "This booking does not have a pending cancellation request" };
    }

    // Find the status before the cancellation request to restore it.
    const previousLog = [...booking.logs]
      .reverse()
      .find((l) => l.new_status === "CANCELLATION_REQUESTED");
    const restoreStatus: BookingStatus = previousLog?.previous_status ?? "APPROVED";

    await store.updateBookingStatus(
      bookingId,
      { status: restoreStatus },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: restoreStatus,
        remarks: `Cancellation rejected: ${reason.trim()}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("rejectCancellation failed", e);
    return { ok: false, error: "Something went wrong while rejecting cancellation" };
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
