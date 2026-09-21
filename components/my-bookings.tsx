"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BedDouble, Check, UsersRound, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { cancelBooking } from "@/app/actions/bookings";
import { BookingDetails } from "@/components/booking-details";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookingProgress, type ProgressStep } from "@/lib/booking-progress";
import { formatDateValue, formatInstituteTime, parseDateValue, toInstituteDateValue } from "@/lib/tz";
import { BOOKING_TYPE_LABELS, type BookingStatus, type BookingWithDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Statuses where the requester can ask to cancel — the same set
 * `cancelBooking` accepts. Every one becomes a request the Guest House
 * Manager decides; a stay that has started (`OCCUPIED`) is ended at the desk
 * instead, so it is not offered here.
 */
const CANCELLABLE: BookingStatus[] = [
  "PENDING_WARDEN", "PENDING_FA", "PENDING_HOD", "PENDING_IAR", "PENDING_GH_MANAGER",
  "APPROVED",
];

/** Finished one way or another — listed under "Past and closed". */
const CLOSED: BookingStatus[] = ["VACATED", "REJECTED", "CANCELLED", "CANCELLATION_APPROVED"];

/**
 * The requester's bookings as cards: where and when, what state it is in, and
 * a track showing which approval it is waiting on. Open requests first, then
 * the ones that have finished.
 */
export function MyBookings({ bookings }: { bookings: BookingWithDetails[] }) {
  const open = bookings.filter((b) => !CLOSED.includes(b.status));
  const closed = bookings.filter((b) => CLOSED.includes(b.status));

  return (
    <div className="space-y-10">
      {open.length > 0 && (
        <section aria-labelledby="open-bookings">
          <h2 id="open-bookings" className="mb-4 text-[21px] font-semibold text-foreground">
            In progress and upcoming
          </h2>
          <ul className="grid gap-4">
            {open.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </ul>
        </section>
      )}
      {closed.length > 0 && (
        <section aria-labelledby="closed-bookings">
          <h2 id="closed-bookings" className="mb-4 text-[21px] font-semibold text-foreground">
            Past and closed
          </h2>
          <ul className="grid gap-4">
            {closed.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Calendar days between two institute dates — the number of nights. */
function nightsBetween(checkIn: string, checkOut: string): number | null {
  const a = parseDateValue(toInstituteDateValue(checkIn));
  const b = parseDateValue(toInstituteDateValue(checkOut));
  if (!a || !b) return null;
  const days = (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000;
  return Math.round(days);
}

function DateBlock({ label, iso }: { label: string; iso: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-heading text-[19px] leading-tight font-semibold text-foreground">
        {formatDateValue(toInstituteDateValue(iso), { year: true })}
      </p>
      <p className="text-[13px] text-muted-foreground tabular-nums">{formatInstituteTime(iso)}</p>
    </div>
  );
}

function ProgressTrack({ steps, caption }: { steps: ProgressStep[]; caption: string }) {
  return (
    <div>
      <p className="mb-3 text-[13px] font-semibold text-foreground">{caption}</p>
      <ol className="flex items-start">
        {steps.map((step, i) => (
          <li key={step.label} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-3 right-1/2 left-[-50%] h-0.5 -translate-y-1/2",
                  step.state === "upcoming" ? "bg-border" : "bg-gradient-to-r from-vermilion-deep to-vermilion"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                step.state === "done" && "bg-vermilion-deep text-white",
                step.state === "current" && "bg-white text-vermilion-deep ring-2 ring-vermilion ring-offset-2 ring-offset-card",
                step.state === "upcoming" && "bg-band text-muted-foreground ring-1 ring-border"
              )}
            >
              {step.state === "done" ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                "mt-2 px-1 text-[11.5px] leading-tight",
                step.state === "upcoming" ? "text-muted-foreground" : "font-semibold text-foreground"
              )}
            >
              {step.label}
              <span className="sr-only">
                {step.state === "done" ? " (done)" : step.state === "current" ? " (current step)" : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BookingCard({ booking }: { booking: BookingWithDetails }) {
  const [open, setOpen] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const canCancel = CANCELLABLE.includes(booking.status);
  const progress = bookingProgress(booking);
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const closed = CLOSED.includes(booking.status);

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelBooking(booking.id, cancelReason);
      if (result.ok) {
        toast.success("Cancellation request submitted — awaiting GH Manager approval");
        setShowCancelDialog(false);
        setOpen(false);
        setCancelReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <li
      className={cn(
        "overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border transition-shadow duration-200 hover:shadow-lift",
        closed && "bg-card/70"
      )}
    >
      <div className="flex flex-wrap items-start gap-4 p-5">
        <span
          aria-hidden
          className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-xl font-heading text-[20px] font-semibold",
            closed ? "bg-band text-muted-foreground" : "bg-ink text-saffron"
          )}
        >
          {booking.guest_house.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-[20px] leading-tight font-semibold text-foreground">
              {booking.guest_house.name}
            </h3>
            <StatusBadge status={booking.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted-foreground">
            <span className="font-mono text-[12px] text-foreground/80">{booking.booking_reference_id}</span>
            <span aria-hidden>·</span>
            <span>{BOOKING_TYPE_LABELS[booking.booking_type]}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <UsersRound aria-hidden className="size-3.5" />
              {booking.guests.length} guest{booking.guests.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              View details
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Booking {booking.booking_reference_id}</DialogTitle>
            </DialogHeader>
            <BookingDetails booking={booking} showAlumniCard />

            {booking.status === "CANCELLATION_REQUESTED" && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
                <p className="font-semibold text-orange-900">Cancellation requested</p>
                <p className="text-orange-800">
                  Your cancellation request is pending GH Manager approval.
                  {booking.rejection_reason && <> Reason: {booking.rejection_reason}</>}
                </p>
              </div>
            )}

            {booking.status === "OCCUPIED" && (
              <p className="rounded-xl border border-border bg-band/60 p-4 text-sm text-body">
                This stay has already started — speak to the Guest House Manager to end it early.
              </p>
            )}

            {canCancel && !showCancelDialog && (
              <div className="flex justify-end">
                <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                  Request cancellation
                </Button>
              </div>
            )}

            {canCancel && showCancelDialog && (
              <div className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <p className="text-sm font-semibold">
                  Submit a cancellation request — the GH Manager will review it.
                </p>
                <div className="space-y-2">
                  <Label htmlFor={`cancel-reason-${booking.id}`}>Reason for cancellation (required)</Label>
                  <Textarea
                    id={`cancel-reason-${booking.id}`}
                    rows={3}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Please explain why you need to cancel this booking…"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowCancelDialog(false);
                      setCancelReason("");
                    }}
                  >
                    Never mind
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancel}
                    disabled={pending || !cancelReason.trim()}
                  >
                    {pending ? "Submitting…" : "Submit cancellation request"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border/70 bg-band/40 px-5 py-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <DateBlock label="Check-in" iso={booking.check_in} />
        <span className="flex flex-col items-center gap-1 text-muted-foreground">
          <ArrowRight aria-hidden className="size-4" />
          {nights !== null && nights > 0 && (
            <span className="text-[11px] font-semibold whitespace-nowrap">
              {nights} night{nights === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <DateBlock label="Check-out" iso={booking.check_out} />
        <span aria-hidden className="hidden h-10 w-px bg-border sm:block" />
        <div className="col-span-3 min-w-0 sm:col-span-1">
          {/* A meals-only booking holds no room, so "0" would read as a room
              request that came to nothing. */}
          {booking.service_type === "meals_only" ? (
            <>
              <p className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                Service
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-heading text-[19px] leading-tight font-semibold text-foreground">
                <UtensilsCrossed aria-hidden className="size-4 text-vermilion" />
                Meals only
              </p>
            </>
          ) : (
            <>
              <p className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                {booking.assigned_rooms.length > 0 ? "Rooms allotted" : "Rooms requested"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 font-heading text-[19px] leading-tight font-semibold text-foreground">
                <BedDouble aria-hidden className="size-4 text-vermilion" />
                {booking.assigned_rooms.length > 0
                  ? booking.assigned_rooms.map((r) => r.room_number).join(", ")
                  : booking.rooms_requested}
              </p>
            </>
          )}
        </div>
      </div>

      {progress && booking.status !== "VACATED" ? (
        <div className="border-t border-border/70 px-5 py-4">
          <ProgressTrack steps={progress.steps} caption={progress.caption} />
        </div>
      ) : (
        (booking.status === "REJECTED" || booking.status === "CANCELLED" || booking.status === "CANCELLATION_APPROVED") &&
        booking.rejection_reason && (
          <p className="border-t border-border/70 px-5 py-3.5 text-[13.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {booking.status === "REJECTED" ? "Reason given: " : "Cancellation reason: "}
            </span>
            {booking.rejection_reason}
          </p>
        )
      )}
    </li>
  );
}
