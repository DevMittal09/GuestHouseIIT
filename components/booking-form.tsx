"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
  type UseFormRegister,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { createBooking } from "@/app/actions/bookings";
import { BookingAvailability } from "@/components/booking-availability";
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
  addGuestBlockedReason,
  addInfantBlockedReason,
  countInfants,
  describeTotals,
  INFANT_AGE_LIMIT,
  roomOccupancyNotice,
  ROOM_TYPE_LABELS,
} from "@/lib/occupancy";
import {
  AADHAAR_DIGITS,
  advanceWindowMessage,
  bookingPayloadSchema,
  checkOutOrderError,
  infantHelpText,
} from "@/lib/booking-schema";
import { DEFAULT_RULES, type CapacityRules, type Rules } from "@/lib/settings";
import {
  hasQualifyingParent,
  parentDependencyHint,
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
  MANAGER_HELP_LINE,
  PETS_POLICY_NOTICE,
  stayLengthHint,
  ALUMNI_GUEST_HOUSE_NOTE,
} from "@/lib/policy";
import {
  declinedFromMealSlots,
  describeMeals,
  MEAL_KEYS,
  mealPlanFromSlots,
  mealSlot,
  mealSlotsFromDeclined,
  stayMealDays,
} from "@/lib/meals";
import { formatInstituteDateTime, instituteDate, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { isOfficeRole, latestCheckIn } from "@/lib/workflow";
import { canBookOnBehalf, canOverrideGuestHousePolicy } from "@/lib/access";
import {
  debitDetailsPrompt,
  fixedDebitHead,
  needsDebitDocument,
  needsProject,
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
  type MealPreference,
  type Profile,
  type ServiceType,
} from "@/lib/types";

interface GuestFields {
  /**
   * A stable id for this row, used to key its uploaded file. Field-array
   * indices shift when a row above is removed, so they cannot be the key —
   * removing Room 1's first guest would otherwise hand their ID document to
   * the person below them.
   */
  key: string;
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
  /** Asked first: whether a room is involved changes the rest of the form. */
  /** Asked next: it decides the approval route and how the stay is settled. */
  booking_type: BookingType;
  /** Which budget pays. Ignored when the booking can only be paid one way. */
  debit_head: "" | DebitHead;
  /** The case for a Special Budget. */
  debit_details: string;
  /** The project for a Project head, from the console's list. */
  project_id: string;
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
  meal_preference: "" | MealPreference;
  rooms: RoomFields[];
  custom: Record<string, string | boolean>;
}

function newGuest(): GuestFields {
  return {
    key: crypto.randomUUID(),
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
  rules = DEFAULT_RULES,
  debitHeads = { room: {}, dining: {} },
  projects = [],
  hodApprovers = [],
}: {
  /**
   * The debitable heads this requester may use per booking type, for rooms and
   * for dining — computed on the server (`bookingContextFor`) from Settings, so
   * the form offers exactly what the server will accept.
   */
  debitHeads?: { room: DebitHeadsByType; dining: DebitHeadsByType };
  /** Active projects, for the Project head. */
  projects?: { id: string; label: string }[];
  /** Who would give HOD approval, by name — for an office's choice. */
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
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Files live outside RHF: a stable Map keyed by each guest row's own `key`.
  const [guestFiles] = useState(() => new Map<string, File>());
  const [alumniCard, setAlumniCard] = useState<File | null>(null);
  // The sanction behind a Special Budget, uploaded with the request.
  const [debitDocument, setDebitDocument] = useState<File | null>(null);
  const [debitDocumentError, setDebitDocumentError] = useState<string | null>(null);
  const [alumniCardError, setAlumniCardError] = useState<string | null>(null);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  // Meal choices live outside react-hook-form as "date|meal" keys (`mealSlot`):
  // the grid's rows follow the stay dates, which fixed field paths cannot. What
  // is held is the meals turned *off*, because every meal the stay covers is
  // ticked once a preference is chosen — see `mealSlotsFromDeclined`. Storing
  // the ticks instead cannot tell a meal the requester unticked from one that
  // was never offered, which is why a day added by a later date change would
  // arrive blank instead of included.
  const [declinedMealSlots, setDeclinedMealSlots] = useState<Set<string>>(() => new Set());
  const [mealsError, setMealsError] = useState<string | null>(null);
  const [roomsToDrop, setRoomsToDrop] = useState<number | null>(null);

  const gf = config.guest_fields;
  const idDocRequired = gf.id_document === "required";
  const onBehalf = canBookOnBehalf(user.role);

  // Whether meals can be booked at all on this account. It decides which
  // service types exist, so it is computed before the form's defaults.
  const [mealsAvailable] = useState(() =>
    guestHouses.some((g) => g.serves_meals && config.allowed_guest_house_ids.includes(g.id))
  );
  /**
   * Which kind of booking this is. It is **not** a question on the form any
   * more: the portal offers two doors, and the door settles it. A meals-only
   * booking arrives here as `initialServiceType`; anything else is a room
   * booking, and whether meals come with it is decided further down by whether
   * the requester actually picks any — see `serviceType` below.
   *
   * The door is still checked against the role, so a hand-edited URL cannot
   * put an ineligible account into the meals-only flow.
   */
  const [mealsOnly] = useState(
    () =>
      initialServiceType === "meals_only" &&
      serviceTypesFor(config.role, mealsAvailable).includes("meals_only")
  );

  const form = useForm<FormValues>({
    defaultValues: {
      // "Official" for staff, because that is the common case; a role with one
      // option is never shown the question at all.
      booking_type: defaultBookingTypeFor(config.role) ?? "official",
      debit_head: "",
      debit_details: "",
      project_id: "",
      office_approval: "direct",
      on_behalf_of_name: "",
      on_behalf_of_email: "",
      on_behalf_of_phone: "",
      alumni_name: "",
      alumni_roll_number: "",
      guest_house_id: guestHouses.length === 1 ? guestHouses[0].id : "",
      purpose_of_visit: "",
      check_in_date: "",
      check_in_time: "12:00",
      check_out_date: "",
      check_out_time: "10:00",
      meal_guest_count: "1",
      meal_preference: "",
      rooms: [newRoom()],
      custom: {},
    },
  });
  const { register, handleSubmit, control, setError, clearErrors, formState, setValue } = form;
  const { fields: roomFields, append: appendRoom, remove: removeRoom } =
    useFieldArray({ control, name: "rooms" });

  const wantsRooms = !mealsOnly;
  const checkInTime = useWatch({ control, name: "check_in_time" });
  const checkOutTime = useWatch({ control, name: "check_out_time" });
  // The availability panel follows the guest house and check-in date as they
  // are picked, so the requester sees the day they are actually choosing.
  const selectedGuestHouseId = useWatch({ control, name: "guest_house_id" });
  const bookingType = useWatch({ control, name: "booking_type" });
  const mealPreference = useWatch({ control, name: "meal_preference" });
  // Watched unconditionally — it is only *shown* on a meals-only booking, but
  // a hook cannot be called inside a branch.
  const mealGuestCount = useWatch({ control, name: "meal_guest_count" }) ?? "";
  // Which booking types this role may pick, and whether the question is worth
  // asking — a club only ever books officially.
  const [bookingTypeOptions] = useState(() => bookingTypesFor(config.role));
  const forAlumnus = needsAlumniDetails(bookingType);
  // Payment follows the kind of booking: one fixed head for a student or a
  // personal stay, a choice otherwise. Derived, so a change of booking type
  // cannot leave a stale answer behind.
  const headOptions = (mealsOnly ? debitHeads.dining : debitHeads.room)[bookingType] ?? [];
  const fixedHead = fixedDebitHead(headOptions);
  const chosenHeadRaw = useWatch({ control, name: "debit_head" });
  const chosenHead: DebitHead | null = fixedHead ?? (chosenHeadRaw || null);
  const paymentHead = chosenHead;
  const debitPrompt = debitDetailsPrompt(chosenHead);
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
    canOverrideHouse ? guestHouses : guestHousesForBookingType(guestHouses, bookingType)
  )
    // A meals-only booking can only go to a kitchen. Offering a guest house
    // that serves no meals would be offering a booking nobody can fulfil.
    .filter((g) => !mealsOnly || g.serves_meals);
  const guestHouseLocked = offeredGuestHouses.length === 1;
  const overridingHouse =
    canOverrideHouse &&
    forAlumnus &&
    selectedGuestHouseId !== "" &&
    !guestHousesForBookingType(guestHouses, bookingType).some(
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
  const dependencyHint = parentDependencyHint(config);

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
  const stay = (() => {
    if (!checkInDate || !checkOutDate) return null;
    const from = `${checkInDate}T${effectiveCheckInTime}`;
    const to = `${checkOutDate}T${effectiveCheckOutTime}`;
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
   * house serves them. Asking first and explaining afterwards — "meals are not
   * served at Bageshri" — is offering something and then taking it away; this
   * way the question never appears where the answer would be no.
   */
  const offerMeals = Boolean(selectedGuestHouse) && servesMeals;
  const mealCheckIn = stay && !stay.problem ? stay.fromAt : null;
  const mealDays =
    stay && !stay.problem ? stayMealDays(stay.fromAt, stay.toAt, rules.meals.windows) : [];
  // Derived, never stored. Picking Veg or Non-Veg means "we are eating here",
  // so the whole stay is ticked and the requester clears what they will miss;
  // before that, nothing is ticked, because no preference has been given. The
  // opt-outs are what survive a change of dates.
  const mealSlots = mealPreference
    ? mealSlotsFromDeclined(mealDays, declinedMealSlots)
    : new Set<string>();
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
  const mealSummary =
    mealPlan.length === 0
      ? "No meals requested yet — pick a preference to fill in the whole stay."
      : `${describeMeals(mealPlan)}, for ${mealHeadCount} guest${mealHeadCount === 1 ? "" : "s"}${
          mealPreference ? ` (${MEAL_PREFERENCE_LABELS[mealPreference].toLowerCase()})` : ""
        }.`;

  /**
   * The grid hands back the full set of ticks; what gets stored is the
   * inverse — the meals turned off — so the default survives a date change.
   */
  const onMealSlotsChange = (next: Set<string>) => {
    setDeclinedMealSlots((prev) => declinedFromMealSlots(mealDays, next, prev));
  };

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

  const onSubmit = handleSubmit((values) => {
    clearErrors();
    setAlumniCardError(null);
    setMealsError(null);

    const checkIn = `${values.check_in_date}T${wantsRooms ? values.check_in_time : MEALS_ONLY_DAY.start}`;
    const checkOut = `${values.check_out_date}T${wantsRooms ? values.check_out_time : MEALS_ONLY_DAY.end}`;

    const payload = {
      service_type: serviceType,
      booking_type: values.booking_type,
      // A student or personal booking can only be paid one way, so the fixed
      // head is sent whatever the radio last held — switching from Official
      // to Personal must not carry a department budget along with it.
      debit_head: paymentHead,
      debit_details: debitPrompt ? values.debit_details : undefined,
      project_id: needsProject(paymentHead) ? values.project_id || null : null,
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
      // Both are sent only when meals were actually chosen, so a preference
      // left over from a guest house that was swapped for one with no kitchen
      // cannot ride along and fail validation on a card nobody can see.
      meal_preference:
        mealPlan.length > 0 && values.meal_preference !== "" ? values.meal_preference : null,
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
    };

    const parsed = bookingPayloadSchema(config, {
      mealsAvailable,
      requesterEmail: user.email,
      rules,
    }).safeParse(payload);
    let hasError = false;
    if (wantsRooms && roomCountRaw.trim() === "") {
      hasError = true;
      setRoomCountError("Number of rooms is required");
    }
    if (!parsed.success) {
      hasError = true;
      for (const issue of parsed.error.issues) {
        // Meals are not a react-hook-form field, so their message has its own slot.
        if (issue.path[0] === "meals" || issue.path[0] === "service_type") {
          setMealsError(issue.message);
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
    setDebitDocumentError(null);
    if (needsDebitDocument(paymentHead) && !debitDocument) {
      hasError = true;
      setDebitDocumentError("Upload the sanction document for the Special Budget");
    }
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
    if (needsDebitDocument(paymentHead) && debitDocument) {
      formData.set("debit_document", debitDocument);
    }
    if (onBehalf) {
      formData.set("on_behalf_of_name", values.on_behalf_of_name);
      formData.set("on_behalf_of_email", values.on_behalf_of_email);
      formData.set("on_behalf_of_phone", values.on_behalf_of_phone);
    }

    startTransition(async () => {
      const result = await createBooking(formData);
      if (result.ok) {
        toast.success(`Booking submitted — reference ${result.reference}`);
        router.push("/dashboard");
      } else {
        toast.error(result.error);
      }
    });
  });

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
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Why the stay is booked. It decides the approval route and how the
          stay is settled. Roles with a single option are not asked — the value
          is still recorded on the booking. */}
      {bookingTypeOptions.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Type of booking</CardTitle>
            <CardDescription>
              Who the stay is for decides who approves it and how it is settled, so this comes
              first — the rest of the form follows from it.
            </CardDescription>
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
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
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
            <CardDescription>
              Send this booking straight to the Guest House Manager, or have your HOD approve it
              first.
            </CardDescription>
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
                      : "Nobody is set as HOD for your office yet — it would go straight to the manager.",
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

      {/* Who pays. A student, or anyone booking personally, pays at checkout
          and has nothing to choose — so it is stated, not asked. */}
      <Card>
        <CardHeader>
          <CardTitle>Debitable head</CardTitle>
          <CardDescription>
            {fixedHead
              ? "How this stay will be settled."
              : "The budget this stay will be charged to. The accounts section debits it after checkout."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fixedHead ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{DEBIT_HEAD_LABELS[fixedHead]}</span> —{" "}
              {PAY_AT_CHECKOUT_NOTE.replace(/^Personal — /, "")}
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

              {needsProject(chosenHead) && (
                <div className="space-y-2">
                  <Label htmlFor="project_id">Project *</Label>
                  <NativeSelect id="project_id" {...register("project_id")}>
                    <option value="">Choose the project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                  {projects.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No projects are on the list yet — ask the Guest House Manager to add yours.
                    </p>
                  )}
                  <FieldError message={err("project_id")} />
                </div>
              )}

              {debitPrompt && (
                <div className="space-y-2">
                  <Label htmlFor="debit_details">{debitPrompt} *</Label>
                  {chosenHead === "special_budget" ? (
                    <Textarea
                      id="debit_details"
                      rows={3}
                      placeholder="What the special budget is, who sanctioned it, and the reference number"
                      {...register("debit_details")}
                    />
                  ) : (
                    <Input
                      id="debit_details"
                      placeholder="e.g. SP/2025/017 — Autonomous Navigation Testbed"
                      {...register("debit_details")}
                    />
                  )}
                  <FieldError message={err("debit_details")} />
                </div>
              )}

              {needsDebitDocument(chosenHead) && (
                <div className="space-y-2">
                  <Label htmlFor="debit_document">Sanction document *</Label>
                  <Input
                    id="debit_document"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setDebitDocument(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, WEBP or PDF, up to 5 MB.
                  </p>
                  <FieldError message={debitDocumentError ?? undefined} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {onBehalf && (
        <Card>
          <CardHeader>
            <CardTitle>Booking on behalf of</CardTitle>
            <CardDescription>
              You are raising this booking for someone else. The booking is recorded against your
              account and names them as the guest, so the desk knows who is arriving.
            </CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>{wantsRooms ? "Stay details" : "Meal dates"}</CardTitle>
          {offeredGuestHouses.length === 1 && (
            <CardDescription>
              {forAlumnus
                ? ALUMNI_GUEST_HOUSE_NOTE
                : `Your role can book the ${offeredGuestHouses[0].name} guest house only.`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="guest_house_id">Guest house *</Label>
            <NativeSelect
              id="guest_house_id"
              {...register("guest_house_id")}
              disabled={guestHouseLocked}
            >
              {offeredGuestHouses.length > 1 && <option value="">Select guest house…</option>}
              {offeredGuestHouses.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
            {forAlumnus && <p className="text-xs text-muted-foreground">{ALUMNI_GUEST_HOUSE_NOTE}</p>}
            {overridingHouse && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                This is an exception to the alumni policy. It will be allowed, and recorded in the
                booking&apos;s log as an override by you.
              </p>
            )}
            <FieldError message={err("guest_house_id")} />
          </div>

          {wantsRooms ? (
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
              <p className="text-xs text-muted-foreground">{roomOccupancyNotice(rules.capacity)}</p>
              <FieldError message={roomCountError ?? undefined} />
              <FieldError message={err("rooms")} />
              {config.banner_text && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {config.banner_text}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="meal_guest_count">Number of guests *</Label>
              <QuantityInput
                id="meal_guest_count"
                aria-label="Number of guests"
                min={1}
                max={100}
                value={mealGuestCount}
                onChange={(raw) => setValue("meal_guest_count", raw, { shouldValidate: false })}
              />
              <p className="text-xs text-muted-foreground">
                How many people the kitchen is cooking for. A meals booking needs no guest list.
              </p>
              <FieldError message={err("meal_guest_count")} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="check_in_date">
              {wantsRooms ? "Check-in date & time *" : "First day of meals *"}
            </Label>
            <Input
              id="check_in_date"
              type="date"
              min={checkInLimits.min}
              max={checkInLimits.max}
              {...register("check_in_date")}
            />
            {wantsRooms && (
              <TimeSelect
                label="Check-in"
                value={checkInTime}
                onChange={(v) => setValue("check_in_time", v)}
              />
            )}
            {checkInLimits.note && (
              <p className="text-xs text-muted-foreground">{checkInLimits.note}.</p>
            )}
            <FieldError message={err("check_in")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="check_out_date">
              {wantsRooms ? "Check-out date & time *" : "Last day of meals *"}
            </Label>
            <Input
              id="check_out_date"
              type="date"
              min={checkInDate || checkInLimits.min}
              max={latestCheckOut ?? undefined}
              {...register("check_out_date")}
            />
            {wantsRooms && (
              <TimeSelect
                label="Check-out"
                value={checkOutTime}
                onChange={(v) => setValue("check_out_time", v)}
              />
            )}
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
                  {wantsRooms ? "Your stay" : "Meal dates"}
                </span>
                <br />
                <span className="font-medium">{stay.from}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium">{stay.to}</span>
                {!stay.problem && wantsRooms && (
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
              placeholder="e.g. Parents visiting for convocation"
              {...register("purpose_of_visit")}
            />
            <FieldError message={err("purpose_of_visit")} />
          </div>
        </CardContent>
      </Card>

      {/* Told, not signed for. A guest who arrives with an animal has to be
          turned away at the desk, so the notice is given prominence here and
          repeated in every booking mail — but there is no tick box: a tick
          proves nothing a notice does not, and the office asked for it to go. */}
      <Card className="border-amber-300 dark:border-amber-900">
        <CardContent className="space-y-3 pt-6">
          <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{PETS_POLICY_NOTICE}</p>
              <p className="mt-1 text-sm">
                There are no kennels on the premises and no way to isolate an animal, so a guest
                arriving with a pet cannot be accommodated.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {wantsRooms && (
        <Card>
          <CardHeader>
            <CardTitle>Room availability</CardTitle>
            <CardDescription>
              What is already booked at your chosen guest house in the week of your check-in
              date — switch to Day or Month, or move to other dates, to find room to spare.
              Nothing here is reserved for you until the Guest House Manager allocates a room.
            </CardDescription>
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
            <CardTitle>{mealsOnly ? "Meals" : "Meals (optional)"}</CardTitle>
            <CardDescription>
              {mealsOnly
                ? `Meals from the ${selectedGuestHouse?.name} kitchen. Choose a preference and every meal of the range is included for you — then untick the ones you will not need.`
                : `${selectedGuestHouse?.name} serves meals. Choose a preference if your party would like them and every meal of the stay is included — then untick the ones they will not need, or leave this alone to book the room on its own.`}{" "}
              The kitchen uses this for head counts, so tell the manager if plans change after
              booking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Meal preference{mealsOnly ? " *" : ""}</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["veg", "non_veg"] as const).map((option) => (
                  <RadioCard
                    key={option}
                    value={option}
                    title={MEAL_PREFERENCE_LABELS[option]}
                    description={
                      option === "veg"
                        ? "Vegetarian meals for the whole party."
                        : "Non-vegetarian meals for the whole party."
                    }
                    register={register("meal_preference")}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Changing the preference keeps the meals you have already ticked — it only changes
                what is cooked.
              </p>
              <FieldError message={err("meal_preference")} />
            </div>

            {!mealCheckIn ? (
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
            <CardDescription>
              Fill in who is staying in each room. {infantHelpText(rules.capacity)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{totals}</span> on this request.
            </div>

            {dependencyHint && (
              <p
                className={
                  parentPresent
                    ? "rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                    : "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                }
              >
                {dependencyHint}
              </p>
            )}

            {roomFields.map((room, roomIndex) => (
              <RoomCard
                key={room.id}
                roomIndex={roomIndex}
                control={control}
                register={register}
                config={config}
                parentPresent={parentPresent}
                idDocRequired={idDocRequired}
                guestFiles={guestFiles}
                err={err}
                capacity={rules.capacity}
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
                ? "The alumnus cannot sign in to confirm their own details, so record them here for the IAR Office to verify against the ID card."
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
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WEBP or PDF, up to 5 MB.
              </p>
              <FieldError message={alumniCardError ?? undefined} />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {MANAGER_HELP_LINE}
      </p>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
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
  idDocRequired,
  guestFiles,
  err,
  capacity,
}: {
  roomIndex: number;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  config: RoleFormConfig;
  parentPresent: boolean;
  idDocRequired: boolean;
  guestFiles: Map<string, File>;
  err: (path: string) => string | undefined;
  capacity: CapacityRules;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `rooms.${roomIndex}.guests`,
  });
  const watched = useWatch({ control, name: `rooms.${roomIndex}.guests` }) ?? [];
  const infants = countInfants(watched.map((g) => ({ is_infant: isInfantEntry(g) })));
  const guests = watched.length - infants;

  const guestBlocked = addGuestBlockedReason(guests, capacity);
  const infantBlocked = addInfantBlockedReason(infants, capacity);

  return (
    <fieldset className="rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Room {roomIndex + 1}</legend>

      <p className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {roomOccupancyNotice(capacity)}
      </p>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Room type preference</Label>
          <NativeSelect {...register(`rooms.${roomIndex}.room_type`)}>
            <option value="">No preference</option>
            {(["double_sharing", "single"] as const).map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            The Guest House Manager allocates the actual room.
          </p>
        </div>
        <div className="flex items-end">
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
            idDocRequired={idDocRequired}
            guestKey={watched[guestIndex]?.key ?? field.id}
            guestFiles={guestFiles}
            err={err}
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
          onClick={() => append(newGuest(), { shouldFocus: false })}
        >
          <PlusIcon />
          Add infant (below {INFANT_AGE_LIMIT})
        </Button>
        {(guestBlocked || infantBlocked) && (
          <p className="text-xs text-muted-foreground">{guestBlocked ?? infantBlocked}</p>
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
  idDocRequired,
  guestKey,
  guestFiles,
  err,
  canRemove,
  onRemove,
}: {
  roomIndex: number;
  guestIndex: number;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  config: RoleFormConfig;
  parentPresent: boolean;
  idDocRequired: boolean;
  guestKey: string;
  guestFiles: Map<string, File>;
  err: (path: string) => string | undefined;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const base = `rooms.${roomIndex}.guests.${guestIndex}` as const;
  const gf = config.guest_fields;
  const citizenship = useWatch({ control, name: `${base}.citizenship` });
  const age = useWatch({ control, name: `${base}.age` });
  const isInfant = isInfantEntry({ age });
  const star = (mode: "required" | "optional" | "hidden") => (mode === "required" ? " *" : "");
  const isLocked = (option: string) =>
    !parentPresent && config.dependent_relationships.includes(option);

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">
          Guest {guestIndex + 1}
          {isInfant && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
              Infant — shares a bed, no ID needed
            </span>
          )}
        </p>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove guest ${guestIndex + 1} from room ${roomIndex + 1}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {gf.name !== "hidden" && (
          <div className="space-y-2">
            <Label>Name{star(gf.name)}</Label>
            <Input placeholder="Full name" {...register(`${base}.name`)} />
            <FieldError message={err(`${base}.name`)} />
          </div>
        )}
        <div className="space-y-2">
          {/* Always asked: the age is what decides whether this person is an
              infant, and the per-room limit counts the two separately. */}
          <Label>Age *</Label>
          <Input type="number" min={0} max={120} {...register(`${base}.age`)} />
          <FieldError message={err(`${base}.age`)} />
        </div>
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
            {config.relationship_style === "dropdown" ? (
              <NativeSelect {...register(`${base}.relationship`)}>
                <option value="">Select…</option>
                {config.relationship_options.map((r) => {
                  const locked = isLocked(r);
                  return (
                    <option
                      key={r}
                      value={r}
                      disabled={locked}
                      className={locked ? "text-muted-foreground opacity-50" : undefined}
                    >
                      {locked ? `${r} — needs a parent on this request` : r}
                    </option>
                  );
                })}
              </NativeSelect>
            ) : (
              <Input
                placeholder="e.g. Colleague, collaborator…"
                {...register(`${base}.relationship`)}
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
            Aadhaar field is not shown for one — asking for both would make a
            foreign guest unbookable on every form that requires an ID. */}
        {gf.id_number !== "hidden" && !isInfant && citizenship !== "other" && (
          <div className="space-y-2">
            <Label>Aadhaar number{star(gf.id_number)}</Label>
            <Input
              inputMode="numeric"
              placeholder="1234 5678 9012"
              {...register(`${base}.id_number`)}
            />
            <p className="text-xs text-muted-foreground">
              {AADHAAR_DIGITS} digits. Spaces and hyphens are ignored.
            </p>
            <FieldError message={err(`${base}.id_number`)} />
          </div>
        )}
        {gf.id_document !== "hidden" && !isInfant && (
          <div className="space-y-2">
            <Label>ID document{idDocRequired ? " *" : " (optional)"}</Label>
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

/** Whether a form row's typed age makes it an infant. */
function isInfantEntry(guest: { age?: string } | undefined): boolean {
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

