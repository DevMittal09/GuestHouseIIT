import { maskIdNumber } from "@/lib/security";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countryName } from "@/lib/countries";
import { describeDebit } from "@/lib/debit-heads";
import { raisedByFacultyInCharge } from "@/lib/club-booking";
import { formatDateTime } from "@/lib/format";
import { describeMeals, MEAL_KEYS, MEAL_LABELS } from "@/lib/meals";
import { countBedGuests, describeParty, ROOM_TYPE_LABELS } from "@/lib/occupancy";
import { formatDateValue } from "@/lib/tz";
import {
  BOOKING_TYPE_LABELS,
  CITIZENSHIP_LABELS,
  MEAL_PREFERENCE_LABELS,
  ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  type BookingGuest,
  type BookingWithDetails,
} from "@/lib/types";

function isPdf(url: string) {
  return url.split("?")[0].toLowerCase().endsWith(".pdf");
}

function DocumentPreview({ url, label }: { url: string; label: string }) {
  if (isPdf(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-4">
        View {label} (PDF)
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- runtime-uploaded documents */}
      <img
        src={url}
        alt={label}
        className="max-h-48 rounded-md border object-contain"
      />
    </a>
  );
}

export function BookingDetails({
  booking,
  showAlumniCard = false,
}: {
  booking: BookingWithDetails;
  showAlumniCard?: boolean;
}) {
  const mealsOnly = booking.service_type === "meals_only";
  // A meals-only booking has no guest rows, so its head count is the number
  // the requester gave; every other booking counts the people needing a bed.
  const mealHeadCount = mealsOnly
    ? (booking.meal_guest_count ?? 0)
    : countBedGuests(booking.guests);
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{booking.booking_reference_id}</span>
        <StatusBadge status={booking.status} />
        <Badge variant="outline">{ROLE_LABELS[booking.user_role]}</Badge>
        <Badge variant="secondary">{BOOKING_TYPE_LABELS[booking.booking_type]}</Badge>
        <Badge variant="outline">{SERVICE_TYPE_LABELS[booking.service_type]}</Badge>
        {booking.meal_preference && (
          <Badge variant="outline">{MEAL_PREFERENCE_LABELS[booking.meal_preference]}</Badge>
        )}
        {/* The guest house has to report foreign nationals, so it is on the
            booking itself rather than only inside the guest list. */}
        {booking.has_foreign_national && <Badge variant="outline">Foreign national</Badge>}
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Requester" value={`${booking.requester.full_name} (${booking.requester.email})`} />
        <Field label="Guest House" value={booking.guest_house.name} />
        {booking.requester.hostel_name && <Field label="Hostel" value={booking.requester.hostel_name} />}
        {booking.requester.department_or_club && (
          <Field label="Department / Club" value={booking.requester.department_or_club} />
        )}
        {booking.requester.roll_number && <Field label="Roll No." value={booking.requester.roll_number} />}
        {booking.alumni_name && <Field label="Alumnus" value={booking.alumni_name} />}
        {booking.alumni_roll_number && (
          <Field label="Alumnus student / roll no." value={booking.alumni_roll_number} />
        )}
        {booking.on_behalf_of_name && (
          <Field
            label="Booked on behalf of"
            value={[booking.on_behalf_of_name, booking.on_behalf_of_email, booking.on_behalf_of_phone]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
        {/* A club's booking, raised by its Faculty Advisor: the submission
            log names who pressed Submit. */}
        {raisedByFacultyInCharge(booking) && (
          <Field
            label="Raised by (Faculty Advisor)"
            value={
              [...booking.logs]
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                .find((l) => l.previous_status === null)?.action_by_name ?? "—"
            }
          />
        )}
        <Field
          label={mealsOnly ? "First day of meals" : "Check-in"}
          value={formatDateTime(booking.check_in)}
        />
        <Field
          label={mealsOnly ? "Last day of meals" : "Check-out"}
          value={formatDateTime(booking.check_out)}
        />
        {!mealsOnly && <Field label="Rooms requested" value={String(booking.rooms_requested)} />}
        <Field
          label={mealsOnly ? "Guests" : "Party size"}
          value={
            mealsOnly
              ? `${booking.meal_guest_count ?? 0} guest${booking.meal_guest_count === 1 ? "" : "s"}`
              : describeParty(booking)
          }
        />
        {/* Only where the guest house serves meals. At Bageshri the row could
            only ever read "None requested", which reads to a reviewer as a
            request that was refused rather than a question never asked. The
            booking mail already applies the same rule. */}
        {(booking.guest_house.serves_meals || booking.meals.length > 0) && (
          <Field label="Meals requested" value={describeMeals(booking.meals)} />
        )}
        {booking.meal_preference && (
          <Field label="Meal preference" value={MEAL_PREFERENCE_LABELS[booking.meal_preference]} />
        )}
        {booking.assigned_rooms.length > 0 && (
          <Field
            label="Assigned rooms"
            value={booking.assigned_rooms
              .map((r) =>
                // The type is worth printing only when it distinguishes: every
                // room is double sharing unless an older single is still in use.
                r.room_type === "single" ? `${r.room_number} (Single)` : r.room_number
              )
              .join(", ")}
          />
        )}
      </div>

      <Field label="Purpose of visit" value={booking.purpose_of_visit} block />

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Debitable head" value={describeDebit(booking)} />
        {/* Who else hears about it: every mail to the requester is copied. */}
        {(booking.copy_to_emails ?? []).length > 0 && (
          <Field label="Copy to" value={booking.copy_to_emails.join(", ")} />
        )}
        {booking.debit_document_url && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Sanction document
            </p>
            <a
              href={booking.debit_document_url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              View
            </a>
          </div>
        )}
      </div>

      {booking.meals.length > 0 && (
        <div>
          <h4 className="mb-1 font-medium">Meals by day</h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Each ticked meal is for {mealHeadCount} guest{mealHeadCount === 1 ? "" : "s"}
            {booking.meal_preference
              ? ` (${MEAL_PREFERENCE_LABELS[booking.meal_preference].toLowerCase()})`
              : ""}
            .
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  {MEAL_KEYS.map((meal) => (
                    <TableHead key={meal} className="text-center">
                      {MEAL_LABELS[meal]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {booking.meals.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell className="font-medium">{formatDateValue(day.date)}</TableCell>
                    {MEAL_KEYS.map((meal) => (
                      <TableCell key={meal} className="text-center">
                        {day[meal] ? (
                          <span aria-label="Requested">✓</span>
                        ) : (
                          <span className="text-muted-foreground" aria-label="Not requested">
                            —
                          </span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {booking.custom_fields && booking.custom_fields.length > 0 && (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {booking.custom_fields.map((f) => (
            <Field
              key={f.id}
              label={f.label}
              value={typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : String(f.value)}
            />
          ))}
        </div>
      )}

      {booking.rejection_reason && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">Rejection reason</p>
          <p>{booking.rejection_reason}</p>
        </div>
      )}

      {/* Guests are shown room by room, because that is how they were entered
          and how the desk needs them: who is sharing with whom. A booking made
          before migration 11 has a single room holding everyone, which is what
          its backfill produced. */}
      {!mealsOnly &&
        (booking.rooms.length > 0 ? (
          <div className="space-y-4">
            <h4 className="font-medium">Guests by room ({booking.guests.length} in total)</h4>
            {booking.rooms.map((room) => (
              <div key={room.id}>
                <p className="mb-1 text-sm font-medium">
                  Room {room.room_index}
                  {room.assigned_room ? (
                    <span className="ml-2 font-normal text-muted-foreground">
                      → {room.assigned_room.room_number}
                      {room.assigned_room.room_type === "single" &&
                        ` (${ROOM_TYPE_LABELS.single})`}
                    </span>
                  ) : (
                    <span className="ml-2 font-normal text-muted-foreground">
                      → not yet allocated
                      {/* A preference is only shown on bookings made while the
                          form still asked for one; it no longer does, because
                          there is only one kind of room to ask about. */}
                      {room.room_type && ` · ${ROOM_TYPE_LABELS[room.room_type]} preferred`}
                    </span>
                  )}
                  <span className="ml-2 font-normal text-muted-foreground">
                    · {describeParty({ guests: room.guests })}
                  </span>
                </p>
                <GuestTable guests={room.guests} />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <h4 className="mb-2 font-medium">Guests ({booking.guests.length})</h4>
            <GuestTable guests={booking.guests} />
          </div>
        ))}

      {showAlumniCard && booking.alumni_id_url && (
        <div>
          <h4 className="mb-2 font-medium">Alumni ID Card</h4>
          <DocumentPreview url={booking.alumni_id_url} label="Alumni ID card" />
        </div>
      )}

      <Separator />

      <div>
        <h4 className="mb-2 font-medium">Approval trail</h4>
        <ol className="space-y-2">
          {booking.logs.map((log) => (
            <li key={log.id} className="flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p>
                  <span className="font-medium">{log.action_by_name}</span>{" "}
                  <span className="text-muted-foreground">
                    {log.previous_status ? `moved ${log.previous_status} → ` : "set "}
                    {log.new_status}
                  </span>
                </p>
                {log.remarks && <p className="text-muted-foreground">{log.remarks}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(log.timestamp)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * One room's guests. Nationality and passport appear only when somebody in
 * the table is a foreign national, so an all-Indian party is not given two
 * empty columns to read past.
 */
function GuestTable({ guests }: { guests: BookingGuest[] }) {
  const anyForeign = guests.some((g) => g.citizenship === "other");
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Gender</TableHead>
            <TableHead>Relationship</TableHead>
            <TableHead>Citizenship</TableHead>
            {anyForeign && <TableHead>Nationality</TableHead>}
            {anyForeign && <TableHead>Passport</TableHead>}
            <TableHead>ID Number</TableHead>
            <TableHead>Document</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {guests.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">
                {g.name}
                {g.is_infant && (
                  <Badge variant="secondary" className="ml-2 align-middle">
                    Infant
                  </Badge>
                )}
              </TableCell>
              <TableCell>{g.age ?? "—"}</TableCell>
              <TableCell className="capitalize">{g.gender}</TableCell>
              <TableCell>{g.relationship ?? "—"}</TableCell>
              <TableCell>{CITIZENSHIP_LABELS[g.citizenship ?? "indian"]}</TableCell>
              {anyForeign && (
                <TableCell>{g.nationality ? countryName(g.nationality) : "—"}</TableCell>
              )}
              {anyForeign && (
                <TableCell className="font-mono text-xs">{maskIdNumber(g.passport_number) ?? "—"}</TableCell>
              )}
              <TableCell className="font-mono text-xs">
                {g.is_infant ? (
                  <span className="font-sans text-muted-foreground">Not required</span>
                ) : (
                  (maskIdNumber(g.id_number) ?? "—")
                )}
              </TableCell>
              <TableCell>
                {g.id_document_url ? (
                  <a
                    href={documentHref(g.id_document_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    View
                  </a>
                ) : g.is_infant ? (
                  <span className="text-muted-foreground">Not required</span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Field({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={block ? "col-span-full" : undefined}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

/**
 * Documents are fetched through `/api/documents/…`, which checks who is asking
 * and signs a five-minute link (Phase 8). Rows written before that stored a
 * full URL; those are still opened directly.
 */
function documentHref(stored: string): string {
  return /^https?:\/\//.test(stored) || stored.startsWith("/uploads/") ? stored : `/api/documents/${stored}`;
}
