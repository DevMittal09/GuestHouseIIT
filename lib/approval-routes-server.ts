import { cache } from "react";
import {
  DEFAULT_APPROVAL_RULES,
  stageLabel,
  stagesDecidedBy,
  type ApprovalRules,
  type StageStatus,
} from "./approval-routes";
import { getRules } from "./settings-server";
import { getStore } from "./store";
import type { BookingStatus, Profile, Role } from "./types";
import type { Unit } from "./units";
import { approvalStageDetailsFor, nextStatusAfter, type ReviewContext } from "./workflow";

/**
 * Server-side readers for the office's approval routes.
 *
 * The routes are a Settings group (`rules.approval`), so `getRules()` already
 * reads them once per request and falls back to the defaults on any error.
 * These helpers exist so a page or a mail module does not have to remember
 * that, and so that the **review context** - the routes plus every account,
 * which is what a stage decided by a role or a named person needs - is built
 * the same way everywhere.
 */

export const getApprovalRules = cache(async (): Promise<ApprovalRules> => {
  try {
    return (await getRules()).approval;
  } catch (error) {
    console.error("[approval-routes] could not read the routes; using the defaults", error);
    return DEFAULT_APPROVAL_RULES;
  }
});

/**
 * What `canReview` / `canReviewBooking` want: the configured routes and every
 * account. Never throws - a store that cannot be read yields the default
 * routes and no profiles, which is the behaviour the portal had before the
 * routes were configurable.
 */
export const getReviewContext = cache(
  async (): Promise<ReviewContext & { units: Unit[] }> => {
    const store = getStore();
    const [rules, profiles, units] = await Promise.all([
      getApprovalRules(),
      store.listProfiles().catch(() => [] as Profile[]),
      store.listUnits().catch(() => [] as Unit[]),
    ]);
    return { rules, profiles, units };
  }
);

/**
 * Which waiting stages this person decides for somebody - what the portal's
 * navigation and each queue page's guard ask.
 *
 * An approver has a queue because a route points at them, not because they
 * hold a reviewer role: a professor named as the approver of one stage of one
 * route heads no unit and holds no reviewer role, and still needs somewhere
 * to go.
 */
export async function stageQueuesFor(user: Profile): Promise<StageStatus[]> {
  const { rules, profiles, units } = await getReviewContext();
  return stagesDecidedBy(user, rules ?? DEFAULT_APPROVAL_RULES, { units, profiles });
}

/**
 * What each request's Forward button sends it to, by name.
 *
 * The queue used to say "Forward to GH Manager" on every row. That was
 * already not quite true - a club's secretary forwarded to the HOD - and
 * once the office can insert a stage it is a button that lies about what it
 * does. So the next stage of each request's **own** route is worked out here,
 * on the server that has the routes, and handed to the queue as a label.
 */
export function forwardTargets(
  bookings: { id: string; status: BookingStatus; requester: Profile; user_role?: Role }[],
  review: ReviewContext & { units: Unit[] }
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const booking of bookings) {
    const stages = approvalStageDetailsFor(
      booking as Parameters<typeof approvalStageDetailsFor>[0],
      booking.requester,
      review.units,
      review
    );
    let next: BookingStatus;
    try {
      next = nextStatusAfter(booking.status, stages.map((s) => s.status));
    } catch {
      continue;
    }
    const stage = stages.find((s) => s.status === next);
    out[booking.id] = stage ? stageLabel(stage) : "the Guest House Manager";
  }
  return out;
}
