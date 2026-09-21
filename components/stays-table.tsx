"use client";

import { describeDebit } from "@/lib/debit-heads";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBookingLifecycle } from "@/app/actions/bookings";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceDialog } from "@/components/invoice-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { describeMealDays, describeMeals } from "@/lib/meals";
import {
  displayStatus,
  earliestCheckIn,
  isEarlyArrival,
  occupancyNotStartedError,
  stayPhase,
} from "@/lib/workflow";
import { STATUS_LABELS, type BookingStatus, type BookingWithDetails } from "@/lib/types";

/**
 * The next lifecycle step for a stay.
 *
 * "Mark as Vacated" gets its own colour rather than reusing the neutral
 * secondary button: check-in and check-out are the two things the desk clicks
 * all day, and telling them apart at a glance matters more than matching the
 * rest of the palette.
 */
const LIFECYCLE_ACTIONS: Record<
  string,
  { label: string; nextStatus: BookingStatus; className: string }
> = {
  APPROVED: {
    label: "Mark as Occupied",
    nextStatus: "OCCUPIED",
    className:
      "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600",
  },
  OCCUPIED: {
    label: "Mark as Vacated",
    nextStatus: "VACATED",
    className:
      "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500",
  },
};

/**
 * One table of allocated stays, shared by the manager console and the
 * caretaker's. Both read identically apart from the heading above them, which
 * is the point: the caretaker is working the same list, not a simplified copy
 * that could fall out of step with it.
 */
export function StaysTable({
  bookings,
  showOverdue = false,
}: {
  bookings: BookingWithDetails[];
  /** Flag stays past their check-out that were never marked Vacated. */
  showOverdue?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead>Assigned rooms</TableHead>
            <TableHead>Meals</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <StayRow key={b.id} booking={b} showOverdue={showOverdue} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Approved/Occupied booking row — lifecycle updates. */
function StayRow({
  booking,
  showOverdue,
}: {
  booking: BookingWithDetails;
  showOverdue: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // What the row is *allowed* to offer follows the stored status; what it
  // *shows* goes through `displayStatus`, so a stay that has not started can
  // never read as Occupied even if a forced override left it that way.
  const action = LIFECYCLE_ACTIONS[booking.status];
  // The same rule the server enforces, so the button is never offered for a
  // click that would be refused.
  const tooEarly = action?.nextStatus === "OCCUPIED" ? occupancyNotStartedError(booking) : null;
  const overdue = showOverdue && stayPhase(booking) === "past";

  // Both are "off schedule but allowed". Checking in early is bounded by
  // `occupancyNotStartedError`; checking out early is not bounded at all.
  const arrivingEarly = action?.nextStatus === "OCCUPIED" && isEarlyArrival(booking);
  const leavingEarly =
    action?.nextStatus === "VACATED" && booking.check_out > new Date().toISOString();

  const handleLifecycle = () =>
    startTransition(async () => {
      if (!action) return;
      const result = await updateBookingLifecycle(booking.id, action.nextStatus);
      if (result.ok) {
        toast.success(`${booking.booking_reference_id} — ${STATUS_LABELS[action.nextStatus]}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow className={overdue ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined}>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>
        {booking.requester.full_name}
        <span className="block text-xs text-muted-foreground">
          Head: {describeDebit(booking)}
        </span>
      </TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>
        {formatDateTime(booking.check_out)}
        {overdue && (
          <Badge variant="outline" className="ml-2 align-middle">
            Overdue
          </Badge>
        )}
      </TableCell>
      <TableCell>{booking.assigned_rooms.map((r) => r.room_number).join(", ") || "—"}</TableCell>
      <TableCell
        className="text-xs"
        title={describeMealDays(booking.meals).join("\n") || undefined}
      >
        {describeMeals(booking.meals)}
      </TableCell>
      <TableCell>
        <StatusBadge status={displayStatus(booking)} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {/* Inside the window the button says what it is actually doing —
              an early arrival or an early departure — and the log records it
              as such. Outside it, there is nothing to offer: the room may
              still have the previous guest in it. */}
          {action && !tooEarly && (
            <Button
              size="sm"
              className={action.className}
              disabled={isPending}
              onClick={handleLifecycle}
            >
              {isPending
                ? "Updating…"
                : arrivingEarly
                  ? "Early check-in"
                  : leavingEarly
                    ? "Early check-out"
                    : action.label}
            </Button>
          )}
          {/* Available from the moment a guest is in the building: the desk
              is often asked for the bill before they have formally left. */}
          {(booking.status === "OCCUPIED" || booking.status === "VACATED") && (
            <InvoiceDialog booking={booking} />
          )}
        </div>
        {tooEarly && (
          <p className="mt-1 text-xs text-muted-foreground" title={tooEarly}>
            Check-in opens {formatDateTime(earliestCheckIn(booking).toISOString())}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}
