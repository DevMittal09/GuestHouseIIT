import { redirect } from "next/navigation";
import { AdminLock } from "@/components/admin/admin-lock";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { isAdminUnlocked, isDefaultAdminPassword } from "@/lib/admin-lock";
import {
  canUseConsole,
  consoleSectionsFor,
  CONSOLE_SECTIONS,
} from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { PageHeader } from "@/components/page-header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // Not developer-only any more: the Guest House Manager runs the guest
  // house, so rooms, accounts, forms and the mail wording are theirs to
  // change. Which tabs they get is `consoleSectionsFor`; the real gate is
  // `requireConsole()` on each action.
  if (!canUseConsole(user.role)) redirect(homeForRole(user.role));
  const sections = consoleSectionsFor(user.role);
  const isDeveloper = user.role === "developer";
  const title = isDeveloper ? "Developer console" : "Guest house console";
  const eyebrow = isDeveloper ? "Superadmin" : "Settings";
  const blurb = isDeveloper
    ? "Full control over users, guest houses, rooms, booking forms and every booking."
    : "Accounts, guest houses and rooms, booking forms, and what the automatic emails say.";

  // The real gate is in `requireDeveloper()` — this only decides what to draw.
  if (!(await isAdminUnlocked())) {
    return (
      <div className="space-y-7">
        <PageHeader eyebrow={eyebrow} title={title}>
          {blurb}
        </PageHeader>
        <AdminLock usingDefault={await isDefaultAdminPassword()} />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow={eyebrow} title={title}>
        {blurb}
      </PageHeader>
      <AdminTabs
        tabs={sections.map((section) => {
          const { href, label, blurb: hint } = CONSOLE_SECTIONS[section];
          return { href, label, blurb: hint };
        })}
      />
      {children}
    </div>
  );
}
