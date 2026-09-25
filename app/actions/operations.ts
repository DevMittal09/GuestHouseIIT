"use server";

import { revalidatePath } from "next/cache";
import { canManageAnyBooking, canUseConsoleSection } from "@/lib/access";
import { isAdminUnlocked } from "@/lib/admin-lock";
import { recordAudit } from "@/lib/audit-server";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { notifyExtensionDecided, notifyExtensionRequested } from "@/lib/mail/notify";
import { releaseNoShow } from "@/lib/no-show-server";
import {
  earlierCheckInError,
  extensionError,
  noShowReleasable,
  planRoomRange,
  roomBlockError,
  type RoomBlock,
  type RoomRangePlan,
} from "@/lib/operations";
import { getStore } from "@/lib/store";
import { instituteIso } from "@/lib/tz";
import { RoomClashError, type Profile, type RoomType } from "@/lib/types";
import { actsAsRequester, canUpdateLifecycle } from "@/lib/workflow";
import type { ActionResult } from "./bookings";

/**
 * Operational states (Phase 7): extending a stay, a requester's extension
 * request and the manager's decision, releasing a no-show, maintenance blocks
 * and adding rooms in bulk. Every action re-checks the caller here and writes
 * the booking log (and the security audit log where the brief asks for it).
 */

function fail(e: unknown, what: string): { ok: false; error: string } {
  if (e instanceof RoomClashError) return { ok: false, error: e.message };
  const code = (e as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205" || code === "42703") {
    return { ok: false, error: "Apply supabase/migrations/00000000000020_operational_states.sql first." };
  }
  console.error(`[operations] ${what} failed`, e);
  return { ok: false, error: e instanceof Error ? e.message : `Something went wrong while ${what}` };
}

function refresh() {
  revalidatePath("/manager");
  revalidatePath("/caretaker");
  revalidatePath("/dashboard");
  revalidatePath("/availability");
}

// ------------------------------------------------------------- extensions

/**
 * The desk extends a stay (manager or caretaker). The holds move through the
 * same path as any date change, so a room someone else has by then refuses it.
 */
export async function extendStayAction(bookingId: string, untilLocal: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canUpdateLifecycle(user.role)) return { ok: false, error: "Only the guest house desk can extend a stay" };
    if (!reason?.trim()) return { ok: false, error: "Say why the stay is being extended — it goes in the log" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const until = instituteIso(untilLocal);
    const problem = extensionError(booking, until);
    if (problem) return { ok: false, error: problem };
    const answersRequest = booking.extension_requested_until && Date.parse(booking.extension_requested_until) <= Date.parse(until);
    await store.updateBookingDetails(bookingId, { check_out: until }, {
      action_by: user.id,
      action_by_name: user.full_name,
      new_status: booking.status,
      remarks: `Stay extended to ${formatDateTime(until)} by ${user.full_name}: ${reason.trim()}`,
    });
    if (answersRequest) await notifyExtensionDecided(bookingId, true, until, reason.trim());
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, "extending the stay");
  }
}

/**
 * The desk brings a stay's check-in forward (manager or caretaker, 25 Sep
 * 2026) — a guest arriving before the booked time. The holds move through
 * the same path as any date change, so a room someone else still has by then
 * refuses it, and the turnaround buffer before it is kept.
 */
export async function advanceCheckInAction(bookingId: string, fromLocal: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canUpdateLifecycle(user.role)) return { ok: false, error: "Only the guest house desk can move a stay's check-in" };
    if (!reason?.trim()) return { ok: false, error: "Say why the check-in is being brought forward — it goes in the log" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const from = instituteIso(fromLocal);
    const problem = earlierCheckInError(booking, from);
    if (problem) return { ok: false, error: problem };
    await store.updateBookingDetails(bookingId, { check_in: from }, {
      action_by: user.id,
      action_by_name: user.full_name,
      new_status: booking.status,
      remarks: `Check-in brought forward to ${formatDateTime(from)} by ${user.full_name}: ${reason.trim()}`,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, "moving the check-in");
  }
}

/** The requester asks to stay longer; the manager decides. */
export async function requestExtensionAction(bookingId: string, untilLocal: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    // Not found rather than forbidden: someone else's booking is not theirs to ask about.
    if (!booking || !actsAsRequester(booking, user.id)) return { ok: false, error: "Booking not found" };
    const why = reason?.trim() ?? "";
    if (why.length < 3) return { ok: false, error: "Say why you need to stay longer" };
    const until = instituteIso(untilLocal);
    const problem = extensionError(booking, until);
    if (problem) return { ok: false, error: problem };
    await store.updateBookingDetails(bookingId, { extension_request: { until, reason: why.slice(0, 500) } }, {
      action_by: user.id,
      action_by_name: user.full_name,
      new_status: booking.status,
      remarks: `Extension requested to ${formatDateTime(until)}: ${why.slice(0, 500)}`,
    });
    await notifyExtensionRequested(bookingId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, "requesting the extension");
  }
}

/** The manager approves (moving the holds) or declines a requester's extension. */
export async function decideExtensionAction(bookingId: string, approve: boolean, note: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) return { ok: false, error: "Only the Guest House Manager can decide an extension" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const until = booking.extension_requested_until;
    if (!until) return { ok: false, error: "There is no extension request on this booking" };
    const log = { action_by: user.id, action_by_name: user.full_name, new_status: booking.status };
    if (approve) {
      const problem = extensionError(booking, until);
      if (problem) return { ok: false, error: problem };
      await store.updateBookingDetails(bookingId, { check_out: until, extension_request: null }, {
        ...log,
        remarks: `Extension to ${formatDateTime(until)} approved by ${user.full_name}${note.trim() ? `: ${note.trim()}` : ""}`,
      });
    } else {
      if (!note?.trim()) return { ok: false, error: "Say why the extension is declined — the requester is told" };
      await store.updateBookingDetails(bookingId, { extension_request: null }, {
        ...log,
        remarks: `Extension to ${formatDateTime(until)} declined by ${user.full_name}: ${note.trim()}`,
      });
    }
    await notifyExtensionDecided(bookingId, approve, until, note.trim() || null);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, "deciding the extension");
  }
}

// ---------------------------------------------------------------- no-show

/** The manager releases a stay whose guest has not arrived. */
export async function releaseNoShowAction(bookingId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) return { ok: false, error: "Only the Guest House Manager can release a no-show" };
    const booking = await getStore().getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    if (!noShowReleasable(booking, new Date())) {
      return { ok: false, error: "Only an approved stay whose check-in time has passed, with no one checked in, can be released as a no-show" };
    }
    await releaseNoShow(bookingId, user, reason?.trim() || null);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, "releasing the no-show");
  }
}

// ------------------------------------------------------------- room moves

/** Rooms at the stay's guest house, and whether each is free for the rest of the stay. */
export async function getMoveOptions(
  bookingId: string
): Promise<{ ok: true; rooms: { id: string; room_number: string; room_type: RoomType; free: boolean; current: boolean }[] } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (!canManageAnyBooking(user.role)) return { ok: false, error: "Only the Guest House Manager can move rooms" };
    const store = getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return { ok: false, error: "Booking not found" };
    const [rooms, busy] = await Promise.all([
      store.listRooms(booking.guest_house_id),
      store.getOccupiedRoomIds(booking.guest_house_id, booking.check_in, booking.check_out, bookingId),
    ]);
    const held = new Set(booking.assigned_room_ids);
    return {
      ok: true,
      rooms: rooms.map((r) => ({
        id: r.id,
        room_number: r.room_number,
        room_type: r.room_type,
        free: !busy.includes(r.id),
        current: held.has(r.id),
      })),
    };
  } catch (e) {
    return fail(e, "reading the rooms");
  }
}

// ------------------------------------------------------ maintenance blocks

async function requireRoomsConsole(): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, "guest_houses")) throw new Error("Only the Guest House Manager or a developer can manage rooms");
  if (!(await isAdminUnlocked())) throw new Error("The console is locked — enter the console password again");
  return user;
}

export async function listRoomBlocksAction(guestHouseId: string): Promise<{ ok: true; blocks: RoomBlock[] } | { ok: false; error: string }> {
  try {
    await requireRoomsConsole();
    return { ok: true, blocks: await getStore().listRoomBlocks(guestHouseId) };
  } catch (e) {
    return fail(e, "reading the blocks");
  }
}

/** Take a room out of service for a period. Refused over any stay's time in it. */
export async function createRoomBlockAction(roomId: string, fromLocal: string, toLocal: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireRoomsConsole();
    const from = instituteIso(fromLocal);
    const to = instituteIso(toLocal);
    const problem = roomBlockError({ from, to, reason: reason ?? "" });
    if (problem) return { ok: false, error: problem };
    const block = await getStore().createRoomBlock({ room_id: roomId, from, to, reason: reason.trim(), created_by: user.id });
    await recordAudit(user, "room.maintenance", roomId, { added: { from, to, reason: block.reason } });
    refresh();
    revalidatePath("/admin/guest-houses");
    return { ok: true };
  } catch (e) {
    return fail(e, "blocking the room");
  }
}

export async function deleteRoomBlockAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireRoomsConsole();
    await getStore().deleteRoomBlock(id);
    await recordAudit(user, "room.maintenance", id, { removed: true });
    refresh();
    revalidatePath("/admin/guest-houses");
    return { ok: true };
  } catch (e) {
    return fail(e, "removing the block");
  }
}

// ----------------------------------------------------------- bulk rooms

export async function previewRoomRangeAction(
  guestHouseId: string,
  text: string
): Promise<{ ok: true; plan: RoomRangePlan } | { ok: false; error: string }> {
  try {
    await requireRoomsConsole();
    const rooms = await getStore().listAllRooms(guestHouseId);
    return { ok: true, plan: planRoomRange(text, rooms.map((r) => r.room_number)) };
  } catch (e) {
    return fail(e, "reading the range");
  }
}

/** Add the rooms the preview listed — all or nothing. */
export async function createRoomRangeAction(guestHouseId: string, text: string, roomType: RoomType): Promise<ActionResult & { created?: number }> {
  try {
    const user = await requireRoomsConsole();
    if (roomType !== "single" && roomType !== "double_sharing") return { ok: false, error: "Choose a room type" };
    const store = getStore();
    const plan = planRoomRange(text, (await store.listAllRooms(guestHouseId)).map((r) => r.room_number));
    if (plan.problems.length > 0) return { ok: false, error: plan.problems[0] };
    if (plan.create.length === 0) return { ok: false, error: "Every one of those rooms already exists" };
    const created = await store.createRooms(guestHouseId, plan.create.map((room_number) => ({ room_number, room_type: roomType })));
    await recordAudit(user, "settings.changed", "rooms", { guest_house: guestHouseId, added: plan.create, room_type: roomType });
    revalidatePath("/admin/guest-houses");
    refresh();
    return { ok: true, created };
  } catch (e) {
    return fail(e, "adding the rooms");
  }
}
