import { cache } from "react";
import { facultyBookableBy, isNonTeachingStaff } from "./staff-booking";
import { getStore } from "./store";
import type { Profile } from "./types";

/**
 * The faculty members a signed-in non-teaching staff may book for - read once
 * per request, for the nav, `/book` and `createBooking` alike. Never throws:
 * with the profiles unreadable, nobody can book for anyone, which fails closed.
 */
export const facultyBookableByUser = cache(async (user: Profile): Promise<Profile[]> => {
  try {
    if (!isNonTeachingStaff(user)) return [];
    return facultyBookableBy(user, await getStore().listProfiles());
  } catch (error) {
    console.error("[staff-booking] could not read profiles", error);
    return [];
  }
});
