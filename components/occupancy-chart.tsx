"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  describeOverlap,
  describeSegmentStatus,
  hourLabel,
  HOURS_IN_DAY,
  type AvailabilityRange,
  type RoomRangeOccupancy,
} from "@/lib/availability";
import { formatDateTime } from "@/lib/format";
import { formatDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";
import type { Room, RoomOccupancySegment } from "@/lib/types";

/**
 * The two shades a room's bookings alternate between, in check-in order. One
 * red for every booking made a stay that begins as another ends look like a
 * single long stay; alternating (with a gap between bars) keeps them apart.
 */
const BOOKED_TONES = ["bg-red-500", "bg-red-800"] as const;

/** Where two bookings hold the same room at once: amber and hatched, drawn over both. */
const OVERLAP_CLASS = "bg-amber-400";
const OVERLAP_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(0 0 0 / 0.2) 0 3px, transparent 3px 7px)",
};

const HOURS = Array.from({ length: HOURS_IN_DAY }, (_, h) => h);

/**
 * The hours-down / rooms-across occupancy chart for one day.
 *
 * Shared by `/availability` and the panel inside the booking form, so a
 * requester checking "is anything free on the 14th" and the manager looking at
 * the same day are reading one chart with one set of rules, not two that can
 * drift. Bookings are drawn as bars to the minute, the same as the week and
 * month views, so a 10:30 check-out and an 11:00 check-in show the half hour
 * between them.
 */
export function OccupancyChart({
  rooms,
  occupancy,
  currentHour,
  nowAt,
  compact = false,
}: {
  rooms: Room[];
  /** The day's occupancy, from `bucketOccupancyByDay` over a one-day range. */
  occupancy: Map<string, RoomRangeOccupancy>;
  /** Hour to emphasise as "now", or null when the day shown is not today. */
  currentHour: number | null;
  /** Where "now" falls in the day (0–1), or null when it is not today. */
  nowAt: number | null;
  /** Shorter rows, for embedding in a form. */
  compact?: boolean;
}) {
  return (
    <TimeGrid
      rooms={rooms}
      occupancy={occupancy}
      nowAt={nowAt}
      labelHeader="Time"
      labelWidth="4.5rem"
      minColumn={compact ? "2.25rem" : "2.75rem"}
      rowHeight={compact ? "1rem" : "1.5rem"}
      labelClassName="items-center justify-end text-[10px]"
      rows={HOURS.map((h) => ({
        key: String(h),
        label: hourLabel(h),
        emphasise: h === currentHour,
      }))}
    />
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
  return (
    <TimeGrid
      rooms={rooms}
      occupancy={occupancy}
      nowAt={nowAt}
      labelHeader="Date"
      labelWidth="6.5rem"
      minColumn="2.75rem"
      rowHeight={isWeek ? "3rem" : "1.75rem"}
      labelClassName={
        isWeek ? "flex-col items-end justify-center" : "items-center justify-end gap-2"
      }
      rows={range.days.map((day, row) => {
        const free = freeByDay[row] ?? 0;
        return {
          key: day,
          title: `${formatDateValue(day, { year: true })} — ${free} of ${rooms.length} rooms free all day`,
          label: (
            <>
              <span className="text-[11px]">{formatDateValue(day, { month: isWeek })}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{free} free</span>
            </>
          ),
          emphasise: day === today,
          highlight: day === today,
        };
      })}
    />
  );
}

/** The chart's key, shared by `/availability` and the booking form's panel. */
export function OccupancyLegend({ nowLabel }: { nowLabel: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="flex overflow-hidden rounded-sm">
          <span className={cn("size-3", BOOKED_TONES[0])} />
          <span className={cn("size-3", BOOKED_TONES[1])} />
        </span>
        Booked — alternate shades are separate bookings
      </span>
      <LegendSwatch className={OVERLAP_CLASS} style={OVERLAP_STYLE} label="Overlap — two bookings at once" />
      <LegendSwatch className="border bg-background" label="Free" />
      {nowLabel && <LegendSwatch className="bg-primary" label={nowLabel} />}
      <span className="text-muted-foreground">Hover over a booking for its details.</span>
    </div>
  );
}

export function LegendSwatch({
  className,
  style,
  label,
}: {
  className: string;
  style?: CSSProperties;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} style={style} />
      {label}
    </span>
  );
}

// ------------------------------------------------------------------ the grid

interface GridRow {
  key: string;
  label: ReactNode;
  title?: string;
  /** Bold the label — today, or the current hour. */
  emphasise?: boolean;
  /** Tint the whole row — today in the week and month views. */
  highlight?: boolean;
}

/**
 * Rows of time down the side, one column per room, and each room's bookings
 * laid over its column as bars positioned by fraction of the whole range.
 */
function TimeGrid({
  rooms,
  rows,
  occupancy,
  nowAt,
  labelHeader,
  labelWidth,
  labelClassName,
  minColumn,
  rowHeight,
}: {
  rooms: Room[];
  rows: GridRow[];
  occupancy: Map<string, RoomRangeOccupancy>;
  nowAt: number | null;
  labelHeader: string;
  labelWidth: string;
  labelClassName: string;
  minColumn: string;
  rowHeight: string;
}) {
  const [card, hoverProps] = useHoverCard();
  const count = rows.length;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-fit text-xs"
        style={{
          gridTemplateColumns: `${labelWidth} repeat(${rooms.length}, minmax(${minColumn}, 1fr))`,
          gridTemplateRows: `auto repeat(${count}, ${rowHeight})`,
        }}
      >
        <div
          className="sticky left-0 z-30 border-b bg-background pr-2 pb-2 text-right font-medium text-muted-foreground"
          style={{ gridColumn: 1, gridRow: 1 }}
        >
          {labelHeader}
        </div>
        {rooms.map((room, column) => (
          <div
            key={room.id}
            title={`${room.room_number} — ${roomTypeLabel(room)}`}
            className="border-b pb-2 text-center font-semibold"
            style={{ gridColumn: column + 2, gridRow: 1 }}
          >
            {room.room_number}
          </div>
        ))}

        {rows.map((row, i) => (
          <div
            key={row.key}
            title={row.title}
            className={cn(
              "sticky left-0 z-30 flex border-b bg-background pr-2 tabular-nums",
              labelClassName,
              row.emphasise ? "font-semibold text-primary" : "text-muted-foreground"
            )}
            style={{ gridColumn: 1, gridRow: i + 2 }}
          >
            {row.label}
          </div>
        ))}

        {rooms.map((room, column) => {
          const entry = occupancy.get(room.id);
          return (
            <div
              key={room.id}
              className="relative border-r"
              style={{ gridColumn: column + 2, gridRow: `2 / span ${count}` }}
            >
              {rows.map((row) => (
                <div
                  key={row.key}
                  className={cn("border-b", row.highlight && "bg-primary/10")}
                  style={{ height: rowHeight }}
                />
              ))}
              {entry?.bars.map((bar) => (
                <div
                  key={bar.segment.booking_id}
                  role="img"
                  aria-label={`${room.room_number} booked ${formatDateTime(
                    bar.segment.check_in
                  )} to ${formatDateTime(bar.segment.check_out)}, ${bar.segment.booking_reference_id}`}
                  className={cn(
                    "absolute inset-x-1 rounded-sm ring-2 ring-background",
                    BOOKED_TONES[bar.tone]
                  )}
                  style={{
                    top: `${bar.from * 100}%`,
                    height: `max(${(bar.to - bar.from) * 100}%, 3px)`,
                  }}
                  {...hoverProps({ room, segments: [bar.segment], overlap: false })}
                />
              ))}
              {entry?.overlaps.map((overlap) => (
                <div
                  key={`${overlap.segments[0].booking_id}-${overlap.segments[1].booking_id}`}
                  role="img"
                  aria-label={`${room.room_number}: ${overlap.segments[0].booking_reference_id} and ${overlap.segments[1].booking_reference_id} overlap`}
                  className={cn(
                    "absolute inset-x-0.5 z-10 rounded-sm ring-1 ring-amber-700",
                    OVERLAP_CLASS
                  )}
                  style={{
                    ...OVERLAP_STYLE,
                    top: `${overlap.from * 100}%`,
                    height: `max(${(overlap.to - overlap.from) * 100}%, 4px)`,
                  }}
                  {...hoverProps({ room, segments: overlap.segments, overlap: true })}
                />
              ))}
              {nowAt !== null && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary"
                  style={{ top: `${nowAt * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      {card && <BookingHoverCard card={card} />}
    </div>
  );
}

function roomTypeLabel(room: Room): string {
  return room.room_type === "double_sharing" ? "Double sharing" : "Single";
}

// ------------------------------------------------------------------ hover card

interface HoverContent {
  room: Room;
  segments: RoomOccupancySegment[];
  overlap: boolean;
}

interface HoverCardState extends HoverContent {
  left: number;
  top: number;
  /** Drawn above the pointer when there is no room below it. */
  above: boolean;
}

const CARD_WIDTH = 288;
/** Roughly the tallest card (an overlap, with two bookings), for choosing a side. */
const CARD_ROOM_BELOW = 260;

/**
 * One floating card per chart rather than a tooltip per bar: a month view can
 * carry a hundred bars, and they all share this state. Placed where the pointer
 * entered, in a portal so the chart's horizontal scroller cannot clip it, and
 * closed on scroll because a fixed card would otherwise drift off its bar.
 */
function useHoverCard() {
  const [card, setCard] = useState<HoverCardState | null>(null);

  useEffect(() => {
    if (!card) return;
    const close = () => setCard(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [card]);

  const show = (content: HoverContent) => (e: MouseEvent<HTMLElement>) => {
    const above = e.clientY + CARD_ROOM_BELOW > window.innerHeight;
    setCard({
      ...content,
      left: Math.max(8, Math.min(e.clientX + 12, window.innerWidth - CARD_WIDTH - 8)),
      top: above ? e.clientY - 12 : e.clientY + 16,
      above,
    });
  };

  // A tap on a touch screen arrives as a click, so it opens the card too.
  const hoverProps = (content: HoverContent) => ({
    onMouseEnter: show(content),
    onClick: show(content),
    onMouseLeave: () => setCard(null),
  });

  return [card, hoverProps] as const;
}

function BookingHoverCard({ card }: { card: HoverCardState }) {
  const [first, second] = card.segments;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lift"
      style={{
        left: card.left,
        top: card.top,
        width: CARD_WIDTH,
        transform: card.above ? "translateY(-100%)" : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Room {card.room.room_number}</p>
        {card.overlap ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase dark:bg-amber-950 dark:text-amber-200">
            Overlap
          </span>
        ) : (
          <span className="text-muted-foreground">{roomTypeLabel(card.room)}</span>
        )}
      </div>
      {card.overlap && first && second && (
        <p className="mt-1 text-muted-foreground">
          These two bookings hold the room at the same time for {describeOverlap(first, second)}.
        </p>
      )}
      {card.segments.map((s) => (
        <dl
          key={s.booking_id}
          className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t pt-2"
        >
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-medium">{s.booking_reference_id}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{describeSegmentStatus(s)}</dd>
          <dt className="text-muted-foreground">Check-in</dt>
          <dd>{formatDateTime(s.check_in)}</dd>
          <dt className="text-muted-foreground">Check-out</dt>
          <dd>{formatDateTime(s.check_out)}</dd>
          {s.requester_name && (
            <>
              <dt className="text-muted-foreground">Booked by</dt>
              <dd>{s.requester_name}</dd>
            </>
          )}
          {s.purpose_of_visit && (
            <>
              <dt className="text-muted-foreground">Purpose</dt>
              <dd className="line-clamp-3">{s.purpose_of_visit}</dd>
            </>
          )}
        </dl>
      ))}
    </div>,
    document.body
  );
}
