"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelInvoiceAction,
  getInvoicePanel,
  issueInvoiceAction,
  markInvoicePaidAction,
  saveInvoiceMealCounts,
  type InvoicePanel,
} from "@/app/actions/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatINR,
  gstBreakdownLines,
  gstRowLabel,
  GST_INCLUDED_NOTE,
  INVOICE_STATUS_LABELS,
  invoiceFacts,
  invoiceKind,
  invoiceTotalLabels,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type InvoiceDocument,
  type MealCounts,
  type PaymentMode,
} from "@/lib/invoice";
import { MEAL_LABELS } from "@/lib/meals";
import { formatDateTime, formatDate } from "@/lib/format";
import { toInstituteDateValue } from "@/lib/tz";
import type { BookingWithDetails } from "@/lib/types";

/**
 * The invoice at the desk (Phase 5): preview, correct the meal counts the
 * kitchen actually served, issue & print, then record the payment.
 *
 * Everything shown is what the server priced — the dialog fetches the panel
 * on opening and after every step, so it never prints a figure the server
 * would not. Once issued, the preview *is* the stored snapshot.
 */
export function InvoiceDialog({ booking }: { booking: Pick<BookingWithDetails, "id" | "booking_reference_id"> }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<InvoicePanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<keyof MealCounts, string> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(() => toInstituteDateValue(new Date()));

  const load = useCallback(async () => {
    const result = await getInvoicePanel(booking.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPanel(result.panel);
    const shown = result.panel.document.meal_lines;
    setCounts({
      breakfast: String(shown[0].count),
      lunch: String(shown[1].count),
      dinner: String(shown[2].count),
    });
  }, [booking.id]);

  useEffect(() => {
    if (open) startTransition(load);
  }, [open, load]);

  const issued = panel?.current && panel.current.status !== "draft" ? panel.current : null;
  const editable = !issued;

  const parsedCounts = (): MealCounts | null => {
    if (!counts) return null;
    const n = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
    return { breakfast: n(counts.breakfast), lunch: n(counts.lunch), dinner: n(counts.dinner) };
  };
  const countsChanged =
    !!panel &&
    !!counts &&
    panel.document.meal_lines.some((l) => String(l.count) !== counts[l.meal]);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      after?.();
      await load();
    });

  const openPdf = (id: string, download = false) =>
    window.open(`/api/invoices/${id}/pdf${download ? "?download=1" : ""}`, "_blank", "noopener");

  const issue = () =>
    startTransition(async () => {
      const result = await issueInvoiceAction(booking.id, parsedCounts());
      setConfirmIssue(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Invoice ${result.number} issued`);
      openPdf(result.invoiceId);
      await load();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Invoice — {booking.booking_reference_id}
            {panel && (
              <Badge variant={issued ? (issued.status === "paid" ? "default" : "secondary") : "outline"}>
                {issued ? INVOICE_STATUS_LABELS[issued.status] : "Not issued"}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {issued
              ? `${issued.invoice_number}, issued ${issued.issued_at ? formatDateTime(issued.issued_at) : ""}. An issued invoice cannot be changed — a correction is a cancellation and a new invoice.`
              : "Check the meal counts against the kitchen's tally, then issue. Issuing numbers the invoice and freezes it."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        )}
        {!panel && !error && <p className="py-8 text-center text-sm text-muted-foreground">Pricing the stay…</p>}

        {panel && counts && (
          <>
            <InvoicePreview
              doc={panel.document}
              counts={editable ? counts : null}
              onCount={(meal, value) => setCounts((c) => (c ? { ...c, [meal]: value } : c))}
            />

            {editable && panel.blocker && (
              <p
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
              >
                ⚠ {panel.blocker}
              </p>
            )}

            {editable && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    const c = panel.computedCounts;
                    setCounts({ breakfast: String(c.breakfast), lunch: String(c.lunch), dinner: String(c.dinner) });
                  }}
                >
                  Reset counts
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending || !countsChanged}
                  onClick={() => run(() => saveInvoiceMealCounts(booking.id, parsedCounts()), "Meal counts saved")}
                >
                  Save counts
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending || countsChanged}
                  title={countsChanged ? "Save the counts first" : undefined}
                  onClick={() => window.open(`/api/invoices/preview/${booking.id}`, "_blank", "noopener")}
                >
                  Preview PDF
                </Button>
                <Button disabled={isPending || !!panel.blocker} onClick={() => setConfirmIssue(true)}>
                  Issue &amp; print
                </Button>
              </div>
            )}

            {issued && (
              <div className="space-y-4">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => openPdf(issued.id)}>
                    Print
                  </Button>
                  <Button variant="outline" onClick={() => openPdf(issued.id, true)}>
                    Download PDF
                  </Button>
                  {panel.canCancel && (
                    <Button variant="destructive" disabled={isPending} onClick={() => setConfirmCancel(true)}>
                      Cancel invoice
                    </Button>
                  )}
                </div>

                {issued.status === "issued" && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <p className="text-sm font-medium">Record the payment</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="pay-mode">Paid by</Label>
                        <NativeSelect id="pay-mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                          {PAYMENT_MODES.map((m) => (
                            <option key={m} value={m}>
                              {PAYMENT_MODE_LABELS[m]}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pay-ref">
                          {mode === "cash" ? "Receipt no. (optional)" : mode === "upi" ? "UPI transaction id" : "UTR / reference"}
                        </Label>
                        <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pay-date">Received on</Label>
                        <Input
                          id="pay-date"
                          type="date"
                          value={paidOn}
                          max={toInstituteDateValue(new Date())}
                          onChange={(e) => setPaidOn(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        disabled={isPending || (mode !== "cash" && !reference.trim())}
                        onClick={() =>
                          run(
                            () => markInvoicePaidAction(issued.id, mode, reference || null, paidOn || null),
                            `${issued.invoice_number} marked paid`,
                            () => setReference("")
                          )
                        }
                      >
                        Mark paid
                      </Button>
                    </div>
                  </div>
                )}
                {issued.status === "paid" && (
                  <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                    ✓ Paid {issued.paid_at ? formatDate(issued.paid_at) : ""} by{" "}
                    {issued.payment_mode ? PAYMENT_MODE_LABELS[issued.payment_mode] : ""}
                    {issued.payment_reference ? ` (ref ${issued.payment_reference})` : ""}.
                  </p>
                )}
              </div>
            )}

            {panel.history.length > 0 && (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Cancelled invoices</p>
                <ul className="space-y-1">
                  {panel.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
                      <button type="button" className="font-mono text-foreground underline" onClick={() => openPdf(h.id)}>
                        {h.invoice_number}
                      </button>
                      <span>✕ cancelled {h.cancelled_at ? formatDate(h.cancelled_at) : ""}: {h.cancel_reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <ConfirmDialog
          open={confirmIssue}
          onOpenChange={setConfirmIssue}
          title="Issue this invoice?"
          description={`It takes the next number for this financial year and can never be edited afterwards — a mistake means cancelling it and issuing another. Grand total ${panel ? formatINR(panel.document.grand_total) : ""}.`}
          consequences={
            countsChanged ? ["The meal counts you have typed are used, even though they are not saved yet."] : undefined
          }
          confirmLabel="Issue & print"
          confirmVariant="default"
          pending={isPending}
          onConfirm={issue}
        />
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={(o) => {
            setConfirmCancel(o);
            if (!o) setCancelReason("");
          }}
          title={`Cancel ${issued?.invoice_number ?? "this invoice"}?`}
          description="The invoice stays on record, marked cancelled, and the booking can be invoiced again. Its number is never reused."
          confirmLabel="Cancel invoice"
          pending={isPending}
          onConfirm={() => {
            if (!issued) return;
            if (cancelReason.trim().length < 5) {
              toast.error("Say why the invoice is being cancelled");
              return;
            }
            run(() => cancelInvoiceAction(issued.id, cancelReason), `${issued.invoice_number} cancelled`, () => {
              setConfirmCancel(false);
              setCancelReason("");
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Lunch counted twice on 2 Oct"
            />
          </div>
        </ConfirmDialog>
      </DialogContent>
    </Dialog>
  );
}

/** The invoice's figures laid out like the printed page, meal counts editable before issue. */
function InvoicePreview({
  doc,
  counts,
  onCount,
}: {
  doc: InvoiceDocument;
  counts: Record<keyof MealCounts, string> | null;
  onCount: (meal: keyof MealCounts, value: string) => void;
}) {
  // The same facts the PDF prints (`invoiceFacts`): project rows only with
  // the Project head, and on a dining invoice nothing about rooms.
  const { left, right } = invoiceFacts(doc);
  const facts = [...left, ...right]
    .filter(([label]) => !/^Invoice (No|Date)/.test(label))
    .map(([label, value]) => [label.replace(/\s*:\s*$/, ""), value] as [string, string]);
  const dining = invoiceKind(doc) === "dining";
  const labels = invoiceTotalLabels(doc);
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1 rounded-lg border p-3 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="break-words">{v || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[28rem] text-sm">
          {/* A dining booking had no room, so there is no room table. */}
          {!dining && (
            <>
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-2 text-left font-medium">Room (with extra beds)</th>
                  <th className="p-2 text-right font-medium">Day(s)</th>
                  <th className="p-2 text-right font-medium">Tariff</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.room_lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-2 text-muted-foreground">
                      No rooms
                    </td>
                  </tr>
                )}
                {doc.room_lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{l.description}</td>
                    <td className="p-2 text-right tabular-nums">{l.days}</td>
                    <td className="p-2 text-right tabular-nums">{l.rate === null ? "⚠ no rate" : formatINR(l.rate)}</td>
                    <td className="p-2 text-right tabular-nums">{formatINR(l.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t font-medium">
                  <td colSpan={3} className="p-2 text-right">
                    Sub Total (A)
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatINR(doc.subtotal_rooms)}</td>
                </tr>
              </tbody>
            </>
          )}
          <thead className="bg-muted/60">
            <tr className={dining ? undefined : "border-t"}>
              <th className="p-2 text-left font-medium">Dining</th>
              <th className="p-2 text-right font-medium">No(s)</th>
              <th className="p-2 text-right font-medium">Tariff</th>
              <th className="p-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.meal_lines.map((l) => (
              <tr key={l.meal} className="border-t">
                <td className="p-2">{MEAL_LABELS[l.meal]}</td>
                <td className="p-2 text-right">
                  {counts ? (
                    <Input
                      aria-label={`${MEAL_LABELS[l.meal]} served`}
                      inputMode="numeric"
                      className="ml-auto h-8 w-20 text-right tabular-nums"
                      value={counts[l.meal]}
                      onChange={(e) => onCount(l.meal, e.target.value.replace(/[^\d]/g, ""))}
                    />
                  ) : (
                    <span className="tabular-nums">{l.count}</span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{l.rate === null ? "—" : formatINR(l.rate)}</td>
                <td className="p-2 text-right tabular-nums">{formatINR(l.amount)}</td>
              </tr>
            ))}
            {[
              ...(dining ? [] : [["Sub Total (B)", doc.subtotal_dining]]),
              [labels.total, doc.total],
              [gstRowLabel(doc).replace(/:$/, ""), doc.gst],
            ].map(([label, value]) => (
              <tr key={String(label)} className="border-t font-medium">
                <td colSpan={3} className="p-2 text-right">
                  {label}
                </td>
                <td className="p-2 text-right tabular-nums">{formatINR(Number(value))}</td>
              </tr>
            ))}
            <tr className="border-t bg-muted/40 text-base font-semibold">
              <td colSpan={3} className="p-2 text-right">
                {labels.grandTotal}
              </td>
              <td className="p-2 text-right tabular-nums">{formatINR(doc.grand_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {(doc.gst_breakdown?.length ?? 0) > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {gstBreakdownLines(doc).map((l) => (
            <li key={l}>{l}</li>
          ))}
          {doc.prices_include_gst && <li>{GST_INCLUDED_NOTE}</li>}
        </ul>
      )}
      {counts && (
        <p className="text-xs text-muted-foreground">
          Meal counts are covers — meals ticked × guests eating (infants excluded). Amounts update after Save counts.
        </p>
      )}
    </div>
  );
}
