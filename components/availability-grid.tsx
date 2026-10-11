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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { AvailabilityCountsPanel } from "@/components/availability-counts";
import {
  AvailabilityLegend,
  OccupancyChart,
  RangeOccupancyChart,
} from "@/components/occupancy-chart";
import {
  AVAILABILITY_VIEWS,
  availabilityRange,
  type AvailabilityCounts,
  bucketOccupancyByDay,
  bucketOccupancyByHour,
  describeRange,
  describeSegmentStatus,
  freeRoomsByDay,
  rangeProgress,
  roomRangeStatus,
  shiftAnchor,
  toDateInputValue,
  type AvailabilityView,
} from "@/lib/availability";
import { formatDateTime } from "@/lib/format";
import { instituteHour } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { segment, segmentGroup } from "@/components/segmented";
import { type GuestHouse, type Room, type RoomOccupancySegment } from "@/lib/types";
import { EmptyState } from "@/components/section-heading";

interface Loaded {
  /** Which request this data answers - see `requestKey` below. */
  key: string;
  rooms: Room[];
  segments: RoomOccupancySegment[];
  showsOccupant: boolean;
  /**
   * Whether this answer carries the rooms at all. The desk draws the chart
   * from `rooms` and `segments`; everyone else is sent `counts` and nothing
   * else (7 Oct 2026) - see `getRoomAvailability`.
   */
  detailed: boolean;
  counts: AvailabilityCounts;
}

const NO_COUNTS: AvailabilityCounts = {
  total: 0,
  days: [],
  freeByDay: [],
  freeThroughout: 0,
  freeByHour: null,
  bookedNow: null,
};

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
        setLoaded({
          key: requestKey,
          rooms: [],
          segments: [],
          showsOccupant: false,
          detailed: false,
          counts: NO_COUNTS,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [guestHouseId, range, requestKey]);

  const rooms = useMemo(() => loaded?.rooms ?? [], [loaded]);
  const segments = useMemo(() => loaded?.segments ?? [], [loaded]);
  const showsOccupant = loaded?.showsOccupant ?? false;
  const detailed = loaded?.detailed ?? false;
  const counts = loaded?.counts ?? NO_COUNTS;

  // The day chart draws hours. Every view also takes per-day totals, which
  // drive the badges and counts, so "booked" means the same thing in all three.
  const hourly = useMemo(
    () => (range?.view === "day" ? bucketOccupancyByHour(rooms, segments, range.start) : null),
    [rooms, segments, range]
  );
  const daily = useMemo(
    () => (range ? bucketOccupancyByDay(rooms, segments, range) : null),
    [rooms, segments, range]
  );

  const today = todayValue();
  const showsToday = range?.days.includes(today) ?? false;
  // Institute time, not the reader's: the markers have to line up with the
  // rows, which are the guest house's hours and days.
  const currentHour = instituteHour();
  /**
   * The header's figures come from `counts`, which the server computes for
   * everybody - so a requester, who is sent no rooms at all (7 Oct 2026),
   * still gets the same totals the desk reads, from the same arithmetic.
   */
  const roomCount = detailed ? rooms.length : counts.total;
  const bookedNow = counts.bookedNow ?? 0;
  const bookedInRange = Math.max(0, counts.total - counts.freeThroughout);
  const period = PERIOD[view];

  if (guestHouses.length === 0) {
    return (
      <EmptyState>No guest houses have been set up yet.</EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          {guestHouses.length > 1 && (
            <div className="space-y-1.5">
              <Label className="block">Guest house</Label>
              <div className={segmentGroup} role="group" aria-label="Guest house">
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
            <div className={segmentGroup} role="group" aria-label="View">
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
                <Figure>{roomCount}</Figure> rooms · <Figure>{bookedInRange}</Figure> booked{" "}
                {view === "day" ? "on this date" : `during this ${period}`}
                {view !== "day" && (
                  <>
                    {" "}
                    · <Figure>{counts.freeThroughout}</Figure> free all {period}
                  </>
                )}
                {counts.bookedNow !== null && (
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
          <CardTitle>Room availability{range ? ` - ${describeRange(range)}` : ""}</CardTitle>
          {/* No description (9 Oct 2026): the legend below names every colour
              and the chart's own axes are labelled. */}
        </CardHeader>
        <CardContent className="space-y-4">
          {detailed && (
            <AvailabilityLegend
              showsToday={showsToday}
              dayView={view === "day"}
              freeLabel="Vacant"
            />
          )}

          {!range ? (
            <EmptyState>Pick a date to see room availability.</EmptyState>
          ) : roomCount === 0 && !loading ? (
            <EmptyState>This guest house has no active rooms.</EmptyState>
          ) : (
            <div className={cn("transition-opacity", loading && "opacity-60")}>
              {/* A requester is sent counts and no rooms at all (7 Oct 2026),
                  so there is nothing here to draw a chart from - and nothing
                  that could leak a room number. */}
              {!detailed ? (
                <AvailabilityCountsPanel
                  counts={counts}
                  today={today}
                  currentHour={showsToday ? currentHour : null}
                />
              ) : hourly ? (
                <OccupancyChart
                  rooms={rooms}
                  occupancy={hourly}
                  currentHour={showsToday ? currentHour : null}
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

      {/* The room-by-room list is the **desk's** (1 Oct 2026).
          
          A requester asking "is a room free" is answered by the grid above;
          this list adds every booking's exact period, reference id and
          housekeeping state, which is the guest house's own business and was
          making the page read like an operations screen. The manager and the
          caretaker keep it - `detailed` is the same flag that decides whether
          the chart draws turnarounds and overlaps, and the server sets it
          (`getRoomAvailability`), so what is shown and what is sent agree. */}
      {range && detailed && (
        <Card>
          <CardHeader>
            <CardTitle>Room details</CardTitle>
            {!showsOccupant && (
              <CardDescription>Guest names are visible to guest house staff only.</CardDescription>
            )}
          </CardHeader>
          {/* A table, not a card per room (11 Oct 2026).

              Bageshri has twenty rooms and most weeks they are nearly all
              free, so this was twenty bordered cards running 1100px down the
              page, nineteen of them carrying the same sentence - "Free all
              week - available to book." A free room now says nothing at all:
              a dash in the last column and a quiet row, so the booked ones
              are the only thing here with ink in them. */}
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>This {period}</TableHead>
                  <TableHead className="w-full">Booked periods</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => {
                  const entry = daily?.get(room.id);
                  const status = roomRangeStatus(entry, range);
                  const roomSegments = entry?.segments ?? [];
                  const vacant = roomSegments.length === 0;
                  return (
                    <TableRow key={room.id} className={vacant ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-mono text-xs font-semibold text-ink">
                        {room.room_number}
                      </TableCell>
                      <TableCell className="text-xs">
                        {room.room_type === "double_sharing" ? "Double sharing" : "Single"}
                      </TableCell>
                      <TableCell>
                        {status === "vacant" ? (
                          <span className="text-xs">Vacant</span>
                        ) : (
                          <Badge variant="tag" className={status === "booked" ? "tag-red" : "tag-yellow"}>
                            {status === "booked" ? "Booked" : "Partly booked"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {vacant ? (
                          <span aria-label={`Free all ${period} - available to book`}>-</span>
                        ) : (
                          <ul className="space-y-1">
                            {roomSegments.map((s) => (
                              <li key={s.booking_id} className="text-meta text-foreground">
                                <span className="font-medium">{formatDateTime(s.check_in)}</span>
                                {" → "}
                                <span className="font-medium">{formatDateTime(s.check_out)}</span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {s.booking_reference_id} · {describeSegmentStatus(s)}
                                  {s.requester_name && ` · ${s.requester_name}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
      className={segment(active)}
    >
      {children}
    </button>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}
