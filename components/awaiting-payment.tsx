"use client";

import { InvoiceDialog } from "@/components/invoice-dialog";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeDebit } from "@/lib/debit-heads";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatINR, type AwaitingPaymentRow } from "@/lib/invoice";
import { describeMealDays, describeMeals } from "@/lib/meals";
import { displayStatus } from "@/lib/workflow";
import type { BookingWithDetails } from "@/lib/types";

/**
 * **Awaiting payment** (7 Oct 2026, the office's eighth list): every booking
 * whose invoice has been issued and not paid, however long ago.
 *
 * A table of its own rather than `StaysTable`, because this list holds both
 * kinds of booking. A **dining** booking is exactly the sort of bill that
 * waits - an official meal order billed to a department - and it has no
 * check-in, no check-out and no rooms, so the office's own decision of
 * 1 Oct 2026 applies: a meal booking does not belong in a table of rooms
 * with a dash in most of its cells. One column says what was booked, and
 * reads correctly for either.
 *
 * What the desk does here is open the invoice and record the payment, so the
 * row carries the invoice's number and the day it went out - how long the
 * money has been outstanding is the whole point of the list.
 */
export function AwaitingPaymentTable({
  rows,
  isManager = false,
}: {
  rows: AwaitingPaymentRow[];
  /** The manager's desk, for the invoice dialog's own powers. */
  isManager?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>What was booked</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ booking, invoice }) => (
            <TableRow key={booking.id}>
              <TableCell className="font-mono text-xs">{booking.booking_reference_id}</TableCell>
              <TableCell>
                {booking.requester.full_name}
                <span className="block text-xs text-muted-foreground">
                  Head: {describeDebit(booking)}
                </span>
              </TableCell>
              <TableCell>
                <Booked booking={booking} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="font-mono text-xs">{invoice.invoice_number ?? "-"}</span>
                <span className="block text-xs text-muted-foreground">
                  Issued {invoice.issued_at ? formatDate(invoice.issued_at) : "-"}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {invoice.grand_total === null || invoice.grand_total === undefined
                  ? "-"
                  : formatINR(invoice.grand_total)}
              </TableCell>
              <TableCell>
                <StatusBadge status={displayStatus(booking)} />
              </TableCell>
              <TableCell className="text-right">
                <InvoiceDialog booking={booking} isManager={isManager} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The one column that has to read for either kind: a stay's dates and rooms,
 * or the days the kitchen cooked and how many it cooked for.
 */
function Booked({ booking }: { booking: BookingWithDetails }) {
  if (booking.service_type === "meals_only") {
    const guests = booking.meal_guest_count ?? 0;
    return (
      <>
        <span className="block text-sm" title={describeMealDays(booking.meals).join("\n") || undefined}>
          {describeMeals(booking.meals)}
        </span>
        <span className="block text-xs text-muted-foreground">
          Meals only · {guests} {guests === 1 ? "person" : "people"}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="block text-sm">
        {formatDateTime(booking.check_in)} → {formatDateTime(booking.check_out)}
      </span>
      <span className="block text-xs text-muted-foreground">
        {booking.assigned_rooms.map((r) => r.room_number).join(", ") || "No rooms allocated"}
      </span>
    </>
  );
}
