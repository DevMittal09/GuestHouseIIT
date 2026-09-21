"use client";

import {
  hourLabel,
  HOURS_IN_DAY,
  type AvailabilityRange,
  type RoomDayOccupancy,
  type RoomRangeOccupancy,
} from "@/lib/availability";
import { formatDateTime } from "@/lib/format";
import { formatDateValue } from "@/lib/tz";
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
        const turnaround = segment ? null : (occupancy.get(room.id)?.turnaround[hour] ?? null);
        return (
          <div
            key={room.id}
            title={
              segment
                ? `${room.room_number} — booked at ${hourLabel(hour)} · ${
                    segment.booking_reference_id
                  }${segment.requester_name ? ` · ${segment.requester_name}` : ""}`
                : turnaround
                  ? `${room.room_number} — turnaround at ${hourLabel(hour)} (housekeeping after ${turnaround.booking_reference_id})`
                  : `${room.room_number} — free at ${hourLabel(hour)}`
            }
            className={cn(
              "border-r border-b",
              rowHeight,
              segment ? "bg-red-500" : turnaround ? "bg-turnaround" : "bg-background",
              isCurrent && "border-t-2 border-t-primary"
            )}
          />
        );
      })}
    </>
  );
}

/**
 * The days-down / rooms-across chart for the week and month views.
 *
 * Same axes as the day chart — time runs down, rooms run across — so switching
 * from Day to Week zooms out rather than turning the picture on its side. Time
 * also runs downward *inside* each day's row, from midnight at its top edge to
 * midnight at its bottom, which is what lets a stay be one continuous bar that
 * starts partway down its check-in day and ends partway down its check-out day.
 */
export function RangeOccupancyChart({
  rooms,
  range,
  occupancy,
  freeByDay,
  today,
  nowAt,
}: {
  rooms: Room[];
  range: AvailabilityRange;
  occupancy: Map<string, RoomRangeOccupancy>;
  /** Rooms free all day, for each day of the range. */
  freeByDay: number[];
  /** Today's institute date ("yyyy-MM-dd"), to highlight its row. */
  today: string;
  /** Where "now" falls in the range (0–1), or null when it is outside it. */
  nowAt: number | null;
}) {
  const isWeek = range.view === "week";
  const rowHeight = isWeek ? "3rem" : "1.75rem";
  const dayCount = range.days.length;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-fit text-xs"
        style={{
          gridTemplateColumns: `6.5rem repeat(${rooms.length}, minmax(2.75rem, 1fr))`,
          gridTemplateRows: `auto repeat(${dayCount}, ${rowHeight})`,
        }}
      >
        <div
          className="sticky left-0 z-20 border-b bg-background pr-2 pb-2 text-right font-medium text-muted-foreground"
          style={{ gridColumn: 1, gridRow: 1 }}
        >
          Date
        </div>
        {rooms.map((room, column) => (
          <div
            key={room.id}
            title={`${room.room_number} — ${
              room.room_type === "double_sharing" ? "Double sharing" : "Single"
            }`}
            className="border-b pb-2 text-center font-semibold"
            style={{ gridColumn: column + 2, gridRow: 1 }}
          >
            {room.room_number}
          </div>
        ))}

        {range.days.map((day, row) => {
          const free = freeByDay[row] ?? 0;
          return (
            <div
              key={day}
              title={`${formatDateValue(day, { year: true })} — ${free} of ${rooms.length} rooms free all day`}
              className={cn(
                "sticky left-0 z-10 flex border-b bg-background pr-2 tabular-nums",
                isWeek ? "flex-col items-end justify-center" : "items-center justify-end gap-2",
                day === today ? "font-semibold text-primary" : "text-muted-foreground"
              )}
              style={{ gridColumn: 1, gridRow: row + 2 }}
            >
              <span className="text-[11px]">{formatDateValue(day, { month: isWeek })}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{free} free</span>
            </div>
          );
        })}

        {rooms.map((room, column) => (
          <div
            key={room.id}
            className="relative border-r"
            style={{ gridColumn: column + 2, gridRow: `2 / span ${dayCount}` }}
          >
            {range.days.map((day) => (
              <div
                key={day}
                className={cn("border-b", day === today && "bg-primary/10")}
                style={{ height: rowHeight }}
              />
            ))}
            {/* The turnaround first, so a stay that begins inside another's
                buffer (an accepted changeover) is drawn over it. */}
            {occupancy.get(room.id)?.turnarounds.map(({ segment, from, to }) => (
              <div
                key={`t-${segment.booking_id}`}
                title={`${room.room_number} — turnaround after ${segment.booking_reference_id}, until ${formatDateTime(
                  segment.turnaround_until ?? segment.check_out
                )}`}
                className="bg-turnaround absolute inset-x-1 rounded-sm"
                style={{ top: `${from * 100}%`, height: `max(${(to - from) * 100}%, 2px)` }}
              />
            ))}
            {occupancy.get(room.id)?.bars.map(({ segment, from, to }) => (
              <div
                key={segment.booking_id}
                title={`${room.room_number} — booked ${formatDateTime(
                  segment.check_in
                )} → ${formatDateTime(segment.check_out)} · ${segment.booking_reference_id}${
                  segment.requester_name ? ` · ${segment.requester_name}` : ""
                }`}
                className="absolute inset-x-1 rounded-sm bg-red-500 ring-1 ring-background"
                style={{ top: `${from * 100}%`, height: `max(${(to - from) * 100}%, 3px)` }}
              />
            ))}
            {nowAt !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 h-0.5 bg-primary"
                style={{ top: `${nowAt * 100}%` }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
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
