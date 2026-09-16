"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { allocateRooms, getOccupancy } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import {
  allocationCapacityError,
  capacityOf,
  countBedGuests,
  describeCapacity,
  describeParty,
  extraBedsFor,
  ROOM_TYPE_LABELS,
} from "@/lib/occupancy";
import { cn } from "@/lib/utils";
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
}: {
  booking: BookingWithDetails;
  rooms: Room[];
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
  const [occupied, setOccupied] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getOccupancy(booking.guest_house_id, checkIn, checkOut, booking.id)
      .then((ids) => {
        if (cancelled) return;
        setOccupied(new Set(ids));
        setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
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
  }, [booking.guest_house_id, booking.id, checkIn, checkOut, refreshKey, occupancyVersion]);

  const refreshOccupancy = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const toggle = (room: Room) => {
    if (occupied.has(room.id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(room.id)) {
        next.delete(room.id);
      } else {
        if (next.size >= booking.rooms_requested) {
          toast.info(`This request is for ${booking.rooms_requested} room(s) — deselect one first`);
          return prev;
        }
        next.add(room.id);
      }
      return next;
    });
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await allocateRooms(booking.id, [...selected]);
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
  const bedGuests = countBedGuests(booking.guests);
  const selectedRooms = rooms.filter((r) => selected.has(r.id));
  const selectedCapacity = capacityOf(selectedRooms);
  const capacityProblem =
    selected.size > 0 ? allocationCapacityError(bedGuests, selectedRooms) : null;
  // Counted against the rooms actually picked: two guests in one single room
  // need an extra bed, which the pre-selection estimate (doubles) would miss.
  const extraBeds = extraBedsFor(bedGuests, selectedRooms);

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
        <LegendSwatch className="bg-red-500" label="Already allotted — cannot be picked" />
        <LegendSwatch className="bg-blue-500" label="Selected for this booking" />
        {loading && <span className="text-muted-foreground">Loading occupancy…</span>}
      </div>

      <RoomSection
        title={`${ROOM_TYPE_LABELS.double_sharing} rooms`}
        description={describeCapacity("double_sharing")}
        rooms={doubles}
        occupied={occupied}
        selected={selected}
        onToggle={toggle}
      />
      <RoomSection
        title={`${ROOM_TYPE_LABELS.single} rooms`}
        description={describeCapacity("single")}
        rooms={singles}
        occupied={occupied}
        selected={selected}
        onToggle={toggle}
      />

      <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem
            label="Rooms selected"
            value={`${selected.size} of ${booking.rooms_requested} requested`}
            detail={
              selected.size > 0 ? selectedRooms.map((r) => r.room_number).join(", ") : undefined
            }
          />
          <SummaryItem label="Guests" value={describeParty(booking)} />
          <SummaryItem
            label="Capacity of selection"
            value={
              selected.size > 0
                ? `${selectedCapacity.standard} guest${selectedCapacity.standard === 1 ? "" : "s"}`
                : "—"
            }
            detail={
              selected.size > 0 && selectedCapacity.withExtraBed > selectedCapacity.standard
                ? `Maximum ${selectedCapacity.withExtraBed} with extra beds`
                : undefined
            }
          />
          <SummaryItem
            label="Extra beds required"
            value={selected.size > 0 && !capacityProblem ? String(extraBeds) : "—"}
            detail={
              selected.size > 0 && !capacityProblem && extraBeds > 0
                ? "To be arranged before check-in"
                : undefined
            }
            attention={selected.size > 0 && !capacityProblem && extraBeds > 0}
          />
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {capacityProblem ? (
            <p className="text-sm text-destructive">{capacityProblem}</p>
          ) : (
            <span />
          )}
          <Button
            onClick={confirm}
            disabled={isPending || selected.size === 0 || capacityProblem !== null}
          >
            {isPending ? "Allocating…" : "Confirm & Allocate"}
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
  occupied,
  selected,
  onToggle,
}: {
  title: string;
  description: string;
  rooms: Room[];
  occupied: Set<string>;
  selected: Set<string>;
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
          const isOccupied = occupied.has(room.id);
          const isSelected = selected.has(room.id);
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onToggle(room)}
              disabled={isOccupied}
              title={
                isOccupied
                  ? `${room.room_number} — already allotted for these dates`
                  : `${room.room_number} — ${ROOM_TYPE_LABELS[room.room_type]}. ${describeCapacity(room.room_type)}`
              }
              className={cn(
                "flex h-12 items-center justify-center rounded-md border text-xs font-semibold text-white transition-transform",
                isOccupied
                  ? "cursor-not-allowed bg-red-500 opacity-90"
                  : isSelected
                    ? "bg-blue-500 ring-2 ring-blue-300 hover:scale-105"
                    : "bg-emerald-500 hover:scale-105 hover:bg-emerald-600"
              )}
            >
              {room.room_number}
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
