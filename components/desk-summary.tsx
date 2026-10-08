import { cn } from "@/lib/utils";

export type DeskFigure = {
  label: string;
  count: number;
  /** The id of the list on this page the figure summarises. */
  anchor: string;
  /** A list somebody has to chase: its figure turns red when it is not zero. */
  alert?: boolean;
};

/**
 * The desk at a glance (30 Sep 2026): one ruled strip of figures at the top
 * of the manager's console and of reception - rooms due back, requests
 * waiting, guests in house, bills to settle - each a jump link to its list
 * below, in the high-density style of a GOV.UK dashboard. It only counts
 * what the page already lists; it decides nothing.
 */
export function DeskSummary({ figures, label = "At a glance" }: { figures: DeskFigure[]; label?: string }) {
  return (
    <nav aria-label={label} className="overflow-hidden rounded-lg border border-border-strong bg-card">
      {/* Each cell draws its own right and bottom hairline; the list runs a
          pixel past the frame so the outermost ones are clipped, and a short
          last row leaves white rather than a grey gap. */}
      <ul
        style={{ "--figures": figures.length } as React.CSSProperties}
        className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(var(--figures),minmax(0,1fr))]"
      >
        {figures.map((f) => {
          const hot = f.alert && f.count > 0;
          return (
            <li key={f.anchor} className="border-r border-b border-border-strong">
              <a
                href={`#${f.anchor}`}
                className={cn(
                  "group flex h-full flex-col justify-between gap-2 border-t-4 px-4 pt-3 pb-3.5 no-underline transition-colors duration-150 hover:bg-band focus-visible:-outline-offset-2",
                  hot ? "border-t-destructive" : f.count > 0 ? "border-t-ink" : "border-t-transparent"
                )}
              >
                <span className="text-[12.5px] leading-snug font-semibold text-muted-foreground group-hover:text-ink">
                  {f.label}
                </span>
                <span
                  className={cn(
                    "font-heading text-[2rem] leading-none font-semibold tabular-nums",
                    hot ? "text-destructive" : f.count > 0 ? "text-ink" : "text-muted-foreground/70"
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
