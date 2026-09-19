"use server";

import { revalidatePath } from "next/cache";
import {
  canAssignRooms,
  canEditMeals,
  canManageAnyBooking,
} from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { checkOutOrderError } from "@/lib/booking-schema";
import { mealPlanError, normalizeMeals } from "@/lib/meals";
import {
  allocationCapacityError,
  countBedGuests,
  roomAssignmentError,
} from "@/lib/occupancy";
import { getStore } from "@/lib/store";
import { instituteDate, instituteIso, toInstituteDateTimeValue } from "@/lib/tz";
import type { BookingStatus, MealPlan, MealPreference } from "@/lib/types";
import { includesMeals, RoomClashError } from "@/lib/types";
import { ROOM_HOLDING_STATUSES } from "@/lib/workflow";
import type { ActionResult } from "./bookings";

/**
 * What the Guest House Manager can do to a booking that already exists.
 *
 * These are the "fix it" operations, as distinct from the decisions in
 * `bookings.ts`: move the dates, change the meals, put a party in a different
 * room, cancel a stay that was called off by telephone, or put back one that
 * was cancelled by mistake. Every one writes a line to `booking_logs` naming
 * who did it, which is what keeps them auditable rather than arbitrary.
 */

/** Move a booking's dates and/or correct its purpose. */
export async function updateBookingStay(
  bookingId: string,
  input: { check_in?: string; check_out?: string; purpose_of_visit?: string; reason: string }
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can change a booking" };
    }
    if (!input.reason?.trim()) {
      return { ok: false, error: "Say why the booking is being changed — it goes in the log" };
    }
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };

    const checkIn = input.check_in ? instituteIso(input.check_in) : booking.check_in;
    const checkOut = input.check_out ? instituteIso(input.check_out) : booking.check_out;
    // Compared as the same wall-clock strings the schema uses, so the message
    // about an AM/PM slip reads identically here.
    const orderProblem = checkOutOrderError(
      input.check_in ?? toInstituteDateTimeValue(booking.check_in),
      input.check_out ?? toInstituteDateTimeValue(booking.check_out)
    );
    if (orderProblem) return { ok: false, error: orderProblem };

    // Meals already chosen have to still fall inside the new dates, or the
    // kitchen would be cooking for a day nobody is here.
    if (booking.meals.length > 0) {
      const mealProblem = mealPlanError(
        booking.meals,
        new Date(checkIn),
        new Date(checkOut)
      );
      if (mealProblem) {
        return {
          ok: false,
          error: `${mealProblem}. Change the meal plan first, then move the dates.`,
        };
      }
    }

    // The manager and the Director's Office are exempt from the 14-night cap
    // (`BOOKING_DURATION_EXEMPT_ROLES`), which is the point of doing this from
    // the admin side: a stay the institute has committed to can be extended
    // past a limit the booking form would refuse.
    await store.updateBookingDetails(
      bookingId,
      {
        ...(input.check_in !== undefined && { check_in: checkIn }),
        ...(input.check_out !== undefined && { check_out: checkOut }),
        ...(input.purpose_of_visit !== undefined && {
          purpose_of_visit: input.purpose_of_visit.trim(),
        }),
      },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: booking.status,
        remarks: `Booking updated by the Guest House Manager: ${input.reason.trim()}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof RoomClashError) return { ok: false, error: e.message };
    console.error("updateBookingStay failed", e);
    return { ok: false, error: "Something went wrong while updating the booking" };
  }
}

/** Change the meals on an existing booking. */
export async function updateBookingMeals(
  bookingId: string,
  input: { meals: MealPlan; meal_preference: MealPreference | null; reason: string }
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canEditMeals(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can change meals" };
    }
    if (!input.reason?.trim()) {
      return { ok: false, error: "Say why the meals are being changed — it goes in the log" };
    }
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (!booking.guest_house.serves_meals) {
      return { ok: false, error: `Meals are not served at ${booking.guest_house.name}` };
    }

    const meals = normalizeMeals(input.meals);
    const problem = mealPlanError(
      meals,
      new Date(booking.check_in),
      new Date(booking.check_out)
    );
    if (problem) return { ok: false, error: problem };
    if (meals.length > 0 && !input.meal_preference) {
      return { ok: false, error: "Choose a vegetarian or non-vegetarian preference" };
    }
    if (meals.length === 0 && includesMeals(booking.service_type)) {
      return {
        ok: false,
        error:
          booking.service_type === "meals_only"
            ? "A meals-only booking needs at least one meal — cancel it instead"
            : "Leave at least one meal, or there is nothing for the kitchen to do",
      };
    }

    await store.updateBookingDetails(
      bookingId,
      { meals, meal_preference: meals.length === 0 ? null : input.meal_preference },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: booking.status,
        remarks: `Meals updated by the Guest House Manager: ${input.reason.trim()}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("updateBookingMeals failed", e);
    return { ok: false, error: "Something went wrong while updating the meals" };
  }
}

/**
 * Move an already-approved booking into different rooms.
 *
 * `allocateRooms` covers the first allocation, which also approves the
 * booking. This is the later change — a guest asks to move, or a room is
 * taken out of service — and leaves the status alone.
 */
export async function reassignRooms(
  bookingId: string,
  roomIds: string[],
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canAssignRooms(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can reassign rooms" };
    }
    if (!reason?.trim()) {
      return { ok: false, error: "Say why the rooms are changing — it goes in the log" };
    }
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (!ROOM_HOLDING_STATUSES.includes(booking.status)) {
      return { ok: false, error: "This booking is not holding any rooms" };
    }
    if (roomIds.length === 0) return { ok: false, error: "Select at least one room" };
    if (roomIds.length > booking.rooms_requested) {
      return { ok: false, error: `The request is for ${booking.rooms_requested} room(s)` };
    }
    if (new Set(roomIds).size !== roomIds.length) {
      return { ok: false, error: "The same room cannot be allocated twice on one booking" };
    }

    const rooms = await store.listRooms(booking.guest_house_id);
    const roomsById = new Map(rooms.map((r) => [r.id, r]));
    if (roomIds.some((id) => !roomsById.has(id))) {
      return { ok: false, error: "Selected rooms do not belong to this guest house" };
    }
    const selected = roomIds.map((id) => roomsById.get(id)!);
    const capacityProblem = allocationCapacityError(countBedGuests(booking.guests), selected);
    if (capacityProblem) return { ok: false, error: capacityProblem };
    for (const [i, card] of booking.rooms.entries()) {
      const room = selected[i];
      if (!room) continue;
      const problem = roomAssignmentError(
        countBedGuests(card.guests),
        room,
        `Room ${card.room_index}`
      );
      if (problem) return { ok: false, error: problem };
    }

    await store.updateBookingStatus(
      bookingId,
      { status: booking.status, assigned_room_ids: roomIds },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: booking.status,
        remarks: `Rooms reassigned to ${selected
          .map((r) => r.room_number)
          .join(", ")}: ${reason.trim()}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof RoomClashError) return { ok: false, error: e.message };
    console.error("reassignRooms failed", e);
    return { ok: false, error: "Something went wrong while reassigning rooms" };
  }
}

/** Cancel any booking outright — a stay called off at the desk or by telephone. */
export async function managerCancelBooking(
  bookingId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can cancel another person's booking" };
    }
    if (!reason?.trim()) return { ok: false, error: "A cancellation reason is required" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };

    const CLOSED: BookingStatus[] = ["CANCELLED", "CANCELLATION_APPROVED", "REJECTED", "VACATED"];
    if (CLOSED.includes(booking.status)) {
      return { ok: false, error: "This booking is already closed" };
    }

    // Leaving ROOM_HOLDING_STATUSES releases the rooms on its own — see
    // `updateBookingStatus`, where the rule lives.
    await store.updateBookingStatus(
      bookingId,
      { status: "CANCELLED", rejection_reason: reason.trim() },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "CANCELLED",
        remarks: `Cancelled by the Guest House Manager: ${reason.trim()}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("managerCancelBooking failed", e);
    return { ok: false, error: "Something went wrong while cancelling" };
  }
}

/**
 * Put a cancelled or rejected booking back into the manager's queue.
 *
 * It does **not** come back approved: the rooms it held were released when it
 * was cancelled and may since have gone to someone else, so it has to be
 * allocated again like any other request.
 */
export async function reinstateBooking(
  bookingId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can reinstate a booking" };
    }
    if (!reason?.trim()) {
      return { ok: false, error: "Say why the booking is being reinstated — it goes in the log" };
    }
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };

    const REINSTATABLE: BookingStatus[] = ["CANCELLED", "CANCELLATION_APPROVED", "REJECTED"];
    if (!REINSTATABLE.includes(booking.status)) {
      return { ok: false, error: "Only a cancelled or rejected booking can be reinstated" };
    }
    if (instituteDate(toInstituteDateTimeValue(booking.check_out)) <= new Date()) {
      return { ok: false, error: "This stay has already ended — raise a new booking instead" };
    }

    await store.updateBookingStatus(
      bookingId,
      { status: "PENDING_GH_MANAGER", rejection_reason: null },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "PENDING_GH_MANAGER",
        remarks: `Reinstated by the Guest House Manager and returned to the allocation queue: ${reason.trim()}`,
      }
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("reinstateBooking failed", e);
    return { ok: false, error: "Something went wrong while reinstating the booking" };
  }
}
