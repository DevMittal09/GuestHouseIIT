"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  cancelInvoiceAction,
  getInvoicePanel,
  issueInvoiceAction,
  markInvoicePaidAction,
  priceInvoiceDraft,
  saveInvoiceDraftAction,
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
  extraChargeFormRows,
  formatINR,
  gstBreakdownLines,
  GST_INCLUDED_NOTE,
  INVOICE_STATUS_LABELS,
  invoiceFacts,
  invoiceTable,
  MAX_EXTRA_CHARGES,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type ExtraChargeSection,
  type InvoiceDocument,
  type MealCounts,
  type PaymentMode,
} from "@/lib/invoice";
import { MEAL_LABELS } from "@/lib/meals";
import { formatDateTime, formatDate } from "@/lib/format";
import { toInstituteDateValue } from "@/lib/tz";
import type { BookingWithDetails } from "@/lib/types";

/** An additional charge as the desk is typing it: rupees and quantity as text. */
type ChargeRow = {
  key: string;
  section: ExtraChargeSection;
  description: string;
  comment: string;
  quantity: string;
  amount: string;
};

type CountRows = Record<keyof MealCounts, string>;

/** What the server said the typed counts and charges come to. */
type Priced = {
  /** The typed state this answer is for; stale once the desk types again. */
  key: string;
  document: InvoiceDocument | null;
  blocker: string | null;
  error: string | null;
};

const newCharge = (section: ExtraChargeSection): ChargeRow => ({
  key: crypto.randomUUID(),
  section,
  description: "",
  comment: "",
  quantity: "1",
  amount: "",
});

const countRowsOf = (doc: InvoiceDocument): CountRows => ({
  breakfast: String(doc.meal_lines[0].count),
  lunch: String(doc.meal_lines[1].count),
  dinner: String(doc.meal_lines[2].count),
});

const parseCounts = (counts: CountRows): MealCounts => {
  const n = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return { breakfast: n(counts.breakfast), lunch: n(counts.lunch), dinner: n(counts.dinner) };
};

/** The charges as the server takes them — the row keys stay here. */
const chargesPayload = (rows: ChargeRow[]) =>
  rows.map(({ section, description, comment, quantity, amount }) => ({ section, description, comment, quantity, amount }));

/** Comparable form of what the desk has typed, to tell saved from unsaved. */
const draftKeyOf = (counts: CountRows | null, rows: ChargeRow[]) =>
  JSON.stringify({ counts: counts ? parseCounts(counts) : null, charges: chargesPayload(rows) });

/**
 * The invoice at the desk (Phase 5): preview, correct the meal counts the
 * kitchen actually served, add any additional charges (25 Sep 2026 — an extra
 * bed, a broken vase, with a comment), issue & print, then record the payment.
 *
 * Everything shown is what the server priced. The figures follow every change
 * as it is typed — `priceInvoiceDraft` reprices the unsaved counts and charges
 * a moment after the desk stops typing — so the amounts, the grand total and
 * the total quoted by the Issue dialog are always what will be issued. (Until
 * 25 Sep 2026 they changed only after "Save counts", and meals added at the
 * desk looked as if they were not being charged.) Once issued, the preview
 * *is* the stored snapshot.
 */
export function InvoiceDialog({ booking }: { booking: Pick<BookingWithDetails, "id" | "booking_reference_id"> }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<InvoicePanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<CountRows | null>(null);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  /** What was last saved (or loaded), to tell whether anything is unsaved. */
  const [savedKey, setSavedKey] = useState<string>("");
  const [priced, setPriced] = useState<Priced | null>(null);
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
    const nextCounts = countRowsOf(result.panel.document);
    const nextCharges = extraChargeFormRows(result.panel.extraCharges).map((c) => ({ ...c, key: crypto.randomUUID() }));
    setCounts(nextCounts);
    setCharges(nextCharges);
    setSavedKey(draftKeyOf(nextCounts, nextCharges));
    setPriced(null);
  }, [booking.id]);

  useEffect(() => {
    if (open) startTransition(load);
  }, [open, load]);

  const issued = panel?.current && panel.current.status !== "draft" ? panel.current : null;
  const editable = !!panel && !issued;
  const draftKey = draftKeyOf(counts, charges);
  const dirty = editable && !!counts && draftKey !== savedKey;

  // Reprice what the desk has typed, a moment after they stop typing. Only the
  // answer for the current state is shown; an older one is dropped.
  useEffect(() => {
    if (!dirty || !counts) return;
    const key = draftKey;
    const timer = setTimeout(() => {
      void priceInvoiceDraft(booking.id, parseCounts(counts), chargesPayload(charges)).then((result) =>
        setPriced(
          result.ok
            ? { key, document: result.document, blocker: result.blocker, error: null }
            : { key, document: null, blocker: null, error: result.error }
        )
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [dirty, draftKey, counts, charges, booking.id]);

  const current = dirty && priced?.key === draftKey ? priced : null;
  /** Repricing has not caught up with the last change yet. */
  const pricing = dirty && !current;
  // While repricing, the last figures stay on screen rather than flickering.
  const shownDoc = (dirty ? (current?.document ?? priced?.document) : null) ?? panel?.document ?? null;
  const problem = dirty ? (current?.error ?? current?.blocker ?? null) : (panel?.blocker ?? null);

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
      const result = await issueInvoiceAction(booking.id, counts ? parseCounts(counts) : null, chargesPayload(charges));
      setConfirmIssue(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Invoice ${result.number} issued`);
      openPdf(result.invoiceId);
      await load();
    });

  const updateCharge = (key: string, patch: Partial<ChargeRow>) =>
    setCharges((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

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
              : "Check the meal counts against the kitchen's tally and add any additional charges, then issue. The figures update as you type. Issuing numbers the invoice and freezes it."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        )}
        {!panel && !error && <p className="py-8 text-center text-sm text-muted-foreground">Pricing the stay…</p>}

        {panel && counts && shownDoc && (
          <>
            <InvoicePreview
              doc={shownDoc}
              counts={editable ? counts : null}
              onCount={(meal, value) => setCounts((c) => (c ? { ...c, [meal]: value } : c))}
              pricing={pricing}
            />

            {editable && (
              <ExtraChargesEditor
                rows={charges}
                panel={panel}
                onAdd={() => setCharges((rows) => [...rows, newCharge(panel.kind === "dining" ? "dining" : "room")])}
                onChange={updateCharge}
                onRemove={(key) => setCharges((rows) => rows.filter((r) => r.key !== key))}
              />
            )}

            {editable && problem && (
              <p
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
              >
                ⚠ {problem}
              </p>
            )}

            {editable && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
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
                  disabled={isPending || !dirty || !!current?.error}
                  onClick={() =>
                    run(
                      () => saveInvoiceDraftAction(booking.id, parseCounts(counts), chargesPayload(charges)),
                      "Draft saved"
                    )
                  }
                >
                  Save draft
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending || dirty}
                  title={dirty ? "Save the draft first" : undefined}
                  onClick={() => window.open(`/api/invoices/preview/${booking.id}`, "_blank", "noopener")}
                >
                  Preview PDF
                </Button>
                <Button disabled={isPending || pricing || !!problem} onClick={() => setConfirmIssue(true)}>
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
          description={`It takes the next number for this financial year and can never be edited afterwards — a mistake means cancelling it and issuing another. Grand total ${shownDoc ? formatINR(shownDoc.grand_total) : ""}.`}
          consequences={
            dirty ? ["The meal counts and charges you have typed are used, even though they are not saved yet."] : undefined
          }
          confirmLabel="Issue & print"
          confirmVariant="default"
          pending={isPending || pricing}
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

/**
 * The desk's additional charges: what it was, what it is charged under (which
 * decides its GST), how many, the amount each, and a comment.
 */
function ExtraChargesEditor({
  rows,
  panel,
  onAdd,
  onChange,
  onRemove,
}: {
  rows: ChargeRow[];
  panel: InvoicePanel;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<ChargeRow>) => void;
  onRemove: (key: string) => void;
}) {
  const dining = panel.kind === "dining";
  const sectionLabels: [ExtraChargeSection, string][] = [
    ...(dining ? [] : ([["room", `Room charges (A) — GST ${panel.gstRoomPercent}%`]] as [ExtraChargeSection, string][])),
    ["dining", `Dining charges${dining ? "" : " (B)"} — GST ${panel.gstMealPercent}%`],
    ["other", "Other — no GST (damage, loss)"],
  ];
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">Additional charges</p>
        <p className="text-xs text-muted-foreground">
          Anything to add at checkout — an extra bed arranged at the desk, a broken vase — with a comment saying what
          it was. Each is printed in the section it is charged under and taxed at that section&apos;s rate. Enter the
          amount {panel.pricesIncludeGst ? "including GST, as the tariffs are" : "before GST"}.
        </p>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
      {rows.map((row, i) => (
        <div key={row.key} className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_5rem_7rem]">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`charge-desc-${row.key}`}>Charge {i + 1}</Label>
              <Input
                id={`charge-desc-${row.key}`}
                value={row.description}
                maxLength={80}
                placeholder="e.g. Extra bed, Broken vase"
                onChange={(e) => onChange(row.key, { description: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`charge-section-${row.key}`}>Charged under</Label>
              <NativeSelect
                id={`charge-section-${row.key}`}
                value={row.section}
                onChange={(e) => onChange(row.key, { section: e.target.value as ExtraChargeSection })}
              >
                {sectionLabels.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`charge-qty-${row.key}`}>Qty</Label>
              <Input
                id={`charge-qty-${row.key}`}
                inputMode="numeric"
                className="text-right tabular-nums"
                value={row.quantity}
                onChange={(e) => onChange(row.key, { quantity: e.target.value.replace(/[^\d]/g, "") })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`charge-amount-${row.key}`}>₹ each</Label>
              <Input
                id={`charge-amount-${row.key}`}
                inputMode="decimal"
                className="text-right tabular-nums"
                value={row.amount}
                placeholder="0.00"
                onChange={(e) => onChange(row.key, { amount: e.target.value.replace(/[^\d.]/g, "") })}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`charge-comment-${row.key}`}>Comment (printed under the charge)</Label>
              <Input
                id={`charge-comment-${row.key}`}
                value={row.comment}
                maxLength={200}
                placeholder="e.g. Vase in B-104 broken on 3 Oct"
                onChange={(e) => onChange(row.key, { comment: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove charge ${i + 1}`}
              onClick={() => onRemove(row.key)}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_EXTRA_CHARGES} onClick={onAdd}>
        <PlusIcon />
        Add a charge
      </Button>
    </section>
  );
}

/**
 * The invoice's figures laid out like the printed page — `invoiceTable`, the
 * same description the PDF draws — with the meal counts editable before issue.
 */
function InvoicePreview({
  doc,
  counts,
  onCount,
  pricing,
}: {
  doc: InvoiceDocument;
  counts: CountRows | null;
  onCount: (meal: keyof MealCounts, value: string) => void;
  pricing: boolean;
}) {
  // The same facts the PDF prints (`invoiceFacts`): project rows only with
  // the Project head, and on a dining invoice nothing about rooms.
  const { left, right } = invoiceFacts(doc);
  const facts = [...left, ...right]
    .filter(([label]) => !/^Invoice (No|Date)/.test(label))
    .map(([label, value]) => [label.replace(/\s*:\s*$/, ""), value] as [string, string]);
  const table = invoiceTable(doc);
  const figure = pricing ? "opacity-60 transition-opacity" : "transition-opacity";
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
          {table.sections.map((section, s) => (
            <SectionRows
              key={section.key}
              section={section}
              first={s === 0}
              rateHeading={table.rateHeading}
              counts={counts}
              onCount={onCount}
              figure={figure}
            />
          ))}
          <tbody>
            {table.closing.map((t, i) => (
              <tr
                key={t.label}
                className={
                  i === table.closing.length - 1
                    ? "border-t bg-muted/40 text-base font-semibold"
                    : "border-t font-medium"
                }
              >
                <td colSpan={3} className="p-2 text-right">
                  {t.label.replace(/:$/, "")}
                </td>
                <td className={`p-2 text-right tabular-nums ${figure}`}>{formatINR(t.amount)}</td>
              </tr>
            ))}
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
          Meal counts are covers — meals ticked × guests eating (infants excluded). Amounts and the grand total
          update as you type{pricing ? " — updating…" : "."}
        </p>
      )}
    </div>
  );
}

function SectionRows({
  section,
  first,
  rateHeading,
  counts,
  onCount,
  figure,
}: {
  section: ReturnType<typeof invoiceTable>["sections"][number];
  first: boolean;
  rateHeading: string;
  counts: CountRows | null;
  onCount: (meal: keyof MealCounts, value: string) => void;
  figure: string;
}) {
  return (
    <>
      <thead className="bg-muted/60">
        <tr className={first ? undefined : "border-t"}>
          <th className="p-2 text-left font-medium">{section.heading}</th>
          <th className="p-2 text-right font-medium">{section.qtyHeading}</th>
          <th className="p-2 text-right font-medium">{rateHeading}</th>
          <th className="p-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {section.rows.length === 0 && (
          <tr>
            <td colSpan={4} className="p-2 text-muted-foreground">
              {section.key === "rooms" ? "No rooms" : "None"}
            </td>
          </tr>
        )}
        {section.rows.map((row, i) => (
          <tr key={`${row.label}-${i}`} className="border-t">
            <td className="p-2">
              {row.label}
              {row.note && <span className="block text-xs text-muted-foreground">{row.note}</span>}
            </td>
            <td className="p-2 text-right">
              {row.meal && counts ? (
                <Input
                  aria-label={`${MEAL_LABELS[row.meal]} served`}
                  inputMode="numeric"
                  className="ml-auto h-8 w-20 text-right tabular-nums"
                  value={counts[row.meal]}
                  onChange={(e) => onCount(row.meal!, e.target.value.replace(/[^\d]/g, ""))}
                />
              ) : (
                <span className="tabular-nums">{row.qty}</span>
              )}
            </td>
            <td className={`p-2 text-right tabular-nums ${figure}`}>
              {row.rate === null ? (row.unpriced ? "⚠ no rate" : "—") : formatINR(row.rate)}
            </td>
            <td className={`p-2 text-right tabular-nums ${figure}`}>{formatINR(row.amount)}</td>
          </tr>
        ))}
        {section.totals.map((t) => (
          <tr key={t.label} className="border-t font-medium">
            <td colSpan={3} className="p-2 text-right">
              {t.label.replace(/:$/, "")}
            </td>
            <td className={`p-2 text-right tabular-nums ${figure}`}>{formatINR(t.amount)}</td>
          </tr>
        ))}
      </tbody>
    </>
  );
}
