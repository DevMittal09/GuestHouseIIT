"use client";

import { describeDebit } from "@/lib/debit-heads";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveCancellation, rejectCancellation, reviewBooking } from "@/app/actions/bookings";
import { RejectDialog } from "@/components/review-queue";
import { BookingDetails } from "@/components/booking-details";
import { CheckoutsToday } from "@/components/checkouts-today";
import { DeskSummary } from "@/components/desk-summary";
import type { CapacityRules } from "@/lib/settings";
import { RoomGrid } from "@/components/room-grid";
import { StaysTable } from "@/components/stays-table";
import { AwaitingPaymentTable } from "@/components/awaiting-payment";
import { MissedTable } from "@/components/missed-requests";
import type { AwaitingPaymentRow } from "@/lib/invoice";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/section-heading";
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
import { describeDietCounts, describeMealDays, describeMeals, mealDietCounts } from "@/lib/meals";
import {
  BOOKING_TYPE_LABELS,
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
  toBill,
  missed,
  awaitingPayment,
  checkoutsToday,
  cancellationRequests,
  rooms,
  occupancyVersion,
  nowIso,
  capacity,
  bufferMinutes,
}: {
  /** Room capacity from Settings, for the allocation grid. */
  capacity?: CapacityRules;
  /** The turnaround buffer from Settings, for the allocation grid. */
  bufferMinutes?: number;
  pending: BookingWithDetails[];
  /** Stays happening right now - check-in has passed, check-out has not. */
  current: BookingWithDetails[];
  /** Allocated stays that have not started yet. */
  upcoming: BookingWithDetails[];
  /** Past their check-out but never marked Vacated - still need closing off. */
  overdue: BookingWithDetails[];
  /** Checked out, invoice not yet paid. The desk's list of bills to settle. */
  toBill: BookingWithDetails[];
  /**
   * Requests the nightly sweep marked Missed, newest first (migration 29).
   * Nobody decided them before their check-in, so they are nobody's queue any
   * more - but the manager can put one back if the stay is still wanted.
   */
  missed: BookingWithDetails[];
  /**
   * Invoice issued and still unpaid, however long ago (7 Oct 2026). The last
   * section on the page: nothing here is a thing to do today, but an official
   * stay's bill can sit with a department for months and must not drop off a
   * screen after thirty days.
   */
  awaitingPayment: AwaitingPaymentRow[];
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
  // Rooms and meals are two different jobs, so they are two sections (1 Oct
  // 2026). A meal booking has no check-in, no check-out and nothing to
  // allocate; it was reading as a stay with every cell dashed out.
  const pendingRooms = pending.filter((b) => b.service_type !== "meals_only");
  const pendingMeals = pending.filter((b) => b.service_type === "meals_only");
  return (
    <div className="space-y-10">
      <DeskSummary
        figures={[
          { label: "Checking out today", count: checkoutsToday.length, anchor: "checkouts" },
          { label: "Cancellation requests", count: cancellationRequests.length, anchor: "cancellations", alert: true },
          { label: "Incoming room requests", count: pendingRooms.length, anchor: "incoming" },
          ...(pendingMeals.length > 0
            ? [{ label: "Incoming meal bookings", count: pendingMeals.length, anchor: "incoming-meals" }]
            : []),
          { label: "In house now", count: current.length, anchor: "in-house" },
          { label: "Awaiting check-out", count: overdue.length, anchor: "awaiting", alert: true },
          { label: "To bill", count: toBill.length, anchor: "to-bill" },
          { label: "Upcoming stays", count: upcoming.length, anchor: "upcoming" },
          ...(missed.length > 0
            ? [{ label: "Missed requests", count: missed.length, anchor: "missed", alert: true }]
            : []),
          ...(awaitingPayment.length > 0
            ? [{ label: "Awaiting payment", count: awaitingPayment.length, anchor: "awaiting-payment" }]
            : []),
        ]}
      />

      {/* What the desk needs first thing: which rooms come back today. */}
      <div id="checkouts" className="scroll-mt-20">
        <CheckoutsToday bookings={checkoutsToday} nowIso={nowIso} isManager />
      </div>

      {/* Cancellation Requests Section */}
      {cancellationRequests.length > 0 && (
        <section id="cancellations" className="scroll-mt-20">
          <SectionHeading
            title="Cancellation requests"
            count={cancellationRequests.length}
            tone="alert"
          />
          <div className="overflow-x-auto rounded-lg border border-border">
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

      {/* Incoming room requests. A meal booking is not one of them - see
          below. */}
      <section id="incoming" className="scroll-mt-20">
        <SectionHeading
          title="Incoming room requests"
          count={pendingRooms.length}
          description={<>Pick rooms for the requested dates; allocating is what approves the booking.</>}
        />
        {pendingRooms.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
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
                {sortOfficialFirst(pendingRooms).map((b) => (
                  <ManagerRow
                    key={b.id}
                    booking={b}
                    rooms={rooms}
                    occupancyVersion={occupancyVersion}
                    capacity={capacity}
                    bufferMinutes={bufferMinutes}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Meal bookings waiting for approval, in their own section (1 Oct
          2026, the office's request).
          
          They were in the list above, under headings that are all about
          rooms - check-in, check-out, rooms, "Review & Allocate" - with a
          dash in most of the cells. Nobody arrives on a meal booking and
          there is nothing to allocate: what the manager needs to see is the
          day, the sitting, the head count and the split, which is what this
          table shows. */}
      {pendingMeals.length > 0 && (
        <section id="incoming-meals" className="scroll-mt-20">
          <SectionHeading
            title="Incoming meal bookings"
            count={pendingMeals.length}
            description={
              <>
                No room is held for these and nobody checks in - confirm the kitchen can serve
                them. Head counts for a given day are on <span className="font-medium">Meal counts</span>.
              </>
            }
          />
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Days and meals</TableHead>
                  <TableHead>People</TableHead>
                  <TableHead>Preferences</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortOfficialFirst(pendingMeals).map((b) => (
                  <MealRequestRow key={b.id} booking={b} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Current occupants - guests physically in the building now */}
      <section id="in-house" className="scroll-mt-20">
        <SectionHeading
          title="Current occupants"
          count={current.length}
          description={
            <>
              Stays that have started and not yet reached their check-out time. Mark a guest as Occupied when they arrive at the desk, and Vacated when they leave.
            </>
          }
        />
        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
            Nobody is staying at this guest house right now.
          </p>
        ) : (
          <StaysTable bookings={current} isManager />
        )}
      </section>

      {/* Past check-out but never closed off. Their own section, because
          counting them as "current occupants" would be the same kind of lie
          this split exists to remove. */}
      {overdue.length > 0 && (
        <section id="awaiting" className="scroll-mt-20">
          <SectionHeading
            title="Awaiting check-out"
            count={overdue.length}
            tone="alert"
            description={
              <>
                These stays are past their check-out time and were never marked Vacated, so they are still holding their rooms. Close them off to release the rooms.
              </>
            }
          />
          <StaysTable bookings={overdue} showOverdue isManager />
        </section>
      )}

      {/* Checked out and still owing. Without this the bill vanished with the
          guest: a Vacated stay appeared on no screen the manager has. */}
      {toBill.length > 0 && (
        <section id="to-bill" className="scroll-mt-20">
          <SectionHeading
            title="Checked out - to bill"
            count={toBill.length}
            description={
              <>
                These guests have left and their invoice is not yet paid. Issue it, or record the payment against one already issued - they leave this list once it is settled.
              </>
            }
          />
          <StaysTable bookings={toBill} isManager />
        </section>
      )}

      {/* Upcoming - allocated, not started */}
      <section id="upcoming" className="scroll-mt-20">
        <SectionHeading
          title="Upcoming stays"
          count={upcoming.length}
          description={
            <>
              Rooms are already held for these bookings. A guest who arrives ahead of their booked time is checked in with <span className="font-medium">Early check-in</span>, which says so in the log.
            </>
          }
        />
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
            No upcoming stays for this guest house.
          </p>
        ) : (
          <StaysTable bookings={upcoming} isManager />
        )}
      </section>

      {/* **Missed** - requests nobody decided before their check-in
          (migration 29, 7 Oct 2026). They used to sit in a queue for ever
          with a "lapsed" badge, waiting to be rejected by hand; the nightly
          sweep now closes them and tells the requester. The manager can put
          one back where it was waiting, and then move its dates and
          allocate. */}
      {missed.length > 0 && (
        <section id="missed" className="scroll-mt-20">
          <SectionHeading
            title="Missed requests"
            count={missed.length}
            tone="alert"
            description={
              <>
                Nobody decided these before the check-in passed - or, for a meal booking, before its last day of meals. The requester has been told. Reinstate one to put it back in the queue it was waiting in; its dates will still need moving before it can be allocated.
              </>
            }
          />
          <MissedTable bookings={missed} />
        </section>
      )}

      {/* **Awaiting payment** - the last section, and the only one with no
          date window (7 Oct 2026). "Checked out - to bill" above is the
          desk's daily list of stays nobody has invoiced yet, and is bounded
          to a few weeks. This is the other half: the invoice has gone out
          and the money has not come in. An official stay's bill can sit with
          a department for months, and a dining booking never checks out at
          all, so neither would ever appear above. */}
      {awaitingPayment.length > 0 && (
        <section id="awaiting-payment" className="scroll-mt-20">
          <SectionHeading
            title="Awaiting payment"
            count={awaitingPayment.length}
            description={
              <>
                An invoice has been issued for each of these and is not yet paid - most recent first, with no cut-off. Open the invoice to record the payment when it arrives. A personal stay cannot be closed off unpaid, so anything here is an official booking, a dining booking, or a stay a manager released with a reason.
              </>
            }
          />
          <AwaitingPaymentTable rows={awaitingPayment} isManager />
        </section>
      )}
    </div>
  );
}

/** Official / dignitary bookings float to the top of a queue. */
function sortOfficialFirst(bookings: BookingWithDetails[]): BookingWithDetails[] {
  return [...bookings].sort(
    (a, b) => Number(b.user_role === "official") - Number(a.user_role === "official")
  );
}

/**
 * One meal booking waiting for approval: the days and sittings, the head
 * count and each person's own preference. No rooms, no dates to allocate
 * against - approving is the whole decision.
 */
function MealRequestRow({ booking }: { booking: BookingWithDetails }) {
  const [open, setOpen] = useState(false);
  const headCount = booking.meal_guest_count ?? 0;
  const split = mealDietCounts(booking, headCount);
  const lapsed = lapsedError(booking);
  return (
    <TableRow
      className={
        booking.user_role === "official"
          ? "bg-notice/70 hover:bg-notice [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-saffron"
          : undefined
      }
    >
      <TableCell className="font-mono text-xs">
        {booking.booking_reference_id}
        {lapsed && (
          <Badge variant="destructive" className="ml-2 align-middle" title={lapsed}>
            Lapsed
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="font-medium">{booking.on_behalf_of_name ?? booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">Head: {describeDebit(booking)}</span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>
        <Badge variant={booking.user_role === "official" ? "default" : "outline"}>
          {ROLE_LABELS[booking.user_role]}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        <ul>
          {describeMealDays(booking.meals).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </TableCell>
      <TableCell>{headCount}</TableCell>
      <TableCell className="text-xs">{split ? describeDietCounts(split) : "-"}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Review &amp; Approve</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Approve meals - {booking.booking_reference_id}</DialogTitle>
                <DialogDescription>
                  Confirm the kitchen can serve these meals. No room is held for a meal booking.
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} />
              <Separator />
              <ApproveMeals booking={booking} onApproved={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          <RejectDialog booking={booking} small />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Incoming request row - allocate or reject. */
function ManagerRow({
  booking,
  rooms,
  occupancyVersion,
  capacity,
  bufferMinutes,
}: {
  booking: BookingWithDetails;
  rooms: Room[];
  occupancyVersion: string;
  capacity?: CapacityRules;
  bufferMinutes?: number;
}) {
  const [open, setOpen] = useState(false);
  // Its check-in has passed while it sat here. Allocating would hold rooms
  // for dates in the past; moving the dates or rejecting are the ways out.
  const lapsed = lapsedError(booking);
  return (
    <TableRow
      className={
        booking.user_role === "official"
          ? "bg-notice/70 hover:bg-notice [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-saffron"
          : undefined
      }
    >
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
        <span className="block text-xs text-muted-foreground">
          Head: {describeDebit(booking)}
        </span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>
        <Badge variant={booking.user_role === "official" ? "default" : "outline"}>
          {ROLE_LABELS[booking.user_role]}
        </Badge>
        {/* Who is paying is a different question from who asked, and the desk
            needs both - a staff member books officially one week and privately
            the next. */}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {BOOKING_TYPE_LABELS[booking.booking_type]} · {SERVICE_TYPE_LABELS[booking.service_type]}
        </span>
      </TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>{booking.rooms_requested}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {/* A meal booking has no room to allocate and is not in this
                  table at all - it has its own section, where approving is
                  the whole decision. */}
              <Button size="sm">Review &amp; Allocate</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Allocate rooms - {booking.booking_reference_id}</DialogTitle>
                <DialogDescription>
                  Pick available rooms for the requested dates, then confirm to approve the booking.
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} showAlumniCard />
              <Separator />
              <RoomGrid
                booking={booking}
                rooms={rooms}
                occupancyVersion={occupancyVersion}
                onAllocated={() => setOpen(false)}
                capacity={capacity}
                bufferMinutes={bufferMinutes}
              />
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
  const split = mealDietCounts(booking, headCount);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {describeMeals(booking.meals)} for {headCount} guest{headCount === 1 ? "" : "s"}
        {split ? ` - ${describeDietCounts(split)}` : ""}.
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

/** Cancellation request row - approve or reject. */
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
        toast.success(`Cancellation approved - ${booking.booking_reference_id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const reject = () =>
    startTransition(async () => {
      const result = await rejectCancellation(booking.id, rejectReason);
      if (result.ok) {
        toast.success(`Cancellation rejected - booking restored`);
        setShowRejectForm(false);
        setRejectReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow className="[&>td:first-child]:border-l-4 [&>td:first-child]:border-l-[#f47738]">
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>
        <span className="font-medium">{booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">
          Head: {describeDebit(booking)}
        </span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>{booking.assigned_rooms.map((r) => r.room_number).join(", ") || "-"}</TableCell>
      <TableCell className="max-w-[200px] truncate text-sm" title={booking.rejection_reason ?? ""}>
        {booking.rejection_reason || "-"}
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
                  <DialogTitle>Cancellation request - {booking.booking_reference_id}</DialogTitle>
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
