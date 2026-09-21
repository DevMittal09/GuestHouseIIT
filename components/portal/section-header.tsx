import { cn } from "@/lib/utils";

/**
 * A console section's heading: the title, a count pill, and a line on what
 * the list is. `tone="alert"` for the lists that need action now.
 */
export function SectionHeader({
  title,
  count,
  tone = "default",
  children,
  id,
  className,
}: {
  title: string;
  count?: number;
  tone?: "default" | "alert" | "warn";
  children?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <h2 id={id} className="flex flex-wrap items-center gap-2.5 text-[21px] font-semibold text-foreground">
        {title}
        {count !== undefined && (
          <span
            className={cn(
              "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-sans text-[12px] font-bold tabular-nums",
              tone === "alert" && count > 0
                ? "bg-red-50 text-red-700 ring-1 ring-red-600/20 ring-inset"
                : tone === "warn" && count > 0
                  ? "bg-orange-50 text-orange-800 ring-1 ring-orange-600/25 ring-inset"
                  : "bg-card text-muted-foreground ring-1 ring-border ring-inset"
            )}
          >
            {count}
          </span>
        )}
      </h2>
      {children && <p className="mt-1 max-w-[80ch] text-[14px] text-muted-foreground">{children}</p>}
    </div>
  );
}
