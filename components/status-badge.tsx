import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type BookingStatus } from "@/lib/types";

/**
 * One colour per stage of a booking's life, from the GOV.UK tag palette
 * (`tag-*` in `app/globals.css`): yellow while an approver has it, blue at
 * the Guest House Manager, green once approved, purple while the guest is in
 * the house, turquoise once they have left, and red / grey / orange / pink for
 * the ways a booking ends or is being ended. The label always says the
 * status in words, so the colour is never the only signal.
 */
const STATUS_CLASSES: Record<BookingStatus, string> = {
  PENDING_WARDEN: "tag-yellow",
  PENDING_FA: "tag-yellow",
  PENDING_HOD: "tag-yellow",
  PENDING_IAR: "tag-yellow",
  PENDING_GH_MANAGER: "tag-blue",
  APPROVED: "tag-green",
  REJECTED: "tag-red",
  CANCELLED: "tag-grey",
  OCCUPIED: "tag-purple",
  VACATED: "tag-turquoise",
  CANCELLATION_REQUESTED: "tag-orange",
  CANCELLATION_APPROVED: "tag-pink",
  // Nobody decided it in time (migration 29). Grey, like a cancellation: it
  // is a way a request ends, and not one anybody chose.
  MISSED: "tag-grey",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="tag" className={cn("whitespace-nowrap", STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
