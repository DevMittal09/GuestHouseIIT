import { Pool } from "pg";
import { expect } from "vitest";
import { createBooking } from "@/app/actions/bookings";
import {
  NO_GUEST_NAME_RULE,
  guestNameRule,
  isRelationshipWithheld,
  lockedNameFor,
} from "@/lib/academic/guest-names";
import { academicRecordFor } from "@/lib/academic";
import { bookingContextFor } from "@/lib/booking-context-server";
import { bookingPayloadSchema } from "@/lib/booking-schema";
import { defaultBookingTypeFor } from "@/lib/booking-types";
import { getEffectiveFormConfig } from "@/lib/form-config-server";
import { getStore } from "@/lib/store";
import { toInstituteDateValue } from "@/lib/tz";
import type { BookingType, BookingWithDetails, DebitHead, GuestHouse, Profile } from "@/lib/types";
import { setSignedIn } from "./session";

/** Raw SQL against the test database, for arranging and asserting. */
let pool: Pool | null = null;
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return (await pool.query(text, params)).rows as T[];
}

/** Every booking and what hangs off it, so each file starts empty. */
export async function resetBookings(): Promise<void> {
  await sql(
    `truncate bookings, booking_rooms, booking_guests, booking_logs, room_holds, room_blocks,
              invoices, email_outbox, rate_limits restart identity cascade`
  );
}

const profiles = new Map<string, Profile>();
export async function profile(email: string): Promise<Profile> {
  if (!profiles.has(email)) {
    const found = (await getStore().listProfiles()).find((p) => p.email === email);
    if (!found) throw new Error(`no persona ${email}`);
    profiles.set(email, found);
  }
  return profiles.get(email)!;
}

/** Sign in as a persona for the actions that follow. */
export async function as(email: string): Promise<Profile> {
  const p = await profile(email);
  setSignedIn(p);
  return p;
}

export const MANAGER = "muhamed.rizwan2458@gmail.com";
export const CARETAKER = "gh.reception@iitpkd.ac.in";

/** An institute calendar date `n` days from today ("yyyy-MM-dd"). */
export function day(n: number): string {
  return toInstituteDateValue(new Date(Date.now() + n * 86_400_000));
}

export async function guestHouse(name: "Bageshri" | "Hamsanandi"): Promise<GuestHouse> {
  const gh = (await getStore().listGuestHouses()).find((g) => g.name === name);
  if (!gh) throw new Error(`no guest house ${name}`);
  return gh;
}

type Guest = { name?: string; age?: string; relationship?: string; id_number?: string };

export type RoomBookingOptions = {
  guestHouse?: "Bageshri" | "Hamsanandi";
  checkIn: string; // "yyyy-MM-ddTHH:mm"
  checkOut: string;
  bookingType?: BookingType;
  debitHead?: DebitHead;
  debitDetails?: string;
  officeApproval?: "direct" | "hod";
  guests?: Guest[];
  /** Days with lunch, at a guest house with a kitchen. */
  lunchOn?: string[];
  files?: Record<string, File>;
  forClub?: string;
};

/**
 * What `/book` would send for this persona, built from the same server
 * functions the page calls, validated by the browser's own schema pass and
 * then submitted through the real `createBooking`.
 */
export async function submitRoom(email: string, o: RoomBookingOptions) {
  const user = await as(email);
  const requester = o.forClub ? await profile(o.forClub) : user;
  const [config, context, lookup] = await Promise.all([
    getEffectiveFormConfig(requester.role),
    bookingContextFor(requester),
    academicRecordFor(requester),
  ]);
  const guestNames = guestNameRule(lookup.status === "found" ? lookup.record : null, config.relationship_options);
  const gh = await guestHouse(o.guestHouse ?? "Bageshri");
  const bookingType = o.bookingType ?? defaultBookingTypeFor(requester.role) ?? "official";
  const heads = context.debitHeads.room[bookingType] ?? [];
  const head =
    o.debitHead ?? heads.find((h) => h !== "special_budget" && h !== "project_grant") ?? heads[0] ?? null;

  const defaultRelationship =
    config.relationship_style === "dropdown"
      ? (config.relationship_options.find((r) => lockedNameFor(guestNames, r)) ??
        config.relationship_options.find(
          (r) => !isRelationshipWithheld(guestNames, r) && !(config.dependent_relationships ?? []).includes(r)
        ))
      : "Colleague";
  const guests = (o.guests ?? [{}]).map((g) => {
    const relationship = config.guest_fields.relationship === "hidden" ? undefined : (g.relationship ?? defaultRelationship);
    const locked = relationship ? lockedNameFor(guestNames, relationship) : null;
    return {
      name: locked ?? g.name ?? "Test Guest",
      age: g.age ?? "45",
      gender: "male",
      relationship,
      id_number: g.id_number ?? "123412341234",
      citizenship: "indian",
    };
  });

  const payload = {
    service_type: o.lunchOn?.length ? "room_meals" : "room",
    booking_type: bookingType,
    debit_head: head,
    debit_details: o.debitDetails,
    fund_declaration: head !== null && head !== "personal_funds",
    project_id: null,
    copy_to_emails: [""],
    office_approval: requester.role === "official" ? (o.officeApproval ?? "direct") : null,
    guest_house_id: gh.id,
    purpose_of_visit: "Test-pg stay",
    check_in: o.checkIn,
    check_out: o.checkOut,
    meal_guest_count: "",
    meal_preference: null,
    meal_diet_counts: o.lunchOn?.length ? { veg: guests.length, non_veg: 0 } : null,
    meals: (o.lunchOn ?? []).map((date) => ({ date, lunch: true })),
    rooms: [{ room_type: null, guests }],
    custom: {},
  };
  return send(requester, config, context, guestNames, gh, payload, o.files, o.forClub);
}

/** A dining booking: lunch for `people` on each date, at the one kitchen. */
export async function submitMeals(email: string, dates: string[], people: number) {
  const user = await as(email);
  const [config, context] = await Promise.all([getEffectiveFormConfig(user.role), bookingContextFor(user)]);
  const gh = await guestHouse("Hamsanandi");
  const bookingType = defaultBookingTypeFor(user.role) ?? "official";
  const heads = context.debitHeads.dining[bookingType] ?? [];
  const head = heads.find((h) => h !== "special_budget") ?? heads[0] ?? null;
  const sorted = [...dates].sort();
  const payload = {
    service_type: "meals_only",
    booking_type: bookingType,
    debit_head: head,
    fund_declaration: head !== null && head !== "personal_funds",
    project_id: null,
    copy_to_emails: [""],
    office_approval: null,
    guest_house_id: gh.id,
    purpose_of_visit: "",
    check_in: `${sorted[0]}T00:00`,
    check_out: `${sorted[sorted.length - 1]}T23:59`,
    meal_guest_count: String(people),
    meal_preference: null,
    meal_diet_counts: { veg: people, non_veg: 0 },
    meals: dates.map((date) => ({ date, lunch: true })),
    rooms: [],
    custom: {},
  };
  return send(user, config, context, NO_GUEST_NAME_RULE, gh, payload);
}

async function send(
  requester: Profile,
  config: Awaited<ReturnType<typeof getEffectiveFormConfig>>,
  context: Awaited<ReturnType<typeof bookingContextFor>>,
  guestNames: ReturnType<typeof guestNameRule>,
  gh: GuestHouse,
  payload: Record<string, unknown>,
  files?: Record<string, File>,
  forClub?: string
) {
  const parsed = bookingPayloadSchema(config, {
    mealsAvailable: gh.serves_meals,
    requesterEmail: requester.email,
    rules: context.rules,
    hasHodApprover: context.hodApprovers.length > 0,
    guestNames,
  }).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: `client: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  }
  const fd = new FormData();
  fd.set("payload", JSON.stringify(parsed.data));
  for (const [k, f] of Object.entries(files ?? {})) fd.set(k, f);
  if (forClub) fd.set("for_club", requester.id);
  const result = await createBooking(fd);
  if (!result.ok) return { ok: false as const, error: `server: ${result.error}` };
  const booking = (await sql<{ id: string }>("select id from bookings where booking_reference_id = $1", [result.reference]))[0];
  return { ok: true as const, reference: result.reference as string, id: booking.id };
}

/** Submit and insist it worked, returning the stored booking. */
export async function mustSubmitRoom(email: string, o: RoomBookingOptions): Promise<BookingWithDetails> {
  const r = await submitRoom(email, o);
  expect(r.ok ? "ok" : r.error).toBe("ok");
  return (await getStore().getBooking((r as { id: string }).id))!;
}

export async function reload(id: string): Promise<BookingWithDetails> {
  return (await getStore().getBooking(id))!;
}

/** The ids of active rooms at a guest house no live hold covers for the stay. */
export async function freeRooms(b: BookingWithDetails): Promise<string[]> {
  const store = getStore();
  const rooms = (await store.listRooms(b.guest_house_id)).filter((r) => r.is_active);
  const taken = new Set(await store.getOccupiedRoomIds(b.guest_house_id, b.check_in, b.check_out));
  return rooms.filter((r) => !taken.has(r.id)).map((r) => r.id);
}

export async function logsOf(id: string) {
  return sql<{ previous_status: string | null; new_status: string; action_by_name: string; remarks: string | null }>(
    "select previous_status, new_status, action_by_name, remarks from booking_logs where booking_id = $1 order by timestamp",
    [id]
  );
}
