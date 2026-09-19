import { cache } from "react";
import { getEffectiveFormConfig } from "./form-config-server";
import { getStore } from "./store";
import {
  REQUESTER_ROLES,
  ROLE_LABELS,
  type GuestHouse,
  type Role,
  type RoomType,
} from "./types";
import { initialStatusFor, isAdvanceWindowExempt, REVIEWER_STAGE } from "./workflow";

/**
 * Read-side data for the public website. Everything the site says about the
 * guest houses — their names, room counts, which serve meals, who may book
 * which, and who approves — comes from the store and `lib/workflow.ts`, so the
 * brochure cannot drift from what the portal actually enforces.
 *
 * Both loaders swallow store errors and return empty data: the public pages
 * are the front door, and a misconfigured backend must not take down the page
 * that carries the office's phone number.
 */

export type SiteGuestHouse = GuestHouse & {
  roomsByType: Record<RoomType, number>;
  activeRooms: number;
};

export const getSiteGuestHouses = cache(async (): Promise<SiteGuestHouse[]> => {
  try {
    const store = getStore();
    const houses = await store.listGuestHouses();
    return await Promise.all(
      houses.map(async (house) => {
        const rooms = (await store.listRooms(house.id)).filter((r) => r.is_active);
        const roomsByType: Record<RoomType, number> = { double_sharing: 0, single: 0 };
        for (const room of rooms) roomsByType[room.room_type] += 1;
        return { ...house, roomsByType, activeRooms: rooms.length };
      })
    );
  } catch (err) {
    console.error("[site] could not load guest houses", err);
    return [];
  }
});

export type BookingRoute = {
  role: Role;
  label: string;
  /** Approvers in order, ending with the Guest House Manager. */
  approvers: string[];
  /** Names of the guest houses this role's form offers. */
  guestHouses: string[];
  advanceWindowExempt: boolean;
};

export type SitePolicies = {
  routes: BookingRoute[];
  /** The student parent rule, when the saved student form still carries it. */
  studentDependency: { parents: string[]; dependents: string[] } | null;
};

/** Who reviews a booking that enters the pipeline at `role`'s entry status. */
function approversFor(role: Role): string[] {
  const entry = initialStatusFor(role);
  const intermediate = (Object.keys(REVIEWER_STAGE) as Role[]).find(
    (reviewer) => reviewer !== "gh_manager" && REVIEWER_STAGE[reviewer] === entry
  );
  return [
    ...(intermediate ? [ROLE_LABELS[intermediate]] : []),
    ROLE_LABELS.gh_manager,
  ];
}

export const getSitePolicies = cache(async (): Promise<SitePolicies> => {
  try {
    const houses = await getSiteGuestHouses();
    const nameOf = new Map(houses.map((h) => [h.id, h.name]));
    const configs = await Promise.all(
      REQUESTER_ROLES.map(async (role) => [role, await getEffectiveFormConfig(role)] as const)
    );

    const routes = configs.map(([role, config]) => ({
      role,
      label: ROLE_LABELS[role],
      approvers: approversFor(role),
      guestHouses: config.allowed_guest_house_ids
        .map((id) => nameOf.get(id))
        .filter((name): name is string => Boolean(name)),
      advanceWindowExempt: isAdvanceWindowExempt(role),
    }));

    const student = configs.find(([role]) => role === "student")?.[1];
    const studentDependency =
      student && student.parent_relationships.length > 0 && student.dependent_relationships.length > 0
        ? { parents: student.parent_relationships, dependents: student.dependent_relationships }
        : null;

    return { routes, studentDependency };
  } catch (err) {
    console.error("[site] could not load booking policies", err);
    return { routes: [], studentDependency: null };
  }
});
