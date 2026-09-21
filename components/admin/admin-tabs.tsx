"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminTab = { href: string; label: string; /** Shown as the tab's tooltip. */ blurb?: string };

/** The developer console's section tabs, with the current one marked. */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Developer console"
      className="-mx-1 flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border"
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            title={t.blurb}
            className={cn(
              "rounded-xl px-4 py-2 text-[14px] font-semibold whitespace-nowrap transition-colors duration-150",
              active ? "bg-ink text-white shadow-soft" : "text-muted-foreground hover:bg-band hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
