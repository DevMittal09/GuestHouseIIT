"use client";

import { hourLabel, HOURS_IN_DAY, type RoomDayOccupancy } from "@/lib/availability";
import { cn } from "@/lib/utils";
import type { Room } from "@/lib/types";

const HOURS = Array.from({ length: HOURS_IN_DAY }, (_, h) => h);

/**
 * The hours-down / rooms-across occupancy chart.
 *
 * Shared by `/availability` and the panel inside the booking form, so a
 * requester checking "is anything free on the 14th" and the manager looking at
 * the same day are reading one chart with one set of rules, not two that can
 * drift.
 */
export function OccupancyChart({
  rooms,
  occupancy,
  currentHour,
  compact = false,
}: {
  rooms: Room[];
  occupancy: Map<string, RoomDayOccupancy>;
  /** Hour to mark as "now", or null when the day shown is not today. */
  currentHour: number | null;
  /** Half-height rows, for embedding in a form. */
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-fit text-xs"
        style={{
          gridTemplateColumns: `4.5rem repeat(${rooms.length}, minmax(${
            compact ? "2.25rem" : "2.75rem"
          }, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-10 border-b bg-background pr-2 pb-2 text-right font-medium text-muted-foreground">
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
            isCurrent={h === currentHour}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

function HourRow({
  hour,
  rooms,
  occupancy,
  isCurrent,
  compact,
}: {
  hour: number;
  rooms: Room[];
  occupancy: Map<string, RoomDayOccupancy>;
  isCurrent: boolean;
  compact: boolean;
}) {
  const rowHeight = compact ? "h-4" : "h-6";
  return (
    <>
      <div
        className={cn(
          "sticky left-0 z-10 flex items-center justify-end bg-background pr-2 text-[10px] tabular-nums",
          rowHeight,
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
              "border-r border-b",
              rowHeight,
              segment ? "bg-red-500" : "bg-background",
              isCurrent && "border-t-2 border-t-primary"
            )}
          />
        );
      })}
    </>
  );
}

export function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} />
      {label}
    </span>
  );
}
