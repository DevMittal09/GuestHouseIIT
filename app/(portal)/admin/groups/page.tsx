import { redirect } from "next/navigation";
import { GroupsManager } from "@/components/admin/groups-manager";
import { assignableRoles, canUseConsoleSection } from "@/lib/access";
import { describeChain, matchingRule } from "@/lib/approval-routes";
import { getCurrentUser } from "@/lib/auth";
import { bookingTypesFor } from "@/lib/booking-types";
import { SIGN_IN_PATH } from "@/lib/routes";
import { getRules } from "@/lib/settings-server";
import { getStore } from "@/lib/store";
import {
  BOOKING_TYPE_LABELS,
  ROLE_LABELS,
  type Role,
} from "@/lib/types";
import { isLoginBlocked, studyYearLabel } from "@/lib/user-groups";

/**
 * Console -> User Groups (5 Nov 2026). The selected group is in the URL, so
 * only its own members reach the browser however large the institute's list is.
 */
export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!canUseConsoleSection(user.role, "groups")) redirect("/admin/users");

  const { group: wanted } = await searchParams;
  const store = getStore();
  const [groups, profiles, units, rules] = await Promise.all([
    store.listUserGroups().catch(() => null),
    store.listProfiles(),
    store.listUnits().catch(() => []),
    getRules(),
  ]);
  if (groups === null) {
    return (
      <div className="border-l-4 border-saffron bg-notice p-4 text-sm text-ink">
        <p className="font-medium">User Groups is not available yet</p>
        <p className="mt-1">
          Apply supabase/migrations/00000000000036_user_groups_and_login_access.sql first.
        </p>
      </div>
    );
  }

  const selected = groups.find((g) => g.id === wanted) ?? groups[0] ?? null;
  const directory = { units, profiles };

  // The route each booking type takes for this group, as the first active rule
  // matching it says - the same matcher a real submission uses.
  const routes = selected
    ? bookingTypesFor(selected.role).map((bookingType) => {
        const rule = matchingRule(
          { role: selected.role, service: "room", bookingType, groupId: selected.id },
          rules.approval
        );
        return {
          label: BOOKING_TYPE_LABELS[bookingType],
          route: describeChain(rule?.stages ?? [], directory),
          rule: rule?.name ?? "No route matches",
          limitedToGroup: Boolean(rule?.when.group_ids?.includes(selected.id)),
        };
      })
    : [];

  const roles = assignableRoles(user.role, Object.keys(ROLE_LABELS) as Role[]).filter(
    (role) => role !== "developer" && role !== "alumni" && role !== "faculty_advisor"
  );

  return (
    <GroupsManager
      // A fresh editor per group, or switching keeps the last group's lists.
      key={selected?.id ?? "none"}
      groups={groups.map((g) => ({
        ...g,
        year: studyYearLabel(g),
        members: profiles.filter((p) => p.group_id === g.id).length,
        blocked: profiles.filter((p) => p.group_id === g.id && isLoginBlocked(p)).length,
      }))}
      selectedId={selected?.id ?? null}
      members={profiles
        .filter((p) => selected && p.group_id === selected.id)
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((p) => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          roll_number: p.roll_number,
          blocked: isLoginBlocked(p),
          reason: p.login_disabled_reason ?? null,
        }))}
      routes={routes}
      roles={roles}
      // Staff and offices to pick from for a copy list: students are not who a
      // booking copies, and listing thousands would slow every keystroke.
      addressBook={profiles
        .filter((p) => p.role !== "student" && !isLoginBlocked(p))
        .map((p) => ({ email: p.email, full_name: p.full_name }))}
      blockedTotal={profiles.filter(isLoginBlocked).length}
    />
  );
}
