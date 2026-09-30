"use client";

import { CheckoutsToday } from "@/components/checkouts-today";
import { StaysTable } from "@/components/stays-table";
import { SectionHeading } from "@/components/section-heading";
import { DeskSummary } from "@/components/desk-summary";
import type { BookingWithDetails } from "@/lib/types";

/**
 * The reception desk's console — a deliberate subset of the manager's.
 *
 * The office was explicit that whoever sits at the guest house reception
 * should not be handed the full manager screen: they need to see who is in the
 * building, who is arriving, who is leaving today, and to record people in and
 * out. Allocation, approvals, rejections and cancellations stay with the
 * manager, so none of that is drawn here — the caretaker cannot reach those
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
  nowIso,
}: {
  current: BookingWithDetails[];
  upcoming: BookingWithDetails[];
  overdue: BookingWithDetails[];
  checkoutsToday: BookingWithDetails[];
  /** Checked out, invoice not yet paid — the same list as the manager's. */
  toBill?: BookingWithDetails[];
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
        ]}
      />
      <div id="checkouts" className="scroll-mt-20">
        <CheckoutsToday bookings={checkoutsToday} nowIso={nowIso} />
      </div>

      <section id="in-house" className="scroll-mt-20">
        <SectionHeading
          title="Current occupants"
          count={current.length}
          description={
            <>
              Guests in the building now. Mark a guest as Occupied when they arrive at the desk, and Vacated when they leave.
            </>
          }
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
            description={
              <>
                Past their check-out time and never marked Vacated, so they are still holding their rooms. Close them off once the room is handed back.
              </>
            }
          />
          <StaysTable bookings={overdue} showOverdue />
        </section>
      )}

      {/* Checked out and still owing (24 Sep 2026). Reception issues the
          invoice, and a stay marked Vacated used to vanish from this console
          with its bill still open — the manager had this list, the desk that
          hands the invoice over did not. */}
      {toBill.length > 0 && (
        <section id="to-bill" className="scroll-mt-20">
          <SectionHeading
            title="Checked out — to bill"
            count={toBill.length}
            description={
              <>
                These guests have left and their invoice is not yet paid. Issue it, print it again, or record the payment — they leave this list once it is settled. Older stays are invoiced from the Approval Log.
              </>
            }
          />
          <StaysTable bookings={toBill} />
        </section>
      )}

      <section id="upcoming" className="scroll-mt-20">
        <SectionHeading
          title="Upcoming stays"
          count={upcoming.length}
          description={
            <>
              Rooms are already held for these bookings. If a guest turns up before their booked time, use <span className="font-medium">Early check-in</span> — the arrival is recorded as early rather than pretending it was on time.
            </>
          }
        />
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground">
            No upcoming stays for this guest house.
          </p>
        ) : (
          <StaysTable bookings={upcoming} />
        )}
      </section>
    </div>
  );
}
