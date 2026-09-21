import { SiteFooter, SiteHeader, UtilityStrip } from "@/components/site/site-chrome";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";
import { getSiteGuestHouses } from "@/lib/site-data";

/**
 * The public guest house website: `/`, the two gated booking entry points,
 * guidelines, gallery, contact, and the sign-in pages. Open to everyone; the
 * portal lives in `app/(portal)/`, behind `getCurrentUser()`.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, houses] = await Promise.all([getCurrentUser(), getSiteGuestHouses()]);
  const subtitle = houses.length > 0 ? houses.map((h) => h.name).join(" · ") : "IIT Palakkad";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-foreground focus:shadow-lift"
      >
        Skip to content
      </a>
      <UtilityStrip />
      <SiteHeader
        subtitle={subtitle}
        portal={user ? { href: homeForRole(user.role), name: user.full_name } : null}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
