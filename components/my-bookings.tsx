"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelBooking } from "@/app/actions/bookings";
import { raisedByFacultyInCharge } from "@/lib/club-booking";
import { requestExtensionAction } from "@/app/actions/operations";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, toDatetimeLocal } from "@/lib/format";
import type { BookingStatus, BookingWithDetails } from "@/lib/types";

/** Statuses where the requester can initiate cancellation. */
const CANCELLABLE: BookingStatus[] = [
  "PENDING_WARDEN", "PENDING_FA", "PENDING_IAR", "PENDING_GH_MANAGER",
  "APPROVED", "OCCUPIED",
];

/** An issued invoice the requester can download (Phase 5). */
export type MyInvoice = { id: string; number: string; paid: boolean };

export function MyBookings({
  bookings,
  invoices = {},
}: {
  bookings: BookingWithDetails[];
  /** By booking id: the live issued invoice, if any. */
  invoices?: Record<string, MyInvoice>;
}) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No bookings yet — create your first request from the &ldquo;New Booking&rdquo; tab.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Guest House</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead>Rooms</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <BookingRow key={b.id} booking={b} invoice={invoices[b.id] ?? null} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BookingRow({ booking, invoice }: { booking: BookingWithDetails; invoice: MyInvoice | null }) {
  const [open, setOpen] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const canCancel = CANCELLABLE.includes(booking.status);
  const needsManagerApproval = booking.status === "APPROVED" || booking.status === "OCCUPIED";

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelBooking(booking.id, cancelReason);
      if (result.ok) {
        toast.success(
          needsManagerApproval
            ? "Cancellation request submitted — awaiting GH Manager approval"
            : "Booking cancelled"
        );
        setShowCancelDialog(false);
        setOpen(false);
        setCancelReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {booking.booking_reference_id}
        {/* A club's booking raised by its faculty in-charge shows on both
            their lists; name the club so the faculty member can tell theirs
            from the club's. */}
        {raisedByFacultyInCharge(booking) && (
          <span className="mt-0.5 block font-sans text-muted-foreground">
            For {booking.requester.full_name}
          </span>
        )}
      </TableCell>
      <TableCell>{booking.guest_house.name}</TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>
        {/* A meals-only booking holds no room, so "0" would read as a room
            request that came to nothing. */}
        {booking.service_type === "meals_only" ? (
          <span className="text-muted-foreground">Meals only</span>
        ) : booking.assigned_rooms.length > 0 ? (
          booking.assigned_rooms.map((r) => r.room_number).join(", ")
        ) : (
          booking.rooms_requested
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {invoice && (
          <Button asChild variant="outline" size="sm" className="mr-2">
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener"
              title={`${invoice.number}${invoice.paid ? " — paid" : " — awaiting payment"}`}
            >
              {invoice.paid ? "✓ " : ""}Invoice
            </a>
          </Button>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Booking {booking.booking_reference_id}</DialogTitle>
            </DialogHeader>
            <BookingDetails booking={booking} showAlumniCard />
            <ExtensionRequest booking={booking} />

            {booking.status === "CANCELLATION_REQUESTED" && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-900 dark:bg-orange-950">
                <p className="font-medium text-orange-900 dark:text-orange-200">
                  Cancellation requested
                </p>
                <p className="text-orange-800 dark:text-orange-300">
                  Your cancellation request is pending GH Manager approval.
                  {booking.rejection_reason && (
                    <> Reason: {booking.rejection_reason}</>
                  )}
                </p>
              </div>
            )}

            {canCancel && !showCancelDialog && (
              <div className="flex justify-end">
                <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                  {needsManagerApproval ? "Request cancellation" : "Cancel booking"}
                </Button>
              </div>
            )}

            {canCancel && showCancelDialog && (
              <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium">
                  {needsManagerApproval
                    ? "Submit a cancellation request — the GH Manager will review it."
                    : "Cancel this booking"}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="cancel-reason">Reason for cancellation (required)</Label>
                  <textarea
                    id="cancel-reason"
                    rows={3}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Please explain why you need to cancel this booking…"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    {pending
                      ? "Submitting…"
                      : needsManagerApproval
                        ? "Submit cancellation request"
                        : "Confirm cancellation"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

/**
 * Ask to stay longer (Phase 7). The manager approves — moving the room holds,
 * which is refused if someone else has the room by then — or declines, and the
 * requester is told either way. One request at a time.
 */
function ExtensionRequest({ booking }: { booking: BookingWithDetails }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [until, setUntil] = useState(() => toDatetimeLocal(booking.check_out));
  const [reason, setReason] = useState("");
  const eligible =
    booking.service_type !== "meals_only" && (booking.status === "APPROVED" || booking.status === "OCCUPIED");
  if (!eligible) return null;
  if (booking.extension_requested_until) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        ⏳ You asked to stay until {formatDateTime(booking.extension_requested_until)}. The Guest House Manager
        will reply by email.
      </p>
    );
  }
  const submit = () =>
    startTransition(async () => {
      const result = await requestExtensionAction(booking.id, until, reason);
      if (result.ok) {
        toast.success("Extension requested — the Guest House Manager will reply by email");
        setReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Need to stay longer?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`ext-until-${booking.id}`}>Stay until</Label>
          <Input
            id={`ext-until-${booking.id}`}
            type="datetime-local"
            value={until}
            min={toDatetimeLocal(booking.check_out)}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ext-reason-${booking.id}`}>Why</Label>
          <Input
            id={`ext-reason-${booking.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The meeting runs a day longer"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 3} onClick={submit}>
          Request extension
        </Button>
      </div>
    </div>
  );
}
