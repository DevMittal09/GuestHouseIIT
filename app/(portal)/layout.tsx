import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { PortalMobileNav, PortalSidebar, type PortalNavItem } from "@/components/portal/portal-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { formatDateValue, instituteHour, toInstituteDateValue } from "@/lib/tz";
import { REQUESTER_ROLES, ROLE_LABELS } from "@/lib/types";
import { isRequesterHistory } from "@/lib/workflow";
import { getStore } from "@/lib/store";
import { headsAnyUnit } from "@/lib/units";

/** "Good morning" by the guest house's clock, not the server's. */
function greeting(now: Date): string {
  const hour = instituteHour(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The signed-in shell: a fixed ink sidebar (a drawer on narrow screens) with
 * the sections this role may use, and a frosted top bar with a greeting and,
 * for anyone who can book, the New booking call to action. Nav items and their
 * role gating are decided here, on the server; `components/portal/portal-nav`
 * only draws them.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  // Who may raise a booking, and who reads an approval log, are two different
  // questions now that the IAR Office does both.
  const canBook = REQUESTER_ROLES.includes(user.role);
  const readsOwnHistory = isRequesterHistory(user.role);
  // Approvers by appointment - an HOD, a council secretary - hold no reviewer
  // role, so the nav asks the units rather than the role. A missing units
  // table (before migration 15) just means nobody is one yet.
  const units = await getStore()
    .listUnits()
    .catch(() => []);
  const approves = headsAnyUnit(user.id, units) || user.role === "faculty_advisor";

  const nav: PortalNavItem[] = [
    ...(canBook
      ? [
          { href: "/dashboard", label: "My Bookings" },
          { href: "/book", label: "New Booking" },
        ]
      : []),
    ...(user.role === "warden" ? [{ href: "/warden", label: "Assistant Warden Queue" }] : []),
    ...(approves ? [{ href: "/approvals", label: "Approvals" }] : []),
    ...(user.role === "iar_cell" ? [{ href: "/iar", label: "IAR Queue" }] : []),
    ...(user.role === "gh_manager"
      ? [
          { href: "/manager", label: "Manager Console" },
          { href: "/admin/users", label: "Settings", match: "/admin" },
        ]
      : []),
    ...(user.role === "gh_caretaker" ? [{ href: "/caretaker", label: "Reception" }] : []),
    ...(user.role === "developer" ? [{ href: "/admin", label: "Developer Console" }] : []),
    { href: "/availability", label: "Room Availability" },
    { href: "/history", label: readsOwnHistory ? "Booking History" : "Approval Log" },
  ];

  const shell = {
    items: nav,
    user: { name: user.full_name, email: user.email, roleLabel: ROLE_LABELS[user.role] },
    homeHref: homeForRole(user.role),
  };
  const now = new Date();

  return (
    <div className="min-h-screen bg-paper">
      <PortalSidebar {...shell} />
      <div className="flex min-h-screen flex-col lg:pl-[272px]">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-paper/80 backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-[clamp(16px,3.5vw,40px)]">
            <PortalMobileNav {...shell} />
            <Link href={shell.homeHref} className="flex items-center gap-2.5 lg:hidden">
              <Image src="/iitpkd-logo.png" alt="" width={32} height={32} className="size-8" />
              <span className="font-heading text-[18px] font-semibold text-foreground">Guest House</span>
            </Link>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-[15px] font-semibold text-foreground">
                {/* The whole name: "Dr. Priya Sharma" and role accounts such as
                    "Guest House Manager" have no usable first word. */}
                {greeting(now)}, {user.full_name}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                {formatDateValue(toInstituteDateValue(now), { year: true })} · {ROLE_LABELS[user.role]}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {canBook && (
                <Button asChild variant="brand" size="sm" className="rounded-full px-4">
                  <Link href="/book">
                    <CalendarPlus data-icon="inline-start" />
                    <span className="hidden sm:inline">New booking</span>
                    <span className="sm:hidden">Book</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-[clamp(16px,3.5vw,40px)] py-[clamp(20px,3vw,36px)]">
          {children}
        </main>
        <footer className="border-t border-border/80">
          <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(16px,3.5vw,40px)] py-5 text-[13px] text-muted-foreground">
            <span>&copy; Indian Institute of Technology Palakkad</span>
            <span className="flex flex-wrap gap-x-5 gap-y-1">
              <Link href="/" className="transition-colors hover:text-foreground">
                Guest house website
              </Link>
              <Link href="/guidelines" className="transition-colors hover:text-foreground">
                Guidelines
              </Link>
              <Link href="/contact" className="transition-colors hover:text-foreground">
                Contact
              </Link>
            </span>
          </div>
        </footer>
      </div>
      <AutoRefresh />
    </div>
  );
}
