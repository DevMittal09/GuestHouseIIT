"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { format } from "date-fns";
import { toast } from "sonner";
import { createBooking } from "@/app/actions/bookings";
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
import { TimeSelect } from "@/components/ui/time-select";
import { Textarea } from "@/components/ui/textarea";
import {
  countInfants,
  DEFAULT_ROOM_MAX,
  DEFAULT_ROOM_STANDARD,
  extraBedsNeeded,
  INFANT_AGE_LIMIT,
  maxGuestsFor,
  roomsNeededFor,
} from "@/lib/occupancy";
import { advanceWindowMessage, bookingPayloadSchema } from "@/lib/booking-schema";
import {
  hasQualifyingParent,
  parentDependencyHint,
  validateCustomValue,
  type CustomField,
  type RoleFormConfig,
} from "@/lib/form-config";
import { latestCheckIn } from "@/lib/workflow";
import { ROLE_LABELS, type GuestHouse, type Profile } from "@/lib/types";

interface GuestFields {
  name: string;
  age: string;
  gender: "" | "male" | "female" | "other";
  relationship: string;
  id_number: string;
  is_infant: boolean;
}

interface FormValues {
  guest_house_id: string;
  purpose_of_visit: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  rooms_requested: string;
  guests: GuestFields[];
  custom: Record<string, string | boolean>;
}

const EMPTY_GUEST: GuestFields = {
  name: "",
  age: "",
  gender: "",
  relationship: "",
  id_number: "",
  is_infant: false,
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

  const gf = config.guest_fields;
  const idDocRequired = gf.id_document === "required";

  const form = useForm<FormValues>({
    defaultValues: {
      guest_house_id: guestHouses.length === 1 ? guestHouses[0].id : "",
      purpose_of_visit: "",
      check_in_date: "",
      check_in_time: "12:00",
      check_out_date: "",
      check_out_time: "10:00",
      rooms_requested: "1",
      guests: [{ ...EMPTY_GUEST }],
      custom: {},
    },
  });
  const { register, handleSubmit, control, setError, clearErrors, formState, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "guests" });
  const checkInTime = useWatch({ control, name: "check_in_time" });
  const checkOutTime = useWatch({ control, name: "check_out_time" });
  const roomsRequested = useWatch({ control, name: "rooms_requested" });

  // Siblings / grandparents stay locked until a parent is on the request.
  const watchedGuests = useWatch({ control, name: "guests" });
  const parentPresent = hasQualifyingParent(
    config,
    (watchedGuests ?? []).map((g) => g?.relationship)
  );
  const dependencyHint = parentDependencyHint(config);
  const isLockedRelationship = (option: string) =>
    !parentPresent && config.dependent_relationships.includes(option);

  // Infants share a guardian's bed, so only the others count against the rooms.
  const guestRows = watchedGuests ?? [];
  const infantCount = countInfants(guestRows);
  const bedGuests = Math.max(fields.length - infantCount, 0);
  const roomsNeeded = roomsNeededFor(bedGuests);
  const roomsPicked = Number(roomsRequested) || 0;
  const bedsAvailable = maxGuestsFor(roomsPicked);
  const extraBeds = extraBedsNeeded(bedGuests, roomsPicked);
  // "In accordance with the rooms": the beds those rooms provide, plus infants,
  // who need none. Marking a guest as an infant frees a bed slot immediately.
  const guestCeiling = Math.min(bedsAvailable + infantCount, MAX_GUESTS);
  const overCapacity = roomsPicked > 0 && bedGuests > bedsAvailable;

  // Advance-booking window: officials are exempt, so the cap can be absent.
  const [checkInLimits] = useState(() => {
    const limit = latestCheckIn(config.role);
    return {
      min: format(new Date(), "yyyy-MM-dd"),
      max: limit ? format(limit, "yyyy-MM-dd") : undefined,
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
    // are exempt, so the ceiling rises as guests are marked as infants.
    if (n > guestCeiling) {
      setGuestCountError(
        `${roomsPicked} room${roomsPicked === 1 ? "" : "s"} sleep ${bedsAvailable}. Add another room, or mark under-${INFANT_AGE_LIMIT}s as infants — they share a bed.`
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

    const payload = {
      guest_house_id: values.guest_house_id,
      purpose_of_visit: values.purpose_of_visit,
      check_in: `${values.check_in_date}T${values.check_in_time}`,
      check_out: `${values.check_out_date}T${values.check_out_time}`,
      rooms_requested: values.rooms_requested,
      guests: values.guests.map((g) => ({
        name: g.name,
        age: g.age === "" ? undefined : g.age,
        gender: g.gender === "" ? undefined : g.gender,
        relationship: g.relationship === "" ? undefined : g.relationship,
        id_number: g.id_number === "" ? undefined : g.id_number,
        is_infant: g.is_infant,
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
        setError(issue.path.join(".") as FieldPath<FormValues>, { message: issue.message });
      }
    }

    // File + custom-field requirements are enforced outside zod. Infants are
    // exempt from the ID upload, matching the server-side check.
    fields.forEach((f, i) => {
      if (idDocRequired && !values.guests[i]?.is_infant && !guestFiles.get(f.id)) {
        hasError = true;
        setError(`guests.${i}.name` as FieldPath<FormValues>, {
          type: "file",
          message: "ID document upload is required for this guest",
        });
      }
    });
    if (config.alumni_card === "required" && !alumniCard) {
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
              A double sharing room sleeps {DEFAULT_ROOM_STANDARD}, or{" "}
              {DEFAULT_ROOM_MAX} with one extra bed.{" "}
              {roomsPicked > 0 && (
                <>
                  {roomsPicked} room{roomsPicked === 1 ? "" : "s"} = {bedsAvailable} bed
                  {bedsAvailable === 1 ? "" : "s"}.
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
          </div>

          <div
            className={
              overCapacity
                ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                : "rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            }
          >
            <span className="font-medium text-foreground">{bedGuests}</span> needing a bed
            {infantCount > 0 && (
              <>
                {" "}
                and <span className="font-medium text-foreground">{infantCount}</span> infant
                {infantCount === 1 ? "" : "s"} sharing
              </>
            )}
            {roomsPicked > 0 && (
              <>
                {" "}
                · <span className="font-medium text-foreground">{roomsPicked}</span> room
                {roomsPicked === 1 ? "" : "s"} sleep{" "}
                <span className="font-medium text-foreground">{bedsAvailable}</span>
                {extraBeds > 0 && !overCapacity && (
                  <>
                    {" "}
                    ({extraBeds} extra bed{extraBeds === 1 ? "" : "s"} needed)
                  </>
                )}
              </>
            )}
            {overCapacity && (
              <>
                {" "}
                — add {roomsNeeded - roomsPicked} more room
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

          {fields.map((field, i) => {
            const isInfant = guestRows[i]?.is_infant ?? false;
            return (
            <fieldset key={field.id} className="rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium text-muted-foreground">
                Guest {i + 1}
                {isInfant && <span className="text-primary"> · infant</span>}
              </legend>

              <label className="mb-4 flex w-fit items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  {...register(`guests.${i}.is_infant`)}
                />
                Infant — under {INFANT_AGE_LIMIT}, shares a bed
              </label>

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
                {gf.id_number !== "hidden" && !isInfant && (
                  <div className="space-y-2">
                    <Label>Aadhaar / ID number{star(gf.id_number)}</Label>
                    <Input placeholder="XXXX-XXXX-XXXX" {...register(`guests.${i}.id_number`)} />
                    <FieldError message={err(`guests.${i}.id_number`)} />
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
                        if (file) guestFiles.set(field.id, file);
                        else guestFiles.delete(field.id);
                      }}
                    />
                  </div>
                )}
              </div>
              {isInfant && (
                <p className="mt-3 text-xs text-muted-foreground">
                  No ID is needed for an infant, and they do not take up a bed — but their name,
                  age and gender still go on the guest house register.
                </p>
              )}
              {fields.length > 1 && (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGuestAt(i, field.id)}
                  >
                    Remove guest
                  </Button>
                </div>
              )}
            </fieldset>
            );
          })}
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

      {config.alumni_card !== "hidden" && (
        <Card>
          <CardHeader>
            <CardTitle>Alumni verification</CardTitle>
            <CardDescription>
              Upload your Alumni ID card{config.alumni_card === "required" ? " (mandatory)" : " (optional)"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setAlumniCard(e.target.files?.[0] ?? null)}
            />
            <FieldError message={alumniCardError ?? undefined} />
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
