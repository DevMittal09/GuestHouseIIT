"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/**
 * The navy nav bar shared by the public site and the portal: uppercase items,
 * a lighter navy on hover, and a 3px gold bar flush with the bottom edge under
 * the current page. `exact` items only light up on their own path (`/`);
 * the rest also cover their sub-pages (`/admin/users` lights Developer Console).
 */
export function NavBar({
  items,
  label,
  exact = ["/"],
  className,
}: {
  items: NavItem[];
  label: string;
  exact?: string[];
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    exact.includes(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label={label} className={cn("bg-navy", className)}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-stretch px-[clamp(2px,1vw,12px)]">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative px-[clamp(9px,1.6vw,16px)] py-3.5 text-[13.5px] font-semibold tracking-[0.08em] text-white uppercase transition-colors duration-150 hover:bg-navy-hover hover:text-white focus-visible:-outline-offset-2"
            >
              {item.label}
              {active && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-gold" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
