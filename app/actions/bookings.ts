"use server";

import { revalidatePath } from "next/cache";
import { canAssignRooms, canBookOnBehalf, canOverrideGuestHousePolicy } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { aadhaarDigits, bookingPayloadSchema } from "@/lib/booking-schema";
import { needsAlumniDetails } from "@/lib/booking-types";
import { needsDebitDocument } from "@/lib/debit-heads";
import { approversOf } from "@/lib/units";
import { validateCustomValue } from "@/lib/form-config";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import {
  notifyBookingSubmitted,
  notifyCancellationDecided,
  notifyCancellationRequested,
  notifyRejected,
  notifyRoomsAllocated,
  notifyTierApproved,
} from "@/lib/mail/notify";
import { guestHousePolicyError } from "@/lib/policy";
import { isWhitelistedOfficial } from "@/lib/settings";
import { getOfficialEmails, getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { instituteIso } from "@/lib/tz";
import type {
  BookingStatus,
  CustomFieldValue,
  Gender,
  NewBookingGuestInput,
  NewBookingRoomInput,
} from "@/lib/types";
import { needsRooms, REQUESTER_ROLES, RoomClashError } from "@/lib/types";
import {
  allocationCapacityError,
  countBedGuests,
  isInfantAge,
  roomAssignmentError,
} from "@/lib/occupancy";
import {
  bufferMs,
  conflictsByRoom,
  TURNOVER_GRACE_HOURS,
  type ConflictKind,
} from "@/lib/turnover";
import {
  ACTIVE_STATUSES,
  canReview,
  lapsedError,
  canUpdateLifecycle,
  initialStatusFor,
  nextStatusOnApprove,
  occupancyNotStartedError,
} from "@/lib/workflow";

export type ActionResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** A trimmed text field from the form, or null when it is blank or absent. */
function readText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

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
    // The Guest House Manager is not a requester, but they take bookings at
    // the desk for people who never open the portal. Those are recorded as
    // theirs with the actual guest named on the booking — see `onBehalfOf`.
    const onBehalf = canBookOnBehalf(user.role);
    if (!REQUESTER_ROLES.includes(user.role) && !onBehalf) {
      return { ok: false, error: "Your role cannot submit booking requests" };
    }
    if (user.role === "official" && !isWhitelistedOfficial(user.email, await getOfficialEmails())) {
      return { ok: false, error: "This account is not whitelisted for official bookings" };
    }

    // Who the stay is actually for. Required when the manager is booking for
    // someone else, because otherwise the booking says only that the manager
    // is staying — and the desk has no way to find out who is arriving.
    const onBehalfOf = onBehalf
      ? {
          name: readText(formData, "on_behalf_of_name"),
          email: readText(formData, "on_behalf_of_email"),
          phone: readText(formData, "on_behalf_of_phone"),
        }
      : null;
    if (onBehalfOf && !onBehalfOf.name) {
      return { ok: false, error: "Enter the name of the guest this booking is for" };
    }

    const config = await getEffectiveFormConfig(user.role);
    const store = getStore();

    // Whether meals can be booked at all on this account, which decides
    // whether "Room + Meals" and "Meals only" are options. Computed from the
    // guest houses the role may book, exactly as the form does.
    const allGuestHouses = await store.listGuestHouses();
    const mealsAvailable = allGuestHouses.some(
      (g) => g.serves_meals && config.allowed_guest_house_ids.includes(g.id)
    );

    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") return { ok: false, error: "Malformed submission" };
    // The same Settings the page handed the form, so the two validate alike.
    const rules = await getRules();
    const parsed = bookingPayloadSchema(config, {
      mealsAvailable,
      requesterEmail: user.email,
      rules,
    }).safeParse(JSON.parse(rawPayload));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data" };
    }
    const payload = parsed.data;
    const wantsRooms = needsRooms(payload.service_type);

    const guestHouse = await store.getGuestHouse(payload.guest_house_id);
    if (!guestHouse) return { ok: false, error: "Unknown guest house" };
    if (!config.allowed_guest_house_ids.includes(guestHouse.id)) {
      return { ok: false, error: `Your role cannot book ${guestHouse.name}` };
    }
    // Alumni are put up at Bageshri. The form locks the selector; this is the
    // check a crafted request meets.
    //
    // The Guest House Manager can set it aside — Bageshri does fill up, and a
    // rule the manager cannot lift just moves the booking off the portal. The
    // override goes into the booking's first log entry, so the exception is
    // visible for as long as the booking is.
    const policyProblem = guestHousePolicyError(
      payload.booking_type,
      guestHouse,
      allGuestHouses
    );
    let overrideNote: string | null = null;
    if (policyProblem) {
      if (!canOverrideGuestHousePolicy(user.role)) {
        return { ok: false, error: policyProblem };
      }
      overrideNote = `Booking submitted. Guest house policy overridden by ${user.full_name}: ${policyProblem}`;
    }
    // Meals only where the guest house serves them (Hamsanandi by default,
    // set in the developer console). The form hides the grid elsewhere; this
    // is the check a crafted request meets.
    if (payload.meals.length > 0 && !guestHouse.serves_meals) {
      return { ok: false, error: `Meals are not served at ${guestHouse.name}` };
    }

    const checkInIso = toIso(payload.check_in);
    const checkOutIso = toIso(payload.check_out);

    // Room limit enforcement: check against total active rooms and date-range
    // availability. A meals-only booking holds no rooms, so none of it applies.
    if (wantsRooms) {
      const activeRooms = await store.listRooms(payload.guest_house_id);
      if (payload.rooms.length > activeRooms.length) {
        return {
          ok: false,
          error: `${guestHouse.name} only has ${activeRooms.length} room(s) available. You requested ${payload.rooms.length}.`,
        };
      }
      const occupiedIds = await store.getOccupiedRoomIds(
        payload.guest_house_id,
        checkInIso,
        checkOutIso
      );
      const freeRoomCount = activeRooms.length - occupiedIds.length;
      if (payload.rooms.length > freeRoomCount) {
        return {
          ok: false,
          error: `Only ${freeRoomCount} room(s) are available at ${guestHouse.name} for the requested dates. You requested ${payload.rooms.length}.`,
        };
      }
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

    // Per-guest ID documents, uploaded per room card. An infant shares a
    // guardian's bed and is not asked for an ID, so no document is demanded
    // for one — `isInfantAge` decides that from the age, the same rule the
    // schema and the database apply.
    const rooms: NewBookingRoomInput[] = [];
    for (const [roomIndex, room] of payload.rooms.entries()) {
      const guests: NewBookingGuestInput[] = [];
      for (const [guestIndex, g] of room.guests.entries()) {
        const infant = isInfantAge(g.age);
        const file = formData.get(`guest_doc_${roomIndex}_${guestIndex}`);
        let documentUrl: string | null = null;
        if (file instanceof File && file.size > 0) {
          const fileError = validFile(file);
          if (fileError) return { ok: false, error: fileError };
          documentUrl = await store.saveDocument(file, "guest-ids");
        } else if (config.guest_fields.id_document === "required" && !infant) {
          return {
            ok: false,
            error: `ID document upload is required for guest ${guestIndex + 1} in Room ${roomIndex + 1}`,
          };
        }
        guests.push({
          name: g.name || "Guest",
          age: g.age,
          gender: (g.gender as Gender | undefined) ?? "other",
          relationship: g.relationship ?? null,
          id_number: infant || !g.id_number ? null : aadhaarDigits(g.id_number),
          id_document_url: documentUrl,
          is_infant: infant,
          citizenship: g.citizenship,
          nationality: g.nationality,
          passport_number: g.passport_number,
        });
      }
      rooms.push({ room_type: room.room_type ?? null, guests });
    }

    // Alumni ID card. Two things can ask for it: the role's form config, and
    // the booking itself being raised on behalf of an alumnus — the IAR
    // accounts book both ways from one form, so the requirement follows the
    // request rather than the account.
    const forAlumnus = needsAlumniDetails(payload.booking_type);
    const cardRequired = config.alumni_card === "required" || forAlumnus;
    let alumniIdUrl: string | null = null;
    const alumniCard = formData.get("alumni_card");
    if (alumniCard instanceof File && alumniCard.size > 0 && (config.alumni_card !== "hidden" || forAlumnus)) {
      const fileError = validFile(alumniCard);
      if (fileError) return { ok: false, error: fileError };
      alumniIdUrl = await store.saveDocument(alumniCard, "alumni-cards");
    } else if (cardRequired) {
      return { ok: false, error: "Alumni ID card upload is mandatory" };
    }

    // The sanction behind a Special Budget. Checked here rather than in the
    // schema because this is where the upload is.
    let debitDocumentUrl: string | null = null;
    if (needsDebitDocument(payload.debit_head)) {
      const document = formData.get("debit_document");
      if (!(document instanceof File) || document.size === 0) {
        return { ok: false, error: "Upload the sanction document for the Special Budget" };
      }
      const fileError = validFile(document);
      if (fileError) return { ok: false, error: fileError };
      debitDocumentUrl = await store.saveDocument(document, "debit-documents");
    }

    // Who approves, if anyone: whoever heads the requester's department, club
    // or council right now — read from the console, not matched by name.
    const units = await store.listUnits();
    const unitApprovers = approversOf(user.unit_id, units);
    const status = initialStatusFor(user.role, payload.service_type, {
      bookingType: payload.booking_type,
      staffCategory: user.staff_category ?? null,
      hasUnitApprover: unitApprovers.length > 0,
    });
    // A faculty member's official booking that should have waited for an HOD,
    // but could not because nobody is set for the department, says so in its
    // log - otherwise it looks as if the approval was skipped on purpose.
    const hodMissing =
      user.role === "employee" &&
      payload.service_type !== "meals_only" &&
      payload.booking_type === "official" &&
      user.staff_category !== "staff" &&
      unitApprovers.length === 0;
    const submissionRemarks =
      [
        overrideNote,
        hodMissing
          ? "Booking submitted. No HOD is set for this department in the console, so it went straight to the Guest House Manager."
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null;

    const booking = await store.createBooking({
      user_id: user.id,
      guest_house_id: payload.guest_house_id,
      user_role: user.role,
      // A meals-only booking is the kitchen's business, so it goes straight
      // to the manager rather than through the room approval chain.
      status,
      purpose_of_visit: payload.purpose_of_visit,
      check_in: checkInIso,
      check_out: checkOutIso,
      booking_type: payload.booking_type,
      service_type: payload.service_type,
      meal_preference: payload.meal_preference ?? null,
      meal_guest_count: wantsRooms ? null : payload.meal_guest_count,
      pets_policy_acknowledged: payload.pets_policy_acknowledged,
      alumni_name: forAlumnus ? payload.alumni_name : null,
      alumni_roll_number: forAlumnus ? payload.alumni_roll_number : null,
      alumni_id_url: alumniIdUrl,
      debit_head: payload.debit_head,
      debit_details: payload.debit_details,
      debit_document_url: debitDocumentUrl,
      custom_fields: customValues.length > 0 ? customValues : null,
      meals: payload.meals,
      rooms,
      submission_remarks: submissionRemarks,
      // Both parties are recorded: the booking hangs off the manager's
      // account for referential integrity, and names the guest it is for.
      created_by: onBehalfOf ? user.id : null,
      on_behalf_of_name: onBehalfOf?.name ?? null,
      on_behalf_of_email: onBehalfOf?.email ?? null,
      on_behalf_of_phone: onBehalfOf?.phone ?? null,
    });

    // Acknowledge to the requester and tell whoever has to decide. Queued,
    // never sent inline: a slow SMTP host must not make the requester wait,
    // and a mail failure must not fail a booking that is already stored.
    await notifyBookingSubmitted(booking.id);

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
    // Unit approvals (an HOD, a club's advisor or council secretary) are
    // decided by who heads the requester's unit now, so the units come too.
    if (!canReview(user, booking.status, booking.requester, await store.listUnits())) {
      return { ok: false, error: "You are not authorised to review this booking" };
    }
    if (action === "reject" && !reason?.trim()) {
      return { ok: false, error: "A rejection reason is mandatory" };
    }
    // Rejecting a request whose dates have passed is still useful — it closes
    // it off and tells the requester. Forwarding one is not: it would move a
    // stay that can no longer happen one step closer to holding a room.
    if (action === "approve") {
      const lapsed = lapsedError(booking);
      if (lapsed) return { ok: false, error: lapsed };
    }
    // A room booking is approved by allocating a room to it, which is a
    // different screen. A meals-only booking has no room to allocate, so for
    // that one the manager's approval *is* the decision.
    const mealsOnly = booking.service_type === "meals_only";
    if (action === "approve" && user.role === "gh_manager" && !mealsOnly) {
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
      // The reason reaches the requester verbatim — a paraphrase would be a
      // different decision, and the reason is the entire point of the mail.
      await notifyRejected(bookingId, user, reason!.trim());
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
      // Two audiences, one transition: the requester learns it moved, the next
      // tier learns it is theirs. `booking.status` here is the stage that was
      // just signed off, which is what the requester's mail names.
      await notifyTierApproved(bookingId, user, booking.status);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("reviewBooking failed", e);
    return { ok: false, error: "Something went wrong while reviewing the booking" };
  }
}

/** GH Manager: confirm allocation — assigns rooms and marks APPROVED. */
/**
 * Each room's worst conflict with a booking's dates — free, a turnover
 * overlap the manager may accept, or a real clash. Manager only: a requester
 * seeing "soft" would read a held room as available.
 */
export async function getRoomConflicts(
  bookingId: string
): Promise<Record<string, ConflictKind>> {
  const user = await requireUser();
  if (!canAssignRooms(user.role)) throw new Error("Not authorised");
  const store = getStore();
  const booking = await store.getBooking(bookingId);
  if (!booking) return {};

  // Widened by the grace and the turnaround buffer at each end, so a stay
  // that ends just before this one begins — or begins just after it ends — is
  // still returned and can be classified.
  const buffer = bufferMs((await getRules()).booking.buffer_minutes);
  const widen = TURNOVER_GRACE_HOURS * 3_600_000 + buffer;
  const from = new Date(Date.parse(booking.check_in) - widen).toISOString();
  const to = new Date(Date.parse(booking.check_out) + widen).toISOString();
  const segments = (
    await store.listRoomOccupancy(booking.guest_house_id, from, to)
  ).filter((seg) => seg.booking_id !== bookingId);

  return conflictsByRoom({ from: booking.check_in, to: booking.check_out }, segments, buffer);
}

export async function allocateRooms(
  bookingId: string,
  roomIds: string[],
  /** Rooms whose turnover overlap the manager is accepting. */
  overrideRoomIds: string[] = []
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "gh_manager") return { ok: false, error: "Only the GH Manager can allocate rooms" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (booking.service_type === "meals_only") {
      return { ok: false, error: "A meals-only booking has no room to allocate" };
    }
    // Allocating a lapsed request would hold rooms for dates in the past.
    const lapsed = lapsedError(booking);
    if (lapsed) return { ok: false, error: lapsed };
    // The manager is the last stage of the approval chain, so they can also be
    // the only stage when the request has already been settled off-portal —
    // an override, recorded as one in the log below.
    const overriding = booking.status !== "PENDING_GH_MANAGER";
    if (overriding && !ACTIVE_STATUSES.includes(booking.status)) {
      return { ok: false, error: "This booking is not awaiting allocation" };
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

    // Do the picked rooms actually sleep the party? Infants share with their
    // guardians, so they need no bed and are excluded from the head count.
    const selectedRooms = roomIds.map((id) => roomsById.get(id)!);
    const { capacity } = await getRules();
    const capacityProblem = allocationCapacityError(
      countBedGuests(booking.guests),
      selectedRooms,
      capacity
    );
    if (capacityProblem) return { ok: false, error: capacityProblem };

    // The aggregate check above can pass while one room card still does not
    // fit — three guests given a single room, say. Rooms are allocated in card
    // order, so card N gets `roomIds[N]`.
    for (const [i, card] of booking.rooms.entries()) {
      const room = selectedRooms[i];
      if (!room) continue;
      const problem = roomAssignmentError(
        countBedGuests(card.guests),
        room,
        `Room ${card.room_index}`,
        capacity
      );
      if (problem) return { ok: false, error: problem };
    }

    // Overrides are re-derived here rather than trusted: the client says
    // which rooms it is overriding, but *whether* each one is only a turnover
    // overlap is decided from the stored occupancy. A crafted request naming
    // a hard clash gets refused, and the database refuses it again.
    const overrides = [...new Set(overrideRoomIds)].filter((id) => roomIds.includes(id));
    if (overrides.length > 0) {
      const conflicts = await getRoomConflicts(bookingId);
      const hard = overrides.find((id) => conflicts[id] === "hard");
      if (hard) {
        const room = roomsById.get(hard);
        return {
          ok: false,
          error: `${room?.room_number ?? "That room"} is booked for more than ${TURNOVER_GRACE_HOURS} hours of this stay — that is a clash, not a changeover, and cannot be overridden.`,
        };
      }
    }

    // No pre-flight occupancy check for the rest: the room_holds exclusion
    // constraint is the authority, and checking first would only reintroduce
    // the check-then-act race this replaced. A loser gets RoomClashError.
    const roomNumbers = selectedRooms.map((r) => r.room_number).join(", ");
    const overrideNumbers = overrides
      .map((id) => roomsById.get(id)?.room_number ?? id)
      .join(", ");
    await store.updateBookingStatus(
      bookingId,
      {
        status: "APPROVED",
        assigned_room_ids: roomIds,
        override_room_ids: overrides,
        override_by: overrides.length > 0 ? user.id : null,
      },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "APPROVED",
        remarks: [
          overriding
            ? `Approved by the Guest House Manager without the remaining review stages (was ${booking.status}).`
            : null,
          `Rooms allocated: ${roomNumbers}`,
          // The override is in the log or it did not happen: it is the record
          // of a human accepting an overlap the system would otherwise refuse.
          overrides.length > 0
            ? `Turnover overlap accepted by ${user.full_name} on ${overrideNumbers}.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      }
    );
    // Administration Section requirement 5: the requester should not have to
    // open the portal to learn their room numbers.
    await notifyRoomsAllocated(bookingId, user);

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
    // A stay that has started cannot be cancelled from the portal: the guest
    // is in the room, and what happens next is a conversation at the desk,
    // not a status change. The manager can still close it off.
    if (booking.status === "OCCUPIED") {
      return {
        ok: false,
        error:
          "This stay has already started — speak to the Guest House Manager to end it early.",
      };
    }

    // **Every** cancellation goes to the Guest House Manager, whatever stage
    // the booking had reached. It used to depend on the stage: a request the
    // warden had not yet seen was simply cancelled, an approved one was
    // requested. That made "can I cancel?" answerable only by knowing where
    // in the chain your booking sat. Now the answer is the same at every
    // stage before the guest walks in — ask, and the manager decides.
    const stageWhenAsked = booking.status;
    await store.updateBookingStatus(
      bookingId,
      { status: "CANCELLATION_REQUESTED", rejection_reason: reason.trim() },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: "CANCELLATION_REQUESTED",
        remarks: `Cancellation requested at ${stageWhenAsked}: ${reason.trim()}`,
      }
    );
    // The manager decides; whoever was reviewing it is told at the same
    // moment, for information only — see `notifyCancellationRequested`.
    await notifyCancellationRequested(bookingId, reason.trim());
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

/** GH Manager or Caretaker: advance a booking (Approved → Occupied → Vacated). */
export async function updateBookingLifecycle(
  bookingId: string,
  targetStatus: BookingStatus
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    // The caretaker on reception records arrivals and departures as well —
    // that is the whole of their console. Allocation and approvals are not.
    if (!canUpdateLifecycle(user.role)) {
      return { ok: false, error: "Your role cannot update booking status" };
    }
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
    // A guest may be checked in up to the turnover grace before their booked
    // time and no earlier. There is no matching limit on checking *out*:
    // people leave when they leave, and the desk records it.
    if (targetStatus === "OCCUPIED") {
      const tooEarly = occupancyNotStartedError(booking);
      if (tooEarly) return { ok: false, error: tooEarly };
    }

    // Was it early? Read from the booking rather than trusted from the
    // caller, so the log says what happened and not what was clicked.
    const now = new Date().toISOString();
    const actuallyEarly =
      targetStatus === "OCCUPIED"
        ? booking.check_in > now
        : targetStatus === "VACATED" && booking.check_out > now;

    const remarkMap: Record<string, string> = {
      OCCUPIED: actuallyEarly
        ? `Guest checked in early — arrived before the booked ${formatDateTime(booking.check_in)}`
        : "Guest checked in — marked as Occupied",
      VACATED: actuallyEarly
        ? `Guest checked out early — left before the booked ${formatDateTime(booking.check_out)}. The room is free from now.`
        : "Guest checked out — marked as Vacated",
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
    await notifyCancellationDecided(bookingId, "approved", user, booking.rejection_reason);

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
    // The booking stands and the rooms stay held, which the requester has no
    // way of knowing otherwise — they asked to cancel and nothing changed.
    await notifyCancellationDecided(bookingId, "rejected", user, reason.trim());

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
