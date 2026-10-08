"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcwIcon } from "lucide-react";
import { reinstateMissedBooking } from "@/app/actions/manager";
import { BookingDetails } from "@/components/booking-details";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeDebit } from "@/lib/debit-heads";
import { formatDateTime } from "@/lib/format";
import { statusBeforeMissed } from "@/lib/workflow";
import { STATUS_LABELS, type BookingWithDetails } from "@/lib/types";

/**
 * Requests the nightly sweep marked **Missed** (migration 29, 7 Oct 2026):
 * nobody decided them before the check-in passed - or, for a meal booking,
 * before its last day of meals.
 *
 * A table of its own rather than the manager's pending queue, because there
 * is nothing to approve here: the dates have gone, so the only thing that can
 * be done is to put the request back where it was waiting and then move its
 * dates. The row says which stage it was at when it ran out of time, because
 * that is where reinstating sends it and the manager should not have to guess.
 */
export function MissedTable({ bookings }: { bookings: BookingWithDetails[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Was waiting at</TableHead>
            <TableHead>Missed deadline</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <MissedRow key={booking.id} booking={booking} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MissedRow({ booking }: { booking: BookingWithDetails }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const back = statusBeforeMissed(booking.logs);
  const dining = booking.service_type === "meals_only";
  // What ran out: a stay's check-in, a meal booking's last day of meals.
  const deadline = dining ? booking.check_out : booking.check_in;

  const reinstate = () =>
    startTransition(async () => {
      const result = await reinstateMissedBooking(booking.id, reason.trim());
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(`${booking.booking_reference_id} - back at ${STATUS_LABELS[back]}`);
      setAsking(false);
      setReason("");
      router.refresh();
    });

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>
        {booking.requester.full_name}
        <span className="block text-xs text-muted-foreground">Head: {describeDebit(booking)}</span>
      </TableCell>
      <TableCell className="text-sm">{STATUS_LABELS[back]}</TableCell>
      <TableCell className="text-sm whitespace-nowrap">
        {formatDateTime(deadline)}
        <span className="block text-xs text-muted-foreground">
          {dining ? "Last day of meals" : "Check-in"}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap items-start justify-end gap-2">
          {/* The request as it was submitted - the manager needs to see what
              was asked for before deciding whether to put it back. */}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                Details
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Missed request - {booking.booking_reference_id}</DialogTitle>
                <DialogDescription>
                  Nobody decided this before {formatDateTime(deadline)}, so the requester was told
                  it had been missed.
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} showAlumniCard />
            </DialogContent>
          </Dialog>
          {asking ? (
            // The reason goes in the log, so it is asked for before the
            // button does anything - the same shape as the manager's
            // rejection and cancellation forms.
            <div className="w-full max-w-xs space-y-2 rounded-md border p-2 text-left">
              <Label htmlFor={`reinstate-${booking.id}`} className="text-xs">
                Why are you putting this request back?
              </Label>
              <Input
                id={`reinstate-${booking.id}`}
                value={reason}
                maxLength={300}
                placeholder="e.g. the guest is arriving next week instead"
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                It goes back to {STATUS_LABELS[back]}. Its dates are in the past, so move them from
                Manage before allocating.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={isPending || reason.trim().length < 3}
                  onClick={reinstate}
                >
                  Reinstate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    setAsking(false);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setAsking(true)}>
              <RotateCcwIcon aria-hidden />
              Reinstate
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
