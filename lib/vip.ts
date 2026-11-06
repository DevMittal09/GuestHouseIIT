import type { AvailabilityCounts } from "./availability";
import { DEFAULT_RULES, type PolicyRules } from "./settings";
import type { Role, Room } from "./types";

/**
 * **VIP rooms** (4 Nov 2026, the owner's sixteenth list).
 *
 * A handful of rooms are held back for the Director and the offices nearest
 * to them: only those accounts see the rooms counted as free, and only their
 * bookings may be given one. Rooms C1 and C2 by default; the Guest House
 * Manager changes which rooms, and who besides the three fixed accounts may
 * use them, at Console -> VIP Rooms & Guidelines (`rules.policy`).
 *
 * The rule has two halves and both are here, so the availability figures and
 * the allocation cannot disagree about what a VIP room is:
 *
 * - **visibility** - `roomsVisibleTo` drops the VIP rooms from what a
 *   requester is counted, before any figure is computed;
 * - **booking rights** - `vipAllocationError` refuses a VIP room on a
 *   booking whose requester is not on the list, at allocation, server-side.
 *
 * The desk (manager, caretaker, developer) sees every room, because it runs
 * them; seeing a room is not the right to give it away.
 */

/** Room numbers that are VIP until the manager saves a list of their own. */
export const DEFAULT_VIP_ROOM_NUMBERS = ["C1", "C2"];

/**
 * The accounts that always have VIP access - the Director, the Director's
 * office and the Administration office, as the sixteenth list names them.
 * Fixed in code rather than a deletable row, so the console cannot take the
 * Director's own rooms away from the Director.
 */
export const FIXED_VIP_EMAILS = [
  "director@iitpkd.ac.in",
  "office_director@iitpkd.ac.in",
  "adadmin@iitpkd.ac.in",
];

/** Roles that see every room, VIP or not. */
const DESK_ROLES: Role[] = ["gh_manager", "gh_caretaker", "developer"];

/** The ids of the VIP rooms among `rooms`, under this policy. */
export function vipRoomIds(
  rooms: Pick<Room, "id" | "room_number">[],
  policy: Pick<PolicyRules, "vip_room_ids"> = DEFAULT_RULES.policy
): Set<string> {
  if (policy.vip_room_ids !== null) return new Set(policy.vip_room_ids);
  const numbers = new Set(DEFAULT_VIP_ROOM_NUMBERS.map((n) => n.toUpperCase()));
  return new Set(rooms.filter((r) => numbers.has(r.room_number.trim().toUpperCase())).map((r) => r.id));
}

export function isVipRoom(
  room: Pick<Room, "id" | "room_number">,
  allRooms: Pick<Room, "id" | "room_number">[],
  policy: Pick<PolicyRules, "vip_room_ids"> = DEFAULT_RULES.policy
): boolean {
  return vipRoomIds(allRooms, policy).has(room.id);
}

/** Every address with VIP access: the fixed three and the manager's list. */
export function vipEmails(policy: Pick<PolicyRules, "vip_emails"> = DEFAULT_RULES.policy): string[] {
  return [...new Set([...FIXED_VIP_EMAILS, ...policy.vip_emails.map((e) => e.trim().toLowerCase())])];
}

/** Whether this account may see and be given the VIP rooms. */
export function hasVipAccess(
  email: string | null | undefined,
  policy: Pick<PolicyRules, "vip_emails"> = DEFAULT_RULES.policy
): boolean {
  if (!email) return false;
  return vipEmails(policy).includes(email.trim().toLowerCase());
}

/** Whether this viewer is counted the VIP rooms - the desk, or a VIP. */
export function seesVipRooms(
  viewer: { role: Role; email: string | null | undefined },
  policy: Pick<PolicyRules, "vip_emails"> = DEFAULT_RULES.policy
): boolean {
  return DESK_ROLES.includes(viewer.role) || hasVipAccess(viewer.email, policy);
}

/** The rooms this viewer is told about: the VIP rooms only for the desk and a VIP. */
export function roomsVisibleTo<R extends Pick<Room, "id" | "room_number">>(
  rooms: R[],
  viewer: { role: Role; email: string | null | undefined },
  policy: Pick<PolicyRules, "vip_room_ids" | "vip_emails"> = DEFAULT_RULES.policy,
  allRooms: Pick<Room, "id" | "room_number">[] = rooms
): R[] {
  if (seesVipRooms(viewer, policy)) return rooms;
  const vip = vipRoomIds(allRooms, policy);
  return rooms.filter((r) => !vip.has(r.id));
}

/**
 * Why these rooms may not be given to this booking, or null when they may.
 *
 * A VIP room goes only to a booking whose requester has VIP access - or one
 * the Guest House Manager raised themself, since the desk books for whoever
 * the Director's office sends to the counter.
 */
export function requesterMayHaveVipRooms(
  requester: { role: Role; email: string | null | undefined },
  policy: Pick<PolicyRules, "vip_emails"> = DEFAULT_RULES.policy
): boolean {
  return (
    requester.role === "gh_manager" ||
    requester.role === "developer" ||
    hasVipAccess(requester.email, policy)
  );
}

export function vipAllocationError(
  roomIds: string[],
  allRooms: Pick<Room, "id" | "room_number">[],
  requester: { role: Role; email: string | null | undefined },
  policy: Pick<PolicyRules, "vip_room_ids" | "vip_emails"> = DEFAULT_RULES.policy
): string | null {
  if (requesterMayHaveVipRooms(requester, policy)) return null;
  const vip = vipRoomIds(allRooms, policy);
  const taken = allRooms.filter((r) => roomIds.includes(r.id) && vip.has(r.id));
  if (taken.length === 0) return null;
  const names = taken.map((r) => r.room_number).join(", ");
  return `${names} ${taken.length === 1 ? "is a VIP room" : "are VIP rooms"} - only a booking by an account with VIP access can be given ${taken.length === 1 ? "it" : "them"}.`;
}

// ------------------------------------------------------- the visible-room cap

/**
 * **The most rooms a general requester is told are free** (sixteenth list:
 * "general users will see a maximum of 14 rooms available at any given time.
 * If the GHM books some of these, the visible count decreases accordingly").
 *
 * The cap is a **pool across every guest house**, not a ceiling per figure:
 * `cap - held` is what is left of it at a moment, where `held` counts every
 * non-VIP room taken anywhere. A guest house's figure is its own free rooms,
 * clamped to that remainder. So a room the desk gives away always comes off
 * what a requester reads, and the figure never reads above the cap.
 *
 * `free` and `total` are per guest house, at one moment (a day, an hour);
 * `heldEverywhere` is the non-VIP rooms held across all of them then.
 */
export function cappedFree(free: number, heldEverywhere: number, cap: number): number {
  if (cap <= 0) return free;
  return Math.max(0, Math.min(free, cap - heldEverywhere));
}

/** Whether this viewer is held to the cap: everyone but the desk and a VIP. */
export function heldToVisibleRoomCap(
  viewer: { role: Role; email: string | null | undefined },
  policy: Pick<PolicyRules, "vip_emails" | "visible_room_cap"> = DEFAULT_RULES.policy
): boolean {
  return policy.visible_room_cap > 0 && !seesVipRooms(viewer, policy);
}

/**
 * One guest house's figures clamped to what is left of the pool, moment by
 * moment. `everywhere` holds every guest house's own figures, this one's
 * included, over the same window and already without the VIP rooms.
 */
export function capCounts(
  own: AvailabilityCounts,
  everywhere: AvailabilityCounts[],
  cap: number
): AvailabilityCounts {
  const held = (pick: (c: AvailabilityCounts) => number) =>
    everywhere.reduce((sum, c) => sum + Math.max(0, c.total - pick(c)), 0);
  return {
    ...own,
    freeByDay: own.freeByDay.map((free, i) =>
      cappedFree(free, held((c) => c.freeByDay[i] ?? c.total), cap)
    ),
    freeThroughout: cappedFree(own.freeThroughout, held((c) => c.freeThroughout), cap),
    freeByHour: own.freeByHour
      ? own.freeByHour.map((free, hour) =>
          cappedFree(free, held((c) => c.freeByHour?.[hour] ?? c.total), cap)
        )
      : null,
  };
}
