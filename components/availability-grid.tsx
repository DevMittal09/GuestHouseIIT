"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getDayAvailability } from "@/app/actions/availability";
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
import { bucketOccupancyByHour, dayBounds, toDateInputValue } from "@/lib/availability";
import { LegendSwatch, OccupancyChart } from "@/components/occupancy-chart";
import { formatDate, formatDateTime } from "@/lib/format";
import { instituteHour } from "@/lib/tz";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  type GuestHouse,
  type Room,
  type RoomOccupancySegment,
} from "@/lib/types";

const todayValue = () => toDateInputValue(new Date());

/**
 * Read-only room availability chart, open to every signed-in user.
 * Y axis is the hours of the chosen day, X axis is the room number; a cell is
 * red while that room is held by a booking and blank while it is free.
 */
export function AvailabilityGrid({ guestHouses }: { guestHouses: GuestHouse[] }) {
  const [guestHouseId, setGuestHouseId] = useState(guestHouses[0]?.id ?? "");
  const [date, setDate] = useState(todayValue);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [segments, setSegments] = useState<RoomOccupancySegment[]>([]);
  const [showsOccupant, setShowsOccupant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!guestHouseId || !date) return;
    const { start, end } = dayBounds(date);
    if (Number.isNaN(start.getTime())) return;

    // `loading` is raised by the handlers that change these inputs, not here:
    // setState in an effect body trips the React Compiler lint.
    let cancelled = false;
    getDayAvailability(guestHouseId, start.toISOString(), end.toISOString())
      .then((data) => {
        if (cancelled) return;
        setRooms(data.rooms);
        setSegments(data.segments);
        setShowsOccupant(data.showsOccupant);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Could not load room availability");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guestHouseId, date, refreshKey]);

  const { start, end } = useMemo(() => dayBounds(date), [date]);

  const occupancy = useMemo(
    () => bucketOccupancyByHour(rooms, segments, start),
    [rooms, segments, start]
  );

  // Clearing the date input leaves an unparseable value; show a prompt rather
  // than a grid full of "Invalid Date".
  const hasValidDate = !Number.isNaN(start.getTime());
  const isToday = date === todayValue();
  // Institute time, not the reader's: the "current hour" marker has to line
  // up with the rows, which are the guest house's hours.
  const currentHour = instituteHour();
  const occupiedNow = isToday
    ? rooms.filter((r) => occupancy.get(r.id)?.hours[currentHour]).length
    : 0;
  const bookedToday = rooms.filter((r) => occupancy.get(r.id)?.segments.length).length;

  if (guestHouses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No guest houses have been set up yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          {guestHouses.length > 1 && (
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {guestHouses.map((gh) => (
                <button
                  key={gh.id}
                  type="button"
                  onClick={() => {
                    setGuestHouseId(gh.id);
                    setLoading(true);
                  }}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    gh.id === guestHouseId
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {gh.name}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="availability-date">Date</Label>
            <Input
              id="availability-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setLoading(true);
              }}
              className="w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="invisible block">Refresh</Label>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                setRefreshKey((k) => k + 1);
              }}
            >
              Refresh
            </Button>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {loading ? (
              "Loading availability…"
            ) : (
              <>
                <span className="font-medium text-foreground">{rooms.length}</span> rooms ·{" "}
                <span className="font-medium text-foreground">{bookedToday}</span> booked on this
                date
                {isToday && (
                  <>
                    {" "}
                    · <span className="font-medium text-foreground">{occupiedNow}</span> occupied
                    right now
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Room availability</CardTitle>
          <CardDescription>
            Hours of the day down the side, room numbers across the top. Red means the room is
            held by a booking for that hour; blank means it is free.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <LegendSwatch className="bg-red-500" label="Booked / occupied" />
            <LegendSwatch className="border bg-background" label="Vacant" />
            {isToday && <LegendSwatch className="bg-primary" label="Current hour" />}
          </div>

          {!hasValidDate ? (
            <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              Pick a date to see room availability.
            </p>
          ) : rooms.length === 0 && !loading ? (
            <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              This guest house has no active rooms.
            </p>
          ) : (
            <OccupancyChart
              rooms={rooms}
              occupancy={occupancy}
              currentHour={isToday ? currentHour : null}
            />
          )}
        </CardContent>
      </Card>

      <Card className={hasValidDate ? undefined : "hidden"}>
        <CardHeader>
          <CardTitle>Room details</CardTitle>
          <CardDescription>
            Every room in this guest house with its booking periods covering{" "}
            {hasValidDate && formatDate(start.toISOString())}
            .{!showsOccupant && " Guest details are visible to guest house staff only."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rooms.map((room) => {
            const entry = occupancy.get(room.id);
            const roomSegments = entry?.segments ?? [];
            const hoursHeld = entry?.hours.filter(Boolean).length ?? 0;
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
                  {roomSegments.length === 0 ? (
                    <Badge variant="secondary">Vacant</Badge>
                  ) : hoursHeld >= 24 ? (
                    <Badge variant="destructive">Occupied</Badge>
                  ) : (
                    <Badge variant="outline">Partly booked</Badge>
                  )}
                </div>
                <div className="min-w-48 flex-1 space-y-1">
                  {roomSegments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Free all day — available to book.
                    </p>
                  ) : (
                    roomSegments.map((s) => (
                      <p key={s.booking_id} className="text-sm">
                        <span className="font-medium">{formatDateTime(s.check_in)}</span>
                        {" → "}
                        <span className="font-medium">{formatDateTime(s.check_out)}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {s.booking_reference_id} · {STATUS_LABELS[s.status]}
                          {s.requester_name && ` · ${s.requester_name}`}
                        </span>
                      </p>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {hasValidDate && (
        <p className="text-xs text-muted-foreground">
          Availability shown for {formatDate(start.toISOString())} until{" "}
          {formatDate(end.toISOString())}, in institute time.
          Rooms are held by approved, occupied and pending-cancellation bookings; requests still
          awaiting approval do not reserve a room.
        </p>
      )}
    </div>
  );
}
