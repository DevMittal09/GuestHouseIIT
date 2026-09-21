"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewBooking } from "@/app/actions/bookings";
import { BookingDetails } from "@/components/booking-details";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { BookingWithDetails } from "@/lib/types";

export function ReviewQueue({
  bookings,
  emptyMessage,
  showAlumniCard = false,
}: {
  bookings: BookingWithDetails[];
  emptyMessage: string;
  showAlumniCard?: boolean;
}) {
  if (bookings.length === 0) {
    return <EmptyState title="All caught up">{emptyMessage}</EmptyState>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Guest House</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Guests</TableHead>
            <TableHead>Rooms</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <ReviewRow key={b.id} booking={b} showAlumniCard={showAlumniCard} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReviewRow({
  booking,
  showAlumniCard,
}: {
  booking: BookingWithDetails;
  showAlumniCard: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [detailOpen, setDetailOpen] = useState(false);
  // Nobody decided this in time and its check-in has gone. It can still be
  // rejected — that closes it and tells the requester — but forwarding it
  // would move a stay that cannot happen one step closer to holding a room.
  const lapsed = lapsedError(booking);

  /**
   * A reviewer's only forward move. It is called "forward", not "approve",
   * because that is what it does: the request goes to the Guest House
   * Manager, who is the one who actually approves it by allocating a room.
   * The Assistant Warden has nowhere else to send it.
   */
  const approve = () =>
    startTransition(async () => {
      const result = await reviewBooking(booking.id, "approve");
      if (result.ok) {
        toast.success(`${booking.booking_reference_id} forwarded to the Guest House Manager`);
        setDetailOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {booking.booking_reference_id}
        {lapsed && (
          <Badge variant="destructive" className="ml-2 align-middle" title={lapsed}>
            Lapsed
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="font-semibold text-foreground">{booking.requester.full_name}</span>
        <span className="block text-xs text-muted-foreground">{booking.requester.email}</span>
      </TableCell>
      <TableCell>{booking.guest_house.name}</TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{booking.guests.length}</TableCell>
      <TableCell>{booking.rooms_requested}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Review
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Review {booking.booking_reference_id}</DialogTitle>
                <DialogDescription>
                  Forwarding sends this request to the Guest House Manager for room allocation.
                  That is the only place it can go — you either forward it or reject it.
                </DialogDescription>
              </DialogHeader>
              <BookingDetails booking={booking} showAlumniCard={showAlumniCard} />
              <DialogFooter className="gap-2">
                <RejectDialog booking={booking} onDone={() => setDetailOpen(false)} />
                <Button onClick={approve} disabled={isPending || lapsed !== null}>
                  {isPending ? "Forwarding…" : "Forward to GH Manager"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={approve} disabled={isPending || lapsed !== null}>
            Forward
          </Button>
          <RejectDialog booking={booking} small />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function RejectDialog({
  booking,
  small = false,
  onDone,
}: {
  booking: BookingWithDetails;
  small?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reject = () => {
    if (reason.trim().length < 5) {
      setError("A rejection reason is mandatory (min. 5 characters)");
      return;
    }
    startTransition(async () => {
      const result = await reviewBooking(booking.id, "reject", reason.trim());
      if (result.ok) {
        toast.success(`${booking.booking_reference_id} rejected`);
        setOpen(false);
        onDone?.();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size={small ? "sm" : "default"}>
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {booking.booking_reference_id}</DialogTitle>
          <DialogDescription>
            The requester will see this justification. A reason is mandatory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`reason-${booking.id}`}>Rejection reason *</Label>
          <Textarea
            id={`reason-${booking.id}`}
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Requested dates clash with an institute event…"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={reject} disabled={isPending}>
            {isPending ? "Rejecting…" : "Confirm rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
