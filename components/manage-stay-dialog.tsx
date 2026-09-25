"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { managerCancelBooking, reassignRooms } from "@/app/actions/manager";
import {
  advanceCheckInAction,
  decideExtensionAction,
  extendStayAction,
  getMoveOptions,
  releaseNoShowAction,
} from "@/app/actions/operations";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TimeSelect } from "@/components/ui/time-select";
import { formatDateTime, toDatetimeLocal } from "@/lib/format";
import { ROOM_TYPE_LABELS } from "@/lib/occupancy";
import { earlierCheckInError, extensionError, noShowReleasable } from "@/lib/operations";
import { instituteIso } from "@/lib/tz";
import type { BookingWithDetails, RoomType } from "@/lib/types";

type MoveRoom = { id: string; room_number: string; room_type: RoomType; free: boolean; current: boolean };

/** "2026-10-01T14:00" → ["2026-10-01", "14:00"]. */
const splitLocal = (iso: string): [string, string] => {
  const [date, time] = toDatetimeLocal(iso).split("T");
  return [date, time];
};

/**
 * What the desk can do to a stay besides check it in and out (Phase 7):
 * extend it — a later check-out, or since 25 Sep 2026 an earlier check-in —
 * answer the requester's extension request, move the party to another room,
 * release a no-show, or cancel it. The caretaker can change the dates; the
 * rest is the manager's. Every change asks for a reason, which goes in the
 * booking's log — and a move or a release in the security audit log too.
 *
 * Dates are a date box and the three time dropdowns (`TimeSelect`), never
 * `datetime-local`, which Firefox makes type-only.
 */
export function ManageStayDialog({ booking, isManager }: { booking: BookingWithDetails; isManager: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [[fromDate, fromTime], setFrom] = useState(() => splitLocal(booking.check_in));
  const [[untilDate, untilTime], setUntil] = useState(() =>
    splitLocal(booking.extension_requested_until ?? booking.check_out)
  );
  const [extendReason, setExtendReason] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [rooms, setRooms] = useState<MoveRoom[] | null>(null);
  const [moveTo, setMoveTo] = useState<string[]>(booking.assigned_room_ids);
  const [moveReason, setMoveReason] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [confirm, setConfirm] = useState<"release" | "cancel" | null>(null);

  const from = `${fromDate}T${fromTime}`;
  const until = `${untilDate}T${untilTime}`;
  // The same rules the actions apply, so a button is only live when the
  // server would accept it; its reason is shown beside it otherwise.
  const instant = (local: string) => {
    try {
      return instituteIso(local);
    } catch {
      return "";
    }
  };
  const earlierProblem = earlierCheckInError(booking, instant(from));
  const laterProblem = extensionError(booking, instant(until));
  const canMove = isManager && booking.assigned_room_ids.length > 0;
  const noShow = isManager && noShowReleasable(booking, new Date());
  const pendingExtension = booking.extension_requested_until ?? null;

  useEffect(() => {
    if (!open || !canMove || rooms) return;
    startTransition(async () => {
      const result = await getMoveOptions(booking.id);
      if (result.ok) setRooms(result.rooms);
    });
  }, [open, canMove, rooms, booking.id]);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string, close = true) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      setConfirm(null);
      if (close) setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {pendingExtension ? "⏳ Manage" : "Manage"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage {booking.booking_reference_id}</DialogTitle>
          <DialogDescription>
            {booking.requester.full_name} · {booking.assigned_rooms.map((r) => r.room_number).join(", ") || "no room"} ·{" "}
            {formatDateTime(booking.check_in)} → {formatDateTime(booking.check_out)}
          </DialogDescription>
        </DialogHeader>

        {pendingExtension && (
          <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
            <p className="font-medium">
              ⏳ Extension requested — until {formatDateTime(pendingExtension)}
            </p>
            {booking.extension_reason && <p className="text-muted-foreground">“{booking.extension_reason}”</p>}
            {isManager ? (
              <>
                <Textarea
                  aria-label="Note to the requester"
                  rows={2}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Note to the requester (required to decline)"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={isPending}
                    onClick={() => run(() => decideExtensionAction(booking.id, false, decisionNote), "Extension declined")}
                  >
                    Decline
                  </Button>
                  <Button
                    disabled={isPending}
                    onClick={() => run(() => decideExtensionAction(booking.id, true, decisionNote), "Extension approved")}
                  >
                    Approve
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">The Guest House Manager decides requests.</p>
            )}
          </section>
        )}

        <section className="space-y-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Extend the stay</p>
            <p className="text-xs text-muted-foreground">
              Bring the check-in forward for a guest arriving early, or push the check-out back. The same rooms are
              kept; refused if someone else has one of them by then.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`extend-reason-${booking.id}`}>Reason</Label>
            <Input
              id={`extend-reason-${booking.id}`}
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
              placeholder="e.g. Arriving a day early for the viva / Viva moved to Friday"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
              <Label htmlFor={`from-${booking.id}`}>Earlier check-in</Label>
              <Input
                id={`from-${booking.id}`}
                type="date"
                value={fromDate}
                max={splitLocal(booking.check_in)[0]}
                onChange={(e) => setFrom([e.target.value, fromTime])}
              />
              <TimeSelect label="New check-in" value={fromTime} onChange={(t) => setFrom([fromDate, t])} />
              <p className="text-xs text-muted-foreground">Now {formatDateTime(booking.check_in)}.</p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={isPending || !extendReason.trim() || !!earlierProblem}
                title={earlierProblem ?? undefined}
                onClick={() => run(() => advanceCheckInAction(booking.id, from, extendReason), "Check-in brought forward")}
              >
                Bring check-in forward
              </Button>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
              <Label htmlFor={`until-${booking.id}`}>Later check-out</Label>
              <Input
                id={`until-${booking.id}`}
                type="date"
                value={untilDate}
                min={splitLocal(booking.check_out)[0]}
                onChange={(e) => setUntil([e.target.value, untilTime])}
              />
              <TimeSelect label="New check-out" value={untilTime} onChange={(t) => setUntil([untilDate, t])} />
              <p className="text-xs text-muted-foreground">Now {formatDateTime(booking.check_out)}.</p>
              <Button
                size="sm"
                className="w-full"
                disabled={isPending || !extendReason.trim() || !!laterProblem}
                title={laterProblem ?? undefined}
                onClick={() => run(() => extendStayAction(booking.id, until, extendReason), "Stay extended")}
              >
                Extend check-out
              </Button>
            </div>
          </div>
        </section>

        {canMove && (
          <section className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Move to another room</p>
            {!rooms ? (
              <p className="text-xs text-muted-foreground">Checking which rooms are free…</p>
            ) : (
              <>
                {booking.assigned_room_ids.map((current, i) => (
                  <div key={current} className="space-y-1">
                    <Label htmlFor={`move-${booking.id}-${i}`}>
                      {booking.rooms[i] ? `Room ${booking.rooms[i].room_index}` : `Room ${i + 1}`} — now{" "}
                      {rooms.find((r) => r.id === current)?.room_number ?? "?"}
                    </Label>
                    <NativeSelect
                      id={`move-${booking.id}-${i}`}
                      value={moveTo[i] ?? current}
                      onChange={(e) => setMoveTo((m) => m.map((x, j) => (j === i ? e.target.value : x)))}
                    >
                      {rooms
                        .filter((r) => r.free || r.current)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.room_number} — {ROOM_TYPE_LABELS[r.room_type]}
                            {r.current ? " (current)" : " (free)"}
                          </option>
                        ))}
                    </NativeSelect>
                  </div>
                ))}
                <Input
                  aria-label="Reason for the move"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="Reason, e.g. AC not working in B-204"
                />
                <p className="text-xs text-muted-foreground">
                  Only rooms free for the whole stay are offered. The move is logged and audited.
                </p>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={
                      isPending ||
                      !moveReason.trim() ||
                      moveTo.every((id, i) => id === booking.assigned_room_ids[i])
                    }
                    onClick={() => run(() => reassignRooms(booking.id, moveTo, moveReason), "Room changed")}
                  >
                    Move
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        {isManager && (
          <section className="space-y-2 rounded-lg border border-destructive/30 p-3">
            <p className="text-sm font-medium">Release or cancel</p>
            <div className="flex flex-wrap gap-2">
              {noShow && (
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => setConfirm("release")}>
                  ✕ Release as no-show
                </Button>
              )}
              <Button size="sm" variant="destructive" disabled={isPending} onClick={() => setConfirm("cancel")}>
                Cancel stay
              </Button>
            </div>
            {!noShow && booking.status === "APPROVED" && (
              <p className="text-xs text-muted-foreground">
                “Release as no-show” appears once the booked check-in time has passed with nobody checked in.
              </p>
            )}
          </section>
        )}

        <ConfirmDialog
          open={confirm === "release"}
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Release as a no-show?"
          description={`Nobody has checked in for ${booking.booking_reference_id}. The booking is cancelled, its rooms are freed for others, and the requester is told by email.`}
          confirmLabel="Release rooms"
          pending={isPending}
          onConfirm={() => run(() => releaseNoShowAction(booking.id, releaseReason), "Released as a no-show")}
        >
          <Input
            aria-label="Note (optional)"
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
            placeholder="Note to the requester (optional)"
          />
        </ConfirmDialog>
        <ConfirmDialog
          open={confirm === "cancel"}
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Cancel this stay?"
          description="The booking is cancelled and its rooms released. The requester is told, with your reason."
          confirmLabel="Cancel stay"
          pending={isPending}
          onConfirm={() => run(() => managerCancelBooking(booking.id, cancelReason), "Stay cancelled")}
        >
          <Textarea
            aria-label="Reason"
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (required)"
          />
        </ConfirmDialog>
      </DialogContent>
    </Dialog>
  );
}
