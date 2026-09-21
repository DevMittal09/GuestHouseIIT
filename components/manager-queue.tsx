"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveCancellation, rejectCancellation, reviewBooking } from "@/app/actions/bookings";
import { RejectDialog } from "@/components/review-queue";
import { BookingDetails } from "@/components/booking-details";
import { CheckoutsToday } from "@/components/checkouts-today";
import type { CapacityRules } from "@/lib/settings";
import { RoomGrid } from "@/components/room-grid";
import { StaysTable } from "@/components/stays-table";
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
import { lapsedError } from "@/lib/workflow";
import { describeMeals } from "@/lib/meals";
import {
  BOOKING_TYPE_LABELS,
  MEAL_PREFERENCE_LABELS,
  ROLE_LABELS,
  SERVICE_TYPE_LABELS,
  type BookingWithDetails,
  type Room,
} from "@/lib/types";

export function ManagerQueue({
  pending,
  current,
  upcoming,
  overdue,
  checkoutsToday,
  cancellationRequests,
  rooms,
  occupancyVersion,
  nowIso,
  capacity,
}: {
  /** Room capacity from Settings, for the allocation grid. */
  capacity?: CapacityRules;
  pending: BookingWithDetails[];
  /** Stays happening right now — check-in has passed, check-out has not. */
  current: BookingWithDetails[];
  /** Allocated stays that have not started yet. */
  upcoming: BookingWithDetails[];
  /** Past their check-out but never marked Vacated — still need closing off. */
  overdue: BookingWithDetails[];
  /** Rooms due back today, earliest first. */
  checkoutsToday: BookingWithDetails[];
  cancellationRequests: BookingWithDetails[];
  rooms: Room[];
  /**
   * Changes whenever any booking's room holds change. The allocation grid
   * fetches occupancy once when its dialog opens; without this it never learnt
   * that another allocation had landed underneath it.
   */
  occupancyVersion: string;
  /** The server's "now", so every overdue flag on the page agrees. */
  nowIso: string;
}) {
  return (
    <div className="space-y-8">
      {/* What the desk needs first thing: which rooms come back today. */}
      <CheckoutsToday bookings={checkoutsToday} nowIso={nowIso} />

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
                    <ManagerRow
                      key={b.id}
                      booking={b}
                      rooms={rooms}
                      occupancyVersion={occupancyVersion}
                      capacity={capacity}
                    />
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
          Rooms are already held for these bookings. A guest who arrives ahead of their booked
          time is checked in with <span className="font-medium">Early check-in</span>, which
          says so in the log.
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
function ManagerRow({
  booking,
  rooms,
  occupancyVersion,
  capacity,
}: {
  booking: BookingWithDetails;
  rooms: Room[];
  occupancyVersion: string;
  capacity?: CapacityRules;
}) {
  const [open, setOpen] = useState(false);
  const mealsOnly = booking.service_type === "meals_only";
  // Its check-in has passed while it sat here. Allocating would hold rooms
  // for dates in the past; moving the dates or rejecting are the ways out.
  const lapsed = lapsedError(booking);
  return (
    <TableRow className={booking.user_role === "official" ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined}>
      <TableCell className="font-mono text-xs">
        {booking.booking_reference_id}
        {lapsed && (
          <Badge variant="destructive" className="ml-2 align-middle" title={lapsed}>
            Lapsed
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="font-medium">{booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>
        <Badge variant={booking.user_role === "official" ? "default" : "outline"}>
          {ROLE_LABELS[booking.user_role]}
        </Badge>
        {/* Who is paying is a different question from who asked, and the desk
            needs both — a staff member books officially one week and privately
            the next. */}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {BOOKING_TYPE_LABELS[booking.booking_type]} · {SERVICE_TYPE_LABELS[booking.service_type]}
        </span>
      </TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>{mealsOnly ? "—" : booking.rooms_requested}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {/* A meals-only booking has no room to allocate, so for that one
                  the manager's approval *is* the decision. */}
              <Button size="sm">{mealsOnly ? "Review & Approve" : "Review & Allocate"}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {mealsOnly ? "Approve meals" : "Allocate rooms"} —{" "}
                  {booking.booking_reference_id}
                </DialogTitle>
                <DialogDescription>
                  {mealsOnly
                    ? "Confirm the kitchen can serve these meals. No room is held for a meals-only booking."
                    : "Pick available rooms for the requested dates, then confirm to approve the booking."}
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} showAlumniCard />
              <Separator />
              {mealsOnly ? (
                <ApproveMeals booking={booking} onApproved={() => setOpen(false)} />
              ) : (
                <RoomGrid
                  booking={booking}
                  rooms={rooms}
                  occupancyVersion={occupancyVersion}
                  onAllocated={() => setOpen(false)}
                  capacity={capacity}
                />
              )}
            </DialogContent>
          </Dialog>
          <RejectDialog booking={booking} small />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Confirm a meals-only booking. There is nothing to allocate, only to agree to. */
function ApproveMeals({
  booking,
  onApproved,
}: {
  booking: BookingWithDetails;
  onApproved: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const headCount = booking.meal_guest_count ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {describeMeals(booking.meals)} for {headCount} guest{headCount === 1 ? "" : "s"}
        {booking.meal_preference
          ? ` (${MEAL_PREFERENCE_LABELS[booking.meal_preference].toLowerCase()})`
          : ""}
        .
      </p>
      <div className="flex justify-end">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await reviewBooking(booking.id, "approve");
              if (result.ok) {
                toast.success("Meals approved");
                onApproved();
                router.refresh();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          {isPending ? "Approving…" : "Approve meals"}
        </Button>
      </div>
    </div>
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
