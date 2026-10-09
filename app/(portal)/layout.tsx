import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LiveUpdates } from "@/components/live-updates";
import { BrandBlock } from "@/components/site/brand";
import { NavBar, type NavItem } from "@/components/site/site-nav";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, SIGN_IN_PATH } from "@/lib/routes";
import { GUEST_HOUSE_CONTACT, INSTITUTE_WEBSITE } from "@/lib/site";
import { REQUESTER_ROLES, ROLE_LABELS } from "@/lib/types";
import { isRequesterHistory } from "@/lib/workflow";
import { getStore } from "@/lib/store";
import { approvesClubsFor, isHodForAny } from "@/lib/units";
import { mustBookThroughFacultyInCharge } from "@/lib/club-booking";
import { clubsBookableByUser } from "@/lib/club-booking-server";

/**
 * The signed-in shell (30 Sep 2026), laid out the way GOV.UK services are: an
 * ink masthead with the lockup and who is signed in, closed by a thick
 * vermilion rule; a white service navigation bar under it - sticky, so the
 * console tabs stay in reach on long queues - with a vermilion bar under the
 * current section; then the page on a warm off-white canvas. No shadows
 * anywhere: tint, hairlines and the ink bar do the separating.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  // Who may raise a booking, and who reads an approval log, are two different
  // questions now that the IAR Office does both. A club's account has its
  // bookings but raises none (its faculty in-charge does, 24 Sep 2026), and
  // a faculty in-charge - a faculty advisor account, say - has the club's.
  const clubs = await clubsBookableByUser(user);
  const hasBookings = REQUESTER_ROLES.includes(user.role) || clubs.length > 0;
  const canBook =
    (REQUESTER_ROLES.includes(user.role) && !mustBookThroughFacultyInCharge(user.role)) ||
    clubs.length > 0;
  const readsOwnHistory = isRequesterHistory(user.role);
  // Approvers by appointment - an HOD, a council secretary - hold no reviewer
  // role, so the nav asks the units rather than the role. A missing units
  // table (before migration 15) just means nobody is one yet.
  const units = await getStore()
    .listUnits()
    .catch(() => []);
  const approves = approvesClubsFor(user.id, units) || user.role === "faculty_advisor";
  const hod = isHodForAny(user.id, units);

  const nav: NavItem[] = [
    ...(hasBookings ? [{ href: "/dashboard", label: "My Bookings" }] : []),
    ...(canBook ? [{ href: "/book", label: "New Booking" }] : []),
    ...(user.role === "warden" ? [{ href: "/warden", label: "Assistant Warden Queue" }] : []),
    ...(hod ? [{ href: "/hod", label: "HOD Queue" }] : []),
    ...(approves ? [{ href: "/approvals", label: "Club Approvals" }] : []),
    ...(user.role === "iar_cell" ? [{ href: "/iar", label: "IAR Queue" }] : []),
    ...(user.role === "gh_manager"
      ? [
          { href: "/manager", label: "Manager Console" },
          { href: "/admin/users", label: "Settings" },
        ]
      : []),
    ...(user.role === "gh_caretaker" ? [{ href: "/caretaker", label: "Reception" }] : []),
    ...(user.role === "developer" ? [{ href: "/admin", label: "Developer Console" }] : []),
    { href: "/availability", label: "Room Availability" },
    { href: "/history", label: readsOwnHistory ? "Booking History" : "Approval Log" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* The masthead, GOV.UK-fashion: the service's name on ink, closed by a
          thick vermilion rule, so a signed-in page can never be mistaken for
          the public website's white header. */}
      <header className="border-b-[5px] border-vermilion bg-ink text-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-[clamp(14px,4vw,24px)] py-3.5">
          <BrandBlock tagline="IIT Palakkad · Booking portal" href={homeForRole(user.role)} tone="light" compact />
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="hidden border-r border-white/20 pr-4 text-right sm:block">
              <p className="text-sm leading-tight font-semibold text-white">{user.full_name}</p>
              <p className="mt-0.5 text-xs leading-tight text-on-ink-muted">{user.email}</p>
            </div>
            <span className="rounded-xs border border-saffron/70 px-1.5 py-px text-xs leading-[1.35] font-semibold text-saffron">
              {ROLE_LABELS[user.role]}
            </span>
            <form action={logout}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-white/45 bg-transparent text-white hover:border-white hover:bg-white hover:text-ink"
              >
                Switch user
              </Button>
            </form>
          </div>
        </div>
      </header>
      <NavBar items={nav} label="Portal" exact={[]} tone="service" className="sticky top-0 z-40" />
      {/* A warm off-white working canvas: cards, tables, inputs and dialogs
          are white on it, so structure comes from tint and hairline, not
          shadow. */}
      <div className="flex-1 bg-canvas">
        <main className="mx-auto w-full max-w-[1200px] px-[clamp(14px,4vw,24px)] pt-10 pb-20">
          {children}
        </main>
      </div>
      {/* The guest house office's own phone and email live here, on every
          signed-in page (9 Oct 2026). They used to be a "Facing trouble
          booking?" notice on My Bookings and again at the foot of the booking
          form - a sentence in the middle of a form, where somebody who is not
          stuck has to read it. A footer is where a reader looks for a number. */}
      <footer className="border-t-[3px] border-vermilion bg-ink text-[13.5px] text-on-ink-muted">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-[clamp(14px,4vw,24px)] py-6">
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>&copy; Indian Institute of Technology Palakkad</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-on-ink-muted">Guest house office</span>
              <a href={GUEST_HOUSE_CONTACT.phoneHref} className="text-on-ink tabular-nums hover:text-white">
                {GUEST_HOUSE_CONTACT.phone}
              </a>
              <a href={`mailto:${GUEST_HOUSE_CONTACT.email}`} className="text-on-ink hover:text-white">
                {GUEST_HOUSE_CONTACT.email}
              </a>
            </span>
          </span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/" className="text-on-ink hover:text-white">
              Guest house website
            </Link>
            <Link href="/guidelines" className="text-on-ink hover:text-white">
              Guidelines
            </Link>
            <Link href="/contact" className="text-on-ink hover:text-white">
              Contact
            </Link>
            <a href={INSTITUTE_WEBSITE} target="_blank" rel="noopener noreferrer" className="text-on-ink hover:text-white">
              iitpkd.ac.in
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </span>
        </div>
      </footer>
      {/* Realtime where Supabase is configured, a 30-second poll otherwise. */}
      <LiveUpdates
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null}
      />
    </div>
  );
}
