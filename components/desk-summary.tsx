"use client";

import { cn } from "@/lib/utils";

export type DeskFigure = {
  label: string;
  count: number;
  /** The id of the list on this page the figure summarises. */
  anchor: string;
  /** A list somebody has to chase: its figure turns vermilion when it is not zero. */
  alert?: boolean;
};

/**
 * The desk at a glance: one ruled strip of buttons at the top of the manager's
 * console and of reception, each button showing or hiding its section below.
 *
 * When `active` and `onSelect` are provided the strip works as a tab bar:
 * clicking a button calls `onSelect(anchor)` and the caller renders only the
 * matching section. Without them it falls back to anchor-link navigation for
 * backwards compatibility.
 */
export function DeskSummary({
  figures,
  label = "At a glance",
  active,
  onSelect,
}: {
  figures: DeskFigure[];
  label?: string;
  active?: string;
  onSelect?: (anchor: string) => void;
}) {
  const isTabbed = !!onSelect;
  return (
    <nav aria-label={label} className="border-y border-border-strong">
      <ul className="-mb-px grid grid-cols-2 gap-x-1 gap-y-1 p-1 sm:grid-cols-3 xl:grid-cols-4">
        {figures.map((f) => {
          const hot = f.alert && f.count > 0;
          const live = f.count > 0;
          const selected = isTabbed && active === f.anchor;

          if (isTabbed) {
            return (
              <li key={f.anchor}>
                <button
                  type="button"
                  onClick={() => onSelect(f.anchor)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5",
                    "text-left text-[13.5px] font-semibold leading-tight transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion-deep",
                    selected
                      ? "bg-ink text-white"
                      : live
                        ? "bg-band hover:bg-ink/10 text-ink"
                        : "bg-band/60 text-muted-foreground"
                  )}
                  aria-current={selected ? "true" : undefined}
                >
                  <span className="min-w-0 truncate">{f.label}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      selected
                        ? cn("figure-serif text-lg", hot ? "text-vermilion" : "text-white")
                        : live
                          ? cn("figure-serif text-lg", hot ? "text-vermilion-deep" : "text-ink")
                          : "text-[13.5px] text-muted-foreground/70"
                    )}
                  >
                    {f.count}
                  </span>
                </button>
              </li>
            );
          }

          // Fallback: anchor-link mode (no onSelect).
          const Row = live ? "a" : "div";
          return (
            <li key={f.anchor} className="border-b border-border">
              <Row
                href={live ? `#${f.anchor}` : undefined}
                className="group flex h-11 items-center gap-3 no-underline focus-visible:-outline-offset-2"
              >
                <span
                  className={cn(
                    "text-[13.5px] leading-none font-semibold transition-colors duration-150",
                    live ? "text-ink group-hover:text-vermilion-deep" : "text-muted-foreground"
                  )}
                >
                  {f.label}
                </span>
                <span aria-hidden className="h-px min-w-4 flex-1 bg-border" />
                <span
                  className={cn(
                    "shrink-0 leading-none tabular-nums",
                    live
                      ? cn("figure-serif text-[1.5rem]", hot ? "text-vermilion-deep" : "text-ink")
                      : "text-[13.5px] text-muted-foreground/70"
                  )}
                >
                  {f.count}
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
