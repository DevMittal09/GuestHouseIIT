/**
 * **Which rooms are in the general online inventory, and who may have the
 * rest** (9 Nov 2026, the meeting).
 *
 * The office's Hamsanandi is four blocks of four rooms - A, B, C and D,
 * rooms 1 and 2 on the ground floor and 3 and 4 above - but three of those
 * sixteen are let to faculty for three years and two more are kept for the
 * Director. Only **eleven** are open to an ordinary online booking.
 *
 * Those are **three** different restrictions, and the meeting was explicit
 * that two of them must not be conflated ("preserve the distinction between
 * direct-only rooms and VIP rooms available to authorized users"), so a room
 * carries a **class**:
 *
 * | Class | Who can be put in it | Why |
 * | --- | --- | --- |
 * | `general` | anybody | the ordinary inventory |
 * | `vip` | the addresses and roles the manager authorises in Portal Settings | a room the office opens to named guests |
 * | `director_only` | nobody through the portal; **only a booking the desk raises itself** | Hamsanandi C1 and C2, which "happen directly through the GHM" |
 * | `reserved` | nobody, through the portal | Hamsanandi A1-A3, let to faculty; the desk still sees them |
 *
 * **`vip` and `director_only` are deliberately not one class.** The meeting's
 * own warning is that the Director's rooms "should not accidentally become
 * available for ordinary online VIP bookings", and they would have if adding
 * an address to the authorised list had reached them. So the authorised list
 * governs `vip` rooms and nothing else; C1 and C2 are reachable only by the
 * desk, which is what booking "directly through the GHM" means. An office
 * that later wants a named guest to book one moves that room to `vip` - a
 * deliberate act on one room, not a side effect of an address being added.
 *
 * **`reserved` is not `is_active = false`.** A deactivated room is one that
 * does not exist as far as the portal is concerned - it leaves the count, the
 * grid and the inventory. A reserved room is a real room, occupied by a real
 * arrangement the office made off-portal, and the manager has to keep seeing
 * it; it is simply never offered to a booking. The same distinction as a
 * maintenance block, which is why reserved rooms are a class rather than a
 * standing `room_blocks` row: a block has dates and a reason and comes to an
 * end, and "let to faculty for three years" is a property of the room's place
 * in the inventory.
 *
 * Everything here is pure. Who is authorised is Settings
 * (`rules.portal`, the manager's own console section), so adding an address
 * is a console edit and not a deploy - which is what the meeting asked for.
 */

import { ROOM_CLASSES, type Profile, type Role, type Room, type RoomClass } from "./types";

export { ROOM_CLASSES };
export type { RoomClass };

export const ROOM_CLASS_LABELS: Record<RoomClass, string> = {
  general: "General",
  vip: "VIP",
  director_only: "VIP - GHM direct booking only",
  reserved: "Reserved",
};

export const ROOM_CLASS_BLURBS: Record<RoomClass, string> = {
  general: "Open to any approved booking.",
  vip: "Allotted only to the authorised addresses and roles below.",
  director_only: "Director rooms. Only bookings raised directly by the Guest House Manager.",
  reserved: "Never offered to an online booking. The desk still sees it.",
};

/**
 * The addresses the meeting named, and which the portal starts with. The
 * manager adds to this list from the console; it is the default of the
 * Setting, not a hardcoded check anywhere.
 */
export const DEFAULT_VIP_EMAILS = [
  "director@iitpkd.ac.in",
  "office_director@iitpkd.ac.in",
  "adadmin@iitpkd.ac.in",
];

/**
 * Roles that reach the VIP rooms whatever the address list says.
 *
 * The desk only. The manager allots the Director's rooms - that is what
 * "these bookings happen directly through the GHM" means - so a manager who
 * could not pick them could not do the job the arrangement exists for. The
 * developer is here for the same reason it is in `FULL_ACCESS_ROLES`.
 */
export const VIP_STAFF_ROLES: Role[] = ["gh_manager", "developer"];

const key = (s: string) => s.trim().toLowerCase();

/** Who may see and be allotted a VIP room. */
export function canUseVipRooms(
  user: Pick<Profile, "email" | "role"> | null | undefined,
  access: { vip_emails: string[]; vip_roles: Role[] }
): boolean {
  if (!user) return false;
  if (VIP_STAFF_ROLES.includes(user.role)) return true;
  if (access.vip_roles.includes(user.role)) return true;
  const email = key(user.email ?? "");
  return email !== "" && access.vip_emails.some((e) => key(e) === email);
}

/** The class a room row carries, defaulting a row written before the column existed. */
export function roomClassOf(room: Pick<Room, "room_class">): RoomClass {
  return room.room_class ?? "general";
}

/**
 * The rooms that may be allotted to a booking raised by this person.
 *
 * `reserved` rooms are out for everybody - including the manager, who ends a
 * reservation by changing the room's class rather than by booking over it, so
 * that the inventory and the booking never disagree about who the room is
 * for. VIP rooms are in only for the authorised.
 */
export function allocatableRooms(
  rooms: Room[],
  requester: Pick<Profile, "email" | "role"> | null | undefined,
  access: { vip_emails: string[]; vip_roles: Role[] }
): Room[] {
  const vip = canUseVipRooms(requester, access);
  return rooms.filter((r) => {
    const cls = roomClassOf(r);
    if (cls === "reserved") return false;
    if (cls === "director_only") return !!requester && VIP_STAFF_ROLES.includes(requester.role);
    if (cls === "vip") return vip;
    return true;
  });
}

/**
 * The general online inventory: what an ordinary requester's availability is
 * counted against. Neither reserved nor VIP.
 */
export function generalInventory(rooms: Room[]): Room[] {
  return rooms.filter((r) => roomClassOf(r) === "general");
}

/**
 * Why this room cannot be allotted to this booking, or null when it can.
 * Checked in `allocateRooms`, never only in the grid.
 */
export function roomAccessError(
  room: Pick<Room, "room_number" | "room_class">,
  requester: Pick<Profile, "email" | "role"> | null | undefined,
  access: { vip_emails: string[]; vip_roles: Role[] }
): string | null {
  const cls = roomClassOf(room);
  if (cls === "reserved") {
    return `${room.room_number} is reserved and is not part of the bookable inventory. Change its class in Guest Houses & Rooms to let it out.`;
  }
  if (cls === "director_only" && (!requester || !VIP_STAFF_ROLES.includes(requester.role))) {
    return `${room.room_number} is a Director-only VIP room. The Guest House Manager must raise the booking directly.`;
  }
  if (cls === "vip" && !canUseVipRooms(requester, access)) {
    return `${room.room_number} is a VIP room. Only the addresses and roles authorised in Portal Settings can be allotted one.`;
  }
  return null;
}

// ------------------------------------------------------- what a requester sees

/**
 * How many free rooms to tell a general requester about.
 *
 * The meeting asked for two things at once: the frontend "must not display
 * the total number of rooms or a fraction such as Available Rooms / Total
 * Rooms", and "general users should see a maximum of 14 rooms available at
 * any given time", decreasing as rooms are taken.
 *
 * So the figure a requester is shown is the real count of free general rooms,
 * capped: it falls as rooms go, it never rises above the cap, and it never
 * discloses the inventory, because a capped figure is not a fraction of
 * anything. `cap` is Settings (`rules.portal.general_visible_rooms`); 0 turns
 * the cap off. The desk is never capped - the manager keeps complete
 * visibility, which is the other half of the same requirement.
 */
export function visibleFreeRooms(free: number, cap: number): number {
  const real = Math.max(0, free);
  return cap > 0 ? Math.min(real, cap) : real;
}
