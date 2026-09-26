import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getStore } from "./store";
import type { GuestHouse, RoomType } from "./types";

/**
 * Read-side data for the public website: the guest houses — their names, room
 * counts and which serve meals — from the store, so the site cannot name a
 * guest house the portal does not have. (Until 26 Sep 2026 this also computed
 * each requester category's approval route for the site; the owner asked for
 * the portal's internals to stay off the public pages, so it went.)
 *
 * The loader swallows store errors and returns empty data: the public pages
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
