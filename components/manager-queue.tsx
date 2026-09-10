"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  approveCancellation,
  rejectCancellation,
  updateBookingLifecycle,
} from "@/app/actions/bookings";
import { RejectDialog } from "@/components/review-queue";
import { BookingDetails } from "@/components/booking-details";
import { RoomGrid } from "@/components/room-grid";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { describeMeals } from "@/lib/meals";
import { occupancyNotStartedError, stayPhase } from "@/lib/workflow";
import { ROLE_LABELS, STATUS_LABELS, type BookingStatus, type BookingWithDetails, type Room } from "@/lib/types";

export function ManagerQueue({
  pending,
  current,
  upcoming,
  overdue,
  cancellationRequests,
  rooms,
}: {
  pending: BookingWithDetails[];
  /** Stays happening right now — check-in has passed, check-out has not. */
  current: BookingWithDetails[];
  /** Allocated stays that have not started yet. */
  upcoming: BookingWithDetails[];
  /** Past their check-out but never marked Vacated — still need closing off. */
  overdue: BookingWithDetails[];
  cancellationRequests: BookingWithDetails[];
  rooms: Room[];
}) {
  return (
    <div className="space-y-8">
      {/* Cancellation Requests Section */}
      {cancellationRequests.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Cancellation requests{" "}
            <Badge variant="destructive" className="align-middle">
              {cancellationRequests.length}
            </Badge>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-orange-200 dark:border-orange-900">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancellationRequests.map((b) => (
                  <CancellationRow key={b.id} booking={b} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Incoming requests */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Incoming requests{" "}
          <Badge variant="secondary" className="align-middle">
            {pending.length}
          </Badge>
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            No requests waiting for allocation.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pending]
                  .sort(
                    // Official/dignitary bookings float to the top of the queue.
                    (a, b) =>
                      Number(b.user_role === "official") - Number(a.user_role === "official")
                  )
                  .map((b) => (
                    <ManagerRow key={b.id} booking={b} rooms={rooms} />
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Current occupants — guests physically in the building now */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">
          Current occupants{" "}
          <Badge variant="secondary" className="align-middle">
            {current.length}
          </Badge>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Stays that have started and not yet reached their check-out time. Mark a guest as
          Occupied when they arrive at the desk, and Vacated when they leave.
        </p>
        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Nobody is staying at this guest house right now.
          </p>
        ) : (
          <StaysTable bookings={current} />
        )}
      </section>

      {/* Past check-out but never closed off. Their own section, because
          counting them as "current occupants" would be the same kind of lie
          this split exists to remove. */}
      {overdue.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">
            Awaiting check-out{" "}
            <Badge variant="destructive" className="align-middle">
              {overdue.length}
            </Badge>
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            These stays are past their check-out time and were never marked Vacated, so they are
            still holding their rooms. Close them off to release the rooms.
          </p>
          <StaysTable bookings={overdue} showOverdue />
        </section>
      )}

      {/* Upcoming — allocated, not started */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">
          Upcoming stays{" "}
          <Badge variant="secondary" className="align-middle">
            {upcoming.length}
          </Badge>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Rooms are already held for these bookings. They cannot be marked Occupied until their
          check-in time.
        </p>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No upcoming stays for this guest house.
          </p>
        ) : (
          <StaysTable bookings={upcoming} />
        )}
      </section>
    </div>
  );
}

/** Incoming request row — allocate or reject. */
function ManagerRow({ booking, rooms }: { booking: BookingWithDetails; rooms: Room[] }) {
  const [open, setOpen] = useState(false);
  return (
    <TableRow className={booking.user_role === "official" ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined}>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>
        <span className="font-medium">{booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>
        <Badge variant={booking.user_role === "official" ? "default" : "outline"}>
          {ROLE_LABELS[booking.user_role]}
        </Badge>
      </TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>{booking.rooms_requested}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Review &amp; Allocate</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Allocate rooms — {booking.booking_reference_id}</DialogTitle>
                <DialogDescription>
                  Pick available rooms for the requested dates, then confirm to approve the
                  booking.
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} showAlumniCard />
              <Separator />
              <RoomGrid booking={booking} rooms={rooms} onAllocated={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          <RejectDialog booking={booking} small />
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * One table of allocated stays, used for both current occupants and upcoming
 * stays so the two read identically apart from the heading.
 */
function StaysTable({
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

/**
 * The next lifecycle step for a stay.
 *
 * "Mark as Vacated" gets its own colour rather than reusing the neutral
 * secondary button: check-in and check-out are the two things the manager
 * clicks all day, and telling them apart at a glance matters more than
 * matching the rest of the palette.
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

  const action = LIFECYCLE_ACTIONS[booking.status];
  // The same rule the server enforces, so the button is never offered for a
  // click that would be refused.
  const tooEarly = action?.nextStatus === "OCCUPIED" ? occupancyNotStartedError(booking) : null;
  const overdue = showOverdue && stayPhase(booking) === "past";

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
      <TableCell>{booking.requester.full_name}</TableCell>
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
      <TableCell className="text-xs">{describeMeals(booking.meals)}</TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      <TableCell className="text-right">
        {action && (
          <Button
            size="sm"
            className={tooEarly ? undefined : action.className}
            variant={tooEarly ? "outline" : "default"}
            disabled={isPending || tooEarly !== null}
            title={tooEarly ?? undefined}
            onClick={handleLifecycle}
          >
            {isPending ? "Updating…" : action.label}
          </Button>
        )}
        {tooEarly && (
          <p className="mt-1 text-xs text-muted-foreground">Available from check-in</p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Cancellation request row — approve or reject. */
function CancellationRow({ booking }: { booking: BookingWithDetails }) {
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const router = useRouter();

  const approve = () =>
    startTransition(async () => {
      const result = await approveCancellation(booking.id);
      if (result.ok) {
        toast.success(`Cancellation approved — ${booking.booking_reference_id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const reject = () =>
    startTransition(async () => {
      const result = await rejectCancellation(booking.id, rejectReason);
      if (result.ok) {
        toast.success(`Cancellation rejected — booking restored`);
        setShowRejectForm(false);
        setRejectReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow className="bg-orange-50/40 dark:bg-orange-950/10">
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>
        <span className="font-medium">{booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>{booking.assigned_rooms.map((r) => r.room_number).join(", ") || "—"}</TableCell>
      <TableCell className="max-w-[200px] truncate text-sm" title={booking.rejection_reason ?? ""}>
        {booking.rejection_reason || "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">Details</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Cancellation request — {booking.booking_reference_id}</DialogTitle>
                  <DialogDescription>
                    {booking.requester.full_name} has requested cancellation of this booking.
                  </DialogDescription>
                </DialogHeader>
                <BookingDetails booking={booking} showAlumniCard />
                {booking.rejection_reason && (
                  <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950">
                    <p className="font-medium text-orange-900 dark:text-orange-200">
                      Cancellation reason
                    </p>
                    <p className="text-orange-800 dark:text-orange-300">
                      {booking.rejection_reason}
                    </p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Button
              size="sm"
              variant="default"
              disabled={isPending}
              onClick={approve}
            >
              {isPending ? "Processing…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => setShowRejectForm(!showRejectForm)}
            >
              Reject
            </Button>
          </div>
          {showRejectForm && (
            <div className="w-full max-w-xs space-y-2 rounded-md border p-2 text-left">
              <Label htmlFor="cancel-reject-reason" className="text-xs">
                Why are you rejecting this cancellation?
              </Label>
              <textarea
                id="cancel-reject-reason"
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason…"
                className="w-full rounded-md border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending || !rejectReason.trim()}
                onClick={reject}
                className="w-full"
              >
                Confirm rejection
              </Button>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
