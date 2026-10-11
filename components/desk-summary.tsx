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
 * The desk at a glance: one ruled index at the top of the manager's console
 * and of reception, each figure a jump link to its list further down.
 *
 * Redrawn 11 Oct 2026. It was seven tiles 110px tall, each with its label
 * over a 32px figure, and on an ordinary morning every one of them read 0 -
 * the shape of a dashboard rather than of a desk. Now a cell is one baseline:
 * the label, a leader rule, the figure. A count of zero is set small and grey
 * and a count that is not is set in the serif at display size, so the eye
 * lands on the two lists that have work in them without reading the other
 * five.
 *
 * The order is the one the caller declares and does not re-sort on the count.
 * This is read all day by the same two people; a figure that moves because
 * somebody checked out is a figure they have to look for again.
 */
export function DeskSummary({ figures, label = "At a glance" }: { figures: DeskFigure[]; label?: string }) {
  return (
    <nav aria-label={label} className="border-y border-border-strong">
      {/* The last row's hairline is pulled onto the strip's own closing rule
          (`-mb-px`), so a short last row leaves no double line. */}
      <ul className="-mb-px grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
        {figures.map((f) => {
          const hot = f.alert && f.count > 0;
          const live = f.count > 0;
          return (
            <li key={f.anchor} className="border-b border-border">
              {/* A fixed row height with the three parts centred in it. The
                  figure changes size with the count, so aligning on the
                  baseline put the one cell with work in it a few pixels below
                  its neighbours. */}
              <a
                href={`#${f.anchor}`}
                className="group flex h-11 items-center gap-3 no-underline focus-visible:-outline-offset-2"
              >
                <span
                  className={cn(
                    "text-[13.5px] leading-none font-semibold transition-colors duration-150 group-hover:text-vermilion-deep",
                    live ? "text-ink" : "text-muted-foreground"
                  )}
                >
                  {f.label}
                </span>
                {/* A leader rule, as a contents page has, so the label and its
                    figure stay joined across a wide column. */}
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
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
