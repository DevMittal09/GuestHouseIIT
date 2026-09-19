"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { buildInvoice, formatMoney } from "@/lib/invoice";
import type { BookingWithDetails } from "@/lib/types";

/**
 * The statement the desk hands a guest on departure.
 *
 * Worked out from the booking every time rather than stored: nothing here is
 * a payment record, so there is nothing to keep. It says what was used —
 * rooms, nights, extra beds, meals — at the tariff in `lib/invoice.ts`.
 */
export function InvoiceDialog({ booking }: { booking: BookingWithDetails }) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const invoice = buildInvoice(booking);

  const download = async () => {
    setIsSaving(true);
    try {
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf");
      await downloadInvoicePdf(invoice, `invoice-${invoice.reference}.pdf`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invoice — {invoice.reference}</DialogTitle>
          <DialogDescription>
            {invoice.guestName} · {invoice.guestHouse} · {invoice.category} · {invoice.checkIn} →{" "}
            {invoice.checkOut}
          </DialogDescription>
        </DialogHeader>

        {invoice.lines.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing to charge for: no rooms were allocated and no meals were taken.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((line) => (
                  <TableRow key={line.description}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-right">
                      {line.quantity} {line.unit}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(line.rate)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(line.amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right text-base font-semibold">
                    {formatMoney(invoice.total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        {/* A total the desk cannot rely on has to say so where the desk is
            looking, not only in the small print at the bottom. */}
        {invoice.unpriced && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            No room tariff is on record for {invoice.unpriced}. The room lines are zero — price
            them by hand before giving this to the guest.
          </p>
        )}
        {invoice.provisional && !invoice.unpriced && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Some rates on this invoice are provisional — see the note below.
          </p>
        )}

        <p className="text-xs text-muted-foreground">{invoice.note}</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={download} disabled={isSaving || invoice.lines.length === 0}>
            {isSaving ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
