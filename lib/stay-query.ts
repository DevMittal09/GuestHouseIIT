import { parseDateValue } from "./tz";

/**
 * The stay a visitor picked in the home page's booking bar, carried in the
 * query string through `/book-room`, sign-in (`next=`) and into `/book`, where
 * it pre-fills the form: `?gh=<guest house id>&in=YYYY-MM-DD&out=YYYY-MM-DD`.
 *
 * It is only ever a convenience. Every value is re-checked here against what
 * the page can offer, and the booking schema still validates the dates on
 * submit, so a hand-edited link can pre-fill nothing the form would not accept
 * from typing.
 */
export type StayQuery = {
  guestHouseId?: string;
  checkIn?: string;
  checkOut?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function dateOrUndefined(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return parseDateValue(value) ? value : undefined;
}

/**
 * Reads the stay from search params. `guestHouseIds` is what the caller may
 * offer — every guest house on `/book-room`, only the role's allowed ones on
 * `/book` — and an id outside it is dropped. A check-out that is not after the
 * check-in is dropped too, since the form would only reject it.
 */
export function parseStayQuery(params: RawParams, guestHouseIds: string[]): StayQuery {
  const gh = one(params.gh);
  const checkIn = dateOrUndefined(one(params.in));
  let checkOut = dateOrUndefined(one(params.out));
  if (checkIn && checkOut && checkOut <= checkIn) checkOut = undefined;
  return {
    guestHouseId: gh && guestHouseIds.includes(gh) ? gh : undefined,
    checkIn,
    checkOut,
  };
}

/** `gh=…&in=…&out=…` for the parts that are set, or "" when none are. */
export function stayQueryString(stay: StayQuery): string {
  const params = new URLSearchParams();
  if (stay.guestHouseId) params.set("gh", stay.guestHouseId);
  if (stay.checkIn) params.set("in", stay.checkIn);
  if (stay.checkOut) params.set("out", stay.checkOut);
  return params.toString();
}

export function hasStay(stay: StayQuery): boolean {
  return Boolean(stay.guestHouseId || stay.checkIn || stay.checkOut);
}
