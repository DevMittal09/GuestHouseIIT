"use server";

import { revalidateBookings } from "@/lib/revalidate";
import {
  canAssignRooms,
  canEditMeals,
  canManageAnyBooking,
} from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit-server";
import { checkOutOrderError } from "@/lib/booking-schema";
import { dietCountsError, dinersFor, mealPlanError, normalizeMeals } from "@/lib/meals";
import {
  allocationCapacityError,
  countBedGuests,
  roomAssignmentError,
} from "@/lib/occupancy";
import { notifyCancelled, notifyStayShortened } from "@/lib/mail/notify";
import { originalDatesPatch } from "@/lib/operations";
import { roomAccessError } from "@/lib/rooms-access";
import {
  describeTariffCategory,
  tariffCategoryError,
  tariffCategoryOf,
} from "@/lib/tariff-category";
import { getStore } from "@/lib/store";
import { getRules } from "@/lib/settings-server";
import { instituteDate, instituteIso, toInstituteDateTimeValue } from "@/lib/tz";
import type { BookingStatus, MealDietCounts, MealPlan } from "@/lib/types";
import { includesMeals, RoomClashError, STATUS_LABELS } from "@/lib/types";
import { reinstateMissedError, ROOM_HOLDING_STATUSES, statusBeforeMissed } from "@/lib/workflow";
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
  input: {
    check_in?: string;
    check_out?: string;
    purpose_of_visit?: string;
    /**
     * The office's tariff category (9 Nov 2026). The manager normally sets it
     * when they allot rooms; this is the way back to it afterwards - a guest
     * who turns out to be an academic visitor rather than a parent. The
     * **manager's** only, like everything else in this action, and audited in
     * the booking's log. `null` clears it, which prices the stay from the
     * uncategorised sheet again.
     */
    tariff_category?: string | null;
    reason: string;
  }
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can change a booking" };
    }
    if (!input.reason?.trim()) {
      return { ok: false, error: "Say why the booking is being changed - it goes in the log" };
    }
    if ("booking_type" in input) {
      return { ok: false, error: "Booking type cannot be changed. Reject the request and ask for a fresh booking." };
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
        new Date(checkOut),
        (await getRules()).meals.windows
      );
      if (mealProblem) {
        return {
          ok: false,
          error: `${mealProblem}. Change the meal plan first, then move the dates.`,
        };
      }
    }

    // **This action has never consulted the 14-night cap, and that is now the
    // whole escape from it** (10 Nov 2026). Only the Director's Office is
    // exempt on the form; everybody else's longer stay is the Guest House
    // Manager increasing it here, on a booking they can see, rather than a
    // length nobody reviewed. `BOOKING_DURATION_EXEMPT_ROLES` is deleted.
    // Refused rather than ignored, so a category the manager chose cannot be
    // silently dropped on its way to the price.
    if (input.tariff_category === null || input.tariff_category === "") {
      return { ok: false, error: "Choose a tariff category" };
    }
    const categoryProblem =
      input.tariff_category === undefined
        ? null
        : tariffCategoryError(input.tariff_category, booking);
    if (categoryProblem) return { ok: false, error: categoryProblem };
    const category =
      input.tariff_category === undefined ? undefined : tariffCategoryOf(input.tariff_category);

    const movingDates =
      (input.check_in !== undefined && checkIn !== booking.check_in) ||
      (input.check_out !== undefined && checkOut !== booking.check_out);

    await store.updateBookingDetails(
      bookingId,
      {
        ...(input.check_in !== undefined && { check_in: checkIn }),
        ...(input.check_out !== undefined && { check_out: checkOut }),
        ...(input.purpose_of_visit !== undefined && {
          purpose_of_visit: input.purpose_of_visit.trim(),
        }),
        ...(category !== undefined && { tariff_category: category }),
        // What the requester asked for, kept once (9 Nov 2026). Any change of
        // dates records it, not only a shortening, so the original duration is
        // on the booking however the desk got to the dates it has.
        ...(movingDates ? originalDatesPatch(booking) : {}),
      },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: booking.status,
        remarks: [
          `Booking updated by the Guest House Manager: ${input.reason.trim()}`,
          category !== undefined
            ? category === null
              ? "Tariff category cleared."
              : `Tariff category set to ${describeTariffCategory(category)}.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      }
    );
    if (movingDates) await notifyStayShortened(bookingId, booking, input.reason.trim());
    revalidateBookings();
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
  input: { meals: MealPlan; meal_diet_counts: MealDietCounts | null; reason: string }
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canEditMeals(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can change meals" };
    }
    if (!input.reason?.trim()) {
      return { ok: false, error: "Say why the meals are being changed - it goes in the log" };
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
      new Date(booking.check_out),
      (await getRules()).meals.windows
    );
    if (problem) return { ok: false, error: problem };
    if (meals.length > 0) {
      // Each person's own preference (1 Oct 2026): the split has to add up to
      // whoever is eating - a dining booking's head count, else the guests
      // needing a bed.
      const diners = dinersFor(booking);
      const split = input.meal_diet_counts;
      const mismatch = split
        ? dietCountsError(split, diners)
        : "Say how many of the party are vegetarian and how many are not";
      if (mismatch) return { ok: false, error: mismatch };
    }
    if (meals.length === 0 && includesMeals(booking.service_type)) {
      return {
        ok: false,
        error:
          booking.service_type === "meals_only"
            ? "A meals-only booking needs at least one meal - cancel it instead"
            : "Leave at least one meal, or there is nothing for the kitchen to do",
      };
    }

    await store.updateBookingDetails(
      bookingId,
      {
        meals,
        meal_diet_counts: meals.length === 0 ? null : input.meal_diet_counts,
        // The legacy whole-party answer is cleared with it, so the two can
        // never disagree about what the kitchen is cooking.
        meal_preference: null,
      },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: booking.status,
        remarks: `Meals updated by the Guest House Manager: ${input.reason.trim()}`,
      }
    );
    revalidateBookings();
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
 * booking. This is the later change - a guest asks to move, or a room is
 * taken out of service - and leaves the status alone.
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
      return { ok: false, error: "Say why the rooms are changing - it goes in the log" };
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
    // A reserved room is nobody's to allot and a VIP room is only the
    // authorised's, on a move mid-stay exactly as on the first allocation
    // (9 Nov 2026) - otherwise the rule could be walked around by allocating
    // an ordinary room and then moving the party into C1.
    const portal = (await getRules()).portal;
    for (const room of selected) {
      const accessProblem = roomAccessError(room, booking.requester, portal);
      if (accessProblem) return { ok: false, error: accessProblem };
    }
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
    // A move mid-stay is audited (Phase 7): who moved whom, from where to where, and why.
    await recordAudit(user, "booking.room_moved", booking.booking_reference_id, {
      from: booking.assigned_rooms.map((r) => r.room_number),
      to: selected.map((r) => r.room_number),
      reason: reason.trim(),
    });
    revalidateBookings();
    return { ok: true };
  } catch (e) {
    if (e instanceof RoomClashError) return { ok: false, error: e.message };
    console.error("reassignRooms failed", e);
    return { ok: false, error: "Something went wrong while reassigning rooms" };
  }
}

/** Cancel any booking outright - a stay called off at the desk or by telephone. */
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

    // Whether the booking was holding rooms decides who needs telling, so it
    // is read before the status change releases them.
    const heldRooms = ROOM_HOLDING_STATUSES.includes(booking.status);

    // Leaving ROOM_HOLDING_STATUSES releases the rooms on its own - see
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
    // The requester did not ask for this one, so they certainly need to hear
    // about it - and the desk needs to know if a room just came back.
    await notifyCancelled(bookingId, user, reason.trim(), { heldRooms });
    revalidateBookings();
    return { ok: true };
  } catch (e) {
    console.error("managerCancelBooking failed", e);
    return { ok: false, error: "Something went wrong while cancelling" };
  }
}

/**
 * Put a **Missed** request back in the queue it was waiting in (migration 29,
 * 7 Oct 2026).
 *
 * Separate from `reinstateBooking` below, because the two are not the same
 * thing. A cancelled or rejected booking was *decided*: its rooms were
 * released and may have gone to somebody else, so it comes back to the
 * manager to be allocated afresh. A missed request was never decided at all -
 * so it goes back to whoever owed the decision (`statusBeforeMissed`), which
 * is usually the manager but may be a warden or an HOD.
 *
 * And there is no "this stay has already ended" guard here, deliberately: a
 * missed request's check-in is in the past by definition, so that guard would
 * refuse nearly every one of them. What the manager does next is move the
 * dates (`updateBookingStay`) and allocate - which is exactly what they did
 * with a lapsed request before this status existed. The nightly sweep will
 * not mark it again (`missedSweepable` reads the reinstatement off the log).
 */
export async function reinstateMissedBooking(
  bookingId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) {
      return { ok: false, error: "Only the Guest House Manager can reinstate a request" };
    }
    if (!reason?.trim()) {
      return { ok: false, error: "Say why the request is being reinstated - it goes in the log" };
    }
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const problem = reinstateMissedError(booking);
    if (problem) return { ok: false, error: problem };

    const back = statusBeforeMissed(booking.logs);
    await store.updateBookingStatus(
      bookingId,
      { status: back },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: back,
        remarks: `Reinstated by the Guest House Manager after being marked Missed, and returned to ${STATUS_LABELS[back]}: ${reason.trim()}`,
      }
    );
    await recordAudit(user, "booking.reinstated", bookingId, {
      from: "MISSED",
      to: back,
      reason: reason.trim(),
    });
    revalidateBookings();
    return { ok: true };
  } catch (e) {
    console.error("reinstateMissedBooking failed", e);
    return { ok: false, error: "Something went wrong while reinstating the request" };
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
      return { ok: false, error: "Say why the booking is being reinstated - it goes in the log" };
    }
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };

    const REINSTATABLE: BookingStatus[] = ["CANCELLED", "CANCELLATION_APPROVED", "REJECTED"];
    if (!REINSTATABLE.includes(booking.status)) {
      return { ok: false, error: "Only a cancelled or rejected booking can be reinstated" };
    }
    if (instituteDate(toInstituteDateTimeValue(booking.check_out)) <= new Date()) {
      return { ok: false, error: "This stay has already ended - raise a new booking instead" };
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
    revalidateBookings();
    return { ok: true };
  } catch (e) {
    console.error("reinstateBooking failed", e);
    return { ok: false, error: "Something went wrong while reinstating the booking" };
  }
}
