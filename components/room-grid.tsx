"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { allocateRooms, getOccupancy } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/ui/time-select";
import { toDatetimeLocal } from "@/lib/format";
import {
  allocationCapacityError,
  capacityOf,
  countBedGuests,
  describeCapacity,
  describeParty,
  extraBedsNeeded,
} from "@/lib/occupancy";
import { cn } from "@/lib/utils";
import type { BookingWithDetails, Room } from "@/lib/types";

/**
 * Cinema-style room allocation grid.
 * Green = available · Red = occupied for the selected dates · Blue = selected.
 */
export function RoomGrid({
  booking,
  rooms,
  onAllocated,
}: {
  booking: BookingWithDetails;
  rooms: Room[];
  onAllocated?: () => void;
}) {
  const router = useRouter();
  const [initialInDate, initialInTime] = toDatetimeLocal(booking.check_in).split("T");
  const [initialOutDate, initialOutTime] = toDatetimeLocal(booking.check_out).split("T");
  const [inDate, setInDate] = useState(initialInDate);
  const [inTime, setInTime] = useState(initialInTime);
  const [outDate, setOutDate] = useState(initialOutDate);
  const [outTime, setOutTime] = useState(initialOutTime);
  const checkIn = `${inDate}T${inTime}`;
  const checkOut = `${outDate}T${outTime}`;
  const [occupied, setOccupied] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!inDate || !outDate || new Date(checkOut) <= new Date(checkIn)) return;
    let cancelled = false;
    getOccupancy(
      booking.guest_house_id,
      new Date(checkIn).toISOString(),
      new Date(checkOut).toISOString(),
      booking.id
    )
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
  }, [booking.guest_house_id, booking.id, inDate, outDate, checkIn, checkOut, refreshKey]);

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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="grid-check-in">View occupancy from</Label>
          <Input
            id="grid-check-in"
            type="date"
            value={inDate}
            onChange={(e) => {
              setInDate(e.target.value);
              setLoading(true);
            }}
          />
          <TimeSelect
            label="Occupancy from"
            value={inTime}
            onChange={(v) => {
              setInTime(v);
              setLoading(true);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grid-check-out">until</Label>
          <Input
            id="grid-check-out"
            type="date"
            value={outDate}
            onChange={(e) => {
              setOutDate(e.target.value);
              setLoading(true);
            }}
          />
          <TimeSelect
            label="Occupancy until"
            value={outTime}
            onChange={(v) => {
              setOutTime(v);
              setLoading(true);
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <LegendSwatch className="bg-emerald-500" label="Available" />
        <LegendSwatch className="bg-red-500" label="Occupied / Booked" />
        <LegendSwatch className="bg-blue-500" label="Selected for this booking" />
        {loading && <span className="text-muted-foreground">Loading occupancy…</span>}
      </div>

      <RoomSection
        title={`Double Sharing — ${describeCapacity("double_sharing")}`}
        rooms={doubles}
        occupied={occupied}
        selected={selected}
        onToggle={toggle}
      />
      <RoomSection
        title={`Single — ${describeCapacity("single")}`}
        rooms={singles}
        occupied={occupied}
        selected={selected}
        onToggle={toggle}
      />

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p>
              Selected <span className="font-semibold">{selected.size}</span> of{" "}
              <span className="font-semibold">{booking.rooms_requested}</span> requested room(s)
              {selected.size > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  — {selectedRooms.map((r) => r.room_number).join(", ")}
                </span>
              )}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{describeParty(booking.guests)}</span>
              {selected.size > 0 && (
                <>
                  {" "}
                  · selection sleeps {selectedCapacity.standard}
                  {selectedCapacity.withExtraBed > selectedCapacity.standard && (
                    <>
                      , {selectedCapacity.withExtraBed} with{" "}
                      {selectedCapacity.withExtraBed - selectedCapacity.standard} extra bed
                      {selectedCapacity.withExtraBed - selectedCapacity.standard === 1 ? "" : "s"}
                    </>
                  )}
                  {extraBedsNeeded(bedGuests, selected.size) > 0 && !capacityProblem && (
                    <span className="text-foreground">
                      {" "}
                      — {extraBedsNeeded(bedGuests, selected.size)} extra bed
                      {extraBedsNeeded(bedGuests, selected.size) === 1 ? "" : "s"} required
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <Button
            onClick={confirm}
            disabled={isPending || selected.size === 0 || capacityProblem !== null}
          >
            {isPending ? "Allocating…" : "Confirm & Allocate"}
          </Button>
        </div>
        {capacityProblem && <p className="text-sm text-destructive">{capacityProblem}</p>}
      </div>
    </div>
  );
}

function RoomSection({
  title,
  rooms,
  occupied,
  selected,
  onToggle,
}: {
  title: string;
  rooms: Room[];
  occupied: Set<string>;
  selected: Set<string>;
  onToggle: (room: Room) => void;
}) {
  if (rooms.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
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
                  ? `${room.room_number} — occupied for the selected dates`
                  : `${room.room_number} — ${describeCapacity(room.room_type)}`
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
