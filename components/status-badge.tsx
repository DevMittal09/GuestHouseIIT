import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type BookingStatus } from "@/lib/types";

/**
 * A soft tint, an inset ring and a dot per status. The hues are semantic and
 * deliberately not the brand's: amber waits on a reviewer, sky waits on the
 * manager, emerald is confirmed, violet is in the building, red is closed.
 */
const STATUS_STYLES: Record<BookingStatus, { chip: string; dot: string }> = {
  PENDING_WARDEN: { chip: "bg-amber-50 text-amber-900 ring-amber-600/20", dot: "bg-amber-500" },
  PENDING_FA: { chip: "bg-amber-50 text-amber-900 ring-amber-600/20", dot: "bg-amber-500" },
  PENDING_HOD: { chip: "bg-amber-50 text-amber-900 ring-amber-600/20", dot: "bg-amber-500" },
  PENDING_IAR: { chip: "bg-amber-50 text-amber-900 ring-amber-600/20", dot: "bg-amber-500" },
  PENDING_GH_MANAGER: { chip: "bg-sky-50 text-sky-900 ring-sky-600/20", dot: "bg-sky-500" },
  APPROVED: { chip: "bg-emerald-50 text-emerald-900 ring-emerald-600/20", dot: "bg-emerald-500" },
  REJECTED: { chip: "bg-red-50 text-red-900 ring-red-600/20", dot: "bg-red-500" },
  CANCELLED: { chip: "bg-stone-100 text-stone-700 ring-stone-500/20", dot: "bg-stone-400" },
  OCCUPIED: { chip: "bg-violet-50 text-violet-900 ring-violet-600/20", dot: "bg-violet-500" },
  VACATED: { chip: "bg-stone-100 text-stone-800 ring-stone-500/20", dot: "bg-stone-500" },
  CANCELLATION_REQUESTED: {
    chip: "bg-orange-50 text-orange-900 ring-orange-600/25",
    dot: "bg-orange-500",
  },
  CANCELLATION_APPROVED: { chip: "bg-rose-50 text-rose-900 ring-rose-600/20", dot: "bg-rose-500" },
};

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const style = STATUS_STYLES[status];
  return (
    <Badge
      className={cn("gap-1.5 border-transparent whitespace-nowrap ring-1 ring-inset", style.chip, className)}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
