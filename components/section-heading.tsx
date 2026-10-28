import { cn } from "@/lib/utils";

/**
 * The heading over one of a console's lists.
 *
 * Redrawn 11 Oct 2026. The count used to be a filled square tag beside the
 * title - a badge, and one of a great many on a desk screen. It is a figure,
 * so it is set as one: the serif with tabular numerals, the way the institute
 * sets its own counters, vermilion on a list somebody has to chase and quiet
 * at zero.
 *
 * **The leader rule beside it went on 27 Oct 2026**, with every other
 * horizontal line attached to a heading. It ran from the title to the far
 * edge of the page, and the manager's console drew eight of them down one
 * screen - the repetition the owner asked to be rid of. Space separates the
 * lists now, and the count is written **"Current bookings: 3"**, as asked on
 * the same day: a figure floating after a heading reads as part of it.
 */
export function SectionHeading({
  title,
  count,
  tone = "default",
  description,
  action,
  id,
  className,
}: {
  title: React.ReactNode;
  count?: number;
  /** A list somebody has to chase: its figure turns vermilion when it is not zero. */
  tone?: "default" | "alert";
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const hot = tone === "alert" && (count ?? 0) > 0;
  return (
    <div className={cn("mb-3.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <h2 id={id} className="flex min-w-0 items-baseline text-section font-semibold text-ink">
          <span className="min-w-0">{title}</span>
          {count !== undefined && (
            <>
              {/* Written "Current bookings: 3", not "Current bookings 3"
                  (27 Oct 2026, the owner). The colon is part of the heading,
                  so it carries no gap of its own - the figure does. */}
              <span aria-hidden>:</span>
              <span
                className={cn(
                  "figure-serif ml-2 text-[1.375rem]",
                  count === 0 ? "text-muted-foreground/70" : hot ? "text-vermilion-deep" : "text-ink"
                )}
              >
                {count}
              </span>
            </>
          )}
        </h2>
        {action}
      </div>
      {description && (
        <p className="mt-1.5 max-w-[85ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * What a list says when it has nothing in it.
 *
 * One quiet line against a vermilion hairline (11 Oct 2026). It was a dashed
 * box 90px tall, and the manager's console stacked four of them between the
 * top of the page and the one row that needed attention.
 */
export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "border-l-2 border-border-strong bg-band/50 px-4 py-2.5 text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}
