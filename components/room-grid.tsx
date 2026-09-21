"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { allocateRooms, getRoomConflicts } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import {
  allocationCapacityError,
  capacityOf,
  countBedGuests,
  describeCapacity,
  describeParty,
  extraBedsFor,
  roomAssignmentError,
  ROOM_TYPE_LABELS,
} from "@/lib/occupancy";
import {
  describeBuffer,
  isOverridable,
  overrideNotice,
  TURNOVER_GRACE_HOURS,
  type ConflictKind,
} from "@/lib/turnover";
import { cn } from "@/lib/utils";
import { DEFAULT_RULES, type CapacityRules } from "@/lib/settings";
import type { BookingWithDetails, Room } from "@/lib/types";

/**
 * Cinema-style room allocation grid for one booking.
 * Green = free for this stay · Red = already held · Blue = selected.
 *
 * Red rooms are rendered `disabled`, so a room held by another booking for any
 * part of this stay cannot be picked at all — the exclusion constraint on
 * `room_holds` is still the authority, but the manager never gets far enough
 * to hit it.
 */
export function RoomGrid({
  booking,
  rooms,
  occupancyVersion,
  onAllocated,
  capacity = DEFAULT_RULES.capacity,
  bufferMinutes = DEFAULT_RULES.booking.buffer_minutes,
}: {
  /** The turnaround buffer from Settings, for the legend and the override notice. */
  bufferMinutes?: number;
  booking: BookingWithDetails;
  rooms: Room[];
  /** Room capacity from Settings — the same values `allocateRooms` checks. */
  capacity?: CapacityRules;
  /**
   * Changes whenever any booking's room holds change, server-side. The grid
   * loads occupancy once when the dialog opens, so without this it never
   * learnt that someone else had taken a room underneath it — the office
   * reported allocations "not being reflected in the grid". Folding it into
   * the fetch key means a change upstream re-fetches on the next render, and
   * an unchanged fingerprint costs nothing.
   */
  occupancyVersion?: string;
  onAllocated?: () => void;
}) {
  const router = useRouter();
  // Occupancy is read for the booking's *own* dates and nothing else.
  //
  // This used to have its own date/time pickers, which meant the manager could
  // shift the window, see a room go green, pick it — and allocate a room that
  // was in fact taken for the actual stay. The write was still safe (the
  // room_holds exclusion constraint refused it), but the grid was offering
  // rooms it should never have shown. The rule now is: a room that is held for
  // any part of this stay is never selectable.
  const checkIn = booking.check_in;
  const checkOut = booking.check_out;
  /**
   * Each room's worst conflict with this stay. A `hard` room is unpickable;
   * a `soft` one overlaps by no more than the turnover grace and can be taken
   * if the manager accepts it. Requesters never see this — their grid marks
   * any held room as taken.
   */
  const [conflicts, setConflicts] = useState<Record<string, ConflictKind>>({});
  /**
   * The picked rooms **in order**, because the order is meaningful: the first
   * is Room 1's, the second Room 2's. A Set would have carried that meaning
   * only by accident of insertion order, and nothing on screen would have said
   * so — the manager needs to see which party ends up where.
   */
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getRoomConflicts(booking.id)
      .then((next) => {
        if (cancelled) return;
        setConflicts(next);
        // Only a hard clash forces a deselection; a turnover the manager had
        // already accepted stays picked.
        setSelected((prev) => prev.filter((id) => next[id] !== "hard"));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Could not load room occupancy");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking.id, refreshKey, occupancyVersion]);

  const refreshOccupancy = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const toggle = (room: Room) => {
    if (conflicts[room.id] === "hard") return;
    setSelected((prev) => {
      if (prev.includes(room.id)) return prev.filter((id) => id !== room.id);
      if (prev.length >= booking.rooms_requested) {
        toast.info(`This request is for ${booking.rooms_requested} room(s) — deselect one first`);
        return prev;
      }
      return [...prev, room.id];
    });
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await allocateRooms(booking.id, selected, overridden);
      if (result.ok) {
        toast.success(`${booking.booking_reference_id} approved — rooms allocated`);
        onAllocated?.();
        router.refresh();
      } else {
        toast.error(result.error);
        refreshOccupancy();
      }
    });

  const doubles = rooms.filter((r) => r.room_type === "double_sharing");
  const singles = rooms.filter((r) => r.room_type === "single");

  // Infants share with their guardians, so only the others need a bed.
  // Which of the picked rooms the manager is accepting an overlap on. Derived
  // from the selection rather than tracked separately, so the two cannot
  // disagree about what is being overridden.
  const overridden = selected.filter((id) => isOverridable(conflicts[id]));
  const bedGuests = countBedGuests(booking.guests);
  // In pick order, so index 0 is Room 1's — the same order the server maps
  // onto the booking's room cards.
  const selectedRooms = selected
    .map((id) => rooms.find((r) => r.id === id))
    .filter((r): r is Room => Boolean(r));
  const selectedCapacity = capacityOf(selectedRooms, capacity);
  // Two different failures, both of which the server also checks: the party as
  // a whole not fitting the rooms picked, and one room card's party not
  // fitting the particular room it landed on. The second can happen while the
  // first passes — three guests and a spare single room add up, but nobody can
  // sleep three in the single.
  const capacityProblem =
    selected.length > 0 ? allocationCapacityError(bedGuests, selectedRooms, capacity) : null;
  const cardProblem = booking.rooms.some((card, i) => {
    const room = selectedRooms[i];
    return room
      ? roomAssignmentError(countBedGuests(card.guests), room, `Room ${card.room_index}`, capacity) !== null
      : false;
  });
  // Counted against the rooms actually picked: two guests in one single room
  // need an extra bed, which the pre-selection estimate (doubles) would miss.
  const extraBeds = extraBedsFor(bedGuests, selectedRooms, capacity);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Occupancy for this stay
          </p>
          <p className="font-medium">
            {formatDateTime(checkIn)} → {formatDateTime(checkOut)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refreshOccupancy}>
          Refresh availability
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <LegendSwatch className="bg-emerald-500" label="Available" />
        {bufferMinutes > 0 && (
          <LegendSwatch
            className="bg-turnaround"
            label={`Turnaround — within ${describeBuffer(bufferMinutes)} of another stay, yours to override`}
          />
        )}
        <LegendSwatch
          className="bg-amber-400"
          label={`Changeover — overlaps by up to ${TURNOVER_GRACE_HOURS}h, yours to override`}
        />
        <LegendSwatch className="bg-red-500" label="Already allotted — cannot be picked" />
        <LegendSwatch className="bg-blue-500" label="Selected for this booking" />
        {loading && <span className="text-muted-foreground">Loading occupancy…</span>}
      </div>

      <RoomSection
        title={`${ROOM_TYPE_LABELS.double_sharing} rooms`}
        description={describeCapacity("double_sharing", capacity)}
        rooms={doubles}
        capacity={capacity}
        bufferMinutes={bufferMinutes}
        conflicts={conflicts}
        selected={selected}
        onToggle={toggle}
      />
      <RoomSection
        title={`${ROOM_TYPE_LABELS.single} rooms`}
        description={describeCapacity("single", capacity)}
        rooms={singles}
        capacity={capacity}
        bufferMinutes={bufferMinutes}
        conflicts={conflicts}
        selected={selected}
        onToggle={toggle}
      />

      <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem
            label="Rooms selected"
            value={`${selected.length} of ${booking.rooms_requested} requested`}
            detail={
              selected.length > 0 ? selectedRooms.map((r) => r.room_number).join(", ") : undefined
            }
          />
          <SummaryItem label="Guests" value={describeParty(booking)} />
          <SummaryItem
            label="Capacity of selection"
            value={
              selected.length > 0
                ? `${selectedCapacity.standard} guest${selectedCapacity.standard === 1 ? "" : "s"}`
                : "—"
            }
            detail={
              selected.length > 0 && selectedCapacity.withExtraBed > selectedCapacity.standard
                ? `Maximum ${selectedCapacity.withExtraBed} with extra beds`
                : undefined
            }
          />
          <SummaryItem
            label="Extra beds required"
            value={selected.length > 0 && !capacityProblem ? String(extraBeds) : "—"}
            detail={
              selected.length > 0 && !capacityProblem && extraBeds > 0
                ? "To be arranged before check-in"
                : undefined
            }
            attention={selected.length > 0 && !capacityProblem && extraBeds > 0}
          />
        </dl>

        {/* Which party ends up in which room. Guests are entered room by room,
            so an allocation that ignored the cards would put a three-guest
            party in a single room and leave the desk to discover it. */}
        {booking.rooms.length > 0 && (
          <ul className="space-y-1 border-t pt-3 text-sm">
            {booking.rooms.map((card, i) => {
              const room = selectedRooms[i];
              const problem = room
                ? roomAssignmentError(
                    countBedGuests(card.guests),
                    room,
                    `Room ${card.room_index}`,
                    capacity
                  )
                : null;
              return (
                <li key={card.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">Room {card.room_index}</span>
                  <span className="text-muted-foreground">
                    · {describeParty({ guests: card.guests })}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span className={room ? "font-medium" : "text-muted-foreground"}>
                    {room
                      ? `${room.room_number} (${ROOM_TYPE_LABELS[room.room_type].toLowerCase()})`
                      : "pick a room"}
                  </span>
                  {problem && <span className="w-full text-xs text-destructive">{problem}</span>}
                </li>
              );
            })}
          </ul>
        )}

        {/* Overriding must be a decision, not a side effect of clicking a
            yellow tile — so it is spelled out, with the rooms named, before
            the button that records it against the booking. */}
        {overridden.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-medium">
              Accepting a changeover on{" "}
              {overridden
                .map((id) => rooms.find((r) => r.id === id)?.room_number ?? id)
                .join(", ")}
            </p>
            <p className="mt-0.5">{overrideNotice(bufferMinutes)}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {capacityProblem ? (
            <p className="text-sm text-destructive">{capacityProblem}</p>
          ) : (
            <span />
          )}
          <Button
            onClick={confirm}
            disabled={
              isPending || selected.length === 0 || capacityProblem !== null || cardProblem
            }
          >
            {isPending
              ? "Allocating…"
              : overridden.length > 0
                ? "Override & Allocate"
                : "Confirm & Allocate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  detail,
  attention = false,
}: {
  label: string;
  value: string;
  detail?: string;
  /** Highlights a figure someone has to act on, such as extra beds to arrange. */
  attention?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd
        className={cn(
          "font-medium",
          attention && "text-amber-700 dark:text-amber-400"
        )}
      >
        {value}
      </dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

function RoomSection({
  title,
  description,
  rooms,
  conflicts,
  selected,
  onToggle,
  capacity,
  bufferMinutes,
}: {
  title: string;
  description: string;
  rooms: Room[];
  capacity: CapacityRules;
  bufferMinutes: number;
  conflicts: Record<string, ConflictKind>;
  /** Picked rooms in card order; the index is the "Room N" shown on the tile. */
  selected: string[];
  onToggle: (room: Room) => void;
}) {
  if (rooms.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8">
        {rooms.map((room) => {
          const conflict = conflicts[room.id] ?? "free";
          const isOccupied = conflict === "hard";
          const isTurnover = conflict === "soft";
          const isTurnaround = conflict === "turnaround";
          const pickedAt = selected.indexOf(room.id);
          const isSelected = pickedAt >= 0;
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onToggle(room)}
              disabled={isOccupied}
              title={
                isOccupied
                  ? `${room.room_number} — already allotted for these dates`
                  : isTurnover
                    ? `${room.room_number} — another stay overlaps by up to ${TURNOVER_GRACE_HOURS} hours. Pick it to accept the changeover.`
                    : isTurnaround
                      ? `${room.room_number} — free, but within the ${describeBuffer(bufferMinutes)} turnaround of another stay. Pick it to accept the tighter changeover.`
                      : `${room.room_number} — ${ROOM_TYPE_LABELS[room.room_type]}. ${describeCapacity(room.room_type, capacity)}`
              }
              className={cn(
                "flex h-12 items-center justify-center rounded-md border text-xs font-semibold text-white transition-transform",
                isOccupied
                  ? "cursor-not-allowed bg-red-500 opacity-90"
                  : isSelected
                    ? isTurnover || isTurnaround
                      ? "bg-blue-500 ring-2 ring-amber-400 hover:scale-105"
                      : "bg-blue-500 ring-2 ring-blue-300 hover:scale-105"
                    : isTurnover
                      ? "bg-amber-400 text-amber-950 hover:scale-105 hover:bg-amber-500"
                      : isTurnaround
                        ? "bg-turnaround text-slate-900 hover:scale-105"
                        : "bg-emerald-500 hover:scale-105 hover:bg-emerald-600"
              )}
            >
              <span className="flex flex-col items-center leading-tight">
                {room.room_number}
                {isSelected && (
                  <span className="text-[10px] font-normal opacity-90">
                    Room {pickedAt + 1}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
