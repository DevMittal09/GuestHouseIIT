import "server-only";
import { academicRecordFor } from "./academic";
import { canBookOnBehalf } from "./access";
import { knownGuestsFromBookings, knownGuestsFromRecord, mergeKnownGuests, type KnownGuest } from "./known-guests";
import { getStore } from "./store";
import type { Profile } from "./types";

/**
 * Who New Booking can fill in for this requester (`lib/known-guests.ts`): the
 * family on their academic record, then the people on their own earlier
 * bookings. Never throws — like the details card, a slow or failing lookup
 * leaves the form as it was, with every box to type.
 *
 * Nobody for the desk: the manager's "own" bookings are other people's
 * guests, and a Father chosen for one guest must not fill in another's.
 */
export async function knownGuestsFor(requester: Profile): Promise<KnownGuest[]> {
  if (canBookOnBehalf(requester.role)) return [];
  try {
    const [lookup, bookings] = await Promise.all([
      academicRecordFor(requester),
      getStore().listBookingsForUser(requester.id),
    ]);
    return mergeKnownGuests(
      knownGuestsFromRecord(lookup.status === "found" ? lookup.record : null),
      knownGuestsFromBookings(bookings, requester.id)
    );
  } catch (e) {
    console.error("[known-guests] lookup failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
