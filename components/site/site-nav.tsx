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
 * - `tone="dark"` — the portal's charcoal bar (iitpkd.ac.in's own menu
 *   colour), uppercase items, a 3px vermilion bar under the current page.
 * - `tone="light"` — the public site's header: the links sit in the white
 *   header itself, in sentence case, with the vermilion bar flush with the
 *   header's bottom edge. `scroll` lets the row scroll sideways inside itself
 *   on a phone instead of wrapping into a block of links.
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
  tone?: "dark" | "light";
  scroll?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    exact.includes(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const dark = tone === "dark";

  return (
    <nav aria-label={label} className={cn(dark && "bg-ink", className)}>
      <div
        className={cn(
          "flex items-stretch",
          dark
            ? "mx-auto w-full max-w-[1200px] flex-wrap px-[clamp(4px,1.5vw,20px)]"
            : "h-full",
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
                "relative flex shrink-0 items-center whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
                dark
                  ? "px-[clamp(9px,1.4vw,16px)] py-3.5 text-[13px] font-semibold tracking-[0.08em] text-white uppercase hover:bg-ink-soft hover:text-white"
                  : cn(
                      "px-[clamp(8px,1.1vw,14px)] py-3 text-[15px] font-semibold",
                      active ? "text-ink" : "text-body hover:text-vermilion-deep"
                    )
              )}
            >
              {item.label}
              {active && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-0 h-[3px] bg-vermilion",
                    dark ? "inset-x-0" : "inset-x-[clamp(8px,1.1vw,14px)]"
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
