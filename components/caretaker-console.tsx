"use client";

import { CheckoutsToday } from "@/components/checkouts-today";
import { StaysTable } from "@/components/stays-table";
import { AwaitingPaymentTable } from "@/components/awaiting-payment";
import type { AwaitingPaymentRow } from "@/lib/invoice";
import { SectionHeading } from "@/components/section-heading";
import { DeskSummary } from "@/components/desk-summary";
import type { BookingWithDetails } from "@/lib/types";

/**
 * The reception desk's console - a deliberate subset of the manager's.
 *
 * The office was explicit that whoever sits at the guest house reception
 * should not be handed the full manager screen: they need to see who is in the
 * building, who is arriving, who is leaving today, and to record people in and
 * out. Allocation, approvals, rejections and cancellations stay with the
 * manager, so none of that is drawn here - the caretaker cannot reach those
 * actions by any route, because the server checks the role again on every one
 * of them.
 *
 * The tables themselves are the *same* components the manager uses, not
 * simplified copies, so the two consoles cannot drift apart.
 */
export function CaretakerConsole({
  current,
  upcoming,
  overdue,
  checkoutsToday,
  toBill = [],
  awaitingPayment = [],
  nowIso,
}: {
  current: BookingWithDetails[];
  upcoming: BookingWithDetails[];
  overdue: BookingWithDetails[];
  checkoutsToday: BookingWithDetails[];
  /** Checked out, invoice not yet paid - the same list as the manager's. */
  toBill?: BookingWithDetails[];
  /**
   * Invoice issued and still unpaid, however long ago (7 Oct 2026). The same
   * list the manager has: reception records a payment when it arrives, and a
   * personal meal booking is settled here at the guest house.
   */
  awaitingPayment?: AwaitingPaymentRow[];
  nowIso: string;
}) {
  return (
    <div className="space-y-10">
      <DeskSummary
        figures={[
          { label: "Checking out today", count: checkoutsToday.length, anchor: "checkouts" },
          { label: "In house now", count: current.length, anchor: "in-house" },
          { label: "Awaiting check-out", count: overdue.length, anchor: "awaiting", alert: true },
          { label: "To bill", count: toBill.length, anchor: "to-bill" },
          { label: "Upcoming stays", count: upcoming.length, anchor: "upcoming" },
          ...(awaitingPayment.length > 0
            ? [{ label: "Awaiting payment", count: awaitingPayment.length, anchor: "awaiting-payment" }]
            : []),
        ]}
      />
      <div id="checkouts" className="scroll-mt-20">
        <CheckoutsToday bookings={checkoutsToday} nowIso={nowIso} />
      </div>

      <section id="in-house" className="scroll-mt-20">
        <SectionHeading
          title="Current occupants"
          count={current.length}
        />
        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
            Nobody is staying at this guest house right now.
          </p>
        ) : (
          <StaysTable bookings={current} />
        )}
      </section>

      {overdue.length > 0 && (
        <section id="awaiting" className="scroll-mt-20">
          <SectionHeading
            title="Awaiting check-out"
            count={overdue.length}
            tone="alert"
            description="Past check-out, never marked Vacated - still holding their rooms."
          />
          <StaysTable bookings={overdue} showOverdue />
        </section>
      )}

      {/* Checked out and still owing (24 Sep 2026). Reception issues the
          invoice, and a stay marked Vacated used to vanish from this console
          with its bill still open - the manager had this list, the desk that
          hands the invoice over did not. */}
      {toBill.length > 0 && (
        <section id="to-bill" className="scroll-mt-20">
          <SectionHeading
            title="Checked out - to bill"
            count={toBill.length}
            description="Left, and not yet settled. Older stays are invoiced from the Approval Log."
          />
          <StaysTable bookings={toBill} />
        </section>
      )}

      <section id="upcoming" className="scroll-mt-20">
        <SectionHeading
          title="Upcoming stays"
          count={upcoming.length}
        />
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
            No upcoming stays for this guest house.
          </p>
        ) : (
          <StaysTable bookings={upcoming} />
        )}
      </section>

      {/* **Awaiting payment** - the last section, and the only one with no
          date window (7 Oct 2026). "Checked out - to bill" above is the
          stays nobody has invoiced yet; this is the bills that have gone out
          and not come back. A personal meal booking is settled here at the
          guest house, which is why reception has the list and not only the
          manager. */}
      {awaitingPayment.length > 0 && (
        <section id="awaiting-payment" className="scroll-mt-20">
          <SectionHeading
            title="Awaiting payment"
            count={awaitingPayment.length}
            description="Invoice issued, not yet paid. No date cut-off."
          />
          <AwaitingPaymentTable rows={awaitingPayment} />
        </section>
      )}
    </div>
  );
}
