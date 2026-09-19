import { REQUESTER_ROLES, type Role } from "./types";

/**
 * Where signed-out visitors are sent. `/` is the public guest house website,
 * so every portal guard redirects here rather than to the home page.
 */
export const SIGN_IN_PATH = "/sign-in";

/** Landing page for each role after sign-in. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "warden":
      return "/warden";
    case "faculty_advisor":
      return "/fa";
    case "iar_cell":
      return "/iar";
    case "gh_manager":
      return "/manager";
    case "gh_caretaker":
      return "/caretaker";
    case "developer":
      return "/admin";
    default:
      // `/dashboard` bounces anyone who is not a requester to `homeForRole()`,
      // so a role that lands here without being a requester would redirect to
      // itself forever. That is not hypothetical: `alumni` is retired but is
      // still in the `Role` union, and stored/legacy alumni accounts hung the
      // browser on sign-in. `/availability` is the one route open to every
      // signed-in role, so it is the safe floor.
      return REQUESTER_ROLES.includes(role) ? "/dashboard" : "/availability";
  }
}

/** Emails allowed to submit Official/Dignitary bookings. */
export const OFFICIAL_EMAIL_WHITELIST = [
  "admin@iitpkd.ac.in",
  "director.office@iitpkd.ac.in",
  "registrar@iitpkd.ac.in",
];
