import { defaultBookingTypeFor } from "@/lib/booking-types";
import { getStore } from "@/lib/store";
import type { BookingType, Profile, Role, ServiceType } from "@/lib/types";
import { approversOf, type Unit } from "@/lib/units";
import { approvalStagesFor, canReview } from "@/lib/workflow";
import { academicRecordKindFor, COPY_TO_RULE } from "./fields";
import { academicRecordFor } from "./index";

/**
 * The "Copy to" list for a request — **one rule, used twice**: the Requester
 * details card shows it on the booking form, and every staff mail about the
 * booking puts it in CC (`lib/mail/notify.ts`, via `addressStaffMail`).
 *
 * Built from `COPY_TO_RULE` (`./fields`):
 *
 * - `approver` — everyone `canReview()` lets act on *any* stage of this
 *   request's chain (`approvalStagesFor`). The chain, not the current stage:
 *   the warden who forwarded a request is still copied when it is allocated
 *   or cancelled.
 * - `head_of_department` — an office's head: from the Departments & Clubs
 *   console when set (the office unit's head, or the head of the unit above
 *   it), else the head named on the office's academic record.
 *
 * Never throws: a failed lookup yields what could be found, and the booking
 * and its mail go ahead regardless. The academic record is only read for the
 * head's address, and nothing from it is stored.
 */

export type CopyToEntry = { name: string | null; email: string | null };

/** What the request is, for routing — a booking, or the form before one exists. */
export type CopyToRoute = {
  user_role: Role;
  service_type?: ServiceType;
  booking_type?: BookingType | string;
};

/** Pure core: the approvers of the chain, from profiles and units already loaded. */
export function chainApprovers(
  route: CopyToRoute,
  requester: Profile,
  profiles: Profile[],
  units: Unit[]
): Profile[] {
  const stages = approvalStagesFor(route as Parameters<typeof approvalStagesFor>[0], requester, units);
  return profiles.filter((p) => stages.some((stage) => canReview(p, stage, requester, units)));
}

export async function copyToFor(
  requester: Profile,
  route: CopyToRoute
): Promise<{ entries: CopyToEntry[]; failed: boolean }> {
  const kind = academicRecordKindFor(requester.role);
  const rules = kind ? COPY_TO_RULE[kind] : [];
  if (rules.length === 0) return { entries: [], failed: false };

  const entries: CopyToEntry[] = [];
  let failed = false;
  let profiles: Profile[] = [];
  let units: Unit[] = [];
  try {
    const store = getStore();
    [profiles, units] = await Promise.all([
      store.listProfiles(),
      store.listUnits().catch(() => [] as Unit[]),
    ]);
  } catch (e) {
    console.error("[copy-to] could not read profiles:", e instanceof Error ? e.message : e);
    failed = true;
  }

  if (rules.includes("approver")) {
    for (const p of chainApprovers(route, requester, profiles, units)) {
      entries.push({ name: p.full_name, email: p.email });
    }
  }

  if (rules.includes("head_of_department")) {
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const fromConsole = approversOf(requester.unit_id, units)
      .map((id) => byId.get(id))
      .filter((p): p is Profile => Boolean(p) && p!.id !== requester.id);
    if (fromConsole.length > 0) {
      for (const p of fromConsole) entries.push({ name: p.full_name, email: p.email });
    } else {
      const lookup = await academicRecordFor(requester);
      if (lookup.status === "found" && lookup.record.kind === "office") {
        const { head_name, head_email } = lookup.record;
        if (head_name || head_email) entries.push({ name: head_name, email: head_email });
      } else if (lookup.status === "unavailable") {
        failed = true;
      }
    }
  }

  // One line per address, the first name given for it.
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = (e.email ?? e.name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { entries: unique, failed };
}

/** The form's route before a booking exists: the role's default booking type. */
export function formRouteFor(requester: Profile): CopyToRoute {
  return {
    user_role: requester.role,
    service_type: "room",
    booking_type: defaultBookingTypeFor(requester.role) ?? undefined,
  };
}
