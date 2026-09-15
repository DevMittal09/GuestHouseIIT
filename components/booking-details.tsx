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
import { formatDateTime } from "@/lib/format";
import { describeMeals, MEAL_KEYS, MEAL_LABELS } from "@/lib/meals";
import { countBedGuests, describeParty } from "@/lib/occupancy";
import { formatDateValue } from "@/lib/tz";
import { ROLE_LABELS, type BookingWithDetails } from "@/lib/types";

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
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{booking.booking_reference_id}</span>
        <StatusBadge status={booking.status} />
        <Badge variant="outline">{ROLE_LABELS[booking.user_role]}</Badge>
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Requester" value={`${booking.requester.full_name} (${booking.requester.email})`} />
        <Field label="Guest House" value={booking.guest_house.name} />
        {booking.requester.hostel_name && <Field label="Hostel" value={booking.requester.hostel_name} />}
        {booking.requester.department_or_club && (
          <Field label="Department / Club" value={booking.requester.department_or_club} />
        )}
        {booking.requester.roll_number && <Field label="Roll No." value={booking.requester.roll_number} />}
        <Field label="Check-in" value={formatDateTime(booking.check_in)} />
        <Field label="Check-out" value={formatDateTime(booking.check_out)} />
        <Field label="Rooms requested" value={String(booking.rooms_requested)} />
        <Field label="Party size" value={describeParty(booking)} />
        <Field label="Meals requested" value={describeMeals(booking.meals)} />
        {booking.assigned_rooms.length > 0 && (
          <Field
            label="Assigned rooms"
            value={booking.assigned_rooms.map((r) => `${r.room_number} (${r.room_type === "single" ? "Single" : "Double"})`).join(", ")}
          />
        )}
      </div>

      <Field label="Purpose of visit" value={booking.purpose_of_visit} block />

      {booking.meals.length > 0 && (
        <div>
          <h4 className="mb-1 font-medium">Meals by day</h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Each ticked meal is for {countBedGuests(booking.guests)} guest
            {countBedGuests(booking.guests) === 1 ? "" : "s"}.
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

      <div>
        <h4 className="mb-2 font-medium">Guests ({booking.guests.length})</h4>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.guests.map((g) => (
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
                  <TableCell className="font-mono text-xs">
                    {g.is_infant ? (
                      <span className="font-sans text-muted-foreground">Not required</span>
                    ) : (
                      (g.id_number ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    {g.id_document_url ? (
                      <a href={g.id_document_url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
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
      </div>

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

function Field({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={block ? "col-span-full" : undefined}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
