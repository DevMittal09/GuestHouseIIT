"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { getRoomAvailability } from "@/app/actions/availability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OccupancyChart,
  OccupancyLegend,
  RangeOccupancyChart,
} from "@/components/occupancy-chart";
import {
  AVAILABILITY_VIEWS,
  availabilityRange,
  bucketOccupancyByDay,
  describeRange,
  describeSegmentStatus,
  freeRoomsByDay,
  rangeProgress,
  roomRangeStatus,
  roomsBookedAt,
  shiftAnchor,
  toDateInputValue,
  type AvailabilityView,
} from "@/lib/availability";
import { formatDateTime } from "@/lib/format";
import { instituteHour } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { type GuestHouse, type Room, type RoomOccupancySegment } from "@/lib/types";

interface Loaded {
  /** Which request this data answers — see `requestKey` below. */
  key: string;
  rooms: Room[];
  segments: RoomOccupancySegment[];
  showsOccupant: boolean;
}

const todayValue = () => toDateInputValue(new Date());

/** The period a view shows, for sentences such as "free all week". */
const PERIOD: Record<AvailabilityView, string> = { day: "day", week: "week", month: "month" };

/**
 * Read-only room availability, open to every signed-in user.
 *
 * Time runs down the chart and room numbers run across it in all three views:
 * the day view has a row per hour, the week and month views a row per day. A
 * room is red while a booking holds it and blank while it is free.
 */
export function AvailabilityGrid({ guestHouses }: { guestHouses: GuestHouse[] }) {
  const [guestHouseId, setGuestHouseId] = useState(guestHouses[0]?.id ?? "");
  const [view, setView] = useState<AvailabilityView>("week");
  const [date, setDate] = useState(todayValue);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Null while the date input is cleared, so the page asks for a date rather
  // than drawing a grid of "Invalid Date".
  const range = useMemo(() => availabilityRange(view, date), [view, date]);

  // Loading is derived by comparing keys rather than kept as a flag, so the
  // effect never sets state synchronously (React Compiler lint).
  const requestKey = `${guestHouseId}|${view}|${date}|${refreshKey}`;
  const loading = Boolean(guestHouseId && range) && loaded?.key !== requestKey;

  useEffect(() => {
    if (!guestHouseId || !range) return;
    let cancelled = false;
    getRoomAvailability(guestHouseId, range.start.toISOString(), range.end.toISOString())
      .then((data) => {
        if (!cancelled) setLoaded({ key: requestKey, ...data });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Could not load room availability");
        setLoaded({ key: requestKey, rooms: [], segments: [], showsOccupant: false });
      });
    return () => {
      cancelled = true;
    };
  }, [guestHouseId, range, requestKey]);

  const rooms = useMemo(() => loaded?.rooms ?? [], [loaded]);
  const segments = useMemo(() => loaded?.segments ?? [], [loaded]);
  const showsOccupant = loaded?.showsOccupant ?? false;

  // One bucketing for all three views — the day chart is a one-day range —
  // and it also drives the badges and counts, so "booked" means the same thing
  // everywhere on the page.
  const daily = useMemo(
    () => (range ? bucketOccupancyByDay(rooms, segments, range) : null),
    [rooms, segments, range]
  );

  const today = todayValue();
  const showsToday = range?.days.includes(today) ?? false;
  // Institute time, not the reader's: the markers have to line up with the
  // rows, which are the guest house's hours and days.
  const currentHour = instituteHour();
  const bookedNow = showsToday && daily ? roomsBookedAt(daily) : 0;
  const bookedInRange = rooms.filter((r) => (daily?.get(r.id)?.segments.length ?? 0) > 0).length;
  const period = PERIOD[view];

  if (guestHouses.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-strong bg-card/60 p-10 text-center text-muted-foreground">
        No guest houses have been set up yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          {guestHouses.length > 1 && (
            <div className="space-y-1.5">
              <Label className="block">Guest house</Label>
              <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                {guestHouses.map((gh) => (
                  <SegmentButton
                    key={gh.id}
                    active={gh.id === guestHouseId}
                    onClick={() => setGuestHouseId(gh.id)}
                  >
                    {gh.name}
                  </SegmentButton>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="block">View</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="View">
              {AVAILABILITY_VIEWS.map((option) => (
                <SegmentButton
                  key={option.value}
                  active={option.value === view}
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                </SegmentButton>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="availability-date">
              {view === "day" ? "Date" : `Any date in the ${period}`}
            </Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Previous ${period}`}
                disabled={!range}
                onClick={() => setDate((d) => shiftAnchor(view, d, -1))}
              >
                <ChevronLeftIcon />
              </Button>
              <Input
                id="availability-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-40"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Next ${period}`}
                disabled={!range}
                onClick={() => setDate((d) => shiftAnchor(view, d, 1))}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => setDate(todayValue())}>
            Today
          </Button>
          <Button type="button" variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            {loading ? (
              "Loading availability…"
            ) : (
              <>
                <Figure>{rooms.length}</Figure> rooms · <Figure>{bookedInRange}</Figure> booked{" "}
                {view === "day" ? "on this date" : `during this ${period}`}
                {view !== "day" && (
                  <>
                    {" "}
                    · <Figure>{rooms.length - bookedInRange}</Figure> free all {period}
                  </>
                )}
                {showsToday && (
                  <>
                    {" "}
                    · <Figure>{bookedNow}</Figure> booked right now
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Room availability{range ? ` — ${describeRange(range)}` : ""}</CardTitle>
          <CardDescription>
            {view === "day"
              ? "Hours of the day down the side, room numbers across the top. Each booking is one bar from its check-in to its check-out; blank means the room is free."
              : "Days down the side, room numbers across the top. Each day's row runs from midnight at its top edge to midnight at its bottom, so a stay is one bar from check-in to check-out. The figure beside each date is the number of rooms free all day."}{" "}
            Back-to-back bookings in a room alternate between two shades of red, and amber marks
            two bookings holding the same room at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OccupancyLegend
            nowLabel={
              showsToday ? (view === "day" ? "Current time" : "Today and the current time") : null
            }
          />

          {!range ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-card/60 p-10 text-center text-muted-foreground">
              Pick a date to see room availability.
            </p>
          ) : rooms.length === 0 && !loading ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-card/60 p-10 text-center text-muted-foreground">
              This guest house has no active rooms.
            </p>
          ) : (
            <div className={cn("transition-opacity", loading && "opacity-60")}>
              {daily && range.view === "day" ? (
                <OccupancyChart
                  rooms={rooms}
                  occupancy={daily}
                  currentHour={showsToday ? currentHour : null}
                  nowAt={rangeProgress(range)}
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
          )}
        </CardContent>
      </Card>

      {range && (
        <Card>
          <CardHeader>
            <CardTitle>Room details</CardTitle>
            <CardDescription>
              Every room in this guest house with its bookings during {describeRange(range)}.
              {!showsOccupant && " Guest details are visible to guest house staff only."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rooms.map((room) => {
              const entry = daily?.get(room.id);
              const status = roomRangeStatus(entry, range);
              const roomSegments = entry?.segments ?? [];
              const overlapping = new Set(
                (entry?.overlaps ?? []).flatMap((o) => o.segments.map((s) => s.booking_id))
              );
              return (
                <div
                  key={room.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border p-3"
                >
                  <div className="w-24 shrink-0">
                    <p className="font-semibold">{room.room_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {room.room_type === "double_sharing" ? "Double sharing" : "Single"}
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    {status === "vacant" ? (
                      <Badge variant="secondary">Vacant</Badge>
                    ) : status === "booked" ? (
                      <Badge variant="destructive">Booked</Badge>
                    ) : (
                      <Badge variant="outline">Partly booked</Badge>
                    )}
                  </div>
                  <div className="min-w-48 flex-1 space-y-1">
                    {roomSegments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Free all {period} — available to book.
                      </p>
                    ) : (
                      roomSegments.map((s) => (
                        <p key={s.booking_id} className="text-sm">
                          <span className="font-medium">{formatDateTime(s.check_in)}</span>
                          {" → "}
                          <span className="font-medium">{formatDateTime(s.check_out)}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {s.booking_reference_id} · {describeSegmentStatus(s)}
                            {s.requester_name && ` · ${s.requester_name}`}
                          </span>
                          {overlapping.has(s.booking_id) && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase dark:bg-amber-950 dark:text-amber-200">
                              Overlaps another booking
                            </span>
                          )}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {range && (
        <p className="text-xs text-muted-foreground">
          Availability shown for {describeRange(range)}, in institute time. Rooms are held by
          approved, occupied and pending-cancellation bookings; requests still awaiting approval
          do not reserve a room.
        </p>
      )}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}
