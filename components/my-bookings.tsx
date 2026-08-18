"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { BookingWithDetails } from "@/lib/types";

const CANCELLABLE = ["PENDING_WARDEN", "PENDING_FA", "PENDING_IAR", "PENDING_GH_MANAGER", "APPROVED"];

export function MyBookings({ bookings }: { bookings: BookingWithDetails[] }) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No bookings yet — create your first request from the “New Booking” tab.
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
            <BookingRow key={b.id} booking={b} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BookingRow({ booking }: { booking: BookingWithDetails }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelBooking(booking.id);
      if (result.ok) {
        toast.success("Booking cancelled");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>{booking.guest_house.name}</TableCell>
      <TableCell>{formatDateTime(booking.check_in)}</TableCell>
      <TableCell>{formatDateTime(booking.check_out)}</TableCell>
      <TableCell>
        {booking.assigned_rooms.length > 0
          ? booking.assigned_rooms.map((r) => r.room_number).join(", ")
          : booking.rooms_requested}
      </TableCell>
      <TableCell>
        <StatusBadge status={booking.status} />
      </TableCell>
      <TableCell className="text-right">
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
            {CANCELLABLE.includes(booking.status) && (
              <div className="flex justify-end">
                <Button variant="destructive" onClick={cancel} disabled={pending}>
                  {pending ? "Cancelling…" : "Cancel booking"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
