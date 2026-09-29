"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { segment, segmentGroup } from "@/components/segmented";

/**
 * The console's section list (`/admin/*`): every section the role may open,
 * as a wrapping segmented row with the current one filled ink and marked
 * `aria-current`. Client-side only for the pathname; which sections appear
 * is decided on the server (`consoleSectionsFor`), and each section's actions
 * re-check it (`requireConsole`).
 */
export function ConsoleNav({ sections }: { sections: { href: string; label: string; blurb: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Console sections">
      <ul className={segmentGroup}>
        {sections.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                title={section.blurb}
                aria-current={active ? "page" : undefined}
                className={segment(active)}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
