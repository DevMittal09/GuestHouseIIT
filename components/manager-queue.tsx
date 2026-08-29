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
import { ROLE_LABELS, STATUS_LABELS, type BookingStatus, type BookingWithDetails, type Room } from "@/lib/types";

export function ManagerQueue({
  pending,
  approved,
  cancellationRequests,
  rooms,
}: {
  pending: BookingWithDetails[];
  approved: BookingWithDetails[];
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

      {/* Upcoming & current stays */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Upcoming &amp; current stays{" "}
          <Badge variant="secondary" className="align-middle">
            {approved.length}
          </Badge>
        </h2>
        {approved.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No approved stays for this guest house.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Assigned rooms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.map((b) => (
                  <ApprovedRow key={b.id} booking={b} />
                ))}
              </TableBody>
            </Table>
          </div>
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

/** Lifecycle status label and style for the next action button. */
const LIFECYCLE_ACTIONS: Record<string, { label: string; nextStatus: BookingStatus; variant: "default" | "secondary" }> = {
  APPROVED: { label: "Mark as Occupied", nextStatus: "OCCUPIED", variant: "default" },
  OCCUPIED: { label: "Mark as Vacated", nextStatus: "VACATED", variant: "secondary" },
};

/** Approved/Occupied/Vacated booking row — lifecycle updates. */
function ApprovedRow({ booking }: { booking: BookingWithDetails }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const action = LIFECYCLE_ACTIONS[booking.status];

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
    <TableRow>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>{booking.requester.full_name}</TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>{booking.assigned_rooms.map((r) => r.room_number).join(", ") || "—"}</TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      <TableCell className="text-right">
        {action && (
          <Button
            size="sm"
            variant={action.variant}
            disabled={isPending}
            onClick={handleLifecycle}
          >
            {isPending ? "Updating…" : action.label}
          </Button>
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
