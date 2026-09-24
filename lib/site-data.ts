import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getEffectiveFormConfig } from "./form-config-server";
import { DEFAULT_RULES, type Rules } from "./settings";
import { getRules } from "./settings-server";
import { getStore } from "./store";
import {
  REQUESTER_ROLES,
  ROLE_LABELS,
  type GuestHouse,
  type Role,
  type RoomType,
} from "./types";
import { defaultBookingTypeFor } from "./booking-types";
import { isAdvanceWindowExempt, isOfficeRole, routeFor } from "./workflow";
import { mustBookThroughFacultyInCharge } from "./club-booking";
import type { BookingStatus } from "./types";

/**
 * Read-side data for the public website. Everything the site says about the
 * guest houses — their names, room counts, which serve meals, who may book
 * which, and who approves — comes from the store and `lib/workflow.ts`, so the
 * brochure cannot drift from what the portal actually enforces.
 *
 * Both loaders swallow store errors and return empty data: the public pages
 * are the front door, and a misconfigured backend must not take down the page
 * that carries the office's phone number.
 *
 * **Caching (Phase 9).** The public pages themselves cannot be static — the
 * header greets whoever is signed in, so every render reads the session — but
 * what they *say* changes only when a guest house, a room or a Setting does.
 * So the data is cached across requests under the `site` tag and rebuilt at
 * most every half hour; `revalidateEverything()` drops the tag the moment any
 * of that is edited. React's `cache` on top of it keeps one render from asking
 * twice.
 */

/** The cache tag every public-site read shares. See `lib/revalidate.ts`. */
export const SITE_CACHE_TAG = "site";

/** Half an hour: the longest the brochure may lag an edit nobody saved through the console. */
const SITE_CACHE_SECONDS = 1800;

export type SiteGuestHouse = GuestHouse & {
  roomsByType: Record<RoomType, number>;
  activeRooms: number;
};

const loadSiteGuestHouses = unstable_cache(
  async (): Promise<SiteGuestHouse[]> => {
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
  },
  ["site-guest-houses"],
  { tags: [SITE_CACHE_TAG], revalidate: SITE_CACHE_SECONDS }
);

export const getSiteGuestHouses = cache(
  async (): Promise<SiteGuestHouse[]> => loadSiteGuestHouses()
);

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
  /** The office's Settings — the advance window and meal times the site quotes. */
  rules: Rules;
};

/** Who each approval stage is, in the words the public site uses. */
const STAGE_NAMES: Partial<Record<BookingStatus, string>> = {
  PENDING_WARDEN: ROLE_LABELS.warden,
  PENDING_FA: "Faculty Advisor or council secretary",
  PENDING_HOD: "HOD",
  PENDING_IAR: ROLE_LABELS.iar_cell,
};

/**
 * Who approves a role's usual booking, in order — read from `routeFor`, the
 * pipeline itself, so the site cannot describe a route the portal does not
 * take. An HOD stage is shown where the role would have one (an office's is
 * its own choice, so it is shown as optional).
 */
function approversFor(role: Role): string[] {
  const type = defaultBookingTypeFor(role) ?? "official";
  // A club's booking is raised by its faculty in-charge (24 Sep 2026), which
  // is why its route starts after the Faculty Advisor stage.
  const stages = routeFor(role, "room", {
    bookingType: type,
    hasHodApprover: true,
    officeApproval: "direct",
    raisedByFacultyInCharge: mustBookThroughFacultyInCharge(role),
  });
  const names = stages.map((s) =>
    // A club has an HOD stage only where the console names one for it.
    s === "PENDING_HOD" && role === "club" ? "HOD (where the club has one)" : (STAGE_NAMES[s] ?? s)
  );
  if (isOfficeRole(role)) names.push("HOD (if the office asks for it)");
  return [...names, ROLE_LABELS.gh_manager];
}

const loadSitePolicies = unstable_cache(
  async (): Promise<SitePolicies> => {
  try {
    const houses = await getSiteGuestHouses();
    const nameOf = new Map(houses.map((h) => [h.id, h.name]));
    const configs = await Promise.all(
      REQUESTER_ROLES.map(async (role) => [role, await getEffectiveFormConfig(role)] as const)
    );

    const routes = configs.map(([role, config]) => ({
      role,
      label: mustBookThroughFacultyInCharge(role)
        ? `${ROLE_LABELS[role]} — booked by its faculty in-charge`
        : ROLE_LABELS[role],
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

    return { routes, studentDependency, rules: await getRules() };
  } catch (err) {
    console.error("[site] could not load booking policies", err);
    return { routes: [], studentDependency: null, rules: DEFAULT_RULES };
  }
  },
  ["site-policies"],
  { tags: [SITE_CACHE_TAG], revalidate: SITE_CACHE_SECONDS }
);

export const getSitePolicies = cache(async (): Promise<SitePolicies> => loadSitePolicies());
