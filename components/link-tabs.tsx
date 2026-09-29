import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = {
  href: string;
  label: string;
  /** A small figure beside the label, e.g. "13 rooms". */
  detail?: string;
  active: boolean;
};

/**
 * A row of page-level tabs that are links (30 Sep 2026): the desk's guest
 * house switcher on `/manager`, `/caretaker` and the kitchen view. A hairline
 * under the row and a 3px vermilion bar under the current one, as on the
 * public site's map — the same mark the portal's own nav uses — with
 * `aria-current="page"` so it is announced, not only drawn. Each is a real
 * link (`?gh=`), so the choice survives a reload and can be bookmarked.
 */
export function LinkTabs({ label, items, className }: { label: string; items: LinkTab[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("border-b border-border-strong", className)}>
      <ul className="-mb-px flex max-w-full gap-x-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "relative flex items-baseline gap-2 px-4 py-2.5 font-heading text-[1.0625rem] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
                item.active ? "text-ink" : "text-muted-foreground hover:text-ink"
              )}
            >
              {item.label}
              {item.detail && (
                <span className="font-sans text-xs font-normal text-muted-foreground tabular-nums">{item.detail}</span>
              )}
              {item.active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-vermilion" />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
