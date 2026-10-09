"use client";

import { hourLabel, type AvailabilityCounts } from "@/lib/availability";
import { formatDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";

/**
 * How many rooms are free - the whole of what a requester is told about
 * availability (7 Oct 2026, the office's eighth list).
 *
 * It replaces the room-by-room chart for everyone but the manager, the
 * caretaker and the developer, on `/availability` and in the booking form.
 * The server sends these figures and nothing else (`getRoomAvailability`), so
 * this component cannot show a room number even by accident: it has none.
 *
 * **Redrawn on 9 Oct 2026.** It was a card per day, each repeating the
 * sentence "10 of 10 rooms available" - seven or thirty-one copies of the
 * same words, and a 24-row table of them underneath a single day. What
 * answers the question is the figure, so the figure is what is drawn: one
 * ruled column per day with the count at display size, a hairline meter for
 * the proportion, and the sentence moved into each cell's `aria-label` so a
 * screen reader still hears it in full. A day with nothing free is a
 * vermilion rule and the word Full.
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
    <div className={cn("space-y-5", compact && "space-y-4")}>
      {/* A single day leads with the figure itself rather than a one-cell
          grid - it is the whole answer, and the hours below qualify it. */}
      {oneDay ? (
        <DayHeadline
          day={counts.days[0]}
          free={counts.freeByDay[0] ?? 0}
          total={counts.total}
          isToday={counts.days[0] === today}
        />
      ) : (
        <div>
          <p className="mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Rooms free each day
          </p>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(4.75rem,100%),1fr))] gap-x-3 gap-y-5">
            {counts.days.map((day, i) => (
              <DayCell
                key={day}
                day={day}
                free={counts.freeByDay[i] ?? 0}
                total={counts.total}
                isToday={day === today}
              />
            ))}
          </ul>
        </div>
      )}

      {/* The hours of a single day. A day with nothing free all day may still
          have rooms free for part of it, and that is what a requester
          choosing a check-in time actually needs. */}
      {counts.freeByHour && (
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Hour by hour
          </p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(4.25rem,100%),1fr))] gap-1.5">
            {counts.freeByHour.map((free, hour) => {
              const full = free === 0;
              const now = hour === currentHour;
              return (
                <li
                  key={hour}
                  aria-label={`${hourLabel(hour)}${now ? " (now)" : ""}: ${
                    full ? "no rooms free" : `${free} of ${counts.total} rooms free`
                  }`}
                  className={cn(
                    "rounded border px-2 py-1.5",
                    full ? "border-border bg-band/70" : "border-border-strong bg-card",
                    now && "border-ink outline-1 -outline-offset-1 outline-ink"
                  )}
                >
                  <span className="block text-[11px] leading-none text-muted-foreground tabular-nums">
                    {hourLabel(hour)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-[0.9375rem] leading-none font-semibold tabular-nums",
                      full ? "text-muted-foreground" : "text-ink"
                    )}
                  >
                    {full ? "Full" : free}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One day of the strip: the date, the figure, the proportion. */
function DayCell({
  day,
  free,
  total,
  isToday,
}: {
  day: string;
  free: number;
  total: number;
  isToday: boolean;
}) {
  const full = free === 0;
  return (
    <li
      aria-label={`${formatDateValue(day)}: ${
        full ? "no rooms free all day" : `${free} of ${total} rooms free`
      }`}
      className={cn(
        "border-t-2 pt-2",
        full ? "border-vermilion" : isToday ? "border-ink" : "border-border-strong"
      )}
    >
      <p
        className={cn(
          "text-[11px] leading-none font-semibold tracking-[0.1em] uppercase",
          isToday ? "text-ink" : "text-muted-foreground"
        )}
      >
        {formatDateValue(day)}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1">
        {full ? (
          <span className="font-heading text-[1.0625rem] leading-none font-semibold text-vermilion-deep">
            Full
          </span>
        ) : (
          <>
            <span className="font-heading text-[1.5rem] leading-none font-semibold text-ink tabular-nums">
              {free}
            </span>
            <span className="text-[12px] leading-none text-muted-foreground tabular-nums">
              /{total}
            </span>
          </>
        )}
      </p>
      <Meter free={free} total={total} className="mt-2" />
    </li>
  );
}

/** The one figure, for a one-day window. */
function DayHeadline({
  day,
  free,
  total,
  isToday,
}: {
  day: string;
  free: number;
  total: number;
  isToday: boolean;
}) {
  return (
    <div className={cn("border-t-2 pt-3", free === 0 ? "border-vermilion" : "border-ink")}>
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {formatDateValue(day, { year: true })}
        {isToday && " · today"}
      </p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        {free === 0 ? (
          <span className="font-heading text-[1.5rem] leading-none font-semibold text-vermilion-deep">
            Fully booked
          </span>
        ) : (
          <>
            <span className="font-heading text-[2.25rem] leading-none font-semibold text-ink tabular-nums">
              {free}
            </span>
            <span className="text-sm text-body">of {total} rooms free all day</span>
          </>
        )}
      </p>
      <Meter free={free} total={total} className="mt-3 max-w-[22rem]" />
    </div>
  );
}

/** The proportion free, as a hairline bar. Decorative: every cell is labelled. */
function Meter({ free, total, className }: { free: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((free / total) * 100) : 0;
  return (
    <span aria-hidden className={cn("block h-[3px] w-full bg-band", className)}>
      <span
        className={cn("block h-full", free === 0 ? "bg-vermilion" : "bg-ink")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
