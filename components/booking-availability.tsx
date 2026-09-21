"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getRoomAvailability } from "@/app/actions/availability";
import {
  LegendSwatch,
  OccupancyChart,
  RangeOccupancyChart,
} from "@/components/occupancy-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVAILABILITY_VIEWS,
  availabilityRange,
  bucketOccupancyByDay,
  bucketOccupancyByHour,
  describeRange,
  freeRoomsByDay,
  rangeProgress,
  shiftAnchor,
  toDateInputValue,
  type AvailabilityView,
} from "@/lib/availability";
import { instituteHour } from "@/lib/tz";
import { cn } from "@/lib/utils";
import type { Room, RoomOccupancySegment } from "@/lib/types";

interface Loaded {
  /** Which request this data answers — see `requestKey` below. */
  key: string;
  rooms: Room[];
  segments: RoomOccupancySegment[];
  failed: boolean;
}

/**
 * Room availability for the stay being booked, inside the booking form.
 *
 * It opens on the check-in date, but the requester can move around freely from
 * there — a day either side, the whole week, the month. That was the point of
 * the office's request: someone who finds their date full needs to see what
 * *is* free before they can pick again, and sending them to `/availability` in
 * another tab meant losing a half-filled form.
 *
 * The browsing is deliberately transient. Moving the chart does not move the
 * booking: the dates come from the form fields above, and `Back to check-in`
 * returns the chart to them. It is the same chart, action and bucketing as
 * `/availability`, so what the requester sees while choosing and what the
 * manager sees while allocating cannot drift.
 */
export function BookingAvailability({
  guestHouseId,
  date,
  guestHouseName,
}: {
  guestHouseId: string;
  /** The check-in date chosen on the form — where the chart starts. */
  date: string;
  guestHouseName?: string;
}) {
  const [view, setView] = useState<AvailabilityView>("week");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /**
   * Where the requester has browsed to, tagged with the check-in date it was
   * chosen against. Picking a new check-in date makes `from` stale, so the
   * chart snaps back to the new date on its own — no effect, and no setState
   * during render for the React Compiler to reject.
   */
  const [browsed, setBrowsed] = useState<{ from: string; value: string } | null>(null);

  const anchor = browsed && browsed.from === date ? browsed.value : date;
  const browsing = anchor !== date;
  const moveTo = (value: string) => setBrowsed({ from: date, value });

  const ready = Boolean(guestHouseId && anchor);
  const range = useMemo(
    () => (ready ? availabilityRange(view, anchor) : null),
    [ready, view, anchor]
  );

  // Loading is derived by comparing keys rather than kept as a flag, so the
  // effect never sets state synchronously (React Compiler lint).
  const requestKey = `${guestHouseId}|${view}|${anchor}|${refreshKey}`;
  const loading = Boolean(range) && loaded?.key !== requestKey;

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    getRoomAvailability(guestHouseId, range.start.toISOString(), range.end.toISOString())
      .then((data) => {
        if (cancelled) return;
        setLoaded({ key: requestKey, rooms: data.rooms, segments: data.segments, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded({ key: requestKey, rooms: [], segments: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [guestHouseId, range, requestKey]);

  // Both memoised off `loaded` so the identity is stable between renders —
  // `?? []` alone makes a fresh array every render and re-runs the bucketing.
  const rooms = useMemo(() => loaded?.rooms ?? [], [loaded]);
  const segments = useMemo(() => loaded?.segments ?? [], [loaded]);

  const hourly = useMemo(
    () => (range?.view === "day" ? bucketOccupancyByHour(rooms, segments, range.start) : null),
    [rooms, segments, range]
  );
  const daily = useMemo(
    () => (range ? bucketOccupancyByDay(rooms, segments, range) : null),
    [rooms, segments, range]
  );

  const today = toDateInputValue(new Date());
  const showsToday = range?.days.includes(today) ?? false;
  const freeAllRange = rooms.filter((r) => (daily?.get(r.id)?.segments.length ?? 0) === 0);
  const period = view === "day" ? "day" : view;

  if (!guestHouseId || !date) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Pick a guest house and a check-in date to see which rooms are free.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="block text-xs">View</Label>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="View">
            {AVAILABILITY_VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={option.value === view}
                onClick={() => setView(option.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  option.value === view
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="booking-availability-date" className="block text-xs">
            {view === "day" ? "Showing" : `Any date in the ${period}`}
          </Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Previous ${period}`}
              disabled={!range}
              onClick={() => moveTo(shiftAnchor(view, anchor, -1))}
            >
              <ChevronLeftIcon />
            </Button>
            <Input
              id="booking-availability-date"
              type="date"
              value={anchor}
              onChange={(e) => moveTo(e.target.value)}
              className="w-40"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Next ${period}`}
              disabled={!range}
              onClick={() => moveTo(shiftAnchor(view, anchor, 1))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>

        {/* Only offered once it would do something — and it is how the
            requester gets back after wandering off. */}
        {browsing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setBrowsed(null)}>
            Back to check-in date
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {loading ? (
          "Loading availability…"
        ) : loaded?.failed ? (
          <span className="text-destructive">
            Could not load availability — you can still submit; the manager checks again at
            allocation.
          </span>
        ) : range ? (
          <>
            <span className="font-medium text-foreground">{freeAllRange.length}</span> of{" "}
            <span className="font-medium text-foreground">{rooms.length}</span> rooms
            {guestHouseName ? ` at ${guestHouseName}` : ""} are free all {period} —{" "}
            <span className="font-medium text-foreground">{describeRange(range)}</span>
          </>
        ) : (
          "Pick a date to see room availability."
        )}
      </p>

      {browsing && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          You are looking at another date. This does not change your booking — the stay is still
          the check-in and check-out you entered above.
        </p>
      )}

      {rooms.length > 0 && range && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <LegendSwatch className="bg-red-500" label="Booked" />
            <LegendSwatch className="bg-turnaround" label="Turnaround (housekeeping after a stay)" />
            <LegendSwatch className="border bg-background" label="Free" />
            {showsToday && (
              <LegendSwatch
                className="bg-primary"
                label={view === "day" ? "Current hour" : "Today and the current time"}
              />
            )}
          </div>
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            {hourly ? (
              <OccupancyChart
                rooms={rooms}
                occupancy={hourly}
                currentHour={showsToday ? instituteHour() : null}
                compact
              />
            ) : daily ? (
              <RangeOccupancyChart
                rooms={rooms}
                range={range}
                occupancy={daily}
                freeByDay={freeRoomsByDay(rooms, daily, range)}
                today={today}
                nowAt={rangeProgress(range)}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Times are institute local time. Rooms are held by approved, occupied and
            pending-cancellation bookings — a request still awaiting approval reserves nothing, so
            availability can change before yours is approved.
          </p>
        </>
      )}

      {!loading && rooms.length === 0 && !loaded?.failed && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          This guest house has no active rooms.
        </p>
      )}
    </div>
  );
}
