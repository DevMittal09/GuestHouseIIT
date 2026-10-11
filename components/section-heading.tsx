import { cn } from "@/lib/utils";

/**
 * The heading over one of a console's lists.
 *
 * Redrawn 11 Oct 2026. The count used to be a filled square tag beside the
 * title - a badge, and one of a great many on a desk screen. It is a figure,
 * so it is set as one: the serif with tabular numerals, the way the institute
 * sets its own counters, vermilion on a list somebody has to chase and quiet
 * at zero. A hairline then runs from the title to the far edge, which is what
 * tells the eye this is a new section; a box around the list no longer has to.
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
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <h2 id={id} className="flex items-baseline gap-2.5 text-section font-semibold text-ink">
          {title}
          {count !== undefined && (
            <span
              className={cn(
                "figure-serif text-[1.375rem]",
                count === 0 ? "text-muted-foreground/70" : hot ? "text-vermilion-deep" : "text-ink"
              )}
            >
              {count}
            </span>
          )}
        </h2>
        {/* The rule, not a box, is what separates one list from the next. */}
        <span aria-hidden className="h-px min-w-8 flex-1 bg-border-strong" />
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
