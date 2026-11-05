"use server";

import { revalidateBookings } from "@/lib/revalidate";
import { blockOverlaps } from "@/lib/operations";
import { prepareUpload } from "@/lib/uploads";
import {
  canAssignRooms,
  canBookOnBehalf,
  canOverrideGuestHousePolicy,
  canOverrideVacatePayment,
} from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { aadhaarDigits, bookingPayloadSchema } from "@/lib/booking-schema";
import { defaultBookingTypeFor, needsAlumniDetails } from "@/lib/booking-types";
import { acceptsDebitDocument, needsProject, requiresFundDeclaration } from "@/lib/debit-heads";
import { mustBookThroughFacultyInCharge } from "@/lib/club-booking";
import { clubsBookableByUser } from "@/lib/club-booking-server";
import { hodApproversFor } from "@/lib/units";
import { bookingContextFor } from "@/lib/booking-context-server";
import { academicRecordFor } from "@/lib/academic";
import { guestNameRule, lockedNameFor } from "@/lib/academic/guest-names";
import { describeProject } from "@/lib/projects";
import { MEAL_KEYS, mealCapacityError, mealPlatesBooked } from "@/lib/meals";
import { isResearchScholar, validateCustomValue } from "@/lib/form-config";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import {
  notifyBookingSubmitted,
  notifyCancellationDecided,
  notifyCancellationRequested,
  notifyRejected,
  notifyRoomsAllocated,
  notifyTierApproved,
} from "@/lib/mail/notify";
import { formatINR, toPaise, vacateBlocker } from "@/lib/invoice";
import { cancellationNoticeError, guestHousePolicyError, mealsPolicyError } from "@/lib/policy";
import { isWhitelistedOfficial } from "@/lib/settings";
import { getOfficialEmails, getRules } from "@/lib/settings-server";
import { roomsVisibleTo, vipAllocationError } from "@/lib/vip";
import { getStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { deskCategoriesFor } from "@/lib/tariff-categories-server";
import { deskCategoryFor, type DeskTariffCategory } from "@/lib/tariff-categories";
import { instituteIso } from "@/lib/tz";
import type {
  BookingStatus,
  BookingWithDetails,
  CustomFieldValue,
  Gender,
  NewBookingGuestInput,
  NewBookingRoomInput,
  Profile,
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
import { stageLabel } from "@/lib/approval-routes";
import { getReviewContext } from "@/lib/approval-routes-server";
import {
  ACTIVE_STATUSES,
  actsAsRequester,
  canReviewBooking,
  lapsedError,
  canUpdateLifecycle,
  approvalStagesFor,
  asksOfficeApproval,
  initialStatusFor,
  droppedStages,
  isOfficeRole,
  nextStatusAfter,
  occupancyNotStartedError,
} from "@/lib/workflow";

export type ActionResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string };

/** A trimmed text field from the form, or null when it is blank or absent. */
function readText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The form sends a wall-clock string ("2026-09-15T12:00"). Resolve it in the
 * institute's timezone rather than the server's - `new Date()` on a naked
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
    // theirs with the actual guest named on the booking - see `onBehalfOf`.
    const onBehalf = canBookOnBehalf(user.role);

    // A club's booking is raised by its faculty in-charge, never by the
    // club's own account (24 Sep 2026, `lib/club-booking.ts`). The club named
    // here is re-checked against the units and profiles, so a crafted
    // request cannot book in the name of a club the caller is not in charge
    // of.
    const clubId = readText(formData, "for_club");
    let club: Profile | null = null;
    if (clubId) {
      club = (await clubsBookableByUser(user)).find((c) => c.id === clubId) ?? null;
      if (!club) {
        return { ok: false, error: "You are not set as the Faculty Advisor of that council or club" };
      }
    } else {
      if (mustBookThroughFacultyInCharge(user.role)) {
        return {
          ok: false,
          error: "Club bookings are raised by the club's Faculty Advisor - ask them to book for the club.",
        };
      }
      if (!REQUESTER_ROLES.includes(user.role) && !onBehalf) {
        return { ok: false, error: "Your role cannot submit booking requests" };
      }
      if (user.role === "official" && !isWhitelistedOfficial(user.email, await getOfficialEmails())) {
        return { ok: false, error: "This account is not whitelisted for official bookings" };
      }
    }
    // Whose booking it is: the club's, when its faculty in-charge raises it -
    // so it is routed, debited, scoped and reported as a club booking - and
    // otherwise the signed-in person's.
    const requester = club ?? user;

    // Who the stay is actually for. Required when the manager is booking for
    // someone else, because otherwise the booking says only that the manager
    // is staying - and the desk has no way to find out who is arriving.
    const onBehalfOf = onBehalf && !club
      ? {
          name: readText(formData, "on_behalf_of_name"),
          email: readText(formData, "on_behalf_of_email"),
          phone: readText(formData, "on_behalf_of_phone"),
        }
      : null;
    if (onBehalfOf && !onBehalfOf.name) {
      return { ok: false, error: "Enter the name of the guest this booking is for" };
    }

    const config = await getEffectiveFormConfig(requester.role);
    const store = getStore();

    // Whether meals can be booked at all on this account, which decides
    // whether "Room + Meals" and "Meals only" are options. Computed from the
    // guest houses the role may book, exactly as the form does.
    const allGuestHouses = await store.listGuestHouses();
    const mealsAvailable =
      (canOverrideGuestHousePolicy(user.role) ||
        mealsPolicyError(defaultBookingTypeFor(requester.role) ?? "official", requester.role) ===
          null) &&
      allGuestHouses.some((g) => g.serves_meals && config.allowed_guest_house_ids.includes(g.id));

    const rawPayload = formData.get("payload");
    if (typeof rawPayload !== "string") return { ok: false, error: "Malformed submission" };
    // The same Settings, debitable heads and projects the page handed the
    // form, from the same computation, so the two validate alike.
    const bookingContext = await bookingContextFor(requester);
    /**
     * What the requester's academic record fixes about their guests (7 Oct
     * 2026): a student's father's and mother's names, and the relationships
     * the record rules out. The same rule the form was built with, rebuilt
     * here from the record rather than taken from the submission - the whole
     * point is that the names are the institute's, not the requester's.
     *
     * `academicRecordFor` never throws and caches, so a database that cannot
     * be reached simply leaves the names editable, as it does on the form.
     */
    const lookup = await academicRecordFor(requester);
    const guestNames = guestNameRule(
      lookup.status === "found" ? lookup.record : null,
      config.relationship_options
    );
    /**
     * Whether anybody other than whoever is submitting gives this requester
     * HOD approval. Read once, here: the schema needs it to know whether an
     * office is asked how its booking is approved, and the route below needs
     * it to know whether the HOD stage exists at all.
     */
    const hasHodApprover =
      hodApproversFor(requester, bookingContext.units).filter((id) => id !== user.id).length > 0;
    const parsed = bookingPayloadSchema(config, {
      mealsAvailable,
      requesterEmail: requester.email,
      // From the requester's own roll number, never the payload (4 Nov 2026).
      researchScholar: isResearchScholar(requester.roll_number),
      copyTo: bookingContext.copyToRule,
      rules: bookingContext.rules,
      debitHeads: bookingContext.debitHeads,
      projectIds: bookingContext.projects.map((p) => p.id),
      guestNames,
      hasHodApprover,
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
    // The Guest House Manager can set it aside - Bageshri does fill up, and a
    // rule the manager cannot lift just moves the booking off the portal. The
    // override goes into the booking's first log entry, so the exception is
    // visible for as long as the booking is.
    const policyProblem = guestHousePolicyError(
      payload.booking_type,
      guestHouse,
      allGuestHouses,
      requester.role
    );
    let overrideNote: string | null = null;
    if (policyProblem) {
      if (!canOverrideGuestHousePolicy(user.role)) {
        return { ok: false, error: policyProblem };
      }
      overrideNote = `Booking submitted. Guest house policy overridden by ${user.full_name}: ${policyProblem}`;
    }
    /**
     * And no meals for a student or for a booking made for an alumnus (7 Oct
     * 2026). Both are accommodated at the guest house with no kitchen, so
     * this used to follow from `serves_meals` alone; it is a rule of its own
     * now, so a tick in the developer console cannot start selling them meals
     * the office does not sell. Overridable by the desk, and recorded in the
     * booking's log when it is.
     */
    if (payload.meals.length > 0 || payload.service_type !== "room") {
      const mealProblem = mealsPolicyError(payload.booking_type, requester.role);
      if (mealProblem) {
        if (!canOverrideGuestHousePolicy(user.role)) {
          return { ok: false, error: mealProblem };
        }
        overrideNote = [
          overrideNote,
          `Meals policy overridden by ${user.full_name}: ${mealProblem}`,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
    // Meals only where the guest house serves them (Hamsanandi by default,
    // set in the developer console). The form hides the grid elsewhere; this
    // is the check a crafted request meets.
    if ((payload.meals.length > 0 || payload.service_type === "meals_only") && !guestHouse.serves_meals) {
      return { ok: false, error: `Meals are not served at ${guestHouse.name}` };
    }

    /**
     * The kitchen's limit per sitting (1 Oct 2026): at most
     * `rules.meals.max_diners_per_meal` people at any one meal, **counting
     * everyone already booked for it**.
     *
     * Only here, not in the schema: the limit is about the other bookings,
     * which the browser cannot see and must not be told about. The booking's
     * own head count is capped by the schema on both sides, so this is the
     * check that needs the database. One query per day of meals - a dining
     * booking has a handful, a stay at most the stay's length.
     */
    if (payload.meals.length > 0) {
      const limit = bookingContext.rules.meals.max_diners_per_meal;
      const diners = wantsRooms
        ? payload.rooms.flatMap((r) => r.guests).filter((g) => !isInfantAge(g.age)).length
        : payload.meal_guest_count;
      if (limit > 0 && diners > 0) {
        const booked = new Map<string, number>();
        for (const day of payload.meals) {
          const others = await store.listBookingsWithMealsOn(day.date, payload.guest_house_id);
          for (const meal of MEAL_KEYS) {
            if (!day[meal]) continue;
            booked.set(`${day.date}|${meal}`, mealPlatesBooked(others, day.date, meal));
          }
        }
        const full = mealCapacityError(
          payload.meals,
          diners,
          (date, meal) => booked.get(`${date}|${meal}`) ?? 0,
          limit
        );
        if (full) return { ok: false, error: full };
      }
    }

    const checkInIso = toIso(payload.check_in);
    const checkOutIso = toIso(payload.check_out);

    // Room limit enforcement: check against total active rooms and date-range
    // availability. A meals-only booking holds no rooms, so none of it applies.
    if (wantsRooms) {
      // A VIP room is not this requester's to ask for unless they have VIP
      // access (4 Nov 2026), so it does not count towards what is free: the
      // manager could not allocate it to them afterwards.
      const activeRooms = roomsVisibleTo(
        await store.listRooms(payload.guest_house_id),
        requester,
        bookingContext.rules.policy
      );
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
      const freeRoomCount = activeRooms.filter((r) => !occupiedIds.includes(r.id)).length;
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
    // for one - `isInfantAge` decides that from the age, the same rule the
    // schema and the database apply.
    const rooms: NewBookingRoomInput[] = [];
    for (const [roomIndex, room] of payload.rooms.entries()) {
      const guests: NewBookingGuestInput[] = [];
      for (const [guestIndex, g] of room.guests.entries()) {
        const infant = isInfantAge(g.age);
        /**
         * A guest the academic record named (7 Oct 2026). Two things follow,
         * both the office's words: the name stored is **the record's**, not
         * whatever the form sent, and neither an Aadhaar number nor an ID
         * document is demanded - the institute has already identified them.
         * A sibling or a grandparent is typed by hand and still asked.
         */
        const recordedName = infant ? null : lockedNameFor(guestNames, g.relationship);
        const recorded = recordedName !== null;
        const file = formData.get(`guest_doc_${roomIndex}_${guestIndex}`);
        let documentUrl: string | null = null;
        if (file instanceof File && file.size > 0) {
          const prepared = await prepareUpload(file);
          if (!prepared.ok) return { ok: false, error: `Guest ${guestIndex + 1} in Room ${roomIndex + 1}: ${prepared.error}` };
          documentUrl = await store.saveDocument(prepared.file, "guest-ids");
        } else if (config.guest_fields.id_document === "required" && !infant && !recorded) {
          return {
            ok: false,
            error: `ID document upload is required for guest ${guestIndex + 1} in Room ${roomIndex + 1}`,
          };
        }
        guests.push({
          name: recordedName ?? (g.name || "Guest"),
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
    // the booking itself being raised on behalf of an alumnus - the IAR
    // accounts book both ways from one form, so the requirement follows the
    // request rather than the account.
    const forAlumnus = needsAlumniDetails(payload.booking_type);
    const cardRequired = config.alumni_card === "required" || forAlumnus;
    let alumniIdUrl: string | null = null;
    const alumniCard = formData.get("alumni_card");
    if (alumniCard instanceof File && alumniCard.size > 0 && (config.alumni_card !== "hidden" || forAlumnus)) {
      const prepared = await prepareUpload(alumniCard);
      if (!prepared.ok) return { ok: false, error: `Alumni ID card: ${prepared.error}` };
      alumniIdUrl = await store.saveDocument(prepared.file, "alumni-cards");
    } else if (cardRequired) {
      return { ok: false, error: "Alumni ID card upload is mandatory" };
    }

    // The sanction letter behind Special Funds, when the requester has one.
    // Optional since 24 Sep 2026 - the office asked for the head, not for a
    // document. Checked here rather than in the schema because this is where
    // the upload is.
    let debitDocumentUrl: string | null = null;
    const document = formData.get("debit_document");
    if (acceptsDebitDocument(payload.debit_head) && document instanceof File && document.size > 0) {
      const prepared = await prepareUpload(document);
      if (!prepared.ok) return { ok: false, error: `Sanction document: ${prepared.error}` };
      debitDocumentUrl = await store.saveDocument(prepared.file, "debit-documents");
    }

    // Who approves, if anyone: the route for this role and kind of booking
    // (`routeFor`), with the HOD whoever heads the requester's department or
    // office right now - read from the console, never the requester. The
    // person raising a club's booking is never its HOD stage either: they
    // cannot approve what they raised.
    //
    // An office with no HOD is not asked (11 Oct 2026): the question has one
    // answer, so Direct is recorded whatever the payload carried rather than
    // the submission being refused for a choice the form did not offer.
    //
    // The chain itself is the office's (12 Oct 2026): `bookingContext.rules
    // .approval` is the list of routes the manager edits at Console ->
    // Approval Workflow, and the directory is what lets a stage with nobody
    // to decide it be skipped rather than stranding the request.
    const routingBase = {
      bookingType: payload.booking_type,
      staffCategory: requester.staff_category ?? null,
      hasHodApprover,
      raisedByFacultyInCharge: club !== null,
      rules: bookingContext.rules.approval,
      directory: { units: bookingContext.units, profiles: bookingContext.profiles },
      requester,
    };
    const officeApproval =
      !isOfficeRole(requester.role) || !wantsRooms
        ? null
        : asksOfficeApproval(requester.role, payload.service_type, hasHodApprover, routingBase)
          ? payload.office_approval
          : "direct";
    const routing = { ...routingBase, officeApproval };
    const status = initialStatusFor(requester.role, payload.service_type, routing);
    // A stage the route names but which nobody can decide is dropped, and the
    // log says which - otherwise it looks as if an approval was skipped on
    // purpose. The HOD's keeps the wording it has had since Phase 4, because
    // it is the one the office reads most.
    //
    // A stage that cannot apply to this requester at all is worded
    // differently (17 Oct 2026): a student with no hostel has no Assistant
    // Warden, which is a fact about a day scholar's account and not a console
    // nobody filled in.
    const dropped = droppedStages(requester.role, payload.service_type, routing);
    const hodMissing = dropped.some(
      (d) => d.stage.approver.kind === "hod" && d.reason === null
    );
    const inapplicable = dropped.filter((d) => d.reason !== null);
    const otherSkipped = dropped.filter(
      (d) => d.reason === null && d.stage.approver.kind !== "hod"
    );
    const submissionRemarks =
      [
        club
          ? `Booking raised by ${user.full_name}, Faculty Advisor of ${club.full_name}, on its behalf - so it goes straight to the Guest House Manager.`
          : null,
        overrideNote,
        hodMissing
          ? "Booking submitted. Nobody other than the person booking is set to give HOD approval for this unit in the console, so the HOD stage was skipped."
          : null,
        ...inapplicable.map(
          (d) => `The ${stageLabel(d.stage)} stage does not apply to this request: ${d.reason}.`
        ),
        otherSkipped.length > 0
          ? `Nobody is set to decide ${otherSkipped
              .map((d) => stageLabel(d.stage))
              .join(" or ")}, so ${otherSkipped.length === 1 ? "that stage was" : "those stages were"} skipped.`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null;

    // A Project head names its project as it is today; the snapshot keeps the
    // booking's record of it if the project list is edited later.
    const project = payload.project_id
      ? bookingContext.allProjects.find((p) => p.id === payload.project_id && p.active)
      : undefined;
    if (payload.project_id && !project) {
      return { ok: false, error: "That project is not on the list of active projects" };
    }

    const booking = await store.createBooking({
      user_id: requester.id,
      guest_house_id: payload.guest_house_id,
      user_role: requester.role,
      // A meals-only booking is the kitchen's business, so it goes straight
      // to the manager rather than through the room approval chain.
      status,
      purpose_of_visit: payload.purpose_of_visit,
      check_in: checkInIso,
      check_out: checkOutIso,
      booking_type: payload.booking_type,
      service_type: payload.service_type,
      meal_preference: payload.meal_preference ?? null,
      // Each person's own preference (migration 27). Only on a booking that
      // has meals, so nothing rides along from a guest house swapped for one
      // with no kitchen.
      meal_diet_counts: payload.meals.length > 0 ? payload.meal_diet_counts : null,
      meal_guest_count: wantsRooms ? null : payload.meal_guest_count,
      pets_policy_acknowledged: payload.pets_policy_acknowledged,
      /*
       * **No privacy consent is recorded any more** (14 Oct 2026). The tick
       * and its paragraph came off the form at the office's request, and then
       * the notice itself was withdrawn - page, version and every link - and
       * archived in `archive/privacy-notice/`.
       *
       * `privacy_notice_version` is the notice the requester *agreed to*, and
       * both stores set `privacy_consent_at` from it. With nothing to agree
       * to, writing either would record something that did not happen - the
       * same rule as `fund_declaration_at`, which is never invented for a
       * booking that was never asked. Bookings made before that day keep
       * their consent and its version; new ones carry null, which reads as
       * "not asked". Neither column is dropped: the data export reads them.
       *
       * `archive/privacy-notice/README.md` is the restore, and it names this
       * line as one of its four steps.
       */
      // Recorded only where the head asked for it, so a personal booking -
      // which is never asked - cannot carry a declaration it did not make
      // (migration 30).
      fund_declaration: requiresFundDeclaration(payload.debit_head) && payload.fund_declaration,
      alumni_name: forAlumnus ? payload.alumni_name : null,
      alumni_roll_number: forAlumnus ? payload.alumni_roll_number : null,
      alumni_id_url: alumniIdUrl,
      debit_head: payload.debit_head,
      debit_details: project ? describeProject(project) : payload.debit_details,
      debit_document_url: debitDocumentUrl,
      debit_subhead: needsProject(payload.debit_head) ? payload.debit_subhead : null,
      // The requester is mailed anyway; copying them to themselves is noise.
      copy_to_emails: payload.copy_to_emails.filter(
        (address) => address.toLowerCase() !== requester.email.toLowerCase()
      ),
      project_id: project?.id ?? null,
      office_approval: officeApproval,
      custom_fields: customValues.length > 0 ? customValues : null,
      meals: payload.meals,
      rooms,
      submission_remarks: submissionRemarks,
      // Both parties are recorded: the booking hangs off the manager's
      // account for referential integrity, and names the guest it is for -
      // or off the club's account, naming the faculty in-charge who raised it.
      created_by: onBehalfOf || club ? user.id : null,
      on_behalf_of_name: onBehalfOf?.name ?? null,
      on_behalf_of_email: onBehalfOf?.email ?? null,
      on_behalf_of_phone: onBehalfOf?.phone ?? null,
    });

    // Acknowledge to the requester and tell whoever has to decide. Queued,
    // never sent inline: a slow SMTP host must not make the requester wait,
    // and a mail failure must not fail a booking that is already stored.
    await notifyBookingSubmitted(booking.id);

    revalidateBookings();
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
  reason?: string,
  /**
   * The tariff category the Guest House Manager is approving a **dining**
   * booking under (31 Oct 2026). A dining booking has no rooms, so the
   * manager's approval here is what room allocation is for a stay - which
   * makes this the one other place a category is decided. Refused on every
   * other stage: an intermediate approver forwards a request, they do not
   * price it.
   */
  tariffCategory?: string | null
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    // Unit approvals (an HOD, a club's advisor or council secretary) are
    // decided by who heads the requester's unit now, so the units come too -
    // and, since 12 Oct 2026, the office's approval routes and every account,
    // because a route can name a stage's approver by role or outright.
    const review = await getReviewContext();
    const units = review.units;
    // Also refuses whoever raised it - a club's faculty in-charge who is the
    // club's HOD too cannot sign off their own request.
    if (!canReviewBooking(user, booking, units, review)) {
      return { ok: false, error: "You are not authorised to review this booking" };
    }
    if (action === "reject" && !reason?.trim()) {
      return { ok: false, error: "A rejection reason is mandatory" };
    }
    // Rejecting a request whose dates have passed is still useful - it closes
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
    // The desk's approval of a dining booking is the moment its category is
    // decided; nobody else's decision carries one, and a payload that says
    // otherwise is refused rather than ignored.
    const pricesIt = action === "approve" && user.role === "gh_manager" && mealsOnly;
    if (tariffCategory && !pricesIt) {
      return { ok: false, error: "Only the Guest House Manager sets the tariff category, when they approve" };
    }
    const category = pricesIt ? await categoryForApproval(booking, tariffCategory) : null;
    if (category && !category.ok) return { ok: false, error: category.error };

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
      // The reason reaches the requester verbatim - a paraphrase would be a
      // different decision, and the reason is the entire point of the mail.
      await notifyRejected(bookingId, user, reason!.trim());
    } else {
      // The next stage of this booking's own route: a club's advisor forwards
      // to its HOD when it has one, everyone else to the manager.
      const next = nextStatusAfter(
        booking.status,
        approvalStagesFor(booking, booking.requester, units, review)
      );
      const chosen = category?.ok ? category.category : null;
      await store.updateBookingStatus(
        bookingId,
        { status: next, ...(pricesIt && { tariff_scope: chosen?.scope ?? null }) },
        {
          action_by: user.id,
          action_by_name: user.full_name,
          new_status: next,
          remarks: [
            next === "PENDING_GH_MANAGER"
              ? "Approved and forwarded to Guest House Manager"
              : next === "PENDING_HOD"
                ? "Approved and forwarded to the HOD"
                : "Approved",
            chosen ? describeCategoryForLog(chosen) : null,
          ]
            .filter(Boolean)
            .join(" "),
        }
      );
      // Two audiences, one transition: the requester learns it moved, the next
      // tier learns it is theirs. `booking.status` here is the stage that was
      // just signed off, which is what the requester's mail names.
      await notifyTierApproved(bookingId, user, booking.status);
    }
    revalidateBookings();
    return { ok: true };
  } catch (e) {
    console.error("reviewBooking failed", e);
    return { ok: false, error: "Something went wrong while reviewing the booking" };
  }
}

/** GH Manager: confirm allocation - assigns rooms and marks APPROVED. */
/**
 * Each room's worst conflict with a booking's dates - free, a turnover
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
  // that ends just before this one begins - or begins just after it ends - is
  // still returned and can be classified.
  const buffer = bufferMs((await getRules()).booking.buffer_minutes);
  const widen = TURNOVER_GRACE_HOURS * 3_600_000 + buffer;
  const from = new Date(Date.parse(booking.check_in) - widen).toISOString();
  const to = new Date(Date.parse(booking.check_out) + widen).toISOString();
  const segments = (
    await store.listRoomOccupancy(booking.guest_house_id, from, to)
  ).filter((seg) => seg.booking_id !== bookingId);

  const conflicts = conflictsByRoom({ from: booking.check_in, to: booking.check_out }, segments, buffer);
  // A room out of service for maintenance is a hard clash (Phase 7): the
  // database refuses it whatever the manager accepts.
  const blocks = await store.listRoomBlocks(booking.guest_house_id).catch(() => []);
  for (const block of blocks) {
    if (blockOverlaps(block, booking.check_in, new Date(Date.parse(booking.check_out) + buffer).toISOString())) {
      conflicts[block.room_id] = "hard";
    }
  }
  return conflicts;
}

/**
 * **The tariff category the manager is approving this booking under** (31 Oct
 * 2026, the owner: the final authority for the applicable category is the
 * GHM's, and the invoice must reflect what they chose).
 *
 * Re-derived from the office's rate sheet rather than trusted: the key arrives
 * from the desk's radio, and a crafted one naming a scope the sheet does not
 * publish would price a stay at a rate the office never set. Three answers,
 * all of them deliberate:
 *
 * - **a key that is on the sheet** - the manager's decision, recorded;
 * - **no key where there is exactly one category** - the one category, taken
 *   as given. A question with one answer is not asked anywhere in this
 *   portal, and recording it anyway means every booking approved from now on
 *   carries an explicit category rather than a silence to be interpreted;
 * - **no key where there are several** - refused. This is the whole point of
 *   the round: an invoice must not fall back to a default.
 */
async function categoryForApproval(
  booking: BookingWithDetails,
  key: string | null | undefined
): Promise<{ ok: true; category: DeskTariffCategory | null } | { ok: false; error: string }> {
  const categories = await deskCategoriesFor(booking);
  // No rate covers this booking's charges at all. The category is nobody's to
  // choose, and the invoice reports the missing rate as a problem of its own
  // rather than the approval refusing to happen over it.
  if (categories.length === 0) return { ok: true, category: null };
  if (key) {
    const chosen = deskCategoryFor(categories, key);
    return chosen
      ? { ok: true, category: chosen }
      : { ok: false, error: "That tariff category is not on this guest house's rate sheet" };
  }
  if (categories.length === 1) return { ok: true, category: categories[0] };
  return { ok: false, error: "Choose the tariff category this booking is charged under" };
}

/**
 * "Tariff category: Hamsanandi type 3, government officers - Room, per day
 * ₹4,000." The log line that keeps the **price** the category stood at on the
 * day it was chosen, which the booking itself deliberately does not store: a
 * stay is priced night by night, so a rate on the booking would be a second
 * source of truth, but an append-only log entry is a record of a decision and
 * cannot be mistaken for one.
 */
function describeCategoryForLog(category: DeskTariffCategory): string {
  const published = category.lines.filter((line) => line.rate !== null);
  const rates = (category.headline?.rate !== null && category.headline ? [category.headline] : published)
    .map((line) => `${line.label} ${formatINR(toPaise(line.rate ?? 0))}`)
    .join(", ");
  return `Tariff category: ${category.label}${rates ? ` - ${rates}` : ""}.`;
}

export async function allocateRooms(
  bookingId: string,
  roomIds: string[],
  /** Rooms whose turnover overlap the manager is accepting. */
  overrideRoomIds: string[] = [],
  /**
   * The tariff category the manager is approving it under
   * (`tariffScopeKey`). Required where the rate sheet publishes more than
   * one - approval is where the category is decided.
   */
  tariffCategory: string | null = null
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
    // the only stage when the request has already been settled off-portal -
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
    const { capacity, policy } = await getRules();
    // A VIP room only for a requester with VIP access (4 Nov 2026).
    const vipProblem = vipAllocationError(roomIds, rooms, booking.requester, policy);
    if (vipProblem) return { ok: false, error: vipProblem };
    const capacityProblem = allocationCapacityError(
      countBedGuests(booking.guests),
      selectedRooms,
      capacity
    );
    if (capacityProblem) return { ok: false, error: capacityProblem };

    // The aggregate check above can pass while one room card still does not
    // fit - three guests given a single room, say. Rooms are allocated in card
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

    // The category before the write: it is part of the same decision as the
    // rooms, so a booking must never come out of this approved and unpriced.
    const category = await categoryForApproval(booking, tariffCategory);
    if (!category.ok) return { ok: false, error: category.error };

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
          error: `${room?.room_number ?? "That room"} is booked for more than ${TURNOVER_GRACE_HOURS} hours of this stay - that is a clash, not a changeover, and cannot be overridden.`,
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
        tariff_scope: category.category?.scope ?? null,
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
          // The rate it was approved at, in the office's own words and with
          // the figure in force on the day - the booking stores the category,
          // and this is where the price it stood at that afternoon is kept.
          category.category ? describeCategoryForLog(category.category) : null,
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

    revalidateBookings();
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
    // The requester, or the faculty in-charge who raised a club's booking.
    if (!booking || !actsAsRequester(booking, user.id)) return { ok: false, error: "Booking not found" };
    if (!reason?.trim()) return { ok: false, error: "A cancellation reason is required" };

    const TERMINAL_STATUSES: BookingStatus[] = [
      "REJECTED", "CANCELLED", "VACATED", "CANCELLATION_REQUESTED", "CANCELLATION_APPROVED",
      // Nobody decided it in time (migration 29), so there is nothing left to
      // cancel - and asking for a cancellation would put a request nobody
      // can act on back in front of the manager.
      "MISSED",
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
          "This stay has already started - speak to the Guest House Manager to end it early.",
      };
    }
    // At least 24 hours' notice (4 Nov 2026): inside that, the manager
    // cancels it - `managerCancelBooking` is never held to this.
    const notice = cancellationNoticeError(
      booking.check_in,
      (await getRules()).booking.cancellation_notice_hours
    );
    if (notice) return { ok: false, error: notice };

    // **Every** cancellation goes to the Guest House Manager, whatever stage
    // the booking had reached. It used to depend on the stage: a request the
    // warden had not yet seen was simply cancelled, an approved one was
    // requested. That made "can I cancel?" answerable only by knowing where
    // in the chain your booking sat. Now the answer is the same at every
    // stage before the guest walks in - ask, and the manager decides.
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
    // moment, for information only - see `notifyCancellationRequested`.
    await notifyCancellationRequested(bookingId, reason.trim());
    revalidateBookings();
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
  targetStatus: BookingStatus,
  /**
   * The manager's reason for closing a personal stay off although its
   * invoice is not paid (7 Oct 2026). Ignored on every other transition.
   */
  overrideReason?: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    // The caretaker on reception records arrivals and departures as well -
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

    /**
     * A personal stay is paid for before the guest leaves (7 Oct 2026): the
     * office asked for check-out to mean issue, pay, then vacate. Nobody
     * chases a private guest for a guest-house bill once they have driven
     * home, and the desk was finding the unpaid invoice weeks later in
     * "Checked out - to bill".
     *
     * The manager may set it aside with a reason - an invoice that cannot be
     * issued at all must not leave a guest in the building on paper - and
     * the reason goes into the log, so the exception is visible for as long
     * as the booking is.
     */
    let paymentOverride: string | null = null;
    if (targetStatus === "VACATED") {
      const invoices = await store.listInvoices({ bookingId }).catch(() => []);
      const unpaid = vacateBlocker(booking, invoices);
      if (unpaid) {
        const reason = overrideReason?.trim();
        if (!reason) return { ok: false, error: unpaid };
        if (!canOverrideVacatePayment(user.role)) {
          return {
            ok: false,
            error: `${unpaid} Only the Guest House Manager can close a stay off without payment.`,
          };
        }
        paymentOverride = reason;
      }
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
        ? `Guest checked in early - arrived before the booked ${formatDateTime(booking.check_in)}`
        : "Guest checked in - marked as Occupied",
      VACATED: actuallyEarly
        ? `Guest checked out early - left before the booked ${formatDateTime(booking.check_out)}. The room is free from now.`
        : "Guest checked out - marked as Vacated",
    };
    const remarks = [
      remarkMap[targetStatus] ?? `Status updated to ${targetStatus}`,
      paymentOverride
        ? `Closed off unpaid by ${user.full_name}, who gave the reason: ${paymentOverride}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    await store.updateBookingStatus(
      bookingId,
      { status: targetStatus },
      {
        action_by: user.id,
        action_by_name: user.full_name,
        new_status: targetStatus,
        remarks,
      }
    );
    revalidateBookings();
    return { ok: true };
  } catch (e) {
    console.error("updateBookingLifecycle failed", e);
    return { ok: false, error: "Something went wrong while updating the booking" };
  }
}

/** GH Manager: approve a cancellation request - releases rooms and finalises cancellation. */
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
        remarks: "Cancellation approved - rooms released",
      }
    );
    await notifyCancellationDecided(bookingId, "approved", user, booking.rejection_reason);

    revalidateBookings();
    return { ok: true };
  } catch (e) {
    console.error("approveCancellation failed", e);
    return { ok: false, error: "Something went wrong while approving cancellation" };
  }
}

/** GH Manager: reject a cancellation request - booking returns to its previous state. */
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
    // way of knowing otherwise - they asked to cancel and nothing changed.
    await notifyCancellationDecided(bookingId, "rejected", user, reason.trim());

    revalidateBookings();
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
