import { isInfantAge } from "@/lib/occupancy";
import type { NewBookingInput } from "@/lib/types";

/**
 * The booking columns that are summaries of the room cards rather than
 * answers in their own right.
 *
 * Both stores call this, so the mock and Supabase cannot disagree about how
 * many rooms a booking asked for or whether an infant is on it. Callers never
 * pass these in: a count kept beside the rows is a count that can drift from
 * them, which is exactly what `rooms_requested` did before the cards existed.
 */
export function deriveFromRooms(input: NewBookingInput): {
  rooms_requested: number;
  has_infant: boolean;
  has_foreign_national: boolean;
  meal_guest_count: number | null;
} {
  const guests = input.rooms.flatMap((r) => r.guests);
  return {
    rooms_requested: input.rooms.length,
    has_infant: guests.some((g) => isInfantAge(g.age)),
    has_foreign_national: guests.some((g) => g.citizenship === "other"),
    // A meals-only booking has no guest rows, so its head count is the one
    // thing here that is genuinely an answer and not a summary.
    meal_guest_count:
      input.service_type === "meals_only" ? (input.meal_guest_count ?? null) : null,
  };
}
