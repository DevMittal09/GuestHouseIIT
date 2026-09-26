import { SiteFooter } from "@/components/site/site-chrome";
import { SiteHeader } from "@/components/site/site-header";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { guestHouseMapPins } from "@/lib/site";
import { getSiteGuestHouses } from "@/lib/site-data";

/**
 * The public guest house website: `/`, the two gated booking entry points,
 * guidelines, gallery, contact, and the sign-in pages. Open to everyone; the
 * portal lives in `app/(portal)/`, behind `getCurrentUser()`. On `/` the
 * header lies over the hero photograph (`SiteHeader` decides from the path).
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, houses] = await Promise.all([getCurrentUser(), getSiteGuestHouses()]);

  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <SiteHeader portal={user ? { href: homeForRole(user.role), name: user.full_name } : null} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter pins={guestHouseMapPins(houses.map((h) => h.name))} />
    </div>
  );
}
