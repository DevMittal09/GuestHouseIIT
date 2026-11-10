import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = {
  href: string;
  label: string;
  /** A small figure beside the label, e.g. "13 rooms". */
  detail?: string;
  active: boolean;
  /**
   * Classes for this tab when it is the selected one, in place of the default
   * filled ink - the guest house's own colour on the desk's console (10 Nov
   * 2026, `lib/guest-house-accent.ts`). Still a **fill**, so the one language
   * of "whatever is selected is filled, never underlined" is kept; only the
   * hue says which house. Omitted everywhere else.
   */
  activeClass?: string;
};

/**
 * A row of page-level tabs that are links (30 Sep 2026): the desk's guest
 * house switcher on `/manager`, `/caretaker` and the kitchen view.
 *
 * **The current one is filled ink** (27 Oct 2026) rather than underlined by a
 * 3px vermilion bar over a hairline - the same mark the nav and the segmented
 * controls use, so everything selected in this service reads the same way.
 * `aria-current="page"` is on it, so it is announced and not only drawn. Each
 * is a real link (`?gh=`), so the choice survives a reload and can be
 * bookmarked.
 */
export function LinkTabs({ label, items, className }: { label: string; items: LinkTab[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className="flex max-w-full gap-x-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex items-baseline gap-2 rounded-md px-4 py-2 font-heading text-[1.0625rem] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
                item.active
                  ? (item.activeClass ?? "bg-ink text-white")
                  : "text-muted-foreground hover:bg-band hover:text-ink"
              )}
            >
              {item.label}
              {item.detail && (
                <span
                  className={cn(
                    "font-sans text-xs font-normal tabular-nums",
                    item.active ? "text-on-ink" : "text-muted-foreground"
                  )}
                >
                  {item.detail}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
