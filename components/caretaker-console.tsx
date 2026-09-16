"use client";

import { CheckoutsToday } from "@/components/checkouts-today";
import { StaysTable } from "@/components/stays-table";
import { Badge } from "@/components/ui/badge";
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
        <h2 className="mb-1 text-lg font-semibold">
          Current occupants{" "}
          <Badge variant="secondary" className="align-middle">
            {current.length}
          </Badge>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Guests in the building now. Mark a guest as Occupied when they arrive at the desk, and
          Vacated when they leave.
        </p>
        {current.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Nobody is staying at this guest house right now.
          </p>
        ) : (
          <StaysTable bookings={current} />
        )}
      </section>

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">
            Awaiting check-out{" "}
            <Badge variant="destructive" className="align-middle">
              {overdue.length}
            </Badge>
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Past their check-out time and never marked Vacated, so they are still holding their
            rooms. Close them off once the room is handed back.
          </p>
          <StaysTable bookings={overdue} showOverdue />
        </section>
      )}

      <section>
        <h2 className="mb-1 text-lg font-semibold">
          Upcoming stays{" "}
          <Badge variant="secondary" className="align-middle">
            {upcoming.length}
          </Badge>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Rooms are already held for these bookings. A stay cannot be marked Occupied before its
          check-in time — until then the guest has not arrived.
        </p>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No upcoming stays for this guest house.
          </p>
        ) : (
          <StaysTable bookings={upcoming} />
        )}
      </section>
    </div>
  );
}
