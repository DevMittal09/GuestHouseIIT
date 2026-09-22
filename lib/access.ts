/**
 * Who may act outside the ordinary flow.
 *
 * The Guest House Manager runs the guest house: they take bookings at the
 * desk for people who never open the portal, fix the ones that are wrong, and
 * override a rule when the institute has already promised something the form
 * refuses. None of that is a new role — `gh_manager` has existed since the
 * first migration — it is a set of permissions that were previously spread
 * across `role === "gh_manager"` checks in individual actions.
 *
 * Every override here is recorded in `booking_logs`, which is what makes it an
 * override rather than a loophole: the audit trail names who did it and why.
 */

import type { Profile, Role } from "./types";

/**
 * Roles with unrestricted access to every booking. The developer is included
 * because the console already bypasses everything; naming it here keeps the
 * two from drifting apart.
 */
export const FULL_ACCESS_ROLES: Role[] = ["gh_manager", "developer"];

export function hasFullBookingAccess(role: Role): boolean {
  return FULL_ACCESS_ROLES.includes(role);
}

/** Create, edit, cancel or reinstate any booking, whoever raised it. */
export function canManageAnyBooking(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** Submit a booking in someone else's name, recording both parties. */
export function canBookOnBehalf(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/**
 * Approve a booking without walking it through the warden / advisor / IAR
 * chain. The manager is the last stage of that chain anyway; this lets them
 * be the only stage when the request is already settled off-portal.
 */
export function canOverrideApproval(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/**
 * Book a guest house that a policy would otherwise rule out — an alumnus at
 * Hamsanandi, say, when Bageshri is full. Gated here and logged at the point
 * of use, never silently allowed.
 */
export function canOverrideGuestHousePolicy(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** Assign and reassign rooms, and change dates on an existing booking. */
export function canAssignRooms(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** Edit the meal selection of a booking after it was submitted. */
export function canEditMeals(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** See occupancy and daily meal counts across every guest house. */
export function canViewAllOccupancy(role: Role): boolean {
  return hasFullBookingAccess(role) || role === "gh_caretaker";
}

// ------------------------------------------------------- the admin console

/**
 * The console is not one permission but several.
 *
 * The developer built the portal; the Guest House Manager runs the guest
 * house. Both need to change how it is configured — rooms come in and out of
 * service, a new manager joins, a booking form needs another field, the
 * wording of a mail is wrong — and making all of that developer-only means
 * every operational change waits on a developer. So the console is split, and
 * each section names the roles that may use it.
 *
 * What stays developer-only is what could lock everyone out or rewrite
 * history: the console password, forcing a booking's status, and deleting
 * bookings outright.
 */
export type ConsoleSection =
  | "users"
  | "units"
  | "projects"
  | "billing"
  | "guest_houses"
  | "forms"
  | "mail_templates"
  | "mail_outbox"
  | "bookings"
  | "settings"
  | "security"
  | "console_access";

export const CONSOLE_SECTIONS: Record<
  ConsoleSection,
  { label: string; href: string; roles: Role[]; blurb: string }
> = {
  users: {
    label: "Users & Roles",
    href: "/admin/users",
    roles: ["gh_manager", "developer"],
    blurb: "Accounts and what each one may do, including other managers.",
  },
  units: {
    label: "Departments & Clubs",
    href: "/admin/units",
    roles: ["gh_manager", "developer"],
    blurb: "Departments, clubs, councils and offices, and who approves for each.",
  },
  projects: {
    label: "Projects",
    href: "/admin/projects",
    roles: ["gh_manager", "developer"],
    blurb: "The projects a booking can be debited to, with a spreadsheet paste import.",
  },
  billing: {
    label: "Tariffs & Invoicing",
    href: "/admin/billing",
    roles: ["gh_manager", "developer"],
    blurb: "Room, extra-bed and meal rates by date, invoice numbering, GST, bank details and the Accounts email.",
  },
  guest_houses: {
    label: "Guest Houses & Rooms",
    href: "/admin/guest-houses",
    roles: ["gh_manager", "developer"],
    blurb: "Guest houses, their rooms, and which of them serve meals.",
  },
  forms: {
    label: "Form Builder",
    href: "/admin/forms",
    roles: ["gh_manager", "developer"],
    blurb: "What each role is asked for on the booking form.",
  },
  mail_templates: {
    label: "Email Templates",
    href: "/admin/mail-templates",
    roles: ["gh_manager", "developer"],
    blurb: "What every automatic email says, and who else is copied on it.",
  },
  mail_outbox: {
    label: "Mail Outbox",
    href: "/admin/mail",
    roles: ["gh_manager", "developer"],
    blurb: "Every message queued or sent, and why any of them failed.",
  },
  bookings: {
    label: "All Bookings",
    href: "/admin/bookings",
    roles: ["developer"],
    blurb: "Force a booking's status or delete it outright. Developer only.",
  },
  settings: {
    label: "Settings",
    href: "/admin/settings",
    roles: ["developer"],
    blurb:
      "The rules: official whitelist, hostels, room capacity, the booking window, stay length and meal times. Developer only.",
  },
  security: {
    label: "Security",
    href: "/admin/security",
    roles: ["gh_manager", "developer"],
    blurb: "Your second factor and the browsers you are signed in on.",
  },
  console_access: {
    label: "Console Access",
    href: "/admin/access",
    roles: ["developer"],
    blurb: "The console password. Developer only — it is the key to this door.",
  },
};

export function canUseConsoleSection(role: Role, section: ConsoleSection): boolean {
  return CONSOLE_SECTIONS[section].roles.includes(role);
}

/** The sections this role may open, in tab order. Empty means no console. */
export function consoleSectionsFor(role: Role): ConsoleSection[] {
  return (Object.keys(CONSOLE_SECTIONS) as ConsoleSection[]).filter((s) =>
    canUseConsoleSection(role, s)
  );
}

export function canUseConsole(role: Role): boolean {
  return consoleSectionsFor(role).length > 0;
}

/**
 * Which roles this console user may hand out.
 *
 * A manager may appoint another manager — that is the point of giving them
 * Users & Roles — but **not** a developer, and not by editing an existing
 * developer account. Otherwise "add an admin" is a route to becoming one,
 * and the split above would be decoration.
 */
export function assignableRoles(actor: Role, all: Role[]): Role[] {
  if (actor === "developer") return all;
  return all.filter((r) => r !== "developer");
}

/** Why this console user may not touch that account, or null when they may. */
export function userEditError(actor: Profile, target: Profile): string | null {
  if (actor.role === "developer") return null;
  if (target.role === "developer") {
    return "Only a developer can change a developer account";
  }
  return null;
}

// ---------------------------------------------------------------- invoices

/**
 * Preview, issue and print invoices and record payments (Phase 5): the desk —
 * manager and caretaker — plus the developer.
 */
export function canIssueInvoices(role: Role): boolean {
  return role === "gh_manager" || role === "gh_caretaker" || role === "developer";
}

/**
 * Cancel an issued invoice. A correction is a cancellation plus a new
 * invoice, so it is the manager's call, not the reception desk's.
 */
export function canCancelInvoices(role: Role): boolean {
  return hasFullBookingAccess(role);
}

/** The monthly collections export on /history. */
export function canExportCollections(role: Role): boolean {
  return canIssueInvoices(role);
}
