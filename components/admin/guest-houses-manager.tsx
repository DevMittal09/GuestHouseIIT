"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createGuestHouseAction,
  createRoomAction,
  deleteGuestHouseAction,
  deleteRoomAction,
  renameGuestHouseAction,
  setGuestHouseMealsAction,
  setRoomActiveAction,
} from "@/app/actions/admin";
import {
  createRoomBlockAction,
  createRoomRangeAction,
  deleteRoomBlockAction,
  previewRoomRangeAction,
} from "@/app/actions/operations";
import { formatDateTime } from "@/lib/format";
import type { RoomBlock, RoomRangePlan } from "@/lib/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { GuestHouse, Room, RoomType } from "@/lib/types";
import type { ActionResult } from "@/app/actions/bookings";

export function GuestHousesManager({
  guestHouses,
  roomsByGh,
  blocksByGh = {},
}: {
  guestHouses: GuestHouse[];
  roomsByGh: Record<string, Room[]>;
  /** Maintenance blocks still to come or in force (Phase 7). */
  blocksByGh?: Record<string, RoomBlock[]>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newGhName, setNewGhName] = useState("");

  const run = (fn: () => Promise<ActionResult>, successMessage: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a guest house</CardTitle>
          <CardDescription>
            New guest houses appear in the manager console and in booking-form guest house
            permissions immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="new-gh">Name</Label>
            <Input
              id="new-gh"
              placeholder="e.g. Kalyani"
              className="w-56"
              value={newGhName}
              onChange={(e) => setNewGhName(e.target.value)}
            />
          </div>
          <Button
            disabled={isPending || newGhName.trim().length < 2}
            onClick={() =>
              run(async () => {
                const result = await createGuestHouseAction(newGhName);
                if (result.ok) setNewGhName("");
                return result;
              }, "Guest house created")
            }
          >
            + Add guest house
          </Button>
        </CardContent>
      </Card>

      {guestHouses.map((gh) => (
        <GuestHouseCard
          key={gh.id}
          gh={gh}
          rooms={roomsByGh[gh.id] ?? []}
          blocks={blocksByGh[gh.id] ?? []}
          isPending={isPending}
          run={run}
        />
      ))}
    </div>
  );
}

function GuestHouseCard({
  gh,
  rooms,
  blocks,
  isPending,
  run,
}: {
  gh: GuestHouse;
  rooms: Room[];
  blocks: RoomBlock[];
  isPending: boolean;
  run: (fn: () => Promise<ActionResult>, successMessage: string) => void;
}) {
  const [rangeText, setRangeText] = useState("");
  const [plan, setPlan] = useState<RoomRangePlan | null>(null);
  const [confirmRange, setConfirmRange] = useState(false);
  const [blockRoom, setBlockRoom] = useState("");
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const roomNumberOf = (id: string) => rooms.find((r) => r.id === id)?.room_number ?? "?";
  const [name, setName] = useState(gh.name);
  const [roomNumber, setRoomNumber] = useState("");
  /**
   * Every room in both guest houses is double sharing, so the type is not
   * asked for: new rooms are created as doubles. It stays a column on `rooms`
   * (the tariffs and the invoice are per type, and older single rooms may
   * still exist), so this is a constant here rather than a removal.
   */
  const roomType: RoomType = "double_sharing";
  /** Whether this guest house still holds rooms of more than one type. */
  const mixedTypes = new Set(rooms.map((r) => r.room_type)).size > 1;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-56 font-semibold"
              aria-label={`Rename ${gh.name}`}
            />
            {name.trim() !== gh.name && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => renameGuestHouseAction(gh.id, name), "Renamed")}
              >
                Save name
              </Button>
            )}
            <Badge variant="secondary">{gh.total_rooms} active rooms</Badge>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5">
              <Switch
                checked={gh.serves_meals}
                disabled={isPending}
                onChange={(e) => {
                  const on = e.target.checked;
                  run(
                    () => setGuestHouseMealsAction(gh.id, on),
                    on ? `Meals enabled at ${gh.name}` : `Meals disabled at ${gh.name}`
                  );
                }}
              />
              Serves meals
            </label>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirmDelete(true)}
          >
            Delete guest house
          </Button>
          {/* Deleting a guest house takes its rooms with it, so this asks for
              the name to be typed rather than accepting a stray Enter on a
              browser confirm. */}
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete ${gh.name}?`}
            description="This permanently removes the guest house from the portal. It cannot be undone."
            consequences={[
              `All ${rooms.length} room${rooms.length === 1 ? "" : "s"} in ${gh.name} are deleted with it.`,
              "Requesters can no longer choose it, and it disappears from the availability grid.",
              "Blocked if any booking still references this guest house — delete those first.",
            ]}
            confirmPhrase={gh.name}
            confirmLabel="Delete guest house"
            pending={isPending}
            onConfirm={() => {
              setConfirmDelete(false);
              run(() => deleteGuestHouseAction(gh.id), "Guest house deleted");
            }}
          />
        </div>
        <CardDescription>
          Deactivated rooms stay in the system but disappear from the manager&apos;s allocation
          grid. With &ldquo;Serves meals&rdquo; on, requesters booking this guest house choose
          meals day by day; with it off, the booking form offers no meals here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Room number</Label>
            <Input
              placeholder="e.g. B-301"
              className="w-36"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={isPending || !roomNumber.trim()}
            onClick={() =>
              run(async () => {
                const result = await createRoomAction(gh.id, roomNumber, roomType);
                if (result.ok) setRoomNumber("");
                return result;
              }, `Room ${roomNumber.trim()} added`)
            }
          >
            + Add room
          </Button>
        </div>

        {/* Many rooms at once (Phase 7): "B-101 to B-120", previewed first. */}
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label htmlFor={`range-${gh.id}`}>Add many rooms</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id={`range-${gh.id}`}
              placeholder="e.g. B-101 to B-120, or B-301, B-305"
              className="w-72 max-w-full"
              value={rangeText}
              onChange={(e) => {
                setRangeText(e.target.value);
                setPlan(null);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isPending || !rangeText.trim()}
              onClick={async () => {
                const result = await previewRoomRangeAction(gh.id, rangeText);
                if (result.ok) setPlan(result.plan);
                else toast.error(result.error);
              }}
            >
              Preview
            </Button>
            <Button
              size="sm"
              disabled={isPending || !plan || plan.problems.length > 0 || plan.create.length === 0}
              onClick={() => setConfirmRange(true)}
            >
              Add {plan?.create.length ?? 0} rooms
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Uses the type chosen above for all of them.</p>
          {plan && (
            <div className="text-sm">
              {plan.problems.length > 0 ? (
                <ul className="list-disc pl-5 text-destructive">
                  {plan.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  <span className="font-medium">{plan.create.length} new:</span> {plan.create.join(", ") || "none"}
                  {plan.existing.length > 0 && (
                    <span className="block text-muted-foreground">Already here, skipped: {plan.existing.join(", ")}</span>
                  )}
                </p>
              )}
            </div>
          )}
          <ConfirmDialog
            open={confirmRange}
            onOpenChange={setConfirmRange}
            title={`Add ${plan?.create.length ?? 0} rooms to ${gh.name}?`}
            description={`${plan?.create.slice(0, 12).join(", ") ?? ""}${(plan?.create.length ?? 0) > 12 ? "…" : ""} — all as double sharing rooms.`}
            confirmLabel="Add rooms"
            confirmVariant="default"
            pending={isPending}
            onConfirm={() => {
              setConfirmRange(false);
              run(async () => {
                const result = await createRoomRangeAction(gh.id, rangeText, roomType);
                if (result.ok) {
                  setRangeText("");
                  setPlan(null);
                }
                return result;
              }, `${plan?.create.length ?? 0} rooms added`);
            }}
          />
        </div>

        {/* Out of service (Phase 7): never allocatable while blocked, drawn
            cross-hatched on the charts, and refused over anyone's stay. */}
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">🔧 Maintenance</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor={`block-room-${gh.id}`}>Room</Label>
              <NativeSelect id={`block-room-${gh.id}`} value={blockRoom} onChange={(e) => setBlockRoom(e.target.value)}>
                <option value="">Choose…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_number}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`block-from-${gh.id}`}>Out of service from</Label>
              <Input id={`block-from-${gh.id}`} type="datetime-local" value={blockFrom} onChange={(e) => setBlockFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`block-to-${gh.id}`}>Back in service</Label>
              <Input id={`block-to-${gh.id}`} type="datetime-local" value={blockTo} onChange={(e) => setBlockTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`block-reason-${gh.id}`}>Reason</Label>
              <Input
                id={`block-reason-${gh.id}`}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g. Repainting"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !blockRoom || !blockFrom || !blockTo || blockReason.trim().length < 3}
              onClick={() =>
                run(async () => {
                  const result = await createRoomBlockAction(blockRoom, blockFrom, blockTo, blockReason);
                  if (result.ok) setBlockReason("");
                  return result;
                }, `Room ${roomNumberOf(blockRoom)} blocked`)
              }
            >
              Block room
            </Button>
          </div>
          {blocks.length > 0 && (
            <ul className="divide-y rounded-md border text-sm">
              {blocks.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span>
                    <span className="font-medium">🔧 {roomNumberOf(b.room_id)}</span> · {formatDateTime(b.from)} →{" "}
                    {formatDateTime(b.to)} · {b.reason}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => run(() => deleteRoomBlockAction(b.id), "Block removed")}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rooms.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No rooms yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border p-2 text-sm",
                  !room.is_active && "opacity-60"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{room.room_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {/* Printed only where this guest house has more than one
                        type — otherwise it is the same word under every room. */}
                    {mixedTypes ? `${room.room_type === "single" ? "Single" : "Double"}` : "Room"}
                    {!room.is_active && " · inactive"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => setRoomActiveAction(room.id, !room.is_active),
                        room.is_active ? "Room deactivated" : "Room activated"
                      )
                    }
                  >
                    {room.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    className="text-destructive"
                    onClick={() => setRoomToDelete(room)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={roomToDelete !== null}
          onOpenChange={(open) => !open && setRoomToDelete(null)}
          title={roomToDelete ? `Delete room ${roomToDelete.room_number}?` : ""}
          description="This permanently removes the room. Deactivating it instead keeps its booking history intact."
          consequences={[
            "The room disappears from the allocation grid and the availability chart.",
            "Blocked if the room is assigned to any booking — deactivate it instead.",
          ]}
          confirmLabel="Delete room"
          pending={isPending}
          onConfirm={() => {
            const room = roomToDelete;
            setRoomToDelete(null);
            if (room) run(() => deleteRoomAction(room.id), "Room deleted");
          }}
        />
      </CardContent>
    </Card>
  );
}
