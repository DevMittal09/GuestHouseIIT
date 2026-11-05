import { z } from "zod";
import { splitCsvLine } from "./academic/stored";
import { isInstituteEmail, LOGIN_DOMAIN, STUDENT_EMAIL_DOMAIN } from "./site";
import { toInstituteDateValue } from "./tz";
import { ROLE_LABELS, type BookingStatus, type Profile, type Role } from "./types";
import type { Unit } from "./units";

/**
 * **User groups, and who may sign in** (5 Nov 2026, the owner).
 *
 * The institute's people come in batches - BTech 2023, PhD 2022, the faculty -
 * so the office loads them as one, says who a group's bookings copy, and stops
 * a batch signing in when it graduates. A group is a **programme and batch**
 * for students, so a student stays in one group for their whole course and the
 * year they are in is worked out rather than stored: nobody has to move anyone
 * every July. Everyone else is a named group ("Faculty").
 *
 * A person is in **at most one** group. Someone in none behaves exactly as
 * before this existed - the groups are an addition, not a new requirement.
 *
 * Each group holds three lists: its **members** (`profiles.group_id`), the
 * addresses **filled in** on their booking form's Copy to, which they may
 * remove, and the addresses they **may type** there.
 *
 * Nobody is deleted. An account is blocked (`profiles.login_disabled_at`), which
 * stops it signing in and ends any session it already has, and its bookings and
 * invoices stay exactly as they were. Restoring access clears the timestamp.
 *
 * Pure, like `lib/users-import.ts`, so the console can show a plan before
 * anything happens and the tests need no store.
 */

// --------------------------------------------------------------- programmes

export const PROGRAMMES = ["BTech", "MTech", "MSc", "MS", "PhD"] as const;
export type Programme = (typeof PROGRAMMES)[number];

export const PROGRAMME_LABELS: Record<Programme, string> = {
  BTech: "B.Tech",
  MTech: "M.Tech",
  MSc: "M.Sc",
  MS: "MS",
  PhD: "PhD",
};

/** The sixth character of a roll number, as the office gave it on 31 Oct 2026. */
export const PROGRAMME_ROLL_DIGIT: Record<Programme, string> = {
  BTech: "1",
  MTech: "2",
  MS: "3",
  PhD: "4",
  MSc: "5",
};

/** Years a course normally runs. A research degree has no fixed end. */
const PROGRAMME_YEARS: Record<Programme, number | null> = {
  BTech: 4,
  MTech: 2,
  MSc: 2,
  MS: null,
  PhD: null,
};

/**
 * **MS and PhD join twice a year, in January and in August** (5 Nov 2026, the
 * owner), so each intake is its own batch. Every other programme joins once.
 */
export const INTAKES = ["jan", "aug"] as const;
export type Intake = (typeof INTAKES)[number];

export const INTAKE_LABELS: Record<Intake, string> = { jan: "Jan", aug: "Aug" };

export function hasIntakes(programme: Programme | null | undefined): boolean {
  return programme === "MS" || programme === "PhD";
}

// -------------------------------------------------------------------- group

export type UserGroup = {
  id: string;
  name: string;
  /** What everyone in the group is on the portal. */
  role: Role;
  /** Both set for a student batch, both null for a named group. */
  programme: Programme | null;
  batch_year: number | null;
  /** January or August, for MS and PhD only. */
  intake: Intake | null;
  /** Filled in on the booking form's Copy to; the requester may remove them. */
  prefill_copy_to: string[];
  /** What the requester may type there. Empty: any IIT Palakkad address. */
  allowed_copy_to: string[];
  created_at: string;
};

export type NewUserGroup = Omit<UserGroup, "id" | "created_at">;

/** "B.Tech 2023 batch" - the name of a student group, so no two spell it apart. */
export function batchGroupName(
  programme: Programme,
  batchYear: number,
  intake?: Intake | null
): string {
  const when = intake ? `${INTAKE_LABELS[intake]} ` : "";
  return `${PROGRAMME_LABELS[programme]} ${when}${batchYear} batch`;
}

const addressList = z
  .array(z.string().trim().toLowerCase())
  .max(50, "Keep each list to 50 addresses")
  .transform((list) => [...new Set(list.filter(Boolean))])
  .superRefine((list, ctx) => {
    const wrong = list.find((address) => !isInstituteEmail(address));
    if (wrong) {
      ctx.addIssue({
        code: "custom",
        message: `${wrong} is not an IIT Palakkad address - every address here must be on the institute's domain`,
      });
    }
  });

export const userGroupSchema = z
  .object({
    name: z.string().trim().max(80, "Keep the name under 80 characters"),
    // Never the developer: a group's role is handed out by a CSV, and that door
    // must not open onto the one role a manager may not assign.
    role: z.custom<Role>(
      (v) => typeof v === "string" && Object.hasOwn(ROLE_LABELS, v) && v !== "developer",
      "Choose what the group's members are"
    ),
    programme: z.enum(PROGRAMMES).nullable(),
    batch_year: z.coerce.number().int().min(2000).max(2100).nullable(),
    intake: z.enum(INTAKES).nullish(),
    prefill_copy_to: addressList,
    allowed_copy_to: addressList,
  })
  .superRefine((group, ctx) => {
    if (group.role === "student" && (!group.programme || !group.batch_year)) {
      ctx.addIssue({ code: "custom", message: "A student group needs a programme and a batch year" });
    }
    if (group.role === "student" && hasIntakes(group.programme) && !group.intake) {
      ctx.addIssue({ code: "custom", message: "Say whether this batch joined in January or August" });
    }
    if (group.role !== "student" && group.name.length < 2) {
      ctx.addIssue({ code: "custom", message: "Give the group a name" });
    }
  })
  .transform((group): NewUserGroup => {
    const batch = group.role === "student" && group.programme && group.batch_year;
    const intake = batch && hasIntakes(group.programme) ? (group.intake ?? null) : null;
    return {
      ...group,
      // Derived, so "BTech 2023" and "B.Tech 2023 batch" cannot both exist.
      name: batch ? batchGroupName(group.programme!, group.batch_year!, intake) : group.name,
      programme: batch ? group.programme : null,
      batch_year: batch ? group.batch_year : null,
      intake,
    };
  });

/**
 * Which year of the course a batch is in on this date, or null for a named
 * group. The academic year turns over in **July** (the owner, 5 Nov 2026), so
 * the 2023 batch is in its second year from July 2024. An MS or PhD batch counts
 * from the month it joined: January's from January, August's from August.
 * Nothing stores this, and nothing is decided by it: it is a label for the
 * manager, who ends a batch's access themselves.
 */
export function studyYear(
  batchYear: number | null,
  on: Date = new Date(),
  intake: Intake | null = null
): number | null {
  if (batchYear === null) return null;
  const [year, month] = toInstituteDateValue(on).split("-").map(Number);
  const turnover = intake === "jan" ? 1 : intake === "aug" ? 8 : 7;
  return Math.max(1, year - batchYear + (month >= turnover ? 1 : 0));
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** "3rd year", or "past its 2 years" for a batch that should have graduated. */
export function studyYearLabel(
  group: Pick<UserGroup, "programme" | "batch_year"> & { intake?: Intake | null },
  on: Date = new Date()
): string | null {
  const year = studyYear(group.batch_year, on, group.intake ?? null);
  if (year === null || !group.programme) return null;
  const length = PROGRAMME_YEARS[group.programme];
  if (length !== null && year > length) return `past its ${length} years`;
  return `${ORDINALS[year - 1] ?? `${year}th`} year`;
}

// ------------------------------------------------------------------ copy to

/** What a requester's group says about the Copy to box on their form. */
export type CopyToRule = {
  prefill: string[];
  /** Null: not limited to a list. Lower-cased. */
  allowed: string[] | null;
  /** A group's member copies institute addresses only. */
  instituteOnly: boolean;
};

export const NO_COPY_TO_RULE: CopyToRule = { prefill: [], allowed: null, instituteOnly: false };

/**
 * The rule for one requester. Whatever is filled in is allowed by definition,
 * as is `alsoAllowed` - a council secretary's mailbox the form fills in on a
 * club's booking - or the form would pre-fill an address it then refuses.
 */
export function copyToRuleFor(
  group: Pick<UserGroup, "prefill_copy_to" | "allowed_copy_to"> | null | undefined,
  alsoAllowed: string[] = []
): CopyToRule {
  if (!group) return NO_COPY_TO_RULE;
  const prefill = group.prefill_copy_to;
  return {
    prefill,
    allowed:
      group.allowed_copy_to.length > 0
        ? [...new Set([...group.allowed_copy_to, ...prefill, ...alsoAllowed].map((a) => a.toLowerCase()))]
        : null,
    instituteOnly: true,
  };
}

/** Why this address may not be copied under this rule, or null when it may. */
export function copyToAddressError(address: string, rule: CopyToRule): string | null {
  const wanted = address.trim().toLowerCase();
  if (rule.allowed) {
    return rule.allowed.includes(wanted)
      ? null
      : `${address} is not on your group's list of addresses that can be copied`;
  }
  if (rule.instituteOnly && !isInstituteEmail(wanted)) {
    return "Use an IIT Palakkad address";
  }
  return null;
}

// --------------------------------------------------------- who is blocked

export function isLoginBlocked(profile: Pick<Profile, "login_disabled_at">): boolean {
  return Boolean(profile.login_disabled_at);
}

/** One sentence for every sign-in door. Safe to say: their identity is proved. */
export const LOGIN_BLOCKED_MESSAGE =
  "Your access to the guest house portal has ended. If this is a mistake, contact the guest house office.";

export const LOGIN_DOMAIN_MESSAGE =
  "Only IIT Palakkad email addresses can sign in to the guest house portal.";

/**
 * **Why this account may not sign in, or null when it may** (5 Nov 2026, the
 * owner: "only IIT Palakkad emails can log in, no one else"). The one rule for
 * every door and for every request, so an account holding any other address is
 * refused however it got there - Google checked this already, LDAP and the
 * account picker did not.
 */
export function signInRefusal(profile: Pick<Profile, "email" | "login_disabled_at">): string | null {
  if (!isInstituteEmail(profile.email)) return LOGIN_DOMAIN_MESSAGE;
  if (isLoginBlocked(profile)) return LOGIN_BLOCKED_MESSAGE;
  return null;
}

/**
 * Why this address is wrong for this kind of account, or null when it is right
 * (`STUDENT_EMAIL_DOMAIN`). A student's roll number is the first half of their
 * address, so a sheet where the two disagree holds a mistake in one of them, and
 * a later list of roll numbers would miss that person.
 */
export function emailFormatError(role: Role, email: string, rollNumber?: string | null): string | null {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  const local = address.slice(0, at);
  const host = address.slice(at + 1);
  if (role === "student") {
    if (host !== STUDENT_EMAIL_DOMAIN) {
      return `${email} - a student's address is <roll number>@${STUDENT_EMAIL_DOMAIN}`;
    }
    const roll = rollNumber?.trim().toLowerCase();
    if (roll && roll !== local) {
      return `${email} - the roll number ${rollNumber} does not match the address`;
    }
    return null;
  }
  return host === LOGIN_DOMAIN ? null : `${email} - this kind of account uses an @${LOGIN_DOMAIN} address`;
}

/** The roll number a student's address carries, for a sheet with no such column. */
export function rollNumberFromEmail(email: string): string | null {
  const address = email.trim().toLowerCase();
  const suffix = `@${STUDENT_EMAIL_DOMAIN}`;
  return address.endsWith(suffix) ? address.slice(0, -suffix.length) || null : null;
}

/** Requests that may still happen, so blocking the requester deserves a warning. */
const FINISHED: BookingStatus[] = [
  "REJECTED",
  "CANCELLED",
  "VACATED",
  "CANCELLATION_APPROVED",
  "MISSED",
];

// ------------------------------------------------------------- reading lists

const IDENTIFIER_HEADERS = ["roll", "roll no", "roll no.", "roll number", "roll_number", "email", "email address", "e-mail", "mail"];

/**
 * The roll numbers or addresses in what the office sent - one per line, a
 * comma-separated line, or a whole spreadsheet. A sheet whose first line names
 * a roll number or email column is read from that column alone, so the names
 * beside it are not mistaken for people.
 */
export function parseIdentifiers(text: string): string[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => splitCsvLine(line.replace(/[;\t]/g, ",")).map((cell) => cell.trim()));
  if (rows.length === 0) return [];

  const headerAt = rows[0].findIndex((cell) => IDENTIFIER_HEADERS.includes(cell.toLowerCase()));
  const values =
    headerAt >= 0
      ? rows.slice(1).map((row) => row[headerAt] ?? "")
      : rows.flat().flatMap((cell) => cell.split(/\s+/));
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Lookup = { found: Profile } | { problem: string } | null;

function lookupIn(profiles: Profile[]) {
  const byEmail = new Map(profiles.map((p) => [p.email.trim().toLowerCase(), p]));
  const byRoll = new Map<string, Profile[]>();
  for (const profile of profiles) {
    const roll = profile.roll_number?.trim().toLowerCase();
    if (roll) byRoll.set(roll, [...(byRoll.get(roll) ?? []), profile]);
  }
  return (identifier: string): Lookup => {
    const key = identifier.toLowerCase();
    if (key.includes("@")) {
      const found = byEmail.get(key);
      return found ? { found } : null;
    }
    const matches = byRoll.get(key) ?? [];
    if (matches.length > 1) {
      return { problem: `${identifier} - held by ${matches.map((m) => m.email).join(" and ")}. Use the email address.` };
    }
    if (matches[0]) return { found: matches[0] };
    // An account whose roll number was never filled in is still findable: the
    // address is the roll number.
    const student = byEmail.get(`${key}@${STUDENT_EMAIL_DOMAIN}`);
    return student ? { found: student } : null;
  };
}

// --------------------------------------------------------------- block plan

export type AccessAction = "block" | "restore";

export type AccessTarget = {
  id: string;
  email: string;
  full_name: string;
  roll_number: string | null;
};

export type AccessPlan = {
  action: AccessAction;
  targets: AccessTarget[];
  /** Roll numbers and addresses that match nobody. */
  notFound: string[];
  /** Already blocked, or already able to sign in. */
  alreadyDone: string[];
  /** Will not be changed, and why. */
  refused: string[];
  /** Will be changed, and the manager should know what that leaves behind. */
  warnings: string[];
};

export type AccessContext = {
  profiles: Profile[];
  actorId: string;
  /** The console's own per-account rule (`userEditError`). */
  locked?: (profile: Profile) => string | null;
  /** Every booking; only live ones produce a warning. */
  bookings?: {
    user_id: string;
    booking_reference_id: string;
    status: BookingStatus;
    check_out: string;
  }[];
  units?: Unit[];
  now?: Date;
};

/** Roles nobody may lock the last holder of: it would shut the console itself. */
const LAST_HOLDER_ROLES: Role[] = ["gh_manager", "developer"];

/**
 * What a list would do, without doing it. Unknown roll numbers are named and
 * the rest go ahead - a list from the academic office routinely holds people
 * who never had an account, and stopping for them would help nobody.
 *
 * **Bookings stand.** A person with a stay still to come is blocked all the
 * same, and named here so the manager can decide what to do about it.
 */
export function planAccessChange(
  action: AccessAction,
  text: string,
  context: AccessContext
): AccessPlan {
  const { profiles, actorId, locked, bookings = [], units = [], now = new Date() } = context;
  const find = lookupIn(profiles);
  const plan: AccessPlan = { action, targets: [], notFound: [], alreadyDone: [], refused: [], warnings: [] };
  const chosen: Profile[] = [];
  const seen = new Set<string>();

  for (const identifier of parseIdentifiers(text)) {
    const result = find(identifier);
    if (!result) {
      plan.notFound.push(identifier);
      continue;
    }
    if ("problem" in result) {
      plan.refused.push(result.problem);
      continue;
    }
    const profile = result.found;
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    if (isLoginBlocked(profile) === (action === "block")) {
      plan.alreadyDone.push(profile.email);
      continue;
    }
    if (action === "block" && profile.id === actorId) {
      plan.refused.push(`${profile.email} - you cannot block your own account`);
      continue;
    }
    const stop = locked?.(profile);
    if (stop) {
      plan.refused.push(`${profile.email} - ${stop}`);
      continue;
    }
    chosen.push(profile);
  }

  if (action === "block") {
    for (const role of LAST_HOLDER_ROLES) {
      const leaving = chosen.filter((p) => p.role === role);
      if (leaving.length === 0) continue;
      const staying = profiles.some(
        (p) => p.role === role && !isLoginBlocked(p) && !leaving.includes(p)
      );
      if (!staying) {
        plan.refused.push(
          `${leaving.map((p) => p.email).join(", ")} - nobody else could use the console. Appoint someone first.`
        );
        for (const p of leaving) chosen.splice(chosen.indexOf(p), 1);
      }
    }
    const going = new Set(chosen.map((p) => p.id));
    for (const booking of bookings) {
      if (!going.has(booking.user_id)) continue;
      if (FINISHED.includes(booking.status) || new Date(booking.check_out) <= now) continue;
      const owner = chosen.find((p) => p.id === booking.user_id)!;
      plan.warnings.push(`${owner.full_name} has ${booking.booking_reference_id} still to come - it stays booked.`);
    }
    for (const person of chosen) {
      if (person.role === "warden") {
        plan.warnings.push(`${person.full_name} is an Assistant Warden - appoint a replacement, or requests will wait at that stage.`);
      }
      for (const unit of units) {
        if (unit.head_id === person.id || unit.acting_head_id === person.id) {
          plan.warnings.push(`${person.full_name} heads ${unit.name} - appoint a replacement, or its approvals will wait.`);
        }
        if (unit.faculty_advisor_id === person.id) {
          plan.warnings.push(`${person.full_name} is Faculty Advisor of ${unit.name} - appoint a replacement, or it cannot book.`);
        }
      }
    }
  }

  plan.targets = chosen.map(({ id, email, full_name, roll_number }) => ({ id, email, full_name, roll_number }));
  return plan;
}

// ------------------------------------------------------------- member plan

export type MemberPlan = {
  add: AccessTarget[];
  /** Moved here from another group, which is allowed and worth saying. */
  moved: string[];
  alreadyIn: string[];
  /** No account yet: a new person comes in through the CSV, with their name. */
  notFound: string[];
  refused: string[];
};

/** What adding these people by hand would do. */
export function planGroupMembers(
  group: Pick<UserGroup, "id" | "role">,
  text: string,
  profiles: Profile[],
  groups: Pick<UserGroup, "id" | "name">[],
  locked?: (profile: Profile) => string | null
): MemberPlan {
  const find = lookupIn(profiles);
  const plan: MemberPlan = { add: [], moved: [], alreadyIn: [], notFound: [], refused: [] };
  const seen = new Set<string>();
  for (const identifier of parseIdentifiers(text)) {
    const result = find(identifier);
    if (!result) {
      plan.notFound.push(identifier);
      continue;
    }
    if ("problem" in result) {
      plan.refused.push(result.problem);
      continue;
    }
    const p = result.found;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (p.group_id === group.id) {
      plan.alreadyIn.push(p.email);
      continue;
    }
    const stop = locked?.(p);
    if (stop) {
      plan.refused.push(`${p.email} - ${stop}`);
      continue;
    }
    if (p.role !== group.role) {
      plan.refused.push(`${p.email} - a different kind of account from this group. Change their role in Users & Roles first.`);
      continue;
    }
    if (p.group_id) {
      const from = groups.find((g) => g.id === p.group_id)?.name ?? "another group";
      plan.moved.push(`${p.email} moves from ${from}`);
    }
    plan.add.push({ id: p.id, email: p.email, full_name: p.full_name, roll_number: p.roll_number });
  }
  return plan;
}

// ----------------------------------------------------------- the CSV format

/** The template a group's list is filled in on. */
export function groupCsvHeader(role: Role): string {
  return role === "employee"
    ? "email,full_name,roll_number,department_or_club,staff_category,unit,ldap_uid"
    : role === "student"
      ? "email,full_name,roll_number,hostel_name,department_or_club,ldap_uid"
      : "email,full_name,department_or_club,unit,ldap_uid";
}

/**
 * Roll numbers that do not look like this batch's programme. A warning rather
 * than a refusal: the digit is a convention, and the office knows its own list.
 */
export function programmeMismatches(
  group: Pick<UserGroup, "programme">,
  rows: { email: string; roll_number: string | null }[]
): string[] {
  if (!group.programme) return [];
  const digit = PROGRAMME_ROLL_DIGIT[group.programme];
  return rows
    .filter((row) => {
      const roll = row.roll_number?.trim() ?? "";
      return roll.length >= 6 && roll[5] !== digit;
    })
    .map((row) => `${row.email} - roll number ${row.roll_number} does not read as ${PROGRAMME_LABELS[group.programme!]}`);
}
