import { getStore } from "@/lib/store";
import type { BookingStatus, BookingWithDetails, Profile, Role } from "@/lib/types";
import { canReview } from "@/lib/workflow";

/**
 * Who gets told.
 *
 * The rule that matters: **reviewers are found through `canReview()`**, the
 * same predicate that decides whether their button works. Re-deriving
 * "wardens of this hostel" here would be a second copy of the scoping rule,
 * and the two would drift — the Malhar warden would start getting mail about
 * Saveri students while still, correctly, being unable to act on them.
 *
 * `canReview` also refuses `reviewer.id === requester.id`, so the IAR Office
 * is never mailed asking it to approve its own booking.
 */

export interface Recipient {
  email: string;
  name: string;
}

function toRecipient(profile: Profile): Recipient {
  return { email: profile.email, name: profile.full_name };
}

/** A plausible address, so a seeded or half-filled profile cannot poison a batch. */
function mailable(profile: Profile): boolean {
  return typeof profile.email === "string" && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(profile.email);
}

export function requesterRecipient(booking: BookingWithDetails): Recipient | null {
  return mailable(booking.requester) ? toRecipient(booking.requester) : null;
}

/**
 * Everyone who can act on this booking at its current stage.
 *
 * Usually one person, but nothing stops two wardens sharing a hostel or a
 * second manager being added, and both should hear about it.
 */
export async function reviewersFor(booking: BookingWithDetails): Promise<Profile[]> {
  return reviewersForStatus(booking, booking.status);
}

/** As `reviewersFor`, for a stage the booking is about to enter. */
export async function reviewersForStatus(
  booking: BookingWithDetails,
  status: BookingStatus
): Promise<Profile[]> {
  return reviewersOfRequester(booking.requester, status);
}

/**
 * As `reviewersForStatus`, before any booking exists — the "Copy to" line at
 * the top of New Booking names who will approve the request being filled in.
 */
export async function reviewersOfRequester(
  requester: Profile,
  status: BookingStatus
): Promise<Profile[]> {
  const store = getStore();
  const [profiles, units] = await Promise.all([store.listProfiles(), store.listUnits()]);
  return profiles.filter(
    (profile) => mailable(profile) && canReview(profile, status, requester, units)
  );
}

/** Everyone holding a role, for the desk copies and the daily report. */
export async function profilesWithRole(...roles: Role[]): Promise<Profile[]> {
  const profiles = await getStore().listProfiles();
  return profiles.filter((profile) => mailable(profile) && roles.includes(profile.role));
}

/**
 * The guest house desk: the manager, and the caretaker on reception.
 *
 * The caretaker is included on allocations and cancellations because they are
 * the person who meets the guest, but never on approvals — approving is not
 * theirs to do, and mail implying otherwise invites them to try.
 */
export async function deskRecipients(): Promise<Profile[]> {
  return profilesWithRole("gh_manager", "gh_caretaker");
}

export async function managerRecipients(): Promise<Profile[]> {
  return profilesWithRole("gh_manager");
}

export function addressesOf(profiles: Profile[]): string[] {
  // De-duplicated: one person holding two seeded profiles, or a shared
  // mailbox, must not get the same message twice.
  return [...new Set(profiles.map((p) => p.email))];
}

export { toRecipient };
