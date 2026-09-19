import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLock } from "@/components/admin/admin-lock";
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
  const title = isDeveloper ? "Developer Console" : "Guest House Console";
  const blurb = isDeveloper
    ? "Full control over users, guest houses, rooms, booking forms and every booking."
    : "Accounts, guest houses and rooms, booking forms, and what the automatic emails say.";

  // The real gate is in `requireDeveloper()` — this only decides what to draw.
  if (!(await isAdminUnlocked())) {
    return (
      <div className="space-y-6">
        <PageHeader title={title}>{blurb}</PageHeader>
        <AdminLock usingDefault={await isDefaultAdminPassword()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title}>{blurb}</PageHeader>
      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 w-fit">
        {sections.map((section) => CONSOLE_SECTIONS[section]).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            title={t.blurb}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground hover:shadow-sm"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
