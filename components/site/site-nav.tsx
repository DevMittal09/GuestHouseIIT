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
 * - `tone="dark"` - the portal's charcoal bar (iitpkd.ac.in's own menu
 *   colour), uppercase items, a 3px vermilion bar under the current page.
 * - `tone="light"` - the public site's white header: sentence-case links,
 *   a short vermilion underline under the current page.
 * - `tone="service"` - the portal's service navigation under its ink
 *   masthead (30 Sep 2026, after GOV.UK's): a white bar, bold sentence-case
 *   items, a 4px vermilion bar under the current one.
 *
 * `scroll` lets the row scroll sideways inside itself on a phone instead of
 * wrapping into a block of links.
 */
export function NavBar({
  items,
  label,
  exact = ["/"],
  tone = "dark",
  scroll = false,
  className,
}: {
  items: NavItem[];
  label: string;
  exact?: string[];
  tone?: "dark" | "light" | "service";
  scroll?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    exact.includes(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const dark = tone === "dark";
  const service = tone === "service";

  return (
    <nav
      aria-label={label}
      className={cn(dark && "bg-ink", service && "border-b border-border-strong bg-white", className)}
    >
      <div
        className={cn(
          "flex items-stretch",
          dark && "mx-auto w-full max-w-[1200px] flex-wrap px-[clamp(4px,1.5vw,20px)]",
          service &&
            "mx-auto w-full max-w-[1200px] gap-x-1 overflow-x-auto px-[clamp(6px,3vw,16px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
                "relative flex shrink-0 items-center whitespace-nowrap transition-colors duration-200 focus-visible:-outline-offset-2",
                dark
                  ? "px-[clamp(9px,1.4vw,16px)] py-3.5 text-[13px] font-semibold tracking-[0.08em] text-white uppercase hover:bg-ink-soft hover:text-white"
                  : service
                    ? cn(
                        "px-[clamp(8px,1.1vw,14px)] pt-4 pb-[14px] text-[15px] font-semibold",
                        active ? "text-ink" : "text-body hover:text-vermilion-deep"
                      )
                    : cn(
                      "px-[clamp(9px,1vw,13px)] py-3 text-[15px] font-medium",
                      active ? "text-ink" : "text-body hover:text-ink"
                    )
              )}
            >
              {item.label}
              {active && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute",
                    dark
                      ? "inset-x-0 bottom-0 h-[3px] bg-vermilion"
                      : service
                        ? "inset-x-[clamp(8px,1.1vw,14px)] bottom-0 h-1 bg-vermilion"
                        : "inset-x-[clamp(9px,1vw,13px)] bottom-1.5 h-[2px] bg-vermilion"
                  )}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
