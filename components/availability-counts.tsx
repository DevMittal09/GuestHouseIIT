"use client";

import { hourLabel, type AvailabilityCounts } from "@/lib/availability";
import { formatDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";

/**
 * "N rooms available" - the whole of what a requester is told about
 * availability (7 Oct 2026, the office's eighth list).
 *
 * It replaces the room-by-room chart for everyone but the manager, the
 * caretaker and the developer, on `/availability` and in the booking form.
 * The server sends these figures and nothing else (`getRoomAvailability`), so
 * this component cannot show a room number even by accident: it has none.
 *
 * One cell per day, with the hours underneath when a single day is shown -
 * someone whose date is full needs to know whether it is full all day or only
 * in the morning, and that is the one piece of detail the counts can give
 * without naming a room.
 */
export function AvailabilityCountsPanel({
  counts,
  today,
  currentHour,
  compact = false,
}: {
  counts: AvailabilityCounts;
  /** Today's institute date, to mark its cell. */
  today: string;
  /** The current hour in institute time, or null when the day shown is not today. */
  currentHour: number | null;
  /** Tighter spacing, for embedding in the booking form. */
  compact?: boolean;
}) {
  const oneDay = counts.days.length === 1;

  return (
    <div className="space-y-4">
      <ul
        className={cn(
          "grid gap-2",
          oneDay
            ? "grid-cols-1"
            : "grid-cols-[repeat(auto-fill,minmax(min(7.5rem,100%),1fr))]"
        )}
      >
        {counts.days.map((day, i) => {
          const free = counts.freeByDay[i] ?? 0;
          const isToday = day === today;
          return (
            <li
              key={day}
              className={cn(
                "rounded-md border px-3",
                compact ? "py-2" : "py-2.5",
                free === 0 && "border-border-strong bg-band/60",
                isToday && "border-primary"
              )}
            >
              <p
                className={cn(
                  "text-xs",
                  isToday ? "font-semibold text-primary" : "text-muted-foreground"
                )}
              >
                {formatDateValue(day, { year: oneDay })}
              </p>
              <p className="text-sm">
                {free === 0 ? (
                  <span className="font-medium">No rooms free all day</span>
                ) : (
                  <>
                    <span className="font-medium tabular-nums">{free}</span>
                    {" of "}
                    <span className="tabular-nums">{counts.total}</span> rooms available
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      {/* The hours of a single day. A day with nothing free all day may still
          have rooms free for part of it, and that is what a requester
          choosing a check-in time actually needs. */}
      {counts.freeByHour && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-sm">
            <caption className="sr-only">Rooms available by hour</caption>
            <thead className="bg-band text-left">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  Time
                </th>
                <th scope="col" className="p-2 text-right font-medium">
                  Rooms available
                </th>
              </tr>
            </thead>
            <tbody>
              {counts.freeByHour.map((free, hour) => (
                <tr
                  key={hour}
                  className={cn("border-t", hour === currentHour && "bg-primary/10 font-medium")}
                >
                  <td className="p-2 tabular-nums">
                    {hourLabel(hour)}
                    {hour === currentHour && (
                      <span className="ml-2 text-xs font-normal text-primary">now</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {free} of {counts.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
