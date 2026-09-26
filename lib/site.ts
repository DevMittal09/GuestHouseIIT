/**
 * Configurable values for the public guest house website (`app/(site)/`).
 *
 * Everything the office may need to change without touching a component lives
 * here: the login domain, the guidelines PDF, contact details, the map and the
 * photographs. Anything marked TODO is a placeholder still to be confirmed with
 * the guest house office — grep for "TODO(site)" to find them all.
 */

/**
 * Institute domain for sign-in. Subdomains are accepted too, because students
 * are `<roll>@smail.iitpkd.ac.in`. Named on the sign-in page. `isInstituteEmail`
 * is the rule real Google sign-in must enforce on the verified address; the
 * mock Google door lists only portal accounts, and LDAP sign-in takes a
 * username, so neither needs it today.
 */
export const LOGIN_DOMAIN = "iitpkd.ac.in";

export function isInstituteEmail(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return false;
  const host = email.trim().toLowerCase().slice(at + 1);
  return host === LOGIN_DOMAIN || host.endsWith(`.${LOGIN_DOMAIN}`);
}

export const INSTITUTE_EMAIL_ERROR = `Use your @${LOGIN_DOMAIN} email address — personal email accounts cannot be used to book.`;

/**
 * Where to go after a successful sign-in, if the page asked for somewhere
 * specific. Only same-origin paths are honoured; `//evil.example` and
 * backslash tricks would otherwise turn the redirect into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

/** TODO(site): the URL of the full guidelines PDF. `null` hides the button. */
export const GUIDELINES_PDF_URL: string | null = null;

/**
 * The Guidelines page's house rules (conduct, safety) are placeholders written
 * from what guest houses usually ask of guests, until the office sends its
 * own. While this is true the page says it is a provisional edition.
 * TODO(site): set to false once the office has confirmed the rules.
 */
export const GUIDELINES_PROVISIONAL = true;

export const INSTITUTE_WEBSITE = "https://iitpkd.ac.in";

/**
 * The institute's Meeting Room Booking System — lecture halls and meeting
 * rooms, which this portal does not book. Linked from the footer so someone
 * who came here for a seminar room finds the right door.
 */
export const MRBS_URL = "https://mrbs.iitpkd.ac.in";

/** "How to reach" on the institute's site: trains, buses and the airport. */
export const HOW_TO_REACH_URL = "https://iitpkd.ac.in/how-reach";

/**
 * The footer's institute links, each checked to resolve on 26 Sep 2026. The
 * iitpkd.ac.in guest house page is the one the institute publishes
 * (`/guest-house-hamsanandi`); there is no Bageshri page.
 */
export const SITE_LINKS = [
  { label: "IIT Palakkad website", href: INSTITUTE_WEBSITE },
  { label: "Room Booking System (MRBS)", href: MRBS_URL },
  { label: "Guest house on iitpkd.ac.in", href: "https://iitpkd.ac.in/guest-house-hamsanandi" },
  { label: "How to reach the campus", href: HOW_TO_REACH_URL },
  { label: "Telephone directory", href: "https://iitpkd.ac.in/TelephoneDirectory" },
] as const;

/**
 * The guest house office, as printed at the foot of the office's own invoice
 * template (public/GHM_Invoice.docx, Sep 2026) — the phone, email and address
 * the office itself hands to guests. (The number on the iitpkd.ac.in guest
 * house page, +91 88483 94440, was used before.) **The one source in code**: the
 * portal's "Facing trouble booking?" line (`lib/policy.ts`) and the invoice's
 * default contact (`DEFAULT_RULES.invoice.contact`) read it too. The invoice's
 * copy is then a Setting (Tariffs & Invoicing), so a change there does not
 * reach this page.
 * TODO(site): whether front-office hours should be published.
 */
export const GUEST_HOUSE_CONTACT = {
  phone: "+91 491 209 2016",
  phoneHref: "tel:+914912092016",
  email: "ghm@iitpkd.ac.in",
  address: ["Guest House, Indian Institute of Technology Palakkad", "Kanjikode West | Palakkad", "Kerala | Pin: 678623"],
} as const;

/**
 * Where each guest house is, keyed by `guestHouseSlug(name)` — guest houses
 * are data, so a new one gets a pin by adding a line here, and one without a
 * line is simply not on the map. `query` is the
 * place's own name on Google Maps: searched together with its coordinates it
 * resolves to the place itself (checked 26 Sep 2026), so the embed shows the
 * guest house's name card rather than a bare pin. `openUrl` is the link the
 * office shared. `name` is only a fallback label for when the store cannot be
 * read; the store's name is used otherwise.
 *
 * Order is the order the Contact page offers them in.
 */
export type GuestHouseLocation = {
  name: string;
  lat: number;
  lng: number;
  query: string;
  openUrl: string;
};

export const GUEST_HOUSE_LOCATIONS: Record<string, GuestHouseLocation> = {
  hamsanandi: {
    name: "Hamsanandi",
    lat: 10.7984359,
    lng: 76.7299972,
    query: "Hamsanandi Guest house IIT pkd",
    openUrl: "https://maps.app.goo.gl/GbKrfiao8TuKxgNA6",
  },
  bageshri: {
    name: "Bageshri",
    lat: 10.8063107,
    lng: 76.726681,
    query: "Bageshri guest house",
    openUrl: "https://maps.app.goo.gl/AspNpPu7sTDLXxL2A",
  },
};

/** One pin on the Contact page's map, with the links under it. */
export type MapPin = {
  slug: string;
  name: string;
  embedUrl: string;
  openUrl: string;
  directionsUrl: string;
};

/**
 * The institute's own pin (from the design handoff): the map's last resort
 * when no guest house has a location.
 */
export const INSTITUTE_MAP: MapPin = {
  slug: "iit-palakkad",
  name: "IIT Palakkad",
  embedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.052565408499!2d76.72327250857225!3d10.807286089298902!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba86eb5b2e20413%3A0x6ac0bc1d9e6a7141!2sIIT%20Palakkad!5e0!3m2!1sen!2sin!4v1687273934671!5m2!1sen!2sin",
  openUrl: "https://goo.gl/maps/LXzZJEUFw5QCTrEDA",
  directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=IIT+Palakkad+Kanjikode",
};

function pinFor(slug: string, name: string, at: GuestHouseLocation): MapPin {
  const coords = `${at.lat},${at.lng}`;
  return {
    slug,
    name,
    // No API key needed. The redirect lands on google.com/maps/embed, which
    // the Content-Security-Policy's frame-src already allows (proxy.ts).
    embedUrl: `https://maps.google.com/maps?q=${encodeURIComponent(at.query)}&ll=${coords}&z=17&output=embed`,
    openUrl: at.openUrl,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${coords}`,
  };
}

/**
 * The map pins to offer, one per guest house that has a location, in the
 * registry's order and under the store's own name. When the store named none
 * of them (it could not be read), every registered location is offered under
 * its fallback name; with no locations at all, the institute's pin.
 */
export function guestHouseMapPins(houseNames: string[]): MapPin[] {
  const bySlug = new Map(houseNames.map((name) => [guestHouseSlug(name), name]));
  const entries = Object.entries(GUEST_HOUSE_LOCATIONS);
  const known = entries.filter(([slug]) => bySlug.has(slug));
  const chosen = known.length > 0 ? known : entries;
  if (chosen.length === 0) return [INSTITUTE_MAP];
  return chosen.map(([slug, at]) => pinFor(slug, bySlug.get(slug) ?? at.name, at));
}

/**
 * A photograph on the public site. `src` is under `public/`; `null` renders a
 * labelled placeholder of the same shape, for slots still waiting on a photo.
 */
export type SitePhoto = { src: string | null; alt: string };

/**
 * The photographs supplied by the guest house office (`Images/` in the repo
 * root, 6000×4000 camera originals, not committed). The site serves 2000px
 * copies from `public/site/photos/`, made with EXIF orientation applied and
 * metadata stripped — see .memories/16-public-site-and-ui.md for the recipe when adding
 * more.
 */
function photo(file: string, alt: string): SitePhoto {
  return { src: `/site/photos/${file}`, alt };
}

export const PHOTOS = {
  courtyard: photo("exterior-courtyard.jpg", "Two-storey guest house blocks around a paved courtyard"),
  block: photo("exterior-block.jpg", "Front of a guest house block, with lawn and garden lights"),
  gazebo: photo("exterior-gazebo.jpg", "Lawn and gazebo between the guest house blocks"),
  walkway: photo("exterior-walkway.jpg", "Garden walkway beside the guest house blocks"),
  livingDining: photo("suite-living-dining.jpg", "Suite living area with sofa set and dining table"),
  livingRoom: photo("suite-living-room.jpg", "Suite living room with sofa and armchairs"),
  kitchenette: photo("suite-kitchenette.jpg", "Living room with television and kitchenette"),
  lounge: photo("suite-lounge.jpg", "Lounge seating by the windows"),
  bedroomWardrobe: photo("bedroom-wardrobe.jpg", "Bedroom with double bed and wardrobe"),
  bedroom: photo("bedroom.jpg", "Bedroom with double bed, bedside table and work desk"),
  dressingTable: photo("dressing-table.jpg", "Dressing table and mirror"),
  bathroom: photo("bathroom.jpg", "Bathroom with glass-screened shower"),
  hall: photo("common-hall.jpg", "Hall set with long tables and chairs"),
  meetingHall: photo("meeting-hall.jpg", "Meeting hall with projector screen and seating"),
} as const;

export const HOME_PHOTOS = {
  hero: PHOTOS.courtyard,
  /** Beside the guest-house names — the grounds, not either house in particular. */
  houses: PHOTOS.block,
  /** The mosaic: one large, two small, one wide. */
  mosaic: [PHOTOS.bedroom, PHOTOS.livingDining, PHOTOS.bathroom, PHOTOS.meetingHall],
  /** Behind "Planning a visit?". */
  closing: PHOTOS.gazebo,
};

/**
 * The banner behind each inner page's title, and the photograph beside the
 * sign-in pages. Decorative (empty alt): the page's title says what it is.
 */
export const PAGE_PHOTOS = {
  guidelines: PHOTOS.walkway,
  gallery: PHOTOS.lounge,
  contact: PHOTOS.gazebo,
  signIn: PHOTOS.livingRoom,
  bookRoom: PHOTOS.bedroomWardrobe,
  bookMeal: PHOTOS.hall,
};

/**
 * The Gallery page, grouped by subject. The supplied photos are not labelled
 * by guest house, so they are not attributed to one here.
 * TODO(site): once the office confirms which guest house each shows, give
 * that guest house a section instead.
 */
export const GALLERY_SECTIONS: { title: string; qualifier: string; photos: SitePhoto[] }[] = [
  {
    title: "Exterior and grounds",
    qualifier: "Guest house",
    photos: [PHOTOS.courtyard, PHOTOS.block, PHOTOS.gazebo, PHOTOS.walkway],
  },
  {
    title: "Rooms and suites",
    qualifier: "Inside",
    photos: [
      PHOTOS.bedroom,
      PHOTOS.bedroomWardrobe,
      PHOTOS.livingDining,
      PHOTOS.livingRoom,
      PHOTOS.kitchenette,
      PHOTOS.lounge,
      PHOTOS.dressingTable,
      PHOTOS.bathroom,
    ],
  },
  {
    title: "Common spaces",
    qualifier: "Shared",
    photos: [PHOTOS.meetingHall, PHOTOS.hall],
  },
];

/** A guest house's name as a key: "Hamsanandi" → "hamsanandi". Used by `GUEST_HOUSE_LOCATIONS`. */
export function guestHouseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
