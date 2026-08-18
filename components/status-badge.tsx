import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type BookingStatus } from "@/lib/types";

const STATUS_CLASSES: Record<BookingStatus, string> = {
  PENDING_WARDEN: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-transparent",
  PENDING_FA: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-transparent",
  PENDING_IAR: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-transparent",
  PENDING_GH_MANAGER: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200 border-transparent",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-transparent",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border-transparent",
  CANCELLED: "bg-muted text-muted-foreground border-transparent",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge className={cn("whitespace-nowrap", STATUS_CLASSES[status])}>{STATUS_LABELS[status]}</Badge>;
}
