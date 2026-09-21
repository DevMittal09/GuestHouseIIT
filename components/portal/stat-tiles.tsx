import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The row of figures at the top of a console — what is waiting, who is in,
 * who leaves today. Each tile can link to the section it counts.
 */
export function StatGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-4", className)}
      {...props}
    />
  );
}

const TONES = {
  vermilion: "bg-vermilion-soft text-vermilion-deep",
  saffron: "bg-saffron-soft text-[#8a5300]",
  sky: "bg-sky-50 text-sky-700",
  emerald: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
  ink: "bg-band text-foreground",
} as const;

export type StatTone = keyof typeof TONES;

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "ink",
  href,
  progress,
  highlight = false,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatTone;
  href?: string;
  /** 0–1: draws a bar under the figure, e.g. occupancy. */
  progress?: number;
  /** Ink tile, for the one figure that needs attention now. */
  highlight?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-[12.5px] font-semibold",
            highlight ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {label}
        </p>
        <span
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
            highlight ? "bg-white/10 text-saffron" : TONES[tone]
          )}
        >
          <Icon aria-hidden className="size-[18px]" />
        </span>
      </div>
      <p
        className={cn(
          "mt-3 font-heading text-[34px] leading-none font-semibold tabular-nums",
          highlight ? "text-white" : "text-foreground"
        )}
      >
        {value}
      </p>
      {progress !== undefined && (
        <div
          aria-hidden
          className={cn("mt-3 h-1.5 overflow-hidden rounded-full", highlight ? "bg-white/15" : "bg-band")}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-vermilion to-saffron"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      )}
      {hint && (
        <p className={cn("mt-2 text-[12.5px]", highlight ? "text-white/60" : "text-muted-foreground")}>
          {hint}
        </p>
      )}
    </>
  );

  const frame = cn(
    "relative block min-w-0 overflow-hidden rounded-2xl p-5 transition-all duration-200",
    highlight
      ? "bg-ink text-white shadow-lift"
      : "bg-card shadow-soft ring-1 ring-border",
    href && "hover:-translate-y-0.5 hover:shadow-lift"
  );

  return href ? (
    <Link href={href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
