"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBookingLifecycle } from "@/app/actions/bookings";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { displayStatus } from "@/lib/workflow";
import { STATUS_LABELS, type BookingWithDetails } from "@/lib/types";

/**
 * Who is leaving today, in check-out order.
 *
 * The desk's first question each morning is which rooms it is getting back and
 * when. That was answerable only by reading the check-out column of every
 * table on the page and doing the date arithmetic by eye, so the office asked
 * for it as its own card. Rows already past their time are flagged, because
 * those are the ones holding a room someone else is waiting for.
 */
export function CheckoutsToday({
  bookings,
  nowIso,
}: {
  /** Stays checking out today, already filtered and sorted by the server. */
  bookings: BookingWithDetails[];
  /** The server's "now", so the overdue flag agrees with the rest of the page. */
  nowIso: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Checking out today
          <Badge variant={bookings.length > 0 ? "default" : "secondary"} className="align-middle">
            {bookings.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Rooms due back today, earliest first. Mark a guest Vacated once they have handed the
          room over — that is what releases it for the next booking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nobody is due to check out today.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <CheckoutRow key={b.id} booking={b} nowIso={nowIso} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CheckoutRow({ booking, nowIso }: { booking: BookingWithDetails; nowIso: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Past its hour and still holding the room: the row the desk has to chase.
  const overdue = booking.check_out <= nowIso;
  // Only a guest who actually checked in can be checked out. An APPROVED stay
  // whose guest never arrived is closed off by the manager, not from here.
  const canVacate = booking.status === "OCCUPIED";

  const vacate = () =>
    startTransition(async () => {
      const result = await updateBookingLifecycle(booking.id, "VACATED");
      if (result.ok) {
        toast.success(`${booking.booking_reference_id} — ${STATUS_LABELS.VACATED}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <TableRow className={overdue ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined}>
      <TableCell className="whitespace-nowrap">
        {formatDateTime(booking.check_out)}
        {overdue && (
          <Badge variant="destructive" className="ml-2 align-middle">
            Overdue
          </Badge>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
      <TableCell>{booking.requester.full_name}</TableCell>
      <TableCell>{booking.assigned_rooms.map((r) => r.room_number).join(", ") || "—"}</TableCell>
      <TableCell>
        <StatusBadge status={displayStatus(booking)} />
      </TableCell>
      <TableCell className="text-right">
        {canVacate ? (
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            disabled={isPending}
            onClick={vacate}
          >
            {isPending ? "Updating…" : "Mark as Vacated"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Not checked in</span>
        )}
      </TableCell>
    </TableRow>
  );
}
