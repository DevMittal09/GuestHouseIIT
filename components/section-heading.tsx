import { cn } from "@/lib/utils";

/**
 * The heading over one of a console's lists (30 Sep 2026): the serif title,
 * a count in a square tag, an optional line on what the list is for, and an
 * optional control at the far end. `tone="alert"` paints the count red for
 * the lists somebody has to chase (awaiting check-out, cancellations).
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
  tone?: "default" | "alert";
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 id={id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[1.3125rem] leading-tight font-semibold text-ink">
          {title}
          {count !== undefined && (
            <span
              className={cn(
                "inline-flex min-w-6 items-center justify-center rounded-xs px-1.5 py-px font-sans text-[0.8125rem] leading-[1.35] font-semibold tabular-nums",
                count === 0 ? "bg-band text-muted-foreground" : tone === "alert" ? "tag-red" : "bg-ink text-white"
              )}
            >
              {count}
            </span>
          )}
        </h2>
        {description && <p className="mt-1 max-w-[85ch] text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** What a list says when it has nothing in it. */
export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("rounded-lg border border-dashed border-border-strong bg-band/40 px-6 py-8 text-center text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}
