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
}: {
  guestHouses: GuestHouse[];
  roomsByGh: Record<string, Room[]>;
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
  isPending,
  run,
}: {
  gh: GuestHouse;
  rooms: Room[];
  isPending: boolean;
  run: (fn: () => Promise<ActionResult>, successMessage: string) => void;
}) {
  const [name, setName] = useState(gh.name);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("double_sharing");
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
          <div className="space-y-2">
            <Label>Type</Label>
            <NativeSelect
              className="w-44"
              value={roomType}
              onChange={(e) => setRoomType(e.target.value as RoomType)}
            >
              <option value="double_sharing">Double sharing</option>
              <option value="single">Single</option>
            </NativeSelect>
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
                    {room.room_type === "single" ? "Single" : "Double"}
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
