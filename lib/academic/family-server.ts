import "server-only";
import type { BookingWithDetails } from "@/lib/types";
import { checkFamily, type StudentRecordPanel } from "./family";
import { academicRecordRows } from "./fields";
import { academicRecordFor, isMockAcademicSource } from "./index";

/**
 * One panel per student request, keyed by booking id. Called by the warden's
 * page for the requests already in their queue — `canReview` scoped them to
 * the warden's hostel — so it widens nothing. Uses the same cached,
 * never-throwing lookup as the details card; the record is shown, never
 * stored, logged or mailed.
 */
export async function studentRecordPanels(
  bookings: Pick<BookingWithDetails, "id" | "requester" | "user_role" | "guests">[]
): Promise<Record<string, StudentRecordPanel>> {
  const students = bookings.filter((b) => b.user_role === "student" && b.requester);
  const entries = await Promise.all(
    students.map(async (b): Promise<[string, StudentRecordPanel]> => {
      const lookup = await academicRecordFor(b.requester);
      const record = lookup.status === "found" ? lookup.record : null;
      const guests = b.guests.filter((g) => !g.is_infant).map((g) => ({ name: g.name, relationship: g.relationship }));
      return [
        b.id,
        {
          status: lookup.status,
          rows: record ? academicRecordRows(record) : [],
          family: checkFamily(record?.kind === "student" ? record : null, guests),
          sample: record !== null && isMockAcademicSource(),
        },
      ];
    })
  );
  return Object.fromEntries(entries);
}
