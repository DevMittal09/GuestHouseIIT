"use client";

import { useEffect, useMemo, useState } from "react";
import { getRoomAvailability } from "@/app/actions/availability";
import { LegendSwatch, OccupancyChart } from "@/components/occupancy-chart";
import { Button } from "@/components/ui/button";
import { bucketOccupancyByHour, dayBounds, toDateInputValue } from "@/lib/availability";
import { formatDate } from "@/lib/format";
import { instituteHour } from "@/lib/tz";
import type { Room, RoomOccupancySegment } from "@/lib/types";

interface Loaded {
  /** Which request this data answers — see `requestKey` below. */
  key: string;
  rooms: Room[];
  segments: RoomOccupancySegment[];
  failed: boolean;
}

/**
 * Hour-by-hour room availability for the day being booked, shown inside the
 * booking form.
 *
 * Requesters were picking dates blind and finding out a room was taken only
 * when the submission bounced. This is the same chart as `/availability` —
 * same action, same bucketing — so what the requester sees while choosing and
 * what the manager sees while allocating cannot disagree.
 *
 * `getRoomAvailability` strips guest identity for everyone but the manager and
 * the developer, so this shows *when* rooms are taken, never by whom.
 */
export function BookingAvailability({
  guestHouseId,
  date,
  guestHouseName,
}: {
  guestHouseId: string;
  date: string;
  guestHouseName?: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const ready = Boolean(guestHouseId && date);
  // Deriving "loading" from a key comparison rather than a state flag keeps
  // the effect free of a synchronous setState, which the React Compiler lint
  // rejects. `/availability` derives its loading state the same way.
  const requestKey = `${guestHouseId}|${date}|${refreshKey}`;
  const loading = ready && loaded?.key !== requestKey;

  useEffect(() => {
    if (!ready) return;
    const { start, end } = dayBounds(date);
    if (Number.isNaN(start.getTime())) return;
    let cancelled = false;
    getRoomAvailability(guestHouseId, start.toISOString(), end.toISOString())
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
  }, [ready, guestHouseId, date, requestKey]);

  // Both memoised off `loaded` so the identity is stable between renders —
  // `?? []` alone makes a fresh array every render and re-runs the bucketing.
  const rooms = useMemo(() => loaded?.rooms ?? [], [loaded]);
  const segments = useMemo(() => loaded?.segments ?? [], [loaded]);
  const { start } = useMemo(() => dayBounds(date || toDateInputValue(new Date())), [date]);
  const occupancy = useMemo(
    () => bucketOccupancyByHour(rooms, segments, start),
    [rooms, segments, start]
  );

  const freeAllDay = rooms.filter((r) => (occupancy.get(r.id)?.segments.length ?? 0) === 0);
  const isToday = date === toDateInputValue(new Date());

  if (!ready) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Pick a guest house and a check-in date to see which rooms are free that day.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {loading ? (
            "Loading availability…"
          ) : loaded?.failed ? (
            <span className="text-destructive">
              Could not load availability — you can still submit; the manager checks again at
              allocation.
            </span>
          ) : (
            <>
              <span className="font-medium text-foreground">{freeAllDay.length}</span> of{" "}
              <span className="font-medium text-foreground">{rooms.length}</span> rooms
              {guestHouseName ? ` at ${guestHouseName}` : ""} are free all day on{" "}
              <span className="font-medium text-foreground">{formatDate(start.toISOString())}</span>
            </>
          )}
        </p>
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

      {rooms.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <LegendSwatch className="bg-red-500" label="Already booked" />
            <LegendSwatch className="border bg-background" label="Free" />
            {isToday && <LegendSwatch className="bg-primary" label="Current hour" />}
          </div>
          <OccupancyChart
            rooms={rooms}
            occupancy={occupancy}
            currentHour={isToday ? instituteHour() : null}
            compact
          />
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
