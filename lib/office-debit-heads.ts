import type { DebitHead } from "./types";

/**
 * Which budgets each institute office may charge a stay to - the office's own
 * spreadsheet of 9 October 2026, one row per mailbox.
 *
 * Settings → Debitable heads keys the allowed heads by the requester's
 * *category*, so every office shared one list of six (Institute Grant,
 * Department Budget, Special Budget, Student Fund, Hostel Funds, Alumni
 * Fund). The office then sent the real mapping, and it is **per office, not
 * per class of office**: the Director's Office draws on the Institute Grant,
 * a department office on its department's budget, the Students Section on the
 * student and hostel funds, IAR on the alumni fund, and the Sports Officer on
 * the grant alone. No class boundary separates those - `office_class`
 * (officer / department) cuts the list in the wrong place, and the six-head
 * list offered every office five budgets it has no authority over.
 *
 * So this table is a **ceiling per mailbox**, laid over the Settings list
 * rather than replacing it ({@link narrowToOffice}): Settings can still take a
 * head away from every office at once, this takes away the ones a particular
 * office may not touch, and neither can widen the other.
 *
 * **Project Grant and Personal Funds are on no row.** The spreadsheet has no
 * column for either, which is the office saying an office does not spend
 * them: a project is held by the investigator, and an office has no private
 * money. Neither was in the offices' lists before this, so nothing changed there -
 * but it is why there are six columns and nine heads.
 *
 * The key is the **mailbox before `@iitpkd.ac.in`**, as the spreadsheet gives
 * it, because that is the account that signs in. Until the institute's real
 * office accounts are loaded (LDAP, then Users & Roles → Import from
 * spreadsheet) the demo personas sit on different addresses, so each row may
 * also name {@link OfficeDebitRow.aliases} - which is how the Director's
 * Office persona on `admin@` is narrowed today. The whole table, and what
 * production has to do with it, is in
 * `.memories/06-production-requirements.md` §2.
 */
export type OfficeDebitRow = {
  /** The office as the spreadsheet names it. Several rows may share a name. */
  office: string;
  /** The mailbox before `@iitpkd.ac.in` - the spreadsheet's own key. */
  mailbox: string;
  /**
   * Addresses that are this office on some other account: a demo persona, or
   * an address the whitelist already carries. Matched the same way as the
   * mailbox, so the row works before the real accounts exist.
   */
  aliases?: string[];
  /** The heads marked "Y", in {@link STANDARD_DEBIT_HEADS} order. */
  heads: DebitHead[];
};

const INSTITUTE_AND_SPECIAL: DebitHead[] = ["institute_grant", "special_budget"];
const DEPARTMENT_AND_SPECIAL: DebitHead[] = ["department_budget", "special_budget"];
const SPECIAL_ONLY: DebitHead[] = ["special_budget"];

/**
 * The spreadsheet, transcribed. Grouped as it groups them, in its order, so a
 * line here can be read against the line there.
 */
export const OFFICE_DEBIT_HEADS: OfficeDebitRow[] = [
  // The Director's Office is the officer office the demo build books as
  // (`admin@`, profile "Director's Office"); `director.office@` is on the
  // whitelist from `DEFAULT_OFFICIAL_EMAILS`.
  { office: "Director Office", mailbox: "director_iitpkd", aliases: ["admin", "director.office"], heads: INSTITUTE_AND_SPECIAL },

  { office: "Administration", mailbox: "office_deanadmn", heads: INSTITUTE_AND_SPECIAL },
  { office: "Administration", mailbox: "ro", aliases: ["registrar"], heads: INSTITUTE_AND_SPECIAL },
  { office: "Administration", mailbox: "personnel", heads: INSTITUTE_AND_SPECIAL },
  { office: "Administration", mailbox: "people", heads: INSTITUTE_AND_SPECIAL },
  { office: "Administration", mailbox: "recruitment", heads: INSTITUTE_AND_SPECIAL },

  { office: "Academics", mailbox: "academic", heads: INSTITUTE_AND_SPECIAL },
  { office: "Academics", mailbox: "acadresearch", heads: INSTITUTE_AND_SPECIAL },
  { office: "Finance & Accounts", mailbox: "accounts", heads: INSTITUTE_AND_SPECIAL },
  { office: "Stores & Purchase Section", mailbox: "purchase", heads: INSTITUTE_AND_SPECIAL },
  { office: "ICSR", mailbox: "icsr", heads: INSTITUTE_AND_SPECIAL },

  // The one office that may spend the student and hostel funds.
  { office: "Students Section", mailbox: "office_studentssection", heads: ["special_budget", "student_fund", "hostel_funds"] },

  { office: "CCE", mailbox: "cce", heads: SPECIAL_ONLY },
  { office: "Placement Cell/Career Development Cell", mailbox: "tpo", heads: SPECIAL_ONLY },
  { office: "Placement Cell/Career Development Cell", mailbox: "placements", heads: SPECIAL_ONLY },

  // The IAR Office's own mailbox. Its *alumni* bookings are already narrowed
  // to the same two heads by the `alumni` category, so this row matters for
  // its official ones.
  { office: "International & Alumni Relations", mailbox: "iar", heads: ["special_budget", "alumni_fund"] },

  { office: "Outreach", mailbox: "eduoutreach", heads: SPECIAL_ONLY },
  { office: "EWD", mailbox: "ewd", heads: INSTITUTE_AND_SPECIAL },
  { office: "CET", mailbox: "cet", heads: SPECIAL_ONLY },

  // The eleven department offices: their department's budget, not the grant.
  { office: "Biological Sciences and Engineering", mailbox: "office_bse", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Chemistry", mailbox: "office_cy", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Civil Engineering", mailbox: "office_ce", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Computer Science and Engineering", mailbox: "office_cs", aliases: ["cse.office"], heads: DEPARTMENT_AND_SPECIAL },
  { office: "Data Science", mailbox: "office_ds", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Electrical Engineering", mailbox: "office_ee", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Humanities and Social Sciences", mailbox: "office_hss", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Materials and Metallurgical Engineering", mailbox: "office_mm", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Mathematics", mailbox: "office_ma", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Mechanical Engineering", mailbox: "office_me", heads: DEPARTMENT_AND_SPECIAL },
  { office: "Physics", mailbox: "office_ph", heads: DEPARTMENT_AND_SPECIAL },

  { office: "Institute Clinic", mailbox: "mo", heads: SPECIAL_ONLY },
  // The only row with the grant and nothing else.
  { office: "Sports & Physical Education", mailbox: "sportsofficer", heads: ["institute_grant"] },
  { office: "Security", mailbox: "security", heads: SPECIAL_ONLY },
  // And the only row with the hostel funds alone.
  { office: "Hostel", mailbox: "hostelmanager", heads: ["hostel_funds"] },
];

/** The mailbox before the `@`, lowercased. `null` for anything that is not an address. */
function mailboxOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  const local = (at === -1 ? email : email.slice(0, at)).trim().toLowerCase();
  return local.length > 0 ? local : null;
}

const BY_MAILBOX: Map<string, OfficeDebitRow> = new Map(
  OFFICE_DEBIT_HEADS.flatMap((row) =>
    [row.mailbox, ...(row.aliases ?? [])].map((key) => [key.toLowerCase(), row] as const)
  )
);

/** The office this address is, or null when it is not on the spreadsheet. */
export function officeDebitRowFor(email: string | null | undefined): OfficeDebitRow | null {
  const mailbox = mailboxOf(email);
  return mailbox ? (BY_MAILBOX.get(mailbox) ?? null) : null;
}

/**
 * The heads this office may charge, or null when the address is not on the
 * spreadsheet - which is the honest answer for an office the office has not
 * mapped yet, and leaves the Settings list alone rather than guessing a
 * narrower one.
 */
export function officeDebitHeads(email: string | null | undefined): DebitHead[] | null {
  return officeDebitRowFor(email)?.heads ?? null;
}

/**
 * The Settings list narrowed to what this office may actually charge.
 *
 * An intersection, kept in the `allowed` list's order so the form offers the
 * heads in the order Settings lists them. An address not on the spreadsheet
 * gets the list unchanged.
 *
 * An empty result is returned as such rather than falling back: it means
 * Settings has taken away every head this office had, and the booking form
 * says so ("No debitable head is set up for this kind of booking"). Widening
 * it back would charge a budget the office has no authority over, which is
 * the thing this table exists to stop.
 */
export function narrowToOffice(allowed: DebitHead[], email: string | null | undefined): DebitHead[] {
  const heads = officeDebitHeads(email);
  if (!heads) return allowed;
  return allowed.filter((head) => heads.includes(head));
}
