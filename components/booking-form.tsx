"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
  type UseFormRegister,
  type UseFormRegisterReturn,
  type UseFormSetValue,
} from "react-hook-form";
import { MailPlusIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { createBooking } from "@/app/actions/bookings";
import { BookingAvailability } from "@/components/booking-availability";
import { MealDatesPicker } from "@/components/meal-dates-picker";
import { TariffTable } from "@/components/tariff-table";
import { MealPlanGrid } from "@/components/meal-plan-grid";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { QuantityInput } from "@/components/ui/quantity-input";
import { TimeSelect } from "@/components/ui/time-select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/countries";
import {
  isRelationshipWithheld,
  LOCKED_NAME_HINT,
  lockedNameFor,
  NO_GUEST_NAME_RULE,
  type GuestNameRule,
} from "@/lib/academic/guest-names";
import {
  addGuestBlockedReason,
  addInfantBlockedReason,
  countInfants,
  describeTotals,
  INFANT_AGE_LIMIT,
} from "@/lib/occupancy";
import {
  AADHAAR_DIGITS,
  advanceWindowMessage,
  bookingPayloadSchema,
  checkOutOrderError,
  MAX_COPY_TO_EMAILS,
} from "@/lib/booking-schema";
import { DEFAULT_RULES, type CapacityRules, type Rules } from "@/lib/settings";
import {
  hasQualifyingParent,
  usedUniqueRelationships,
  validateCustomValue,
  type CustomField,
  type RoleFormConfig,
} from "@/lib/form-config";
import {
  bookingTypesFor,
  defaultBookingTypeFor,
  describeBookingType,
  needsAlumniDetails,
  serviceTypesFor,
} from "@/lib/booking-types";
import {
  guestHousesForBookingType,
  latestCheckOutDate,
  mealsAllowedFor,
  PETS_POLICY_NOTICE,
  stayLengthHint,
  STUDENT_GUEST_HOUSE_NOTE,
  ALUMNI_GUEST_HOUSE_NOTE,
} from "@/lib/policy";
import {
  bookableMealsOn,
  choicesFromMealSlots,
  DEFAULT_MEALS_ON,
  describeDietCounts,
  describeMealDays,
  describeMeals,
  dietCountsError,
  dietTotal,
  firstBookableMealDate,
  MEAL_KEYS,
  mealPlanFromSlots,
  mealSlot,
  mealSlotsFromChoices,
  NO_MEALS,
  stayMealDays,
  totalMeals,
} from "@/lib/meals";
import type { TariffPreview } from "@/lib/tariffs";
import { formatInstituteDateTime, instituteDate, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { isOfficeRole, latestCheckIn } from "@/lib/workflow";
import { canBookOnBehalf, canOverrideGuestHousePolicy } from "@/lib/access";
import {
  acceptsDebitDocument,
  asksForDebitHead,
  debitDetailsPrompt,
  debitDetailsRequired,
  FUND_DECLARATION,
  requiresFundDeclaration,
  describeDebit,
  fixedDebitHead,
  MAX_SUBHEAD_LENGTH,
  needsProject,
  PERSONAL_DEBIT_HEAD,
  type DebitHeadsByType,
  PAY_AT_CHECKOUT_NOTE,
} from "@/lib/debit-heads";
import {
  BOOKING_TYPE_LABELS,
  CITIZENSHIP_LABELS,
  DEBIT_HEAD_LABELS,
  MEAL_PREFERENCE_LABELS,
  type BookingType,
  type DebitHead,
  type Citizenship,
  type GuestHouse,
  type Profile,
  type ServiceType,
} from "@/lib/types";

interface GuestFields {
  /**
   * A stable id for this row, used to key its uploaded file. Field-array
   * indices shift when a row above is removed, so they cannot be the key -
   * removing Room 1's first guest would otherwise hand their ID document to
   * the person below them.
   */
  key: string;
  /**
   * Which button made the card (25 Sep 2026): "Add infant" makes an infant
   * card - age below 5 chosen from a list, no ID - rather than a guest card
   * that turns into an infant only once a small age is typed.
   */
  kind: "guest" | "infant";
  name: string;
  age: string;
  gender: "" | "male" | "female" | "other";
  relationship: string;
  id_number: string;
  citizenship: Citizenship;
  nationality: string;
  passport_number: string;
}

interface RoomFields {
  room_type: "" | "single" | "double_sharing";
  guests: GuestFields[];
}

interface FormValues {
  /** DPDP consent (Phase 8): ticked before the request can be submitted. */
  privacy_consent: boolean;
  /** Asked first: whether a room is involved changes the rest of the form. */
  /** Asked next: it decides the approval route and how the stay is settled. */
  booking_type: BookingType;
  /** Which budget pays. Ignored when the booking can only be paid one way. */
  debit_head: "" | DebitHead;
  /** Which special fund, with the Special Budget head. */
  debit_details: string;
  /**
   * The requester's declaration that the funds are approved and available
   * (8 Oct 2026). Asked by every head but Personal Funds.
   */
  fund_declaration: boolean;
  /** The project for a Project head, from the console's list. */
  project_id: string;
  /** The project's sub-head, typed. Optional, and only with a Project head. */
  debit_subhead: string;
  /**
   * Extra addresses copied on every mail sent to the requester about this
   * booking. Objects rather than strings because react-hook-form's field
   * arrays key their rows by an id on each item.
   */
  copy_to: { email: string }[];
  /** An office's choice: straight to the manager, or through its HOD. */
  office_approval: "" | "direct" | "hod";
  /** Only when the Guest House Manager is booking for somebody else. */
  on_behalf_of_name: string;
  on_behalf_of_email: string;
  on_behalf_of_phone: string;
  /** Both only apply to a booking raised for an alumnus. */
  alumni_name: string;
  alumni_roll_number: string;
  guest_house_id: string;
  purpose_of_visit: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  /** Head count for a meals-only booking, which has no guest rows. */
  meal_guest_count: string;
  /**
   * Each person's own preference, as counts (1 Oct 2026). Kept as raw
   * strings, like every other number on this form, so a box can be cleared
   * and retyped; they have to add up to the head count.
   */
  meal_veg_count: string;
  meal_non_veg_count: string;
  rooms: RoomFields[];
  custom: Record<string, string | boolean>;
}

function newGuest(kind: GuestFields["kind"] = "guest"): GuestFields {
  return {
    key: crypto.randomUUID(),
    kind,
    name: "",
    age: "",
    gender: "",
    relationship: "",
    id_number: "",
    citizenship: "indian",
    nationality: "",
    passport_number: "",
  };
}

function newRoom(): RoomFields {
  return { room_type: "", guests: [newGuest()] };
}

/** Hard ceiling regardless of guests, so the form cannot grow unbounded. */
const MAX_ROOMS = 10;

/** A meals-only booking has no check-in time; it covers whole days. */
const MEALS_ONLY_DAY = { start: "00:00", end: "23:59" };

export function BookingForm({
  user,
  guestHouses,
  config,
  initialServiceType,
  initialMealDate,
  rules = DEFAULT_RULES,
  debitHeads = { room: {}, dining: {} },
  hodApprovers = [],
  forClub = null,
  defaultCopyTo = [],
  tariffPreviews = [],
  guestNames = NO_GUEST_NAME_RULE,
}: {
  /**
   * What the requester's academic record fixes about their guests (7 Oct
   * 2026): a student's father's and mother's names, which the form shows
   * read-only, and the relationships the record rules out, which it does not
   * offer. Built on the server (`guestNameRule`) and handed to the schema as
   * well, so the form and `createBooking` apply one rule.
   */
  guestNames?: GuestNameRule;
  /**
   * The rates for each guest house and booking type the requester may pick,
   * resolved on the server with the same function the invoice uses
   * (`tariffPreviews`). Shown as a small table beside the stay, so what the
   * requester is quoted and what the desk charges cannot drift.
   */
  tariffPreviews?: TariffPreview[];
  /**
   * Set when a club's Faculty Advisor is booking for the club (24 Sep 2026).
   * `user` and `config` are then the club's, so the form is exactly the
   * club's form; this names the club and the person raising it, and the
   * submission carries the club's id for the server to re-check.
   */
  forClub?: { id: string; name: string } | null;
  /**
   * What Copy to starts with - the council secretary's mailbox when a
   * Faculty Advisor books (`defaultCopyToFor`). A default, not a rule: the
   * requester may clear it or add more.
   */
  defaultCopyTo?: string[];
  /**
   * The debitable heads this requester may use per booking type, for rooms and
   * for dining - computed on the server (`bookingContextFor`) from Settings, so
   * the form offers exactly what the server will accept.
   */
  debitHeads?: { room: DebitHeadsByType; dining: DebitHeadsByType };
  /** Who would give HOD approval, by name - for an office's choice. */
  hodApprovers?: string[];
  user: Profile;
  guestHouses: GuestHouse[];
  config: RoleFormConfig;
  /**
   * The office's Settings, read by the page. The schema below is built from
   * the same object the server action uses, so what the form allows and what
   * the server accepts cannot differ.
   */
  rules?: Rules;
  /**
   * Which kind of booking the form opens on. The portal home offers meals and
   * rooms as two separate doors, because someone booking lunch for a visiting
   * examiner should not have to work out that it lives inside "New Booking".
   * The selector is still there, so the door is a starting point, not a trap.
   */
  initialServiceType?: ServiceType;
  /**
   * The first date a meals-only booking can be cooked for, resolved on the
   * server (`firstBookableMealDate`). Passed in rather than computed here so
   * the server-rendered form and its hydration cannot disagree about which
   * day it is - they would, for one second either side of a meal's deadline.
   */
  initialMealDate?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Files live outside RHF: a stable Map keyed by each guest row's own `key`.
  const [guestFiles] = useState(() => new Map<string, File>());
  const [alumniCard, setAlumniCard] = useState<File | null>(null);
  // The sanction letter behind Special Funds, when the requester has one.
  const [debitDocument, setDebitDocument] = useState<File | null>(null);
  const [alumniCardError, setAlumniCardError] = useState<string | null>(null);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  // Meal choices live outside react-hook-form as "date|meal" keys (`mealSlot`):
  // the grid's rows follow the stay dates, which fixed field paths cannot.
  // What is held is each slot the requester has *decided about* and their
  // answer - see `mealSlotsFromChoices`. A slot that is not in here takes its
  // meal's default (lunch on, breakfast and dinner off), which is what makes
  // the default survive a change of dates.
  const [mealChoices, setMealChoices] = useState<Map<string, boolean>>(() => new Map());
  const [mealsError, setMealsError] = useState<string | null>(null);
  const [roomsToDrop, setRoomsToDrop] = useState<number | null>(null);
  /** The room card whose "Remove room" was pressed, awaiting confirmation. */
  const [roomToRemove, setRoomToRemove] = useState<number | null>(null);
  /**
   * The clock the kitchen's notice period is measured against, taken once
   * when the form opens. The server checks it again on submission, so a form
   * left open past a meal's deadline is refused there rather than silently
   * accepted here.
   */
  const [now] = useState(() => new Date());

  const gf = config.guest_fields;
  const idDocRequired = gf.id_document === "required";
  const onBehalf = canBookOnBehalf(user.role);

  // Whether meals can be booked at all on this account. It decides which
  // service types exist, so it is computed before the form's defaults.
  const [mealsAvailable] = useState(
    () =>
      // Students and bookings for alumni are never offered meals (7 Oct
      // 2026, `mealsAllowedFor`). The manager keeps them: the desk can make
      // an exception, and the server records it.
      (canOverrideGuestHousePolicy(user.role) ||
        mealsAllowedFor(defaultBookingTypeFor(config.role) ?? "official", config.role)) &&
      guestHouses.some((g) => g.serves_meals && config.allowed_guest_house_ids.includes(g.id))
  );
  /**
   * Which kind of booking this is. It is **not** a question on the form any
   * more: the portal offers two doors, and the door settles it. A meals-only
   * booking arrives here as `initialServiceType`; anything else is a room
   * booking, and whether meals come with it is decided further down by whether
   * the requester actually picks any - see `serviceType` below.
   *
   * The door is still checked against the role, so a hand-edited URL cannot
   * put an ineligible account into the meals-only flow.
   */
  const [mealsOnly] = useState(
    () =>
      initialServiceType === "meals_only" &&
      serviceTypesFor(config.role, mealsAvailable).includes("meals_only")
  );
  /**
   * A dining booking's days. It is not a stay, so there is no check-in and no
   * check-out to ask for: the requester picks the dates the kitchen cooks on,
   * one at a time, starting from the first day that still has a meal open.
   * `check_in` / `check_out` are derived from the first and last of them when
   * the request is submitted, because that is what the booking record holds.
   */
  const [mealDates, setMealDates] = useState<string[]>(() =>
    initialServiceType === "meals_only"
      ? [initialMealDate ?? firstBookableMealDate(new Date(), rules.meals.windows)]
      : []
  );

  /**
   * The guest house the form opens on.
   *
   * Computed here, before `useForm`, rather than left to the effect below:
   * a role with one guest house renders it as a statement rather than a
   * dropdown, and a hidden field that starts empty would be empty in the
   * server-rendered HTML too - which is exactly the "select a guest house"
   * the IAR Student Cell hit on a form that was never going to ask.
   * `offeredGuestHouses` below recomputes the same list once the requester
   * can change the booking type.
   */
  const [initialGuestHouseId] = useState(() => {
    const offered = (
      canOverrideGuestHousePolicy(user.role)
        ? guestHouses
        : guestHousesForBookingType(
            guestHouses,
            defaultBookingTypeFor(config.role) ?? "official",
            config.role
          )
    ).filter((g) => !mealsOnly || g.serves_meals);
    return offered.length === 1 ? offered[0].id : "";
  });

  const form = useForm<FormValues>({
    defaultValues: {
      privacy_consent: false,
      // "Official" for staff, because that is the common case; a role with one
      // option is never shown the question at all.
      booking_type: defaultBookingTypeFor(config.role) ?? "official",
      debit_head: "",
      debit_details: "",
      fund_declaration: false,
      project_id: "",
      debit_subhead: "",
      copy_to: defaultCopyTo.length > 0 ? defaultCopyTo.map((email) => ({ email })) : [{ email: "" }],
      office_approval: "direct",
      on_behalf_of_name: "",
      on_behalf_of_email: "",
      on_behalf_of_phone: "",
      alumni_name: "",
      alumni_roll_number: "",
      guest_house_id: initialGuestHouseId,
      purpose_of_visit: "",
      check_in_date: "",
      check_in_time: "12:00",
      check_out_date: "",
      check_out_time: "10:00",
      meal_guest_count: "1",
      meal_veg_count: "",
      meal_non_veg_count: "",
      rooms: [newRoom()],
      custom: {},
    },
  });
  const { register, handleSubmit, control, setError, clearErrors, formState, setValue } = form;
  const { fields: roomFields, append: appendRoom, remove: removeRoom } =
    useFieldArray({ control, name: "rooms" });
  const {
    fields: copyToFields,
    append: appendCopyTo,
    remove: removeCopyTo,
  } = useFieldArray({ control, name: "copy_to" });

  const wantsRooms = !mealsOnly;
  const checkInTime = useWatch({ control, name: "check_in_time" });
  const checkOutTime = useWatch({ control, name: "check_out_time" });
  // The availability panel follows the guest house and check-in date as they
  // are picked, so the requester sees the day they are actually choosing.
  const selectedGuestHouseId = useWatch({ control, name: "guest_house_id" });
  const bookingType = useWatch({ control, name: "booking_type" });
  // Watched unconditionally - it is only *shown* on a meals-only booking, but
  // a hook cannot be called inside a branch.
  const mealGuestCount = useWatch({ control, name: "meal_guest_count" }) ?? "";
  const vegCountRaw = useWatch({ control, name: "meal_veg_count" }) ?? "";
  const nonVegCountRaw = useWatch({ control, name: "meal_non_veg_count" }) ?? "";
  // Watched rather than read with `getValues`, so the summary at the end of a
  // dining booking follows what is being typed instead of the last render.
  const purposeText = useWatch({ control, name: "purpose_of_visit" }) ?? "";
  const debitDetailsText = useWatch({ control, name: "debit_details" }) ?? "";
  // Which booking types this role may pick, and whether the question is worth
  // asking - a club only ever books officially.
  const [bookingTypeOptions] = useState(() => bookingTypesFor(config.role));
  const forAlumnus = needsAlumniDetails(bookingType);
  // Payment follows the kind of booking: one fixed head for a student or a
  // personal stay, a choice otherwise. Derived, so a change of booking type
  // cannot leave a stale answer behind.
  const headOptions = (mealsOnly ? debitHeads.dining : debitHeads.room)[bookingType] ?? [];
  const fixedHead = fixedDebitHead(headOptions);
  const chosenHeadRaw = useWatch({ control, name: "debit_head" });
  /**
   * A **personal** booking is not asked which budget pays (7 Oct 2026, the
   * office's eighth list): the money is the requester's own, so the card is
   * not rendered at all and the server records Personal Funds itself
   * (`debitHeadFor`, applied by the schema). What stays on screen is the line
   * about settling the invoice at check-out, which is the part of that card a
   * requester actually needed.
   */
  const asksHead = asksForDebitHead(bookingType);
  const chosenHead: DebitHead | null = !asksHead
    ? PERSONAL_DEBIT_HEAD
    : (fixedHead ?? (chosenHeadRaw || null));
  const paymentHead = chosenHead;
  const debitPrompt = debitDetailsPrompt(chosenHead);
  const debitDetailsMandatory = debitDetailsRequired(chosenHead);
  // Somebody else's money: the declaration the office asked for (8 Oct 2026).
  // Read off the head that is actually in force - `paymentHead`, not the radio
  // - so a personal booking, which is never asked for a head, is never asked
  // for the declaration either.
  const needsDeclaration = requiresFundDeclaration(paymentHead);
  // The Alumni ID card is demanded by the role's form config *or* by this
  // request being raised for an alumnus, since the IAR accounts book both ways
  // from one form.
  const alumniCardRequired = config.alumni_card === "required" || forAlumnus;
  const showAlumniSection = config.alumni_card !== "hidden" || forAlumnus;
  const checkInDate = useWatch({ control, name: "check_in_date" });
  const checkOutDate = useWatch({ control, name: "check_out_date" });

  // Alumni are accommodated at Bageshri, so the selector narrows to it rather
  // than letting a requester pick a guest house the server will refuse. The
  // manager keeps the full list: they are allowed to make an exception, and
  // the server records it in the booking's log when they do.
  const canOverrideHouse = canOverrideGuestHousePolicy(user.role);
  const offeredGuestHouses = (
    canOverrideHouse ? guestHouses : guestHousesForBookingType(guestHouses, bookingType, config.role)
  )
    // A meals-only booking can only go to a kitchen. Offering a guest house
    // that serves no meals would be offering a booking nobody can fulfil.
    .filter((g) => !mealsOnly || g.serves_meals);
  const guestHouseLocked = offeredGuestHouses.length === 1;
  // One guest house is not a choice, so the select is locked - and a locked
  // select never fires a change, which left the field empty and the form
  // unsubmittable. It happens on every meals-only booking: only the kitchens
  // are offered, and there is one. Set it here instead of asking.
  const onlyGuestHouseId = guestHouseLocked ? offeredGuestHouses[0].id : null;
  useEffect(() => {
    if (onlyGuestHouseId && selectedGuestHouseId !== onlyGuestHouseId) {
      setValue("guest_house_id", onlyGuestHouseId, { shouldValidate: false });
    }
  }, [onlyGuestHouseId, selectedGuestHouseId, setValue]);
  const overridingHouse =
    canOverrideHouse &&
    forAlumnus &&
    selectedGuestHouseId !== "" &&
    !guestHousesForBookingType(guestHouses, bookingType, config.role).some(
      (g) => g.id === selectedGuestHouseId
    );

  // Siblings / grandparents stay locked until a parent is on the request. The
  // rule spans the whole booking, so a parent in Room 1 unlocks Room 2.
  const watchedRooms = useWatch({ control, name: "rooms" });
  const allGuests = (watchedRooms ?? []).flatMap((r) => r?.guests ?? []);
  const parentPresent = hasQualifyingParent(
    config,
    allGuests.map((g) => g?.relationship)
  );
  // Mother, Father, Guardian… once each across the whole request. Computed
  // here, where every room's guests are in view, and greyed out on every
  // guest but the one that already holds the answer.
  const usedUnique = usedUniqueRelationships(
    config,
    allGuests.map((g) => g?.relationship)
  );

  const totals = describeTotals({
    rooms: (watchedRooms ?? []).length,
    guests: allGuests.filter((g) => !isInfantEntry(g)).length,
    infants: allGuests.filter((g) => isInfantEntry(g)).length,
  });

  // A live reading of the stay, so a mis-set AM/PM is caught while filling the
  // form rather than by a validation error after submitting. `checkOutOrderError`
  // is the same function the schema uses, so the two cannot disagree.
  const effectiveCheckInTime = wantsRooms ? checkInTime : MEALS_ONLY_DAY.start;
  const effectiveCheckOutTime = wantsRooms ? checkOutTime : MEALS_ONLY_DAY.end;
  // A dining booking's first and last day come from the dates picked below,
  // not from two date boxes - it has no check-in and no check-out.
  const effectiveCheckInDate = mealsOnly ? (mealDates[0] ?? "") : checkInDate;
  const effectiveCheckOutDate = mealsOnly
    ? (mealDates[mealDates.length - 1] ?? "")
    : checkOutDate;
  const stay = (() => {
    if (!effectiveCheckInDate || !effectiveCheckOutDate) return null;
    const from = `${effectiveCheckInDate}T${effectiveCheckInTime}`;
    const to = `${effectiveCheckOutDate}T${effectiveCheckOutTime}`;
    const fromAt = instituteDate(from);
    const toAt = instituteDate(to);
    if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) return null;
    const problem = checkOutOrderError(from, to);
    const hours = (toAt.getTime() - fromAt.getTime()) / 3_600_000;
    return {
      fromAt,
      toAt,
      from: formatInstituteDateTime(fromAt),
      to: formatInstituteDateTime(toAt),
      problem,
      duration:
        hours >= 24
          ? `${Math.floor(hours / 24)} night${Math.floor(hours / 24) === 1 ? "" : "s"}${
              hours % 24 ? ` and ${Math.round(hours % 24)} hours` : ""
            }`
          : `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`,
    };
  })();

  // Meals are offered only where the chosen guest house serves them, and only
  // for the days and serving times the stay actually covers.
  const selectedGuestHouse = guestHouses.find((g) => g.id === selectedGuestHouseId);
  const servesMeals = selectedGuestHouse?.serves_meals ?? false;
  /**
   * Meals are offered only once a guest house has been chosen *and* that guest
   * house serves them. Asking first and explaining afterwards - "meals are not
   * served at Bageshri" - is offering something and then taking it away; this
   * way the question never appears where the answer would be no.
   *
   * The policy is checked beside the guest house (7 Oct 2026), not left to
   * follow from it: a student and a booking for an alumnus get no meals
   * whatever the guest house's "Serves meals" tick says. The manager may
   * still do it, and the server logs the exception.
   */
  const mealsAllowedHere = canOverrideHouse || mealsAllowedFor(bookingType, config.role);
  const offerMeals = Boolean(selectedGuestHouse) && servesMeals && mealsAllowedHere;
  const mealCheckIn = stay && !stay.problem ? stay.fromAt : null;
  /**
   * The rows of the meal grid. For a stay they are the days it touches; for a
   * dining booking they are exactly the dates picked, which need not be
   * consecutive. Either way a meal is offered only while the kitchen can still
   * take it (`now`), so nothing is ticked by default that the schema would
   * then refuse.
   */
  const mealDays = mealsOnly
    ? mealDates.map((date) => ({
        date,
        available: bookableMealsOn(date, now, rules.meals.windows),
      }))
    : stay && !stay.problem
      ? stayMealDays(stay.fromAt, stay.toAt, rules.meals.windows, now)
      : [];
  /**
   * Derived, never stored: each slot's own answer, else its meal's default.
   *
   * On a **meal booking**, lunch arrives ticked and the other two clear
   * (1 Oct 2026 - until then nothing was ticked until a preference had been
   * chosen, and then everything was). On a **stay**, nothing is ticked:
   * meals there are an extra the requester opts into, and defaulting them on
   * would put dining charges on every stay at a guest house with a kitchen
   * without anyone asking for them.
   */
  const mealSlots = mealSlotsFromChoices(
    mealDays,
    mealChoices,
    mealsOnly ? DEFAULT_MEALS_ON : NO_MEALS
  );
  const mealPlan = servesMeals ? mealPlanFromSlots(mealSlots, mealDays) : [];
  /**
   * What is actually being booked, derived rather than asked. A room booking
   * becomes a room-and-meals booking exactly when meals were picked, so the
   * two can never disagree the way a separate radio could.
   */
  const serviceType: ServiceType = mealsOnly
    ? "meals_only"
    : mealPlan.length > 0
      ? "room_meals"
      : "room";
  const mealHeadCount = wantsRooms
    ? allGuests.filter((g) => !isInfantEntry(g)).length
    : Number(mealGuestCount) || 0;
  /**
   * Each person's own preference (1 Oct 2026). One answer per kind rather
   * than per person: a dining booking has no guest list, only a head count,
   * and the kitchen cooks to numbers. They have to add up to the head count -
   * the same rule the schema applies on both sides (`dietCountsError`).
   */
  const dietCounts = {
    veg: Number(vegCountRaw) || 0,
    non_veg: Number(nonVegCountRaw) || 0,
  };
  const dietChosen = vegCountRaw !== "" || nonVegCountRaw !== "";
  /**
   * Answering one box fills the other with the rest (7 Oct 2026): the counts
   * must add up to the head count, so answering one settles the other, and
   * making the requester do the subtraction was the commonest way to end up
   * with a split that did not add up.
   *
   * Only ever written from a change, never from an effect: the requester can
   * still correct either box afterwards, and the one they are not touching is
   * the one that moves. Both boxes are steppers written with `setValue`, the
   * same way the two `TimeSelect`s are - they are in `defaultValues`, so the
   * submitted values carry them without a `register()` of their own.
   */
  const fillOtherDietCount = (
    other: "meal_veg_count" | "meal_non_veg_count",
    chosen: string
  ) => {
    if (chosen === "" || mealHeadCount <= 0) return;
    const rest = mealHeadCount - Number(chosen);
    if (!Number.isFinite(rest) || rest < 0) return;
    setValue(other, String(rest), { shouldValidate: false });
  };
  const dietProblem =
    mealPlan.length === 0 || mealHeadCount === 0
      ? null
      : !dietChosen
        ? "Say how many of the party are vegetarian and how many are not"
        : dietCountsError(dietCounts, mealHeadCount);
  const mealSummary =
    mealPlan.length === 0
      ? "No meals requested - tick the ones your party would like."
      : `${describeMeals(mealPlan)}, for ${mealHeadCount} guest${mealHeadCount === 1 ? "" : "s"}${
          dietChosen && !dietProblem ? ` (${describeDietCounts(dietCounts)})` : ""
        }.`;

  /** The grid hands back the full set of ticks; what gets stored is the answers. */
  const onMealSlotsChange = (next: Set<string>) => {
    setMealChoices((prev) => choicesFromMealSlots(mealDays, next, prev));
  };

  // The kitchen's limit per sitting (Settings). One booking cannot be larger
  // than it; how much of a sitting is already taken is checked on the server,
  // which can read the other bookings.
  const mealPartyLimit = rules.meals.max_diners_per_meal;
  const mealPartyMax = mealPartyLimit > 0 ? mealPartyLimit : 100;

  // Advance-booking window: officials are exempt, so the cap can be absent.
  const [checkInLimits] = useState(() => {
    const months = rules.booking.advance_booking_months;
    const limit = latestCheckIn(config.role, new Date(), months);
    return {
      min: toInstituteDateValue(new Date()),
      max: limit ? toInstituteDateValue(limit) : undefined,
      note: advanceWindowMessage(config.role, months),
    };
  });
  // The stay-length cap (Settings), applied to the check-out picker. The
  // picker blocking it is a courtesy; the schema is the rule, on the client
  // and again on the server.
  const maxNights = rules.booking.max_stay_nights;
  const durationHint = stayLengthHint(config.role, user.email, maxNights);
  const latestCheckOut = checkInDate
    ? latestCheckOutDate(checkInDate, config.role, user.email, maxNights)
    : null;

  // The room count is its own text state rather than being read off
  // `roomFields.length`, so the box can be cleared and retyped.
  const [roomCountRaw, setRoomCountRaw] = useState("1");
  const [roomCountError, setRoomCountError] = useState<string | null>(null);

  const growRooms = (target: number) => {
    for (let i = roomFields.length; i < target; i++) appendRoom(newRoom(), { shouldFocus: false });
  };

  const shrinkRooms = (target: number) => {
    for (let i = roomFields.length - 1; i >= target; i--) {
      for (const g of form.getValues(`rooms.${i}.guests`) ?? []) guestFiles.delete(g.key);
      removeRoom(i);
    }
  };

  /** Whether the rooms about to be dropped have anything typed into them. */
  const roomsHaveData = (fromIndex: number) =>
    (form.getValues("rooms") ?? [])
      .slice(fromIndex)
      .some((room) => room.guests.some((g) => g.name.trim() || g.age.trim() || g.id_number.trim()));

  const onRoomCountChange = (raw: string) => {
    setRoomCountRaw(raw);
    if (raw.trim() === "") {
      setRoomCountError("Number of rooms is required");
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      setRoomCountError("At least 1 room");
      return;
    }
    if (n > MAX_ROOMS) {
      setRoomCountError(`Maximum ${MAX_ROOMS} rooms per request`);
      return;
    }
    setRoomCountError(null);
    if (n > roomFields.length) {
      growRooms(n);
      return;
    }
    if (n < roomFields.length) {
      // Removing a room takes its guests with it, so say so before doing it.
      if (roomsHaveData(n)) {
        setRoomsToDrop(n);
        return;
      }
      shrinkRooms(n);
    }
  };

  const confirmShrink = () => {
    if (roomsToDrop === null) return;
    shrinkRooms(roomsToDrop);
    setRoomsToDrop(null);
  };

  /**
   * Remove one particular room (not just the last), with its guests. The rooms
   * after it move up - Room 3 becomes Room 2 - which is fine: the numbers are
   * only the order the requester filled them in.
   */
  const confirmRemoveRoom = () => {
    if (roomToRemove === null || roomFields.length <= 1) return;
    for (const g of form.getValues(`rooms.${roomToRemove}.guests`) ?? []) guestFiles.delete(g.key);
    removeRoom(roomToRemove);
    setRoomCountRaw(String(roomFields.length - 1));
    setRoomCountError(null);
    setRoomToRemove(null);
  };

  /** How many people are entered in a room, for the warning. */
  const peopleIn = (index: number) =>
    (form.getValues(`rooms.${index}.guests`) ?? []).filter((g) => g.name.trim() || g.age.trim() || g.id_number.trim()).length;

  const validateAndSubmit = handleSubmit((values) => {
    setAlumniCardError(null);
    setMealsError(null);

    const checkIn = wantsRooms
      ? `${values.check_in_date}T${values.check_in_time}`
      : `${effectiveCheckInDate}T${MEALS_ONLY_DAY.start}`;
    const checkOut = wantsRooms
      ? `${values.check_out_date}T${values.check_out_time}`
      : `${effectiveCheckOutDate}T${MEALS_ONLY_DAY.end}`;

    const payload = {
      service_type: serviceType,
      booking_type: values.booking_type,
      // A student or personal booking can only be paid one way, so the fixed
      // head is sent whatever the radio last held - switching from Official
      // to Personal must not carry a department budget along with it.
      debit_head: paymentHead,
      debit_details: debitPrompt ? values.debit_details : undefined,
      // Only where the head asks for it, so switching to Personal Funds
      // after ticking it does not send a declaration about nothing.
      fund_declaration: needsDeclaration ? values.fund_declaration : false,
      // No project is picked from a list any more (1 Oct 2026) - the number
      // and title are typed into the details box above, which is what the
      // invoice prints.
      project_id: null,
      // The sub-head belongs to the project; a value typed before switching
      // to another head is not sent.
      debit_subhead: needsProject(paymentHead) ? values.debit_subhead : undefined,
      // Every row, blank ones included, so a message lands on the row that is
      // wrong; the schema drops the blanks and repeats.
      copy_to_emails: values.copy_to.map((row) => row.email),
      // Only an office chooses, and only for a stay.
      office_approval:
        isOfficeRole(config.role) && !mealsOnly ? values.office_approval || null : null,
      // Sent only when they apply; the schema rejects them on any other kind
      // of booking, so a stale value cannot ride along.
      alumni_name: forAlumnus ? values.alumni_name : undefined,
      alumni_roll_number: forAlumnus ? values.alumni_roll_number : undefined,
      guest_house_id: values.guest_house_id,
      purpose_of_visit: values.purpose_of_visit,
      check_in: checkIn,
      check_out: checkOut,
      meal_guest_count: wantsRooms ? "" : values.meal_guest_count,
      // Sent only when meals were actually chosen, so a split left over from
      // a guest house that was swapped for one with no kitchen cannot ride
      // along and fail validation on a card nobody can see.
      meal_preference: null,
      meal_diet_counts: mealPlan.length > 0 && dietChosen ? dietCounts : null,
      meals: mealPlan,
      // A meals-only booking has no rooms and no guest rows at all.
      rooms: wantsRooms
        ? values.rooms.map((room) => ({
            room_type: room.room_type === "" ? null : room.room_type,
            guests: room.guests.map((g) => ({
              name: g.name,
              age: g.age,
              gender: g.gender === "" ? undefined : g.gender,
              relationship: g.relationship === "" ? undefined : g.relationship,
              // Only on an infant card, whose age must then be below the limit.
              infant: g.kind === "infant" ? true : undefined,
              // Not sent for a foreign national: the field is hidden for one,
              // so anything still in it was typed before the answer changed.
              id_number:
                g.citizenship === "other" || g.id_number === "" ? undefined : g.id_number,
              citizenship: g.citizenship,
              // Cleared rather than sent: the schema refuses a nationality on
              // an Indian citizen, so a value typed before switching back
              // would fail validation on a field the form no longer shows.
              nationality: g.citizenship === "other" ? g.nationality : undefined,
              passport_number: g.citizenship === "other" ? g.passport_number : undefined,
            })),
          }))
        : [],
      custom: values.custom,
      // DPDP (Phase 8): the tick below, recorded with the notice's version.
      privacy_consent: values.privacy_consent,
    };

    const parsed = bookingPayloadSchema(config, {
      mealsAvailable,
      requesterEmail: user.email,
      rules,
      // The names the academic record fixes, so the form applies the same
      // rule it renders: a locked parent needs no Aadhaar, and a withheld
      // relationship is refused here as well as on the server.
      guestNames,
    }).safeParse(payload);
    let hasError = false;
    if (wantsRooms && roomCountRaw.trim() === "") {
      hasError = true;
      setRoomCountError("Number of rooms is required");
    }
    if (mealsOnly && mealDates.length === 0) {
      hasError = true;
      setMealsError("Add at least one date for the kitchen to cook on");
    }
    if (dietProblem) {
      hasError = true;
      setMealsError(dietProblem);
    }
    if (!parsed.success) {
      hasError = true;
      for (const issue of parsed.error.issues) {
        // Meals are not a react-hook-form field, so their message has its own slot.
        if (
          issue.path[0] === "meals" ||
          issue.path[0] === "service_type" ||
          issue.path[0] === "meal_diet_counts"
        ) {
          setMealsError(issue.message);
          continue;
        }
        // The schema's list is the form's rows, one to one.
        if (issue.path[0] === "copy_to_emails") {
          const row = typeof issue.path[1] === "number" ? issue.path[1] : 0;
          setError(`copy_to.${row}.email` as FieldPath<FormValues>, { message: issue.message });
          continue;
        }
        setError(issue.path.join(".") as FieldPath<FormValues>, { message: issue.message });
      }
    }

    // File + custom-field requirements are enforced outside zod.
    if (wantsRooms && idDocRequired) {
      values.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          // An infant needs no ID, so none is demanded for one.
          if (isInfantEntry(g)) return;
          // Nor does a guest the academic record named (7 Oct 2026): the
          // institute has already identified them. `createBooking` applies
          // the same exemption, from the record rather than from this form.
          if (lockedNameFor(guestNames, g.relationship)) return;
          if (!guestFiles.get(g.key)) {
            hasError = true;
            setError(`rooms.${i}.guests.${j}.name` as FieldPath<FormValues>, {
              type: "file",
              message: "ID document upload is required for this guest",
            });
          }
        });
      });
    }
    if (alumniCardRequired && !alumniCard) {
      hasError = true;
      setAlumniCardError("Alumni ID card upload is mandatory");
    }
    const nextCustomErrors: Record<string, string> = {};
    for (const field of config.custom_fields) {
      const [fieldError] = validateCustomValue(field, values.custom[field.id]);
      if (fieldError) {
        hasError = true;
        nextCustomErrors[field.id] = fieldError;
      }
    }
    setCustomErrors(nextCustomErrors);
    if (hasError || !parsed.success) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    const formData = new FormData();
    formData.set("payload", JSON.stringify(parsed.data));
    if (wantsRooms) {
      values.rooms.forEach((room, i) => {
        room.guests.forEach((g, j) => {
          const file = guestFiles.get(g.key);
          if (file) formData.set(`guest_doc_${i}_${j}`, file);
        });
      });
    }
    if (alumniCard) formData.set("alumni_card", alumniCard);
    if (acceptsDebitDocument(paymentHead) && debitDocument) {
      formData.set("debit_document", debitDocument);
    }
    // The server checks again that the signed-in person is this club's
    // faculty in-charge; this only says which club.
    if (forClub) formData.set("for_club", forClub.id);
    if (onBehalf) {
      formData.set("on_behalf_of_name", values.on_behalf_of_name);
      formData.set("on_behalf_of_email", values.on_behalf_of_email);
      formData.set("on_behalf_of_phone", values.on_behalf_of_phone);
    }

    startTransition(async () => {
      const result = await createBooking(formData);
      if (result.ok) {
        toast.success(`Booking submitted - reference ${result.reference}`);
        router.push("/dashboard");
      } else {
        toast.error(result.error);
      }
    });
  });

  /**
   * Wipe the previous attempt's errors *before* react-hook-form decides
   * whether to run the callback above.
   *
   * The zod pass reports on paths that are not registered fields -
   * `check_in`, `check_out`, `rooms` - and react-hook-form only clears the
   * errors of fields it knows about. A stale error on one of those paths
   * therefore kept `formState.errors` non-empty for ever, `handleSubmit` went
   * on treating the form as invalid, and the callback that clears errors
   * never ran again: fix the date, press Submit, nothing happens. Clearing
   * here rather than inside the callback is the point - whatever is still
   * wrong is re-reported by the zod pass a moment later.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    clearErrors();
    void validateAndSubmit(event);
  };

  const err = (path: string) => {
    const parts = path.split(".");
    let node: unknown = formState.errors;
    for (const p of parts) {
      if (!node || typeof node !== "object") return undefined;
      node = (node as Record<string, unknown>)[p];
    }
    return (node as { message?: string } | undefined)?.message;
  };

  return (
    <form onSubmit={onSubmit} className="numbered-sections space-y-6">
      {/* `numbered-sections` (globals.css) numbers each card's title 1, 2, 3…
          in the order they are shown, so the numbers follow whichever
          sections this role's form actually has. */}
      {/* A club's booking, raised by its Faculty Advisor. Said at the top,
          because everything below is the club's form, not theirs. */}
      {forClub && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Booking for <span className="font-medium">{forClub.name}</span> as its Faculty Advisor.
        </p>
      )}

      {/* Why the stay is booked. It decides the approval route and how the
          stay is settled. Roles with a single option are not asked - the value
          is still recorded on the booking. */}
      {bookingTypeOptions.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Type of booking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {bookingTypeOptions.map((option) => (
                <RadioCard
                  key={option}
                  value={option}
                  title={BOOKING_TYPE_LABELS[option]}
                  description={describeBookingType(config.role, option)}
                  register={register("booking_type")}
                />
              ))}
            </div>
            <FieldError message={err("booking_type")} />
          </CardContent>
        </Card>
      ) : (
        bookingTypeOptions.length === 1 && (
          // One option is not a choice, so it is stated rather than asked.
          // The IAR Student Cell raises alumni requests and nothing else.
          <Card>
            <CardHeader>
              <CardTitle>Type of booking</CardTitle>
              <CardDescription>{describeBookingType(config.role, bookingTypeOptions[0])}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="border-l-4 border-border-strong bg-band/60 px-3 py-2 text-sm font-medium">
                {BOOKING_TYPE_LABELS[bookingTypeOptions[0]]}
              </p>
            </CardContent>
          </Card>
        )
      )}

      {/* An office chooses how its booking is approved (Phase 4). */}
      {isOfficeRole(config.role) && !mealsOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["direct", "Direct", "Straight to the Guest House Manager."],
                  [
                    "hod",
                    "Requires HOD approval",
                    hodApprovers.length > 0
                      ? `${hodApprovers.join(" or ")} approves it first.`
                      : "Nobody is set as HOD for your office yet - it would go straight to the manager.",
                  ],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors",
                    "has-checked:border-primary has-checked:bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    {...register("office_approval")}
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError message={err("office_approval")} />
          </CardContent>
        </Card>
      )}

      {/* Who pays.

          A **personal** booking is not asked (7 Oct 2026): the requester's
          own money is the only answer, so instead of a card headed
          "Debitable head" with one option in it, the form says how the stay
          is settled and nothing more. A personal *meal* booking has no
          check-out to settle anything at, so it gets no card at all. */}
      {!asksHead ? (
        !mealsOnly && (
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{PAY_AT_CHECKOUT_NOTE}</p>
            </CardContent>
          </Card>
        )
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Debitable head</CardTitle>
          <CardDescription>
            {mealsOnly ? "Which budget pays for these meals." : "Which budget pays for this stay."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fixedHead ? (
            <p className="border-l-4 border-border-strong bg-band/60 px-3 py-2 text-sm">
              <span className="font-medium">{DEBIT_HEAD_LABELS[fixedHead]}</span>
              {/* There is no checkout on a dining booking - nobody checks in -
                  so the line about settling an invoice at the desk was
                  describing something that does not happen. */}
              {!mealsOnly && fixedHead === "personal_funds" && (
                <span className="mt-1 block text-muted-foreground">{PAY_AT_CHECKOUT_NOTE}</span>
              )}
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {headOptions.map((head) => (
                  <label
                    key={head}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors",
                      "has-checked:border-primary has-checked:bg-primary/5"
                    )}
                  >
                    <input
                      type="radio"
                      value={head}
                      className="size-4 shrink-0 accent-primary"
                      {...register("debit_head")}
                    />
                    {DEBIT_HEAD_LABELS[head]}
                  </label>
                ))}
              </div>
              <FieldError message={err("debit_head")} />
              {/* Personal Funds is a choice beside Special Funds since 25 Sep
                  2026, so the note that used to follow the fixed head
                  follows the choice instead. */}
              {chosenHead === "personal_funds" && !mealsOnly && (
                <p className="text-sm text-muted-foreground">{PAY_AT_CHECKOUT_NOTE}</p>
              )}

              {/* The project is **typed**, not picked from a list (1 Oct 2026).
                  The console's list was always behind the real one - a
                  sanction that landed last week was not on it, and the
                  requester had nothing to choose. What they type is
                  snapshotted onto the booking and printed on the invoice
                  (`projectFromDetails` splits "number - title"), so nothing
                  downstream needed to change. The box itself is the
                  debit-details field below, whose prompt and mandatory star
                  follow the head. */}

              {/* The project's sub-head, typed - optional, and only with a
                  Project head. */}
              {needsProject(chosenHead) && (
                <div className="space-y-2">
                  <Label htmlFor="debit_subhead">Project sub-head (optional)</Label>
                  <Input
                    id="debit_subhead"
                    maxLength={MAX_SUBHEAD_LENGTH}
                    placeholder="e.g. Travel, Contingency, Consumables"
                    {...register("debit_subhead")}
                  />
                  <FieldError message={err("debit_subhead")} />
                </div>
              )}

              {debitPrompt && (
                <div className="space-y-2">
                  <Label htmlFor="debit_details">
                    {debitPrompt}
                    {debitDetailsMandatory ? " *" : " (optional)"}
                  </Label>
                  <Input
                    id="debit_details"
                    maxLength={300}
                    placeholder={
                      needsProject(chosenHead)
                        ? "e.g. SP/2025/017 - Grid-scale storage (Dr. A. Kumar)"
                        : "e.g. Director's discretionary fund - sanction DO/2026/114"
                    }
                    {...register("debit_details")}
                  />
                  <FieldError message={err("debit_details")} />
                </div>
              )}

              {acceptsDebitDocument(chosenHead) && (
                <div className="space-y-2">
                  <Label htmlFor="debit_document">Upload approval (optional)</Label>
                  <Input
                    id="debit_document"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setDebitDocument(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF, up to 5 MB.</p>
                </div>
              )}
            </>
          )}

          {/* Somebody else's money (8 Oct 2026, the office's ninth list).
              Inside this card rather than beside the privacy tick at the foot
              of the form: it is a statement about the head just chosen, and
              it appears and disappears with it. Personal Funds is never asked
              - the requester is the competent authority for their own money. */}
          {needsDeclaration && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background px-4 py-3.5 text-sm leading-relaxed">
              <input
                type="checkbox"
                className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-vermilion-deep"
                {...register("fund_declaration")}
              />
              <span>
                {FUND_DECLARATION}
                <FieldError message={err("fund_declaration")} />
              </span>
            </label>
          )}
        </CardContent>
      </Card>
      )}

      {onBehalf && (
        <Card>
          <CardHeader>
            <CardTitle>Booking on behalf of</CardTitle>
            <CardDescription>Recorded against your account, and names them as the guest.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="on_behalf_of_name">Guest&apos;s name *</Label>
              <Input id="on_behalf_of_name" {...register("on_behalf_of_name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="on_behalf_of_email">Email</Label>
              <Input id="on_behalf_of_email" type="email" {...register("on_behalf_of_email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="on_behalf_of_phone">Phone</Label>
              <Input id="on_behalf_of_phone" {...register("on_behalf_of_phone")} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* A dining booking is not a stay: no guest house to choose (only a
          kitchen can take it, and there is one), no check-in, no check-out.
          What it needs is a head count, a reason, and the days - which are
          picked in the Meals card below, beside the meals themselves. */}
      {mealsOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>Meal booking</CardTitle>
            <CardDescription>
              {offeredGuestHouses.length === 1
                ? `From the ${offeredGuestHouses[0].name} kitchen.`
                : "Choose the kitchen."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {offeredGuestHouses.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="guest_house_id">Kitchen *</Label>
                <NativeSelect id="guest_house_id" {...register("guest_house_id")}>
                  <option value="">Select guest house…</option>
                  {offeredGuestHouses.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
                <FieldError message={err("guest_house_id")} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="meal_guest_count">Number of people *</Label>
              {/* Typed, with steppers either side (9 Oct 2026). It was a
                  1…30 dropdown from 1 Oct, which hid the number the requester
                  had chosen behind a list they had to scroll; the box takes
                  "24" in two keystrokes. Capped at the kitchen's own limit per
                  sitting, which the schema and `createBooking` check again. */}
              <QuantityInput
                id="meal_guest_count"
                aria-label="Number of people"
                min={1}
                max={mealPartyMax}
                value={mealGuestCount}
                onChange={(raw) => setValue("meal_guest_count", raw, { shouldValidate: false })}
              />
              <FieldError message={err("meal_guest_count")} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              {/* "Purpose" renamed and made optional (1 Oct 2026): a meal
                  order needs no justification, and the box is for anything
                  the kitchen should know. */}
              <Label htmlFor="purpose_of_visit">Remarks (optional)</Label>
              <Textarea
                id="purpose_of_visit"
                rows={3}
                placeholder="Anything the kitchen should know - a guest who cannot eat wheat, a sitting time, where to serve"
                {...register("purpose_of_visit")}
              />
              <FieldError message={err("purpose_of_visit")} />
            </div>
            <FieldError message={err("check_in")} />
            <FieldError message={err("check_out")} />
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Stay details</CardTitle>
          {offeredGuestHouses.length === 1 && (
            <CardDescription>
              {forAlumnus
                ? ALUMNI_GUEST_HOUSE_NOTE
                : config.role === "student"
                  ? STUDENT_GUEST_HOUSE_NOTE
                  : `Your role can book the ${offeredGuestHouses[0].name} guest house only.`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="guest_house_id">Guest house *</Label>
            {/* One guest house is not a choice, so it is not a dropdown.
                A disabled <select> looked like a question that had somehow
                been answered wrongly - the IAR Student Cell, whose alumni
                bookings are always Bageshri, reported being told to select a
                guest house it was never offered. The name is stated and the
                id travels in a hidden input, which is a real registered field
                and so cannot be left empty by anything the browser does to a
                disabled control. */}
            {guestHouseLocked ? (
              <>
                <input
                  type="hidden"
                  {...register("guest_house_id")}
                  // Carried in the server-rendered HTML too, so the field is
                  // never momentarily empty between render and hydration.
                  defaultValue={offeredGuestHouses[0].id}
                />
                <p
                  id="guest_house_id"
                  className="border-input flex h-9 w-full items-center rounded-md border bg-muted/40 px-3 py-1 text-sm"
                >
                  {offeredGuestHouses[0].name}
                </p>
              </>
            ) : (
              <NativeSelect id="guest_house_id" {...register("guest_house_id")}>
                <option value="">Select guest house…</option>
                {offeredGuestHouses.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            {forAlumnus && <p className="text-xs text-muted-foreground">{ALUMNI_GUEST_HOUSE_NOTE}</p>}
            {overridingHouse && (
              <p className="border-l-4 border-saffron bg-notice px-3 py-2 text-xs text-ink">
                An exception to the alumni policy, recorded in the booking&apos;s log.
              </p>
            )}
            <FieldError message={err("guest_house_id")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rooms_requested">Number of rooms *</Label>
            <QuantityInput
              id="rooms_requested"
              aria-label="Number of rooms"
              min={1}
              max={MAX_ROOMS}
              value={roomCountRaw}
              onChange={onRoomCountChange}
            />
            <FieldError message={roomCountError ?? undefined} />
            <FieldError message={err("rooms")} />
            {config.banner_text && (
              <p className="border-l-4 border-saffron bg-notice px-3 py-2 text-sm text-ink">
                {config.banner_text}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="check_in_date">Check-in date &amp; time *</Label>
            <Input
              id="check_in_date"
              type="date"
              min={checkInLimits.min}
              max={checkInLimits.max}
              {...register("check_in_date")}
            />
            <TimeSelect
              label="Check-in"
              value={checkInTime}
              onChange={(v) => setValue("check_in_time", v)}
            />
            {checkInLimits.note && (
              <p className="text-xs text-muted-foreground">{checkInLimits.note}.</p>
            )}
            <FieldError message={err("check_in")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="check_out_date">Check-out date &amp; time *</Label>
            <Input
              id="check_out_date"
              type="date"
              min={checkInDate || checkInLimits.min}
              max={latestCheckOut ?? undefined}
              {...register("check_out_date")}
            />
            <TimeSelect
              label="Check-out"
              value={checkOutTime}
              onChange={(v) => setValue("check_out_time", v)}
            />
            {durationHint && <p className="text-xs text-muted-foreground">{durationHint}</p>}
            <FieldError message={err("check_out")} />
          </div>

          {stay && (
            <div
              className={
                stay.problem
                  ? "space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm sm:col-span-2"
                  : "space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm sm:col-span-2"
              }
            >
              <p>
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  Your stay
                </span>
                <br />
                <span className="font-medium">{stay.from}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium">{stay.to}</span>
                {!stay.problem && (
                  <span className="text-muted-foreground"> · {stay.duration}</span>
                )}
              </p>
              {stay.problem && <p className="text-destructive">{stay.problem}</p>}
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="purpose_of_visit">Purpose of visit *</Label>
            <Textarea
              id="purpose_of_visit"
              rows={3}
              {...register("purpose_of_visit")}
            />
            <FieldError message={err("purpose_of_visit")} />
          </div>
        </CardContent>
      </Card>
      )}

      {/* Told, not signed for. A guest who arrives with an animal has to be
          turned away at the desk, so the notice is given prominence here and
          repeated in every booking mail - but there is no tick box: a tick
          proves nothing a notice does not, and the office asked for it to go.
          **Not on a dining booking** (1 Oct 2026): nobody stays, so there is
          no animal to turn away, and the notice was the largest thing on a
          form for ordering lunch. */}
      {wantsRooms && (
      <Card className="border-amber-300 dark:border-amber-900">
        <CardContent className="space-y-3 pt-6">
          <div className="flex gap-3 border-l-4 border-saffron bg-notice p-4 text-ink">
            <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{PETS_POLICY_NOTICE}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* What it costs, from the office's own rate sheet (7 Oct 2026). Beside
          the stay rather than at the end: the requester is choosing a guest
          house and a number of rooms a few lines above, and the rates are
          part of that choice. The same resolution the invoice uses, so the
          figure quoted here is the figure charged. */}
      <Card>
        <CardHeader>
          <CardTitle>{mealsOnly ? "Meal rates" : "Rates"}</CardTitle>
        </CardHeader>
        <CardContent>
          <TariffTable
            previews={tariffPreviews}
            guestHouseId={selectedGuestHouseId}
            bookingType={bookingType}
            guestHouseName={selectedGuestHouse?.name}
            pricesIncludeGst={rules.invoice.prices_include_gst}
          />
        </CardContent>
      </Card>

      {wantsRooms && (
        <Card>
          <CardHeader>
            <CardTitle>Room availability</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingAvailability
              guestHouseId={selectedGuestHouseId}
              date={checkInDate}
              guestHouseName={guestHouses.find((g) => g.id === selectedGuestHouseId)?.name}
            />
          </CardContent>
        </Card>
      )}

      {offerMeals && (
        <Card>
          <CardHeader>
            <CardTitle>{mealsOnly ? "Days and meals" : "Meals (optional)"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Each person's own preference (1 Oct 2026). It used to be one
                radio for the whole party, so a group of thirty with two
                vegetarians was booked as non-vegetarian and the kitchen
                cooked thirty non-vegetarian plates. Counts rather than a row
                per person: a dining booking has no guest list at all, only a
                head count, and the kitchen cooks to numbers. */}
            {mealPlan.length > 0 && (
              <fieldset className="space-y-2 rounded-md border border-border-strong bg-band/40 p-3">
                <legend className="px-1.5 text-sm font-medium">Meal preferences *</legend>
                {/* Answering one box fills the other with the rest (7 Oct
                    2026, the office's eighth list). The two always have to
                    add up to the head count, so the second question only
                    ever has one right answer - asking it twice was asking
                    the requester to do the subtraction, and the commonest
                    way to get "the two have to add up to N" was to answer
                    one box and stop. Either box fills the other, so a
                    correction to the first still works. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="meal_veg_count">{MEAL_PREFERENCE_LABELS.veg}</Label>
                    <QuantityInput
                      id="meal_veg_count"
                      aria-label={MEAL_PREFERENCE_LABELS.veg}
                      min={0}
                      max={Math.max(mealHeadCount, 1)}
                      value={vegCountRaw}
                      onChange={(raw) => {
                        setValue("meal_veg_count", raw, { shouldValidate: false });
                        fillOtherDietCount("meal_non_veg_count", raw);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="meal_non_veg_count">{MEAL_PREFERENCE_LABELS.non_veg}</Label>
                    <QuantityInput
                      id="meal_non_veg_count"
                      aria-label={MEAL_PREFERENCE_LABELS.non_veg}
                      min={0}
                      max={Math.max(mealHeadCount, 1)}
                      value={nonVegCountRaw}
                      onChange={(raw) => {
                        setValue("meal_non_veg_count", raw, { shouldValidate: false });
                        fillOtherDietCount("meal_veg_count", raw);
                      }}
                    />
                  </div>
                </div>
                {dietChosen && (
                  <p className={cn("text-xs", dietProblem ? "text-destructive" : "text-muted-foreground")}>
                    {dietProblem ?? `${describeDietCounts(dietCounts)} - ${dietTotal(dietCounts)} of ${mealHeadCount}.`}
                  </p>
                )}
              </fieldset>
            )}

            {mealsOnly ? (
              <>
                <MealDatesPicker
                  dates={mealDates}
                  slots={mealSlots}
                  onSlotsChange={onMealSlotsChange}
                  onDatesChange={setMealDates}
                  now={now}
                  windows={rules.meals.windows}
                  minDate={checkInLimits.min}
                  maxDate={checkInLimits.max}
                />
                <p className="text-sm text-muted-foreground">{mealSummary}</p>
              </>
            ) : !mealCheckIn ? (
              <EmptyNote>Choose your dates to pick meals for each day.</EmptyNote>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onMealSlotsChange(
                        new Set(
                          mealDays.flatMap((day) =>
                            MEAL_KEYS.filter((meal) => day.available[meal]).map((meal) =>
                              mealSlot(day.date, meal)
                            )
                          )
                        )
                      )
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onMealSlotsChange(new Set())}
                  >
                    Clear all
                  </Button>
                </div>
                <MealPlanGrid
                  days={mealDays}
                  checkIn={mealCheckIn}
                  slots={mealSlots}
                  onChange={onMealSlotsChange}
                  windows={rules.meals.windows}
                  now={now}
                />
                <p className="text-sm text-muted-foreground">{mealSummary}</p>
              </>
            )}
            <FieldError message={mealsError ?? undefined} />
          </CardContent>
        </Card>
      )}

      {wantsRooms && (
        <Card>
          <CardHeader>
            <CardTitle>Guests, room by room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-l-4 border-border-strong bg-band/60 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{totals}</span> on this request.
            </div>

            {roomFields.map((room, roomIndex) => (
              <RoomCard
                key={room.id}
                roomIndex={roomIndex}
                control={control}
                register={register}
                config={config}
                parentPresent={parentPresent}
                usedUnique={usedUnique}
                idDocRequired={idDocRequired}
                guestFiles={guestFiles}
                err={err}
                capacity={rules.capacity}
                guestNames={guestNames}
                setValue={setValue}
                onRemove={roomFields.length > 1 ? () => setRoomToRemove(roomIndex) : undefined}
              />
            ))}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={roomFields.length >= MAX_ROOMS}
                onClick={() => onRoomCountChange(String(roomFields.length + 1))}
              >
                <PlusIcon />
                Add room
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {config.custom_fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Additional information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {config.custom_fields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                register={register}
                error={customErrors[field.id]}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {showAlumniSection && (
        <Card>
          <CardHeader>
            <CardTitle>Alumni verification</CardTitle>
            <CardDescription>
              {forAlumnus
                ? "For the IAR Office to check against the ID card."
                : `Upload your Alumni ID card${alumniCardRequired ? " (mandatory)" : " (optional)"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {forAlumnus && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="alumni_name">Alumnus full name *</Label>
                  <Input
                    id="alumni_name"
                    placeholder="As printed on the Alumni ID card"
                    {...register("alumni_name")}
                  />
                  <FieldError message={err("alumni_name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alumni_roll_number">Student / roll number *</Label>
                  <Input
                    id="alumni_roll_number"
                    placeholder="e.g. 101601023"
                    {...register("alumni_roll_number")}
                  />
                  <FieldError message={err("alumni_roll_number")} />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="alumni_card">
                Alumni ID card{alumniCardRequired ? " *" : " (optional)"}
              </Label>
              <Input
                id="alumni_card"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setAlumniCard(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF, up to 5 MB.</p>
              <FieldError message={alumniCardError ?? undefined} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Copy to (24 Sep 2026): anyone else who should hear about this
          booking - a secretary, the guest, a colleague. Every mail the
          requester gets about it is copied to them. As many as are needed,
          up to a ceiling a crafted request cannot run past. */}
      <Card>
        <CardHeader>
          <CardTitle>Copy to (optional)</CardTitle>
          <CardDescription>
            Copied on every mail you get about this booking.
            {defaultCopyTo.length > 0 && " The secretary's mailbox is filled in; clear it to remove."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {copyToFields.map((field, i) => (
            <div key={field.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor={`copy_to_${i}`} className="sr-only">
                  Copy to address {i + 1}
                </Label>
                <Input
                  id={`copy_to_${i}`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="name@example.com"
                  {...register(`copy_to.${i}.email`)}
                />
                {copyToFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove copy-to address ${i + 1}`}
                    onClick={() => removeCopyTo(i)}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
              <FieldError message={err(`copy_to.${i}.email`)} />
            </div>
          ))}
          <FieldError message={err("copy_to_emails")} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={copyToFields.length >= MAX_COPY_TO_EMAILS}
            onClick={() => appendCopyTo({ email: "" }, { shouldFocus: true })}
          >
            <MailPlusIcon />
            Add another email
          </Button>
          {copyToFields.length >= MAX_COPY_TO_EMAILS && (
            <p className="text-xs text-muted-foreground">
              {MAX_COPY_TO_EMAILS} addresses is the most one booking can copy.
            </p>
          )}
        </CardContent>
      </Card>

      {/* What is about to be ordered, in words, at the end of the form
          (1 Oct 2026 - "add a confirmation message at the end of the meal
          booking, basically what all we booked"). A dining booking is a list
          of numbers spread over three cards; this reads it back as one
          sentence per fact so the requester can check it before submitting,
          and it is live, so it is never the previous answer. */}
      {mealsOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm your meal booking</CardTitle>
          </CardHeader>
          <CardContent>
            {mealPlan.length === 0 ? (
              <EmptyNote>
                Nothing is ordered yet - add a date above and tick the meals you would like.
              </EmptyNote>
            ) : (
              <dl className="divide-y divide-border border-y border-border text-sm">
                <SummaryRow label="Kitchen">
                  {guestHouses.find((g) => g.id === selectedGuestHouseId)?.name ?? "-"}
                </SummaryRow>
                <SummaryRow label="People">
                  {mealHeadCount} {mealHeadCount === 1 ? "person" : "people"}
                </SummaryRow>
                <SummaryRow label="Preferences">
                  {dietProblem ? (
                    <span className="text-destructive">{dietProblem}</span>
                  ) : (
                    describeDietCounts(dietCounts)
                  )}
                </SummaryRow>
                <SummaryRow label={`Days and meals (${totalMeals(mealPlan)} sittings)`}>
                  <ul className="space-y-0.5">
                    {describeMealDays(mealPlan).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </SummaryRow>
                <SummaryRow label="Charged to">
                  {paymentHead
                    ? describeDebit({
                        debit_head: paymentHead,
                        debit_details: debitPrompt ? debitDetailsText || null : null,
                        debit_subhead: null,
                      })
                    : "Not chosen yet"}
                </SummaryRow>
                {purposeText.trim() !== "" && (
                  <SummaryRow label="Remarks">{purposeText}</SummaryRow>
                )}
              </dl>
            )}
          </CardContent>
        </Card>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background px-4 py-3.5 text-sm leading-relaxed">
        <input
          type="checkbox"
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-vermilion-deep"
          {...register("privacy_consent")}
        />
        <span>
          I have read how these details are used, who can see them and how long they are kept, and I
          agree to the guest house holding them.{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-4">
            Privacy notice
          </a>
          .
          <FieldError message={err("privacy_consent")} />
        </span>
      </label>

      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
        <Button type="button" variant="outline" size="lg" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
        <Button type="submit" variant="brand" size="lg" className="px-5" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit booking request"}
        </Button>
      </div>

      <ConfirmDialog
        open={roomsToDrop !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRoomsToDrop(null);
            // The box still shows the number that was typed, so put it back
            // to what the form actually has.
            setRoomCountRaw(String(roomFields.length));
          }
        }}
        title="Remove rooms and their guests?"
        description={
          roomsToDrop === null
            ? ""
            : `Reducing this booking to ${roomsToDrop} room${roomsToDrop === 1 ? "" : "s"} removes the guests entered in the rooms below it.`
        }
        consequences={
          roomsToDrop === null
            ? undefined
            : roomFields
                .slice(roomsToDrop)
                .map((_, i) => `Room ${roomsToDrop + i + 1} and everyone entered in it`)
        }
        confirmLabel="Remove rooms"
        onConfirm={confirmShrink}
      />

      <ConfirmDialog
        open={roomToRemove !== null}
        onOpenChange={(open) => !open && setRoomToRemove(null)}
        title={roomToRemove === null ? "Remove room?" : `Remove Room ${roomToRemove + 1}?`}
        description={
          roomToRemove === null
            ? ""
            : peopleIn(roomToRemove) > 0
              ? `Everyone entered in Room ${roomToRemove + 1} is removed with it, including any ID documents attached. This cannot be undone.`
              : `Room ${roomToRemove + 1} is empty, so nothing else is lost.`
        }
        consequences={
          roomToRemove === null
            ? undefined
            : [
                ...(peopleIn(roomToRemove) > 0
                  ? [`${peopleIn(roomToRemove)} guest${peopleIn(roomToRemove) === 1 ? "" : "s"} entered in this room`]
                  : []),
                ...(roomToRemove < roomFields.length - 1
                  ? [`The rooms after it move up - Room ${roomToRemove + 2} becomes Room ${roomToRemove + 1}`]
                  : []),
              ]
        }
        confirmLabel="Remove room"
        onConfirm={confirmRemoveRoom}
      />
    </form>
  );
}

/**
 * One room's card: the occupancy rule, its guests, and the two Add buttons
 * that stop when the rule is reached.
 *
 * Its own field array, nested under `rooms.<i>.guests`, so adding a guest to
 * Room 2 leaves Room 1 alone.
 */
function RoomCard({
  roomIndex,
  control,
  register,
  config,
  parentPresent,
  usedUnique,
  idDocRequired,
  guestFiles,
  err,
  capacity,
  guestNames,
  setValue,
  onRemove,
}: {
  roomIndex: number;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  config: RoleFormConfig;
  parentPresent: boolean;
  /** Unique relationships already used anywhere on the request. */
  usedUnique: string[];
  idDocRequired: boolean;
  guestFiles: Map<string, File>;
  err: (path: string) => string | undefined;
  capacity: CapacityRules;
  guestNames: GuestNameRule;
  setValue: UseFormSetValue<FormValues>;
  /** Absent on the only room: a booking always has at least one. */
  onRemove?: () => void;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `rooms.${roomIndex}.guests`,
  });
  const watched = useWatch({ control, name: `rooms.${roomIndex}.guests` }) ?? [];
  const infants = countInfants(watched.map((g) => ({ is_infant: isInfantEntry(g) })));
  const guests = watched.length - infants;
  // "Guest 2", "Infant 1": each card numbered among its own kind.
  const numberOf = (index: number) => {
    const infant = isInfantEntry(watched[index]);
    return watched.slice(0, index + 1).filter((g) => isInfantEntry(g) === infant).length;
  };

  const guestBlocked = addGuestBlockedReason(guests, infants, capacity);
  const infantBlocked = addInfantBlockedReason(infants, guests, capacity);

  return (
    <fieldset className="rounded-lg border border-border-strong px-4 pt-2 pb-4 sm:px-5">
      <legend className="px-1.5 font-heading text-[1.0625rem] font-semibold text-ink">Room {roomIndex + 1}</legend>

      {/* No room-type question: the guest houses have only double sharing
          rooms, so "preference" was a choice with one real answer. The
          manager still allocates the actual room. */}
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{guests}</span> guest
          {guests === 1 ? "" : "s"}
          {infants > 0 && (
            <>
              {" "}
              + <span className="font-medium text-foreground">{infants}</span> infant
            </>
          )}{" "}
          in this room.
        </p>
      </div>

      <div className="space-y-4">
        {fields.map((field, guestIndex) => (
          <GuestRow
            key={field.id}
            roomIndex={roomIndex}
            guestIndex={guestIndex}
            control={control}
            register={register}
            config={config}
            parentPresent={parentPresent}
            usedUnique={usedUnique}
            idDocRequired={idDocRequired}
            guestKey={watched[guestIndex]?.key ?? field.id}
            guestFiles={guestFiles}
            err={err}
            number={numberOf(guestIndex)}
            guestNames={guestNames}
            setValue={setValue}
            canRemove={fields.length > 1}
            onRemove={() => {
              const key = watched[guestIndex]?.key;
              if (key) guestFiles.delete(key);
              remove(guestIndex);
            }}
          />
        ))}
      </div>

      <FieldError message={err(`rooms.${roomIndex}.guests`)} />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={Boolean(guestBlocked)}
          onClick={() => append(newGuest(), { shouldFocus: false })}
        >
          <PlusIcon />
          Add guest
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={Boolean(infantBlocked)}
          onClick={() => append(newGuest("infant"), { shouldFocus: false })}
        >
          <PlusIcon />
          Add infant (below {INFANT_AGE_LIMIT})
        </Button>
        {(guestBlocked || infantBlocked) && (
          <p className="text-xs text-muted-foreground">{guestBlocked ?? infantBlocked}</p>
        )}
        {/* Last in the row and pushed to the end, so it sits on the same line
            as the Add buttons inside the card instead of straddling its border. */}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove Room ${roomIndex + 1}`}
          >
            <Trash2Icon />
            Remove room
          </Button>
        )}
      </div>
    </fieldset>
  );
}

/** One guest inside a room card, including their citizenship. */
function GuestRow({
  roomIndex,
  guestIndex,
  control,
  register,
  config,
  parentPresent,
  usedUnique,
  idDocRequired,
  guestKey,
  guestFiles,
  err,
  number,
  guestNames,
  setValue,
  canRemove,
  onRemove,
}: {
  roomIndex: number;
  guestIndex: number;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  config: RoleFormConfig;
  parentPresent: boolean;
  /** Unique relationships already used anywhere on the request. */
  usedUnique: string[];
  idDocRequired: boolean;
  guestKey: string;
  guestFiles: Map<string, File>;
  err: (path: string) => string | undefined;
  /** This card's number among its own kind: Guest 2, Infant 1. */
  number: number;
  guestNames: GuestNameRule;
  setValue: UseFormSetValue<FormValues>;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const base = `rooms.${roomIndex}.guests.${guestIndex}` as const;
  const gf = config.guest_fields;
  const kind = useWatch({ control, name: `${base}.kind` });
  const citizenship = useWatch({ control, name: `${base}.citizenship` });
  const age = useWatch({ control, name: `${base}.age` });
  const relationship = useWatch({ control, name: `${base}.relationship` });
  const infantCard = kind === "infant";
  const isInfant = isInfantEntry({ age, kind });
  const star = (mode: "required" | "optional" | "hidden") => (mode === "required" ? " *" : "");
  const set = { shouldDirty: true, shouldValidate: false } as const;
  /**
   * Why an option is not selectable here, or null when it is. Two reasons,
   * and they read differently on the option, so the requester is told which
   * rule they have met rather than just finding a greyed line:
   *
   *  - a dependent (sibling, grandparent) with no parent on the request yet;
   *  - a one-of-each relationship another guest already holds. Never this
   *    guest's own answer - taking away the value in the box would silently
   *    clear it.
   */
  const lockReason = (option: string): string | null => {
    if (!parentPresent && config.dependent_relationships.includes(option)) {
      return "needs a parent on this request";
    }
    if (usedUnique.includes(option) && relationship?.trim() !== option) {
      return "already on this request";
    }
    return null;
  };

  // ---- names the academic record fixes (7 Oct 2026)

  /**
   * **Nothing is filled in from a list any more.** Choosing a relationship
   * stopped filling the name in on 1 Oct 2026, and the "Fill in…" shortcut
   * that replaced it went on 7 Oct, at the office's request - along with
   * "Yourself", for every role.
   *
   * What is left is narrower and firmer: where the requester's academic
   * record names a parent, that name is **not a question**. The box carries
   * it, read-only, and the server writes the record's name whatever arrives
   * (`guestNameRule`, `lockedNameFor`). A sibling or a grandparent is typed
   * by hand exactly as before.
   */
  const lockedName = lockedNameFor(guestNames, relationship);
  const relationshipField = register(`${base}.relationship`);
  // Keep the box and the payload holding the record's name: the field is
  // read-only, so nothing else would ever set it. Written from the change
  // event on the relationship, never from an effect.
  const onRelationshipChange = (value: string) => {
    const fixed = lockedNameFor(guestNames, value);
    if (fixed && gf.name !== "hidden") setValue(`${base}.name`, fixed, set);
  };

  return (
    <div className={cn("rounded-md border p-4", infantCard ? "border-saffron/60 bg-notice/60" : "border-border bg-band/40")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {infantCard ? `Infant ${number}` : `Guest ${number}`}
          {isInfant && (
            <span className="tag-yellow ml-2 rounded-xs px-1.5 py-px text-xs font-semibold">
              {infantCard ? `Below ${INFANT_AGE_LIMIT} · shares a guardian's bed · no ID needed` : "Infant - shares a bed, no ID needed"}
            </span>
          )}
        </p>
        {/* The "Fill in…" shortcut that stood here until 7 Oct 2026 is gone,
            for every role, at the office's request - "Yourself" with it. A
            parent's name is no longer something to fill in: where the record
            has it, the box below carries it and cannot be edited. */}
        <div className="ml-auto flex items-center gap-1">
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${infantCard ? "infant" : "guest"} ${number} from room ${roomIndex + 1}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {gf.name !== "hidden" && (
          <div className="space-y-2">
            <Label>Name{star(gf.name)}</Label>
            {/* Where the academic record names this relationship, the name is
                the institute's and not the requester's to change - so the box
                shows it and is read-only rather than being left open and
                checked afterwards. It stays a registered field, so the value
                travels with the submission; the server writes the record's
                name regardless. */}
            <Input
              placeholder={infantCard ? "Infant's full name" : "Full name"}
              readOnly={lockedName !== null}
              aria-readonly={lockedName !== null || undefined}
              className={lockedName !== null ? "bg-muted/50" : undefined}
              {...register(`${base}.name`)}
            />
            {lockedName !== null && (
              <p className="text-xs text-muted-foreground">{LOCKED_NAME_HINT}</p>
            )}
            <FieldError message={err(`${base}.name`)} />
          </div>
        )}
        {infantCard ? (
          <div className="space-y-2">
            {/* A list rather than a number box: an infant's age is below the
                limit by definition, so nothing else is offered. */}
            <Label>Age *</Label>
            <NativeSelect {...register(`${base}.age`)}>
              <option value="">Select…</option>
              {Array.from({ length: INFANT_AGE_LIMIT }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Below 1 year" : `${n} year${n === 1 ? "" : "s"}`}
                </option>
              ))}
            </NativeSelect>
            <FieldError message={err(`${base}.age`)} />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Always shown - the age is what decides whether this person is an
                infant, and the per-room limit counts the two separately - but
                mandatory only where the role's form says so. Left blank on a
                form where it is optional, the guest is an adult. */}
            <Label>Age{star(gf.age)}</Label>
            <Input type="number" min={0} max={120} {...register(`${base}.age`)} />
            {gf.age !== "required" && !age?.trim() && (
              <p className="text-xs text-muted-foreground">
                Needed for a child below {INFANT_AGE_LIMIT}.
              </p>
            )}
            <FieldError message={err(`${base}.age`)} />
          </div>
        )}
        {gf.gender !== "hidden" && (
          <div className="space-y-2">
            <Label>Gender{star(gf.gender)}</Label>
            <NativeSelect {...register(`${base}.gender`)}>
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </NativeSelect>
            <FieldError message={err(`${base}.gender`)} />
          </div>
        )}
        {gf.relationship !== "hidden" && (
          <div className="space-y-2">
            <Label>Relationship{star(gf.relationship)}</Label>
            {/* An infant gets a text box whatever the role's style is. The
                dropdown lists the relationships an adult guest can have to
                the requester; "Nephew", "Niece", "Cousin's daughter" are not
                on it, and a child who has to be typed as "Siblings" to get
                past the form tells the desk the wrong thing. */}
            {config.relationship_style === "dropdown" && !isInfant ? (
              <NativeSelect
                {...relationshipField}
                onChange={(e) => {
                  relationshipField.onChange(e);
                  onRelationshipChange(e.target.value);
                }}
              >
                <option value="">Select…</option>
                {/* A relationship the record rules out is not offered at all
                    (7 Oct 2026): there would be no name to lock it to, and
                    offering it would let a typed parent back in through the
                    one door this closes. Guardian is the mirror - it appears
                    only where the record names neither parent. */}
                {config.relationship_options
                  .filter((r) => !isRelationshipWithheld(guestNames, r))
                  .map((r) => {
                    const locked = lockReason(r);
                    return (
                      <option
                        key={r}
                        value={r}
                        disabled={Boolean(locked)}
                        className={locked ? "text-muted-foreground opacity-50" : undefined}
                      >
                        {locked ? `${r} - ${locked}` : r}
                      </option>
                    );
                  })}
              </NativeSelect>
            ) : (
              <Input
                placeholder={
                  isInfant ? "e.g. Daughter, niece…" : "e.g. Colleague, collaborator…"
                }
                {...relationshipField}
              />
            )}
            <FieldError message={err(`${base}.relationship`)} />
          </div>
        )}

        <div className="space-y-2">
          <Label>Citizenship *</Label>
          <NativeSelect {...register(`${base}.citizenship`)}>
            <option value="indian">{CITIZENSHIP_LABELS.indian}</option>
            <option value="other">{CITIZENSHIP_LABELS.other}</option>
          </NativeSelect>
          <FieldError message={err(`${base}.citizenship`)} />
        </div>

        {/* Rendered only for a foreign national, and cleared on submit when
            the answer changes back, so a stale value cannot ride along. */}
        {citizenship === "other" && (
          <>
            <div className="space-y-2">
              <Label>Nationality / Country *</Label>
              <NativeSelect {...register(`${base}.nationality`)}>
                <option value="">Select country…</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <FieldError message={err(`${base}.nationality`)} />
            </div>
            <div className="space-y-2">
              <Label>Passport number *</Label>
              <Input
                placeholder="As printed on the passport"
                className="uppercase"
                {...register(`${base}.passport_number`)}
              />
              <FieldError message={err(`${base}.passport_number`)} />
            </div>
          </>
        )}

        {/* A foreign national's passport is their identity document, so the
            Aadhaar field is not shown for one - asking for both would make a
            foreign guest unbookable on every form that requires an ID. */}
        {gf.id_number !== "hidden" && !isInfant && citizenship !== "other" && (
          <div className="space-y-2">
            {/* Optional for a guest the record named (7 Oct 2026) - the
                institute has already identified them, so asking for a
                document as well is asking the requester to prove what the
                record says. Still asked of a sibling or a grandparent, who
                were typed by hand. */}
            <Label>
              Aadhaar number
              {lockedName !== null ? " (optional)" : star(gf.id_number)}
            </Label>
            <Input
              inputMode="numeric"
              placeholder="1234 5678 9012"
              {...register(`${base}.id_number`)}
            />
            <p className="text-xs text-muted-foreground">{AADHAAR_DIGITS} digits.</p>
            <FieldError message={err(`${base}.id_number`)} />
          </div>
        )}
        {gf.id_document !== "hidden" && !isInfant && (
          <div className="space-y-2">
            <Label>
              ID document{idDocRequired && lockedName === null ? " *" : " (optional)"}
            </Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) guestFiles.set(guestKey, file);
                else guestFiles.delete(guestKey);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Whether a form row is an infant: a card made by "Add infant", or a guest
 * card whose typed age is below the limit (the server's rule - the age
 * decides).
 */
function isInfantEntry(guest: { age?: string; kind?: GuestFields["kind"] } | undefined): boolean {
  if (guest?.kind === "infant") return true;
  const raw = guest?.age?.trim();
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n < INFANT_AGE_LIMIT;
}

/** A radio rendered as a selectable card, used for all three top-level choices. */
function RadioCard({
  value,
  title,
  description,
  register,
}: {
  value: string;
  title: string;
  description: string;
  register: UseFormRegisterReturn;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors",
        "has-checked:border-primary has-checked:bg-primary/5"
      )}
    >
      <input
        type="radio"
        value={value}
        className="mt-0.5 size-4 shrink-0 accent-primary"
        {...register}
      />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function CustomFieldInput({
  field,
  register,
  error,
}: {
  field: CustomField;
  register: UseFormRegister<FormValues>;
  error?: string;
}) {
  const name = `custom.${field.id}` as FieldPath<FormValues>;
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" id={field.id} className="size-4 accent-primary" {...register(name)} />
        <Label htmlFor={field.id}>{label}</Label>
        <FieldError message={error} />
      </div>
    );
  }

  return (
    <div className={field.type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label htmlFor={field.id}>{label}</Label>
      {field.type === "textarea" ? (
        <Textarea id={field.id} rows={3} {...register(name)} />
      ) : field.type === "select" ? (
        <NativeSelect id={field.id} {...register(name)}>
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input
          id={field.id}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          {...register(name)}
        />
      )}
      <FieldError message={error} />
    </div>
  );
}

/** One fact of the meal-booking summary: its label, then what was chosen. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[11rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="border-l-4 border-destructive pl-2.5 text-sm font-semibold text-destructive">{message}</p>;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

