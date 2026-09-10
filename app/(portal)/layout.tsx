import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabSessionGuard } from "@/components/tab-session-guard";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { REQUESTER_ROLES, ROLE_LABELS } from "@/lib/types";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const isRequester = REQUESTER_ROLES.includes(user.role);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href={homeForRole(user.role)} className="flex items-center gap-2.5 font-semibold">
            <Image
              src="/iitpkd-logo.png"
              alt="IIT Palakkad"
              width={32}
              height={32}
              className="size-8 shrink-0"
              priority
            />
            <span className="leading-tight">
              <span className="block text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                IIT Palakkad
              </span>
              <span className="block">Guest House</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {isRequester && (
              <>
                <NavLink href="/dashboard">My Bookings</NavLink>
                <NavLink href="/book">New Booking</NavLink>
              </>
            )}
            {user.role === "warden" && <NavLink href="/warden">Warden Queue</NavLink>}
            {user.role === "faculty_advisor" && <NavLink href="/fa">FA Queue</NavLink>}
            {user.role === "iar_cell" && <NavLink href="/iar">IAR Queue</NavLink>}
            {user.role === "gh_manager" && <NavLink href="/manager">Manager Console</NavLink>}
            {user.role === "developer" && <NavLink href="/admin">Developer Console</NavLink>}
            <NavLink href="/availability">Room Availability</NavLink>
            <NavLink href="/history">
              {isRequester ? "Booking History" : "Approval Log"}
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">{user.full_name}</p>
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <TabSessionGuard userId={user.id} userName={user.full_name} />
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </Link>
  );
}
