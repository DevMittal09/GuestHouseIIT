"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBookingStay } from "@/app/actions/manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stayNights } from "@/lib/policy";
import { addDaysToDateValue, toInstituteDateTimeValue, toInstituteDateValue } from "@/lib/tz";
import type { BookingWithDetails } from "@/lib/types";

/**
 * **Shorten the stay before approving it** (4 Nov 2026, the owner's sixteenth
 * list: "the GHM has the authority to reduce the requested number of days,
 * e.g. changing a 10-day request to 3 days, before or while approving").
 *
 * Only the check-out moves, and only earlier; the time of day stays as asked.
 * `updateBookingStay` is the write: it re-checks the role, refuses a meal plan
 * the new dates would strand, and puts the reason in the booking's log.
 */
export function ShortenStay({ booking }: { booking: BookingWithDetails }) {
  const router = useRouter();
  const requestedOut = toInstituteDateValue(booking.check_out);
  const earliest = addDaysToDateValue(toInstituteDateValue(booking.check_in), 1);
  const latest = addDaysToDateValue(requestedOut, -1);
  const [date, setDate] = useState(latest);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // A one-night stay has nothing to take off.
  if (latest < earliest) return null;

  const time = toInstituteDateTimeValue(booking.check_out).slice(11);
  const nights = stayNights(new Date(booking.check_in), new Date(booking.check_out));
  const save = () =>
    startTransition(async () => {
      const result = await updateBookingStay(booking.id, {
        check_out: `${date}T${time}`,
        reason: `Stay shortened from ${nights} nights: ${reason.trim()}`,
      });
      if (result.ok) {
        toast.success("Stay shortened");
        setReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <details className="rounded-lg border border-border bg-band/60 p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">Shorten this stay</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`shorten-${booking.id}`}>New check-out date</Label>
          <Input
            id={`shorten-${booking.id}`}
            type="date"
            min={earliest}
            max={latest}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`shorten-reason-${booking.id}`}>Reason</Label>
          <Input
            id={`shorten-reason-${booking.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !reason.trim() || date < earliest || date > latest}
          onClick={save}
        >
          {pending ? "Saving…" : "Shorten stay"}
        </Button>
      </div>
    </details>
  );
}
