import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The segmented control above the manager and reception consoles: one tab per
 * guest house, each a link (`?gh=<name>`), so the choice survives the 5 s
 * refresh and can be bookmarked.
 */
export function GuestHouseSwitcher({
  basePath,
  guestHouses,
  currentId,
}: {
  basePath: string;
  guestHouses: { id: string; name: string; total_rooms: number }[];
  currentId: string;
}) {
  return (
    <nav
      aria-label="Guest house"
      className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border"
    >
      {guestHouses.map((g) => {
        const active = g.id === currentId;
        return (
          <Link
            key={g.id}
            href={`${basePath}?gh=${encodeURIComponent(g.name.toLowerCase())}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2.5 rounded-xl px-4 py-2 text-[14px] font-semibold transition-colors duration-150",
              active ? "bg-ink text-white shadow-soft" : "text-muted-foreground hover:bg-band hover:text-foreground"
            )}
          >
            {g.name}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                active ? "bg-white/15 text-saffron" : "bg-band text-muted-foreground"
              )}
            >
              {g.total_rooms} rooms
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
