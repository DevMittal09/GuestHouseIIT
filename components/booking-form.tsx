"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { Trash2Icon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Switch } from "@/components/ui/switch";
import { TimeSelect } from "@/components/ui/time-select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_ROOM_MAX,
  DEFAULT_ROOM_STANDARD,
  extraBedsNeeded,
  INFANT_AGE_LIMIT,
  maxGuestsFor,
  roomsNeededFor,
} from "@/lib/occupancy";
import {
  advanceWindowMessage,
  bookingPayloadSchema,
  checkOutOrderError,
} from "@/lib/booking-schema";
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
} from "@/lib/booking-types";
import {
  declinedFromMealSlots,
  describeMeals,
  mealPlanFromSlots,
  mealSlotsFromDeclined,
  stayMealDays,
} from "@/lib/meals";
import { formatInstituteDateTime, instituteDate, toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { latestCheckIn } from "@/lib/workflow";
import {
  BOOKING_TYPE_LABELS,
  ROLE_LABELS,
  type BookingType,
  type GuestHouse,
  type Profile,
} from "@/lib/types";

interface GuestFields {
  name: string;
  age: string;
  gender: "" | "male" | "female" | "other";
  relationship: string;
  id_number: string;
}

interface FormValues {
  /** Asked first: it decides the approval route and how the stay is settled. */
  booking_type: BookingType;
  /** Both only apply to a booking raised for an alumnus. */
  alumni_name: string;
  alumni_roll_number: string;
  guest_house_id: string;
  purpose_of_visit: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  rooms_requested: string;
  /** One switch for the booking: are any infants coming, however many. */
  has_infant: boolean;
  guests: GuestFields[];
  custom: Record<string, string | boolean>;
}

const EMPTY_GUEST: GuestFields = {
  name: "",
  age: "",
  gender: "",
  relationship: "",
  id_number: "",
};

/** Hard ceiling regardless of rooms, so the form cannot grow unbounded. */
const MAX_GUESTS = 15;

export function BookingForm({
  user,
  guestHouses,
  config,
}: {
  user: Profile;
  guestHouses: GuestHouse[];
  config: RoleFormConfig;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Files live outside RHF: a stable Map keyed by field-array row id.
  const [guestFiles] = useState(() => new Map<string, File>());
  const [alumniCard, setAlumniCard] = useState<File | null>(null);
  const [alumniCardError, setAlumniCardError] = useState<string | null>(null);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  // Meal choices live outside react-hook-form as "date|meal" keys (`mealSlot`):
  // the grid's rows follow the stay dates, which fixed field paths cannot. What
  // is held is the meals turned *off*, because every meal the stay covers is
  // ticked by default — see `mealSlotsFromDeclined`.
  const [declinedMealSlots, setDeclinedMealSlots] = useState<Set<string>>(() => new Set());
  const [mealsError, setMealsError] = useState<string | null>(null);

  const gf = config.guest_fields;
  const idDocRequired = gf.id_document === "required";

  const form = useForm<FormValues>({
    defaultValues: {
      // "Official" for staff, because that is the common case; a role with one
      // option is never shown the question at all.
      booking_type: defaultBookingTypeFor(config.role) ?? "official",
      alumni_name: "",
      alumni_roll_number: "",
      guest_house_id: guestHouses.length === 1 ? guestHouses[0].id : "",
      purpose_of_visit: "",
      check_in_date: "",
      check_in_time: "12:00",
      check_out_date: "",
      check_out_time: "10:00",
      rooms_requested: "1",
      has_infant: false,
      guests: [{ ...EMPTY_GUEST }],
      custom: {},
    },
  });
  const { register, handleSubmit, control, setError, clearErrors, formState, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "guests" });
  const checkInTime = useWatch({ control, name: "check_in_time" });
  const checkOutTime = useWatch({ control, name: "check_out_time" });
  const roomsRequested = useWatch({ control, name: "rooms_requested" });
  // The availability panel follows the guest house and check-in date as they
  // are picked, so the requester sees the day they are actually choosing.
  const selectedGuestHouseId = useWatch({ control, name: "guest_house_id" });
  const bookingType = useWatch({ control, name: "booking_type" });
  // Which booking types this role may pick, and whether the question is worth
  // asking — a club only ever books officially.
  const [bookingTypeOptions] = useState(() => bookingTypesFor(config.role));
  const forAlumnus = needsAlumniDetails(bookingType);
  // The Alumni ID card is demanded by the role's form config *or* by this
  // request being raised for an alumnus, since the IAR accounts book both ways
  // from one form.
  const alumniCardRequired = config.alumni_card === "required" || forAlumnus;
  const showAlumniSection = config.alumni_card !== "hidden" || forAlumnus;
  const checkInDate = useWatch({ control, name: "check_in_date" });
  const checkOutDate = useWatch({ control, name: "check_out_date" });

  // Siblings / grandparents stay locked until a parent is on the request.
  const watchedGuests = useWatch({ control, name: "guests" });
  const parentPresent = hasQualifyingParent(
    config,
    (watchedGuests ?? []).map((g) => g?.relationship)
  );
  const dependencyHint = parentDependencyHint(config);
  const isLockedRelationship = (option: string) =>
    !parentPresent && config.dependent_relationships.includes(option);

  // Every guest row needs a bed. Infants are not rows at all: one switch says
  // whether any are coming, and they share a guardian's bed.
  const hasInfant = useWatch({ control, name: "has_infant" });
  const bedGuests = fields.length;
  const roomsNeeded = roomsNeededFor(bedGuests);
  const roomsPicked = Number(roomsRequested) || 0;
  const bedsAvailable = maxGuestsFor(roomsPicked);
  const extraBeds = extraBedsNeeded(bedGuests, roomsPicked);
  // "In accordance with the rooms": no more guests than those rooms can take.
  const guestCeiling = Math.min(bedsAvailable, MAX_GUESTS);
  const overCapacity = roomsPicked > 0 && bedGuests > bedsAvailable;

  // A live reading of the stay, so a mis-set AM/PM is caught while filling the
  // form rather than by a validation error after submitting. `checkOutOrderError`
  // is the same function the schema uses, so the two cannot disagree.
  const stay = (() => {
    if (!checkInDate || !checkOutDate) return null;
    const from = `${checkInDate}T${checkInTime}`;
    const to = `${checkOutDate}T${checkOutTime}`;
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
  const mealHouseNames = guestHouses.filter((g) => g.serves_meals).map((g) => g.name);
  const mealCheckIn = stay && !stay.problem ? stay.fromAt : null;
  const mealDays = stay && !stay.problem ? stayMealDays(stay.fromAt, stay.toAt) : [];
  const mealSlots = mealSlotsFromDeclined(mealDays, declinedMealSlots);
  const mealPlan = servesMeals ? mealPlanFromSlots(mealSlots, mealDays) : [];
  const mealSummary =
    mealPlan.length === 0
      ? "No meals requested — guests will make their own arrangements."
      : `${describeMeals(mealPlan)}, for ${fields.length} guest${fields.length === 1 ? "" : "s"}.`;

  // Advance-booking window: officials are exempt, so the cap can be absent.
  const [checkInLimits] = useState(() => {
    const limit = latestCheckIn(config.role);
    return {
      min: toInstituteDateValue(new Date()),
      max: limit ? toInstituteDateValue(limit) : undefined,
      note: advanceWindowMessage(config.role),
    };
  });

  // The guest count is its own text state rather than being read off
  // `fields.length`, so the box can be cleared and retyped. The field array is
  // only resized once a valid number is in it.
  const [guestCountRaw, setGuestCountRaw] = useState("1");
  const [guestCountError, setGuestCountError] = useState<string | null>(null);

  const setGuestCount = (count: number) => {
    const target = Math.min(Math.max(count, 1), MAX_GUESTS);
    if (target > fields.length) {
      for (let i = fields.length; i < target; i++) append({ ...EMPTY_GUEST }, { shouldFocus: false });
    } else {
      for (let i = fields.length - 1; i >= target; i--) {
        guestFiles.delete(fields[i].id);
        remove(i);
      }
    }
  };

  const onGuestCountChange = (raw: string) => {
    setGuestCountRaw(raw);
    if (raw.trim() === "") {
      setGuestCountError("Number of guests is required");
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      setGuestCountError("At least 1 guest");
      return;
    }
    if (n > MAX_GUESTS) {
      setGuestCountError(`Maximum ${MAX_GUESTS} guests per request`);
      return;
    }
    // The rooms already chosen decide how many guests can be added. Infants
    // are not guests here, so they never count against it.
    if (n > guestCeiling) {
      setGuestCountError(
        `${roomsPicked === 1 ? "1 room accommodates" : `${roomsPicked} rooms accommodate`} up to ${bedsAvailable} guests. Add another room. Infants are not counted — use the “Infant accompanying” switch for them.`
      );
      return;
    }
    setGuestCountError(null);
    setGuestCount(n);
  };

  /** Keep the box in step when a guest row is removed with its own button. */
  const removeGuestAt = (index: number, fieldId: string) => {
    guestFiles.delete(fieldId);
    remove(index);
    setGuestCountRaw(String(fields.length - 1));
    setGuestCountError(null);
  };

  const onSubmit = handleSubmit((values) => {
    clearErrors();
    setAlumniCardError(null);
    setMealsError(null);

    const payload = {
      booking_type: values.booking_type,
      // Sent only when they apply; the schema rejects them on any other kind
      // of booking, so a stale value cannot ride along.
      alumni_name: forAlumnus ? values.alumni_name : undefined,
      alumni_roll_number: forAlumnus ? values.alumni_roll_number : undefined,
      guest_house_id: values.guest_house_id,
      purpose_of_visit: values.purpose_of_visit,
      check_in: `${values.check_in_date}T${values.check_in_time}`,
      check_out: `${values.check_out_date}T${values.check_out_time}`,
      rooms_requested: values.rooms_requested,
      meals: mealPlan,
      has_infant: values.has_infant,
      guests: values.guests.map((g) => ({
        name: g.name,
        age: g.age === "" ? undefined : g.age,
        gender: g.gender === "" ? undefined : g.gender,
        relationship: g.relationship === "" ? undefined : g.relationship,
        id_number: g.id_number === "" ? undefined : g.id_number,
      })),
      custom: values.custom,
    };

    const parsed = bookingPayloadSchema(config).safeParse(payload);
    let hasError = false;
    if (guestCountRaw.trim() === "") {
      hasError = true;
      setGuestCountError("Number of guests is required");
    }
    if (!parsed.success) {
      hasError = true;
      for (const issue of parsed.error.issues) {
        // Meals are not a react-hook-form field, so their message has its own slot.
        if (issue.path[0] === "meals") {
          setMealsError(issue.message);
          continue;
        }
        setError(issue.path.join(".") as FieldPath<FormValues>, { message: issue.message });
      }
    }

    // File + custom-field requirements are enforced outside zod.
    fields.forEach((f, i) => {
      if (idDocRequired && !guestFiles.get(f.id)) {
        hasError = true;
        setError(`guests.${i}.name` as FieldPath<FormValues>, {
          type: "file",
          message: "ID document upload is required for this guest",
        });
      }
    });
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
    fields.forEach((f, i) => {
      const file = guestFiles.get(f.id);
      if (file) formData.set(`guest_doc_${i}`, file);
    });
    if (alumniCard) formData.set("alumni_card", alumniCard);

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

  const star = (mode: "required" | "optional" | "hidden") => (mode === "required" ? " *" : "");

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* The first question, because it decides the approval route and how the
          stay is settled. Roles with a single option are not asked — the value
          is still recorded on the booking. */}
      {bookingTypeOptions.length > 1 && (
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
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors",
                    "has-checked:border-primary has-checked:bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    value={option}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    {...register("booking_type")}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{BOOKING_TYPE_LABELS[option]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {describeBookingType(config.role, option)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError message={err("booking_type")} />
          </CardContent>
        </Card>
      )}

      {/* Simulated LDAP profile — read-only */}
      <Card>
        <CardHeader>
          <CardTitle>Requester details</CardTitle>
          <CardDescription>Pre-filled from your institute profile ({ROLE_LABELS[user.role]}).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label="Name" value={user.full_name} />
          <ReadOnly label="Email" value={user.email} />
          {user.roll_number && <ReadOnly label="Roll Number" value={user.roll_number} />}
          {user.hostel_name && <ReadOnly label="Hostel" value={user.hostel_name} />}
          {user.department_or_club && (
            <ReadOnly label="Department / Club" value={user.department_or_club} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stay details</CardTitle>
          {guestHouses.length === 1 && (
            <CardDescription>
              Your role can book the {guestHouses[0].name} guest house only.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="guest_house_id">Guest house *</Label>
            <NativeSelect
              id="guest_house_id"
              {...register("guest_house_id")}
              disabled={guestHouses.length === 1}
            >
              {guestHouses.length > 1 && <option value="">Select guest house…</option>}
              {guestHouses.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
            <FieldError message={err("guest_house_id")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rooms_requested">Number of rooms *</Label>
            <QuantityInput
              id="rooms_requested"
              aria-label="Number of rooms"
              min={1}
              max={10}
              value={roomsRequested}
              onChange={(raw) => setValue("rooms_requested", raw, { shouldValidate: false })}
            />
            <p className="text-xs text-muted-foreground">
              Each double sharing room accommodates {DEFAULT_ROOM_STANDARD} guests, or{" "}
              {DEFAULT_ROOM_MAX} with an extra bed.{" "}
              {roomsPicked > 0 && (
                <>
                  {roomsPicked === 1 ? "1 room accommodates" : `${roomsPicked} rooms accommodate`}{" "}
                  up to {bedsAvailable} guest{bedsAvailable === 1 ? "" : "s"}.
                </>
              )}
            </p>
            <FieldError message={err("rooms_requested")} />
            {config.banner_text && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
              min={checkInLimits.min}
              {...register("check_out_date")}
            />
            <TimeSelect
              label="Check-out"
              value={checkOutTime}
              onChange={(v) => setValue("check_out_time", v)}
            />
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
              placeholder="e.g. Parents visiting for convocation"
              {...register("purpose_of_visit")}
            />
            <FieldError message={err("purpose_of_visit")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Room availability</CardTitle>
          <CardDescription>
            What is already booked at your chosen guest house on your check-in date, hour by
            hour. Use it to pick a day with room to spare — nothing here is reserved for you
            until the Guest House Manager allocates a room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingAvailability
            guestHouseId={selectedGuestHouseId}
            date={checkInDate}
            guestHouseName={
              guestHouses.find((g) => g.id === selectedGuestHouseId)?.name
            }
          />
        </CardContent>
      </Card>

      {/* Only for roles that can book a guest house serving meals at all. */}
      {mealHouseNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meals</CardTitle>
            <CardDescription>
              Meals are served at {joinNames(mealHouseNames)} only. Every meal of the stay is
              included by default — untick the ones your party will not need, or clear the table
              entirely if guests will make their own arrangements. The kitchen uses this for head
              counts, so tell the manager if plans change after booking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedGuestHouse ? (
              <EmptyNote>Choose a guest house above to see the meal options.</EmptyNote>
            ) : !servesMeals ? (
              <EmptyNote>Meals are not served at {selectedGuestHouse.name}.</EmptyNote>
            ) : !mealCheckIn ? (
              <EmptyNote>Choose your check-in and check-out to pick meals for each day.</EmptyNote>
            ) : (
              <>
                <MealPlanGrid
                  days={mealDays}
                  checkIn={mealCheckIn}
                  slots={mealSlots}
                  onChange={(next) =>
                    setDeclinedMealSlots((prev) => declinedFromMealSlots(mealDays, next, prev))
                  }
                />
                <p className="text-sm text-muted-foreground">{mealSummary}</p>
              </>
            )}
            <FieldError message={mealsError ?? undefined} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Guest details</CardTitle>
          <CardDescription>
            {idDocRequired
              ? "Every guest needs an Aadhaar / ID number and a document upload (JPG, PNG, WEBP or PDF, max 5 MB)."
              : "Fields marked * are mandatory."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="num_guests">Number of guests *</Label>
              <QuantityInput
                id="num_guests"
                aria-label="Number of guests"
                min={1}
                max={guestCeiling}
                value={guestCountRaw}
                onChange={onGuestCountChange}
              />
              <FieldError message={guestCountError ?? undefined} />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={fields.length >= guestCeiling}
              onClick={() => onGuestCountChange(String(fields.length + 1))}
            >
              + Add guest
            </Button>
            <label
              htmlFor="has_infant"
              className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5"
            >
              <Switch id="has_infant" {...register("has_infant")} />
              Infant accompanying
            </label>
          </div>
          {hasInfant && (
            <p className="-mt-1 text-xs text-muted-foreground">
              Children under {INFANT_AGE_LIMIT} share a guardian&apos;s bed, so they need no room,
              bed or ID of their own — this one switch covers however many are coming. Add only
              the guests who need a bed below.
            </p>
          )}

          <div
            className={
              overCapacity
                ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                : "rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            }
          >
            <span className="font-medium text-foreground">{bedGuests}</span> guest
            {bedGuests === 1 ? "" : "s"} requiring a bed
            {hasInfant && <>, with infant(s) sharing a guardian&apos;s bed</>}
            {roomsPicked > 0 && (
              <>
                {" "}
                · {roomsPicked === 1 ? "1 room accommodates" : `${roomsPicked} rooms accommodate`}{" "}
                up to <span className="font-medium text-foreground">{bedsAvailable}</span> guest
                {bedsAvailable === 1 ? "" : "s"}
                {extraBeds > 0 && !overCapacity && (
                  <>
                    {" "}
                    · {extraBeds} extra bed{extraBeds === 1 ? "" : "s"} required
                  </>
                )}
              </>
            )}
            {overCapacity && (
              <>
                {" "}
                — please add {roomsNeeded - roomsPicked} more room
                {roomsNeeded - roomsPicked === 1 ? "" : "s"}.
              </>
            )}
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

          {fields.map((field, i) => (
            <fieldset key={field.id} className="rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium text-muted-foreground">
                Guest {i + 1}
              </legend>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gf.name !== "hidden" && (
                  <div className="space-y-2">
                    <Label>Name{star(gf.name)}</Label>
                    <Input placeholder="Full name" {...register(`guests.${i}.name`)} />
                    <FieldError message={err(`guests.${i}.name`)} />
                  </div>
                )}
                {gf.age !== "hidden" && (
                  <div className="space-y-2">
                    <Label>Age{star(gf.age)}</Label>
                    <Input type="number" min={1} max={120} {...register(`guests.${i}.age`)} />
                    <FieldError message={err(`guests.${i}.age`)} />
                  </div>
                )}
                {gf.gender !== "hidden" && (
                  <div className="space-y-2">
                    <Label>Gender{star(gf.gender)}</Label>
                    <NativeSelect {...register(`guests.${i}.gender`)}>
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </NativeSelect>
                    <FieldError message={err(`guests.${i}.gender`)} />
                  </div>
                )}
                {gf.relationship !== "hidden" && (
                  <div className="space-y-2">
                    <Label>Relationship{star(gf.relationship)}</Label>
                    {config.relationship_style === "dropdown" ? (
                      <NativeSelect {...register(`guests.${i}.relationship`)}>
                        <option value="">Select…</option>
                        {config.relationship_options.map((r) => {
                          const locked = isLockedRelationship(r);
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
                        {...register(`guests.${i}.relationship`)}
                      />
                    )}
                    <FieldError message={err(`guests.${i}.relationship`)} />
                  </div>
                )}
                {gf.id_number !== "hidden" && (
                  <div className="space-y-2">
                    <Label>Aadhaar / ID number{star(gf.id_number)}</Label>
                    <Input placeholder="XXXX-XXXX-XXXX" {...register(`guests.${i}.id_number`)} />
                    <FieldError message={err(`guests.${i}.id_number`)} />
                  </div>
                )}
                {gf.id_document !== "hidden" && (
                  <div className="space-y-2">
                    <Label>ID document{idDocRequired ? " *" : " (optional)"}</Label>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) guestFiles.set(field.id, file);
                        else guestFiles.delete(field.id);
                      }}
                    />
                  </div>
                )}
              </div>
              {fields.length > 1 && (
                <div className="mt-4 flex justify-end border-t pt-3">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`Remove guest ${i + 1}`}
                    className="border-destructive/30"
                    onClick={() => removeGuestAt(i, field.id)}
                  >
                    <Trash2Icon />
                    Remove guest {i + 1}
                  </Button>
                </div>
              )}
            </fieldset>
          ))}
          <FieldError message={err("guests")} />
        </CardContent>
      </Card>

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

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit booking request"}
        </Button>
      </div>
    </form>
  );
}

function CustomFieldInput({
  field,
  register,
  error,
}: {
  field: CustomField;
  register: ReturnType<typeof useForm<FormValues>>["register"];
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium">{value}</p>
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

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
