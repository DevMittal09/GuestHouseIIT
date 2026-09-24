import { cache } from "react";
import { clubsBookableBy, facultyInChargeOf, mightBeFacultyInCharge } from "./club-booking";
import { getStore } from "./store";
import type { Profile } from "./types";
import type { Unit } from "./units";

/**
 * The clubs a signed-in person may book for — read once per request, for the
 * nav, `/book`, the dashboard and `createBooking` alike. Never throws: with
 * the profiles or units unreadable, nobody is anybody's faculty in-charge,
 * which fails closed.
 */
export const clubsBookableByUser = cache(async (user: Profile): Promise<Profile[]> => {
  try {
    const store = getStore();
    // Every portal page asks (the nav), so the profiles are read only for
    // someone the units say could be a faculty in-charge.
    const units = await store.listUnits().catch(() => [] as Unit[]);
    if (!mightBeFacultyInCharge(user, units)) return [];
    return clubsBookableBy(user, await store.listProfiles(), units);
  } catch (error) {
    console.error("[club-booking] could not read profiles or units", error);
    return [];
  }
});

/** A club's faculty in-charge, for telling the club's account who to ask. */
export const facultyInChargeForClub = cache(async (club: Profile): Promise<Profile[]> => {
  try {
    const store = getStore();
    const [profiles, units] = await Promise.all([
      store.listProfiles(),
      store.listUnits().catch(() => [] as Unit[]),
    ]);
    return facultyInChargeOf(club, profiles, units);
  } catch (error) {
    console.error("[club-booking] could not read profiles or units", error);
    return [];
  }
});
