"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/**
 * The nav shared by the public site and the portal. `exact` items only light
 * up on their own path (`/`); the rest also cover their sub-pages
 * (`/admin/users` lights Developer Console).
 *
 * **The current page is filled, not underlined** (27 Oct 2026, the owner:
 * "improve active-tab styling so the selected tab is distinguishable without
 * relying on the conventional underline indicator"). Every selected thing in
 * this application now reads the same way - a filled rectangle at the 6px
 * corner, which is what `segment()` has always done for a toggle - so a tab,
 * a console section and a view switcher no longer each have their own idea of
 * "chosen".
 *
 * - `tone="ink"` - the public site's masthead: the institute's own charcoal
 *   bar, white links, the current one filled **vermilion-deep** (5.2:1 with
 *   white on it), which is the colour iitpkd.ac.in marks its own current menu
 *   item with.
 * - `tone="service"` - the portal's service navigation under its ink
 *   masthead (30 Sep 2026, after GOV.UK's): a white bar, the current item
 *   filled ink.
 * - `tone="light"` - a white bar with dark links, the current one in a
 *   vermilion-soft chip. Kept for a light header.
 *
 * `scroll` lets the row scroll sideways inside itself on a phone instead of
 * wrapping into a block of links.
 */
export function NavBar({
  items,
  label,
  exact = ["/"],
  tone = "service",
  scroll = false,
  className,
}: {
  items: NavItem[];
  label: string;
  exact?: string[];
  tone?: "ink" | "light" | "service";
  scroll?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    exact.includes(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const ink = tone === "ink";
  const service = tone === "service";

  return (
    <nav
      aria-label={label}
      className={cn(service && "border-b border-border-strong bg-white", className)}
    >
      <div
        className={cn(
          "flex items-center gap-x-1",
          service &&
            "mx-auto w-full max-w-[1200px] overflow-x-auto px-[clamp(6px,3vw,16px)] py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          scroll && "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex shrink-0 items-center rounded-md whitespace-nowrap transition-colors duration-200 focus-visible:-outline-offset-2",
                ink
                  ? cn(
                      "px-[clamp(10px,1.1vw,15px)] py-2 text-[14.5px] font-medium tracking-[0.01em]",
                      active
                        ? "bg-vermilion-deep font-semibold text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    )
                  : service
                    ? cn(
                        "px-[clamp(9px,1.1vw,14px)] py-2 text-[15px] font-semibold",
                        active ? "bg-ink text-white" : "text-body hover:bg-band hover:text-ink"
                      )
                    : cn(
                        "px-[clamp(9px,1vw,13px)] py-2 text-[15px] font-medium",
                        active
                          ? "bg-vermilion-soft font-semibold text-vermilion-hover"
                          : "text-body hover:bg-band hover:text-ink"
                      )
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
