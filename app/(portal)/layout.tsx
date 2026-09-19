import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/auto-refresh";
import { BrandBlock } from "@/components/site/site-chrome";
import { NavBar, type NavItem } from "@/components/site/site-nav";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { REQUESTER_ROLES, ROLE_LABELS } from "@/lib/types";
import { isRequesterHistory } from "@/lib/workflow";

/**
 * The signed-in shell, in the guest house website's style: a white header with
 * the institute logo and who is signed in, then the navy nav bar — sticky, so
 * the console tabs stay in reach on long queues — with a gold bar under the
 * current section.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  // Who may raise a booking, and who reads an approval log, are two different
  // questions now that the IAR Office does both.
  const canBook = REQUESTER_ROLES.includes(user.role);
  const readsOwnHistory = isRequesterHistory(user.role);

  const nav: NavItem[] = [
    ...(canBook
      ? [
          { href: "/dashboard", label: "My Bookings" },
          { href: "/book", label: "New Booking" },
        ]
      : []),
    ...(user.role === "warden" ? [{ href: "/warden", label: "Warden Queue" }] : []),
    ...(user.role === "faculty_advisor" ? [{ href: "/fa", label: "FA Queue" }] : []),
    ...(user.role === "iar_cell" ? [{ href: "/iar", label: "IAR Queue" }] : []),
    ...(user.role === "gh_manager" ? [{ href: "/manager", label: "Manager Console" }] : []),
    ...(user.role === "gh_caretaker" ? [{ href: "/caretaker", label: "Reception" }] : []),
    ...(user.role === "developer" ? [{ href: "/admin", label: "Developer Console" }] : []),
    { href: "/availability", label: "Room Availability" },
    { href: "/history", label: readsOwnHistory ? "Booking History" : "Approval Log" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-5 gap-y-3 px-[clamp(14px,4vw,24px)] py-3">
          <BrandBlock subtitle="Booking portal" href={homeForRole(user.role)} compact />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-semibold text-foreground">{user.full_name}</p>
              <p className="text-xs leading-tight text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Switch user
              </Button>
            </form>
          </div>
        </div>
      </header>
      <NavBar items={nav} label="Portal" exact={[]} className="sticky top-0 z-40" />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-[clamp(14px,4vw,24px)] py-8">
        {children}
      </main>
      <footer className="bg-navy-dark text-[13.5px] text-footer-muted">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[clamp(14px,4vw,24px)] py-4">
          <span>&copy; Indian Institute of Technology Palakkad</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/" className="text-footer-text hover:text-white">
              Guest house website
            </Link>
            <Link href="/guidelines" className="text-footer-text hover:text-white">
              Guidelines
            </Link>
            <Link href="/contact" className="text-footer-text hover:text-white">
              Contact
            </Link>
          </span>
        </div>
      </footer>
      <AutoRefresh />
    </div>
  );
}
