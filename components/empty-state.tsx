import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** What a list shows when there is nothing in it. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  children,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** Less padding, for a section inside a busy console. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-card/60 text-center",
        compact ? "px-6 py-8" : "px-6 py-14",
        className
      )}
    >
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-band text-muted-foreground">
        <Icon aria-hidden className="size-6" />
      </span>
      <p className="font-heading text-[18px] font-semibold text-foreground">{title}</p>
      {children && <p className="mt-1.5 max-w-[52ch] text-[14px] text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
