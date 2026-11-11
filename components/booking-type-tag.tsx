import { cn } from "@/lib/utils";
import { BOOKING_TYPE_LABELS, type BookingType } from "@/lib/types";

/**
 * **The booking type as a tag, where the Guest House Manager reviews**
 * (11 Nov 2026, the owner, a second time: "Make type of booking more visible
 * in review panel of guest house manager, [Personal/Official]").
 *
 * The 10 Nov answer was weight and position only, under the 11 Oct rule that
 * a badge is for a state. That was not visible enough, so on the desk's
 * review the type is a tag - **solid**, which is what keeps it from reading
 * as a status: every status tag (`StatusBadge`, `tag-*`) is a pale fill.
 *
 * - Official: saffron with ink, the colour that already marks an official
 *   request at the desk (the row's saffron edge). Saffron never carries white.
 * - Personal: ink with white.
 * - Alumni: outlined, its full label in the tooltip.
 *
 * Used on the manager's queue and the Review & Allocate dialog only.
 * `BookingDetails`, which every reviewer sees, keeps the type in bold text.
 */
const SHORT: Record<BookingType, string> = {
  official: "Official",
  personal: "Personal",
  alumni: "Alumni",
};

const STYLE: Record<BookingType, string> = {
  official: "bg-saffron text-ink",
  personal: "bg-ink text-white",
  alumni: "border border-ink text-ink",
};

export function BookingTypeTag({
  type,
  size = "sm",
  className,
}: {
  type: BookingType;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      title={BOOKING_TYPE_LABELS[type]}
      aria-label={`Type of booking: ${BOOKING_TYPE_LABELS[type]}`}
      className={cn(
        "inline-flex items-center rounded font-semibold tracking-wide uppercase",
        size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
        STYLE[type],
        className
      )}
    >
      {SHORT[type]}
    </span>
  );
}
