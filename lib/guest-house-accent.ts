/**
 * **One colour per guest house, on the desk's console** (10 Nov 2026, the
 * owner: "try different colours for each guest house for guest house manager
 * console").
 *
 * The manager and the caretaker work two guest houses from one console and
 * switch between them with a tab. Everything below that tab - the queue, the
 * stays, the invoices - looks identical for either house, so the only thing
 * saying which one you are acting on was a word. This gives each house a
 * colour of its own, on the switcher and the console's heading.
 *
 * **The colours are tokens of their own** (`--gh-1`..`--gh-4` in
 * `app/globals.css`) because every accent the service already has means
 * something: vermilion is the brand, Reject and Full; saffron marks an
 * official request; green is check-in; indigo check-out; violet an accepted
 * overlap. A guest house painted green would read as "occupied" wherever it
 * appeared.
 *
 * **Assigned by position, not by name.** Guest houses are created and renamed
 * from the console (`AGENTS.md`: don't reintroduce a hardcoded name check), so
 * a colour keyed on "Bageshri" would be lost the day somebody fixed a typo.
 * Position in the store's own ordered list is stable for the life of the
 * install and needs no column. A guest house the caller did not list falls
 * back to a hash of its id, so a page holding one house still gets a
 * consistent colour rather than always the first.
 */

export const GUEST_HOUSE_ACCENTS = ["gh-1", "gh-2", "gh-3", "gh-4"] as const;

export type GuestHouseAccent = (typeof GUEST_HOUSE_ACCENTS)[number];

/** A stable small number from a string, for the off-list fallback. */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The accent for one guest house.
 *
 * `all` is the ordered list the page already has - pass it and the colours are
 * stable across every console; omit it and the id decides, which is only
 * consistent with itself.
 */
export function guestHouseAccent(
  guestHouseId: string,
  all: readonly { id: string }[] = []
): GuestHouseAccent {
  const at = all.findIndex((g) => g.id === guestHouseId);
  const index = at >= 0 ? at : hash(guestHouseId);
  return GUEST_HOUSE_ACCENTS[index % GUEST_HOUSE_ACCENTS.length];
}

/*
 * The classes are **written out, never interpolated**. Tailwind finds classes
 * by scanning the source for literal text, so `bg-${accent}` compiles to
 * nothing at all and the chip comes out unstyled - with no error anywhere.
 * These two records are the only place the four names appear.
 */

/** The filled chip of the guest house that is selected. */
export const GUEST_HOUSE_CHIP: Record<GuestHouseAccent, string> = {
  "gh-1": "bg-gh-1 text-white",
  "gh-2": "bg-gh-2 text-white",
  "gh-3": "bg-gh-3 text-white",
  "gh-4": "bg-gh-4 text-white",
};

/** The rule that marks which guest house a console page is showing. */
export const GUEST_HOUSE_RULE: Record<GuestHouseAccent, string> = {
  "gh-1": "border-gh-1",
  "gh-2": "border-gh-2",
  "gh-3": "border-gh-3",
  "gh-4": "border-gh-4",
};

/** The guest house's name set in its own colour, on a light ground. */
export const GUEST_HOUSE_TEXT: Record<GuestHouseAccent, string> = {
  "gh-1": "text-gh-1",
  "gh-2": "text-gh-2",
  "gh-3": "text-gh-3",
  "gh-4": "text-gh-4",
};
