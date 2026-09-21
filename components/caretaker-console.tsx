"use client";

import { CheckoutsToday } from "@/components/checkouts-today";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/portal/section-header";
import { StaysTable } from "@/components/stays-table";
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
  nowIso,
}: {
  current: BookingWithDetails[];
  upcoming: BookingWithDetails[];
  overdue: BookingWithDetails[];
  checkoutsToday: BookingWithDetails[];
  nowIso: string;
}) {
  return (
    <div className="space-y-8">
      <CheckoutsToday bookings={checkoutsToday} nowIso={nowIso} />

      <section>
        <SectionHeader title="Current occupants" count={current.length}>
          Guests in the building now. Mark a guest as Occupied when they arrive at the desk, and
          Vacated when they leave.
        </SectionHeader>
        {current.length === 0 ? (
          <EmptyState compact title="Nobody in residence">
            Nobody is staying at this guest house right now.
          </EmptyState>
        ) : (
          <StaysTable bookings={current} />
        )}
      </section>

      {overdue.length > 0 && (
        <section>
          <SectionHeader title="Awaiting check-out" count={overdue.length} tone="alert">
            Past their check-out time and never marked Vacated, so they are still holding their
            rooms. Close them off once the room is handed back.
          </SectionHeader>
          <StaysTable bookings={overdue} showOverdue />
        </section>
      )}

      <section>
        <SectionHeader title="Upcoming stays" count={upcoming.length}>
          Rooms are already held for these bookings. If a guest turns up before their booked
          time, use <span className="font-medium">Early check-in</span> — the arrival is
          recorded as early rather than pretending it was on time.
        </SectionHeader>
        {upcoming.length === 0 ? (
          <EmptyState compact title="No upcoming stays">
            No upcoming stays for this guest house.
          </EmptyState>
        ) : (
          <StaysTable bookings={upcoming} />
        )}
      </section>
    </div>
  );
}
