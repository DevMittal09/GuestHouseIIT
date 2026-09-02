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
import {
  bucketOccupancyByHour,
  dayBounds,
  hourLabel,
  toDateInputValue,
  HOURS_IN_DAY,
  type RoomDayOccupancy,
} from "@/lib/availability";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  type GuestHouse,
  type Room,
  type RoomOccupancySegment,
} from "@/lib/types";

const HOURS = Array.from({ length: HOURS_IN_DAY }, (_, h) => h);

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
  const currentHour = new Date().getHours();
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
            <div className="overflow-x-auto">
              <div
                className="grid min-w-fit text-xs"
                style={{
                  gridTemplateColumns: `4.5rem repeat(${rooms.length}, minmax(2.75rem, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-10 border-b bg-background pb-2 pr-2 text-right font-medium text-muted-foreground">
                  Time
                </div>
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    title={`${room.room_number} — ${
                      room.room_type === "double_sharing" ? "Double sharing" : "Single"
                    }`}
                    className="border-b pb-2 text-center font-semibold"
                  >
                    {room.room_number}
                  </div>
                ))}

                {HOURS.map((h) => (
                  <HourRow
                    key={h}
                    hour={h}
                    rooms={rooms}
                    occupancy={occupancy}
                    isCurrent={isToday && h === currentHour}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={hasValidDate ? undefined : "hidden"}>
        <CardHeader>
          <CardTitle>Room details</CardTitle>
          <CardDescription>
            Every room in this guest house with its booking periods covering{" "}
            {hasValidDate &&
              start.toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
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
          Availability shown for {start.toLocaleDateString()} until {end.toLocaleDateString()}.
          Rooms are held by approved, occupied and pending-cancellation bookings; requests still
          awaiting approval do not reserve a room.
        </p>
      )}
    </div>
  );
}

function HourRow({
  hour,
  rooms,
  occupancy,
  isCurrent,
}: {
  hour: number;
  rooms: Room[];
  occupancy: Map<string, RoomDayOccupancy>;
  isCurrent: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "sticky left-0 z-10 flex h-6 items-center justify-end bg-background pr-2 text-[10px] tabular-nums",
          isCurrent ? "font-semibold text-primary" : "text-muted-foreground"
        )}
      >
        {hourLabel(hour)}
      </div>
      {rooms.map((room) => {
        const segment = occupancy.get(room.id)?.hours[hour] ?? null;
        return (
          <div
            key={room.id}
            title={
              segment
                ? `${room.room_number} — booked at ${hourLabel(hour)} · ${
                    segment.booking_reference_id
                  }${segment.requester_name ? ` · ${segment.requester_name}` : ""}`
                : `${room.room_number} — free at ${hourLabel(hour)}`
            }
            className={cn(
              "h-6 border-r border-b",
              segment ? "bg-red-500" : "bg-background",
              isCurrent && "border-t-2 border-t-primary"
            )}
          />
        );
      })}
    </>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} />
      {label}
    </span>
  );
}
