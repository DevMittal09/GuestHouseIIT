"use client";

import { useState } from "react";
import { BookingDetails } from "@/components/booking-details";
import { RejectDialog } from "@/components/review-queue";
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
import { ROLE_LABELS, type BookingWithDetails, type Room } from "@/lib/types";

export function ManagerQueue({
  pending,
  approved,
  rooms,
}: {
  pending: BookingWithDetails[];
  approved: BookingWithDetails[];
  rooms: Room[];
}) {
  return (
    <div className="space-y-8">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.booking_reference_id}</TableCell>
                    <TableCell>{b.requester.full_name}</TableCell>
                    <TableCell>{formatDateTime(b.check_in)}</TableCell>
                    <TableCell>{formatDateTime(b.check_out)}</TableCell>
                    <TableCell>{b.assigned_rooms.map((r) => r.room_number).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

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
