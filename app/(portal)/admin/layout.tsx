import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLock } from "@/components/admin/admin-lock";
import { isAdminUnlocked, isDefaultAdminPassword } from "@/lib/admin-lock";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";

const TABS = [
  { href: "/admin/users", label: "Users & Roles" },
  { href: "/admin/guest-houses", label: "Guest Houses & Rooms" },
  { href: "/admin/forms", label: "Form Builder" },
  { href: "/admin/bookings", label: "All Bookings" },
  { href: "/admin/access", label: "Console Access" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "developer") redirect(homeForRole(user.role));

  // The real gate is in `requireDeveloper()` — this only decides what to draw.
  if (!(await isAdminUnlocked())) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Developer Console</h1>
          <p className="text-muted-foreground">
            Full control over users, guest houses, rooms, booking forms and every booking.
          </p>
        </div>
        <AdminLock usingDefault={await isDefaultAdminPassword()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Developer Console</h1>
        <p className="text-muted-foreground">
          Full control over users, guest houses, rooms, booking forms and every booking.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 w-fit">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
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
