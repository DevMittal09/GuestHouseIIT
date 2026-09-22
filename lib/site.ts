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

export const INSTITUTE_WEBSITE = "https://iitpkd.ac.in";

export const SITE_LINKS = [
  { label: "IIT Palakkad Website", href: INSTITUTE_WEBSITE },
  { label: "Guest House on iitpkd.ac.in", href: "https://iitpkd.ac.in/guest-house-hamsanandi" },
  { label: "Room Booking System (MRBS)", href: "https://mrbs.iitpkd.ac.in" },
] as const;

/** The institute's own switchboard line and address, shown in the utility strip. */
export const INSTITUTE_CONTACT = {
  phone: "0491 209 2013",
  email: "info@iitpkd.ac.in",
  addressLine: "Kanjikode | Palakkad | Kerala – 678623",
} as const;

/**
 * The guest house office, as printed at the foot of the office's own invoice
 * template (public/GHM_Invoice.docx, Sep 2026) — the phone, email and address
 * the office itself hands to guests. (The number on the iitpkd.ac.in guest
 * house page, +91 88483 94440, was used before.) The invoice's copy of these is
 * a Setting (Tariffs & Invoicing), so a change there does not reach this page.
 * TODO(site): whether front-office hours should be published.
 */
export const GUEST_HOUSE_CONTACT = {
  phone: "+91 491 209 2016",
  phoneHref: "tel:+914912092016",
  email: "ghm@iitpkd.ac.in",
  address: ["Guest House, Indian Institute of Technology Palakkad", "Kanjikode West | Palakkad", "Kerala | Pin: 678623"],
} as const;

/**
 * The map on the Contact page. The embed is the institute's own Google Maps
 * pin (from the design handoff); no separate pin for the guest houses is
 * published. TODO(site): replace with the guest house's own pin once the
 * office confirms it — `https://maps.google.com/maps?q=<lat>,<lng>&z=17&output=embed`
 * works without an API key.
 */
export const GUEST_HOUSE_MAP = {
  title: "IIT Palakkad guest house on the map",
  embedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.052565408499!2d76.72327250857225!3d10.807286089298902!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ba86eb5b2e20413%3A0x6ac0bc1d9e6a7141!2sIIT%20Palakkad!5e0!3m2!1sen!2sin!4v1687273934671!5m2!1sen!2sin",
  openUrl: "https://goo.gl/maps/LXzZJEUFw5QCTrEDA",
  directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=IIT+Palakkad+Kanjikode",
} as const;

/**
 * A photograph on the public site. `src` is under `public/`; `null` renders a
 * labelled placeholder of the same shape, for slots still waiting on a photo.
 */
export type SitePhoto = { src: string | null; alt: string };

/**
 * The photographs supplied by the guest house office (`Images/` in the repo
 * root, 6000×4000 camera originals, not committed). The site serves 2000px
 * copies from `public/site/photos/`, made with EXIF orientation applied and
 * metadata stripped — see .memories/10-ui-design.md for the recipe when adding
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
  strip: [PHOTOS.bedroom, PHOTOS.livingDining, PHOTOS.livingRoom, PHOTOS.gazebo],
};

/**
 * The Gallery page, grouped by subject. The supplied photos are not labelled
 * by guest house, so they are not attributed to one here.
 * TODO(site): once the office confirms which guest house each shows, give
 * that guest house a section (and a `GUEST_HOUSE_PHOTOS` cover) instead.
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

/**
 * A cover photograph per guest house, keyed by a slug of its name
 * (`guestHouseSlug`). Guest houses are data — an admin can add one — so a
 * guest house with no entry shows its card without a picture.
 * TODO(site): e.g. `hamsanandi: PHOTOS.block`, once confirmed.
 */
export const GUEST_HOUSE_PHOTOS: Record<string, SitePhoto> = {};

export function guestHouseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
