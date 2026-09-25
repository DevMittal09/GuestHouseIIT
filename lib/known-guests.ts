import type { AcademicRecord } from "./academic/types";
import type { BookingWithDetails, Citizenship, Gender } from "./types";

/**
 * People the portal already knows the requester books for (25 Sep 2026), so
 * New Booking can fill a guest in instead of asking for it to be typed again.
 * Two sources, in this order:
 *
 * 1. **The academic record.** A student's record names their father, mother
 *    and guardian. Choosing Father / Mother / Guardian on a guest fills that
 *    name in — the same names the Assistant Warden checks the request against
 *    (`lib/academic/family.ts`). The other kinds of record describe the
 *    requester alone, so they add nobody.
 * 2. **The requester's own earlier bookings.** Whoever they have booked for
 *    before, with the relationship, gender and citizenship they gave — for
 *    every requester, whatever their role.
 *
 * Only what is safe to hand back to the browser: never an Aadhaar or passport
 * number (the portal stores them encrypted, and they are the requester's to
 * type again), never an age (it changes, and it decides who is an infant),
 * never an infant (who may be five by now).
 */
export type KnownGuest = {
  name: string;
  relationship: string | null;
  gender: Gender | null;
  citizenship: Citizenship;
  nationality: string | null;
  source: "record" | "booking";
  /** For a guest from an earlier booking, which one. */
  reference: string | null;
};

/** How many earlier guests are offered — the most recent first. */
export const MAX_KNOWN_FROM_BOOKINGS = 15;

/**
 * The relationships a record names, with the gender the word implies. Matched
 * on the Form Builder's relationship options ignoring case, so a renamed
 * option ("Dad") simply stops being filled rather than filling the wrong box.
 */
const RECORD_FAMILY = [
  { field: "father_name", relationship: "Father", gender: "male" },
  { field: "mother_name", relationship: "Mother", gender: "female" },
  { field: "guardian_name", relationship: "Guardian", gender: null },
] as const;

/** The gender a relationship word settles, for filling an empty Gender box. */
const IMPLIED_GENDER: Record<string, Gender> = {
  father: "male",
  mother: "female",
  grandfather: "male",
  grandmother: "female",
  husband: "male",
  wife: "female",
  son: "male",
  daughter: "female",
  brother: "male",
  sister: "female",
};

export function impliedGender(relationship: string | null | undefined): Gender | null {
  return IMPLIED_GENDER[relationship?.trim().toLowerCase() ?? ""] ?? null;
}

const key = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Father, mother and guardian from a student's academic record; nobody from any other kind. */
export function knownGuestsFromRecord(record: AcademicRecord | null): KnownGuest[] {
  if (!record || record.kind !== "student") return [];
  const out: KnownGuest[] = [];
  for (const f of RECORD_FAMILY) {
    const name = record[f.field]?.trim();
    if (!name) continue;
    out.push({
      name,
      relationship: f.relationship,
      gender: f.gender,
      citizenship: "indian",
      nationality: null,
      source: "record",
      reference: null,
    });
  }
  return out;
}

/**
 * The adults on the requester's own earlier bookings, newest first, one entry
 * per name and relationship. A booking raised *for* them by someone else
 * counts; one they raised for a club (`created_by`) does not — those guests
 * are the club's.
 */
export function knownGuestsFromBookings(
  bookings: Pick<BookingWithDetails, "user_id" | "created_at" | "booking_reference_id" | "guests">[],
  requesterId: string,
  limit = MAX_KNOWN_FROM_BOOKINGS
): KnownGuest[] {
  const seen = new Set<string>();
  const out: KnownGuest[] = [];
  const own = bookings.filter((b) => b.user_id === requesterId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const b of own) {
    for (const g of b.guests) {
      const name = g.name?.trim();
      // "Guest" is what a nameless row is stored as.
      if (!name || name === "Guest" || g.is_infant) continue;
      const k = `${key(name)}|${key(g.relationship)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        name,
        relationship: g.relationship?.trim() || null,
        gender: g.gender ?? null,
        citizenship: g.citizenship ?? "indian",
        nationality: g.citizenship === "other" ? (g.nationality ?? null) : null,
        source: "booking",
        reference: b.booking_reference_id,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Both lists, the record first; an earlier guest the record already names is dropped. */
export function mergeKnownGuests(fromRecord: KnownGuest[], fromBookings: KnownGuest[]): KnownGuest[] {
  const names = new Set(fromRecord.map((k) => key(k.name)));
  return [...fromRecord, ...fromBookings.filter((k) => !names.has(key(k.name)))];
}

/** Who to fill in when this relationship is chosen: the record first, then the most recent booking. */
export function prefillFor(known: KnownGuest[], relationship: string | null | undefined): KnownGuest | null {
  const r = key(relationship);
  if (!r) return null;
  return known.find((k) => key(k.relationship) === r) ?? null;
}

/** The known person this name (and relationship) came from, for the "filled in from…" note. */
export function knownSourceOf(
  known: KnownGuest[],
  name: string | null | undefined,
  relationship: string | null | undefined
): KnownGuest | null {
  const n = key(name);
  if (!n) return null;
  const r = key(relationship);
  return known.find((k) => key(k.name) === n && (!r || !k.relationship || key(k.relationship) === r)) ?? null;
}

/** "Ramesh Menon — Father (academic record)" */
export function describeKnownGuest(k: KnownGuest): string {
  const who = k.relationship ? `${k.name} — ${k.relationship}` : k.name;
  return `${who} (${k.source === "record" ? "academic record" : `booked before, ${k.reference}`})`;
}
