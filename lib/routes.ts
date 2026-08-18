import type { Role } from "./types";

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
    case "developer":
      return "/admin";
    default:
      return "/dashboard";
  }
}

/** Emails allowed to submit Official/Dignitary bookings. */
export const OFFICIAL_EMAIL_WHITELIST = [
  "admin@iitpkd.ac.in",
  "director.office@iitpkd.ac.in",
  "registrar@iitpkd.ac.in",
];
