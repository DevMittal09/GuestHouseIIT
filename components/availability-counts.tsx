"use client";

import { hourLabel, isPastDay, type AvailabilityCounts } from "@/lib/availability";
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
 *
 * **14 Oct 2026, the office.** Two changes, both about what the figures are
 * saying. The count of free rooms is **green** - the desk's own check-in
 * green (`--occupy`), the one green the portal already has, so nothing new
 * was added to the palette - against the vermilion a full day carries. And a
 * day that has **already gone** carries no figure at all: a week runs Monday
 * to Sunday and a month is a whole calendar month, so a range containing
 * today contains days nobody can book, and printing "10 free" against them
 * read as an offer. They are greyed, labelled Past, and `isPastDay`
 * (`lib/availability.ts`) is the one rule - the same one the desk's week and
 * month chart uses.
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
  /** A one-day window on a date that has gone: there is nothing to choose. */
  const singleDayPast = oneDay && isPastDay(counts.days[0], today);

  return (
    <div className={cn("space-y-5", compact && "space-y-4")}>
      {/* A single day leads with the figure itself rather than a one-cell
          grid - it is the whole answer, and the hours below qualify it. */}
      {oneDay ? (
        <DayHeadline
          day={counts.days[0]}
          free={counts.freeByDay[0] ?? 0}
          isToday={counts.days[0] === today}
          isPast={isPastDay(counts.days[0], today)}
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
                isToday={day === today}
                isPast={isPastDay(day, today)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* The hours of a single day. A day with nothing free all day may still
          have rooms free for part of it, and that is what a requester
          choosing a check-in time actually needs - on a date that has gone,
          nothing at all. */}
      {counts.freeByHour && !singleDayPast && (
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
                    full ? "no rooms free" : `${free} room${free === 1 ? "" : "s"} free`
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
                      full ? "text-muted-foreground" : "text-occupy"
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

/**
 * One day of the strip: the date and the figure.
 *
 * **No denominator and no proportional meter** (9 Nov 2026, the meeting: the
 * frontend "must not display the total number of rooms or a fraction such as
 * Available Rooms / Total Rooms"). Both were here: the figure was set beside
 * "/10" and a 3px bar underneath drew `free / total`, which publishes the
 * inventory just as plainly as printing it. The count is the whole answer, it
 * still falls as rooms go, and a day with nothing left still says **Full** -
 * which is the one thing the fraction was doing that the figure alone could
 * not.
 */
function DayCell({
  day,
  free,
  isToday,
  isPast,
}: {
  day: string;
  free: number;
  isToday: boolean;
  /** The day has gone: no figure, because it cannot be booked. */
  isPast: boolean;
}) {
  const full = free === 0;
  return (
    <li
      aria-label={`${formatDateValue(day)}: ${
        isPast
          ? "a past date, not available to book"
          : full
            ? "no rooms free all day"
            : `${free} room${free === 1 ? "" : "s"} free`
      }`}
      className={cn(
        "border-t-2 pt-2",
        isPast
          ? "border-border opacity-55"
          : full
            ? "border-vermilion"
            : isToday
              ? "border-ink"
              : "border-border-strong"
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
        {isPast ? (
          <span className="text-[13px] leading-none text-muted-foreground">Past</span>
        ) : full ? (
          <span className="font-heading text-[1.0625rem] leading-none font-semibold text-vermilion-deep">
            Full
          </span>
        ) : (
          <>
            <span className="font-heading text-[1.5rem] leading-none font-semibold text-occupy tabular-nums">
              {free}
            </span>
            <span className="text-[12px] leading-none text-muted-foreground">
              free
            </span>
          </>
        )}
      </p>
    </li>
  );
}

/** The one figure, for a one-day window. */
function DayHeadline({
  day,
  free,
  isToday,
  isPast,
}: {
  day: string;
  free: number;
  isToday: boolean;
  /** The day has gone - see `DayCell`. */
  isPast: boolean;
}) {
  return (
    <div
      className={cn(
        "border-t-2 pt-3",
        isPast ? "border-border" : free === 0 ? "border-vermilion" : "border-ink"
      )}
    >
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {formatDateValue(day, { year: true })}
        {isToday && " · today"}
      </p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        {isPast ? (
          <span className="font-heading text-[1.5rem] leading-none font-semibold text-muted-foreground">
            Past date
          </span>
        ) : free === 0 ? (
          <span className="font-heading text-[1.5rem] leading-none font-semibold text-vermilion-deep">
            Fully booked
          </span>
        ) : (
          <>
            <span className="font-heading text-[2.25rem] leading-none font-semibold text-occupy tabular-nums">
              {free}
            </span>
            <span className="text-sm text-body">
              room{free === 1 ? "" : "s"} free all day
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/*
 * **`Meter` is deleted** (9 Nov 2026). It drew `free / total` as a 3px bar,
 * which is the fraction the office asked to be taken off the page - a reader
 * can see a bar a tenth full as readily as they can read "1 of 10". Nothing
 * replaced it: the figure, its colour and the word **Full** carry the whole
 * answer, and every cell already states it in full to a screen reader.
 */
