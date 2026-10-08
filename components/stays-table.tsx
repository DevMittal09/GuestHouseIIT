"use client";

import { describeDebit } from "@/lib/debit-heads";
import { LogIn, LogOut, type LucideIcon } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBookingLifecycle } from "@/app/actions/bookings";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceDialog } from "@/components/invoice-dialog";
import { settlesAtCheckOut } from "@/lib/invoice";
import { ManageStayDialog } from "@/components/manage-stay-dialog";
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
 * "Mark as Occupied" is deep green with an arrow into a door and "Mark as
 * Vacated" deep indigo with an arrow out of one (the `occupy` / `vacate`
 * button variants): check-in and check-out are the two things the desk clicks
 * all day, and telling them apart at a glance - by colour *and* by shape -
 * matters more than matching the rest of the palette.
 */
const LIFECYCLE_ACTIONS: Record<
  string,
  { label: string; nextStatus: BookingStatus; variant: "occupy" | "vacate"; icon: LucideIcon }
> = {
  APPROVED: {
    label: "Mark as Occupied",
    nextStatus: "OCCUPIED",
    variant: "occupy",
    icon: LogIn,
  },
  OCCUPIED: {
    label: "Mark as Vacated",
    nextStatus: "VACATED",
    variant: "vacate",
    icon: LogOut,
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
  isManager = false,
}: {
  bookings: BookingWithDetails[];
  /** Flag stays past their check-out that were never marked Vacated. */
  showOverdue?: boolean;
  /** The manager's desk: moves, no-shows and cancellations as well as extensions. */
  isManager?: boolean;
}) {
  // The Meals column is dropped where no stay on the table is at a guest house
  // that serves them: at Bageshri every cell could only read "None requested",
  // which reads as a refusal rather than as a question never asked.
  const showMeals = bookings.some((b) => b.guest_house.serves_meals || b.meals.length > 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead>Assigned rooms</TableHead>
            {showMeals && <TableHead>Meals</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <StayRow
              key={b.id}
              booking={b}
              showOverdue={showOverdue}
              isManager={isManager}
              showMeals={showMeals}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Approved/Occupied booking row - lifecycle updates. */
function StayRow({
  booking,
  showOverdue,
  isManager,
  showMeals,
}: {
  booking: BookingWithDetails;
  showOverdue: boolean;
  isManager: boolean;
  /** Whether the table is showing a Meals column at all. */
  showMeals: boolean;
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

  /**
   * A **personal** stay's check-out goes through the invoice (7 Oct 2026):
   * issue, pay, then vacate, in one dialog. So the row offers one button -
   * "Check out & settle", which opens that dialog - instead of a Mark as
   * Vacated the server would refuse while the bill is unpaid. An official
   * stay is unchanged: it is checked out here and the invoice follows it into
   * "Awaiting payment".
   */
  const settlesHere = action?.nextStatus === "VACATED" && settlesAtCheckOut(booking);

  const handleLifecycle = () =>
    startTransition(async () => {
      if (!action) return;
      const result = await updateBookingLifecycle(booking.id, action.nextStatus);
      if (result.ok) {
        toast.success(`${booking.booking_reference_id} - ${STATUS_LABELS[action.nextStatus]}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow className={overdue ? "bg-notice/70 hover:bg-notice [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-destructive" : undefined}>
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
        {booking.extension_requested_until && (
          <Badge variant="tag" className="tag-yellow ml-2 align-middle">
            ⏳ Extension to {formatDateTime(booking.extension_requested_until)}
          </Badge>
        )}
        {overdue && (
          <Badge variant="destructive" className="ml-2 align-middle">
            Overdue
          </Badge>
        )}
      </TableCell>
      <TableCell>{booking.assigned_rooms.map((r) => r.room_number).join(", ") || "-"}</TableCell>
      {showMeals && (
        <TableCell
          className="text-xs"
          title={describeMealDays(booking.meals).join("\n") || undefined}
        >
          {booking.guest_house.serves_meals || booking.meals.length > 0
            ? describeMeals(booking.meals)
            : "-"}
        </TableCell>
      )}
      <TableCell>
        <StatusBadge status={displayStatus(booking)} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {/* Inside the window the button says what it is actually doing -
              an early arrival or an early departure - and the log records it
              as such. Outside it, there is nothing to offer: the room may
              still have the previous guest in it. */}
          {action && !tooEarly && !settlesHere && (
            <Button
              size="sm"
              variant={action.variant}
              disabled={isPending}
              onClick={handleLifecycle}
            >
              <action.icon aria-hidden />
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
              is often asked for the bill before they have formally left. For
              a personal stay this *is* the check-out. */}
          {(booking.status === "OCCUPIED" || booking.status === "VACATED") && (
            <InvoiceDialog
              booking={booking}
              isManager={isManager}
              label={settlesHere ? "Check out & settle" : undefined}
              variant={settlesHere ? "vacate" : undefined}
            />
          )}
          {(booking.status === "APPROVED" || booking.status === "OCCUPIED") && (
            <ManageStayDialog booking={booking} isManager={isManager} />
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
