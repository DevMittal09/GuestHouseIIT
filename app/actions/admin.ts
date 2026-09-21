"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  checkAdminPassword,
  clearAttempts,
  grantAdminUnlock,
  isAdminUnlocked,
  recordFailedAttempt,
  revokeAdminUnlock,
  setAdminPassword,
  throttleCheck,
  validatePasswordChoice,
} from "@/lib/admin-lock";
import type { RoleFormConfig } from "@/lib/form-config";
import { planLdapUidImport } from "@/lib/ldap/import";
import { isValidLdapUid, LDAP_UID_ERROR, normalizeLdapUid } from "@/lib/ldap/uid";
import { mailConfig } from "@/lib/mail/config";
import { dispatchOutbox, drainOutbox } from "@/lib/mail/dispatch";
import { queueMessages } from "@/lib/mail/notify";
import type { MailStatus } from "@/lib/mail/types";
import { getStore } from "@/lib/store";
import type { BookingStatus, Profile, Role, RoomType } from "@/lib/types";
import { REQUESTER_ROLES, ROLE_LABELS } from "@/lib/types";
import { occupancyNotStartedError } from "@/lib/workflow";
import {
  assignableRoles,
  canUseConsole,
  canUseConsoleSection,
  CONSOLE_SECTIONS,
  userEditError,
  type ConsoleSection,
} from "@/lib/access";
import type { ActionResult } from "./bookings";

/**
 * Every console mutation funnels through here, so both gates are enforced on
 * the **actions**, not merely by hiding the UI: a crafted request with the
 * right cookie but no unlock, or with a manager's cookie against a
 * developer-only section, still gets nothing.
 *
 * The section is named at each call site rather than inferred, so adding an
 * action without deciding who may run it is not possible.
 */
async function requireConsole(section: ConsoleSection): Promise<Profile> {
  const user = await requireUser();
  if (!canUseConsoleSection(user.role, section)) {
    throw new Error(`You do not have access to ${CONSOLE_SECTIONS[section].label}`);
  }
  if (!(await isAdminUnlocked())) {
    throw new Error("The console is locked — enter the console password again");
  }
  return user;
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- console lock

/** Exchange the console password for an unlock cookie. */
export async function unlockAdminConsole(password: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    // Anyone with a console section may unlock it; which sections they then
    // see is `consoleSectionsFor`. The password is the door, not the roles.
    if (!canUseConsole(user.role)) return { ok: false, error: "Console access required" };

    const gate = throttleCheck(user.id);
    if (!gate.allowed) {
      return {
        ok: false,
        error: `Too many attempts — try again in ${gate.retryInSeconds}s`,
      };
    }

    if (!(await checkAdminPassword(password))) {
      recordFailedAttempt(user.id);
      return { ok: false, error: "Incorrect console password" };
    }

    clearAttempts(user.id);
    await grantAdminUnlock();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Drop the unlock without switching persona. */
export async function lockAdminConsole(): Promise<ActionResult> {
  await revokeAdminUnlock();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Change the console password. Requires the current one even though the caller
 * is already unlocked — an unlocked console left open should not let a passer-by
 * lock the real developer out.
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    await requireConsole("console_access");

    if (!(await checkAdminPassword(currentPassword))) {
      return { ok: false, error: "Current password is incorrect" };
    }
    const problem = validatePasswordChoice(newPassword);
    if (problem) return { ok: false, error: problem };
    if (await checkAdminPassword(newPassword)) {
      return { ok: false, error: "That is already the current password" };
    }

    await setAdminPassword(newPassword);
    // The unlock cookie is signed with the old hash, so it is now invalid —
    // mint a fresh one so the developer is not thrown out of their own session.
    await grantAdminUnlock();
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- form configs

const fieldMode = z.enum(["required", "optional", "hidden"]);

const formConfigSchema = z.object({
  role: z.enum(REQUESTER_ROLES as [Role, ...Role[]]),
  allowed_guest_house_ids: z.array(z.string()),
  guest_fields: z.object({
    name: fieldMode,
    age: fieldMode,
    gender: fieldMode,
    relationship: fieldMode,
    id_number: fieldMode,
    id_document: fieldMode,
  }),
  relationship_style: z.enum(["dropdown", "free_text"]),
  relationship_options: z.array(z.string().trim().min(1)).max(30),
  parent_relationships: z.array(z.string().trim().min(1)).max(30).default([]),
  dependent_relationships: z.array(z.string().trim().min(1)).max(30).default([]),
  alumni_card: fieldMode,
  banner_text: z.string().trim().max(200).nullable(),
  custom_fields: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().trim().min(1, "Custom fields need a label").max(120),
        type: z.enum(["text", "textarea", "number", "date", "select", "checkbox"]),
        options: z.array(z.string().trim().min(1)).max(30),
        required: z.boolean(),
      })
    )
    .max(20),
});

export async function saveRoleFormConfig(config: RoleFormConfig): Promise<ActionResult> {
  try {
    await requireConsole("forms");
    const parsed = formConfigSchema.safeParse(config);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid configuration" };
    }
    for (const f of parsed.data.custom_fields) {
      if (f.type === "select" && f.options.length === 0) {
        return { ok: false, error: `Dropdown field “${f.label}” needs at least one option` };
      }
    }
    if (
      parsed.data.relationship_style === "dropdown" &&
      parsed.data.guest_fields.relationship !== "hidden" &&
      parsed.data.relationship_options.length === 0
    ) {
      return { ok: false, error: "The relationship dropdown needs at least one option" };
    }
    // A dependency the requester cannot satisfy would make those options
    // permanently unselectable.
    if (parsed.data.dependent_relationships.length > 0 && parsed.data.parent_relationships.length === 0) {
      return {
        ok: false,
        error: "Pick at least one relationship that unlocks the restricted ones",
      };
    }
    const offered = new Set(parsed.data.relationship_options);
    const stray = [...parsed.data.parent_relationships, ...parsed.data.dependent_relationships].find(
      (r) => !offered.has(r)
    );
    if (stray) {
      return { ok: false, error: `“${stray}” is not one of the relationship dropdown options` };
    }
    const overlap = parsed.data.parent_relationships.find((r) =>
      parsed.data.dependent_relationships.includes(r)
    );
    if (overlap) {
      return { ok: false, error: `“${overlap}” cannot both unlock and be restricted` };
    }
    await getStore().saveFormConfig(parsed.data);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function resetRoleFormConfig(role: Role): Promise<ActionResult> {
  try {
    await requireConsole("forms");
    await getStore().deleteFormConfig(role);
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- guest houses & rooms

export async function createGuestHouseAction(name: string): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    const trimmed = name.trim();
    if (trimmed.length < 2) return { ok: false, error: "Guest house name is too short" };
    await getStore().createGuestHouse(trimmed);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function renameGuestHouseAction(id: string, name: string): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    const trimmed = name.trim();
    if (trimmed.length < 2) return { ok: false, error: "Guest house name is too short" };
    await getStore().updateGuestHouse(id, { name: trimmed });
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Whether requesters booking this guest house may choose meals. */
export async function setGuestHouseMealsAction(
  id: string,
  servesMeals: boolean
): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    await getStore().updateGuestHouse(id, { serves_meals: servesMeals === true });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGuestHouseAction(id: string): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    await getStore().deleteGuestHouse(id);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function createRoomAction(
  guestHouseId: string,
  roomNumber: string,
  roomType: RoomType
): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    const trimmed = roomNumber.trim();
    if (!trimmed) return { ok: false, error: "Room number is required" };
    await getStore().createRoom(guestHouseId, trimmed, roomType);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function setRoomActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    await getStore().updateRoom(id, { is_active: isActive });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRoomAction(id: string): Promise<ActionResult> {
  try {
    await requireConsole("guest_houses");
    await getStore().deleteRoom(id);
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- users

const userSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  full_name: z.string().trim().min(2, "Name is required"),
  // Derived from ROLE_LABELS rather than written out again: a hand-kept copy
  // of the role list silently rejected every newly added role.
  role: z.enum(Object.keys(ROLE_LABELS) as [Role, ...Role[]]),
  hostel_name: z.string().trim().transform((v) => v || null),
  department_or_club: z.string().trim().transform((v) => v || null),
  roll_number: z.string().trim().transform((v) => v || null),
  // The unit decides who approves for this person (lib/units.ts); blank means
  // they belong to none, and their requests route as if nobody were set.
  unit_id: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  // Only meaningful for employees: faculty official bookings wait for the HOD.
  staff_category: z
    .enum(["", "faculty", "staff"])
    .optional()
    .transform((v) => (v ? v : null)),
  // Optional: without one the person signs in only through the Google door.
  ldap_uid: z
    .string()
    .transform((v) => normalizeLdapUid(v) || null)
    .refine((v) => v === null || isValidLdapUid(v), LDAP_UID_ERROR),
});

export type UserFormInput = z.input<typeof userSchema>;

export async function createUserAction(input: UserFormInput): Promise<ActionResult> {
  try {
    const actor = await requireConsole("users");
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid user" };
    // A manager may appoint another manager — that is the point of giving
    // them this section — but not a developer. Otherwise "add an admin" is a
    // route to becoming one, and the section split would be decoration.
    const roleError = assignRoleError(actor, parsed.data.role);
    if (roleError) return { ok: false, error: roleError };
    await getStore().createProfile(parsed.data);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(id: string, input: UserFormInput): Promise<ActionResult> {
  try {
    const actor = await requireConsole("users");
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid user" };
    if (id === actor.id && parsed.data.role !== actor.role) {
      return { ok: false, error: "You cannot change your own role" };
    }
    // Both halves matter: a manager may not *edit* a developer's account, and
    // may not promote anyone into one.
    const target = await getStore().getProfile(id);
    if (!target) return { ok: false, error: "User not found" };
    const editError = userEditError(actor, target);
    if (editError) return { ok: false, error: editError };
    const roleError = assignRoleError(actor, parsed.data.role);
    if (roleError) return { ok: false, error: roleError };
    await getStore().updateProfile(id, parsed.data);
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Why this console user may not hand out that role, or null when they may. */
function assignRoleError(actor: Profile, role: Role): string | null {
  const allowed = assignableRoles(actor.role, Object.keys(ROLE_LABELS) as Role[]);
  if (allowed.includes(role)) return null;
  return `Only a developer can assign the ${ROLE_LABELS[role]} role`;
}

export type LdapImportResult =
  | { ok: true; updated: number; unchanged: number }
  | { ok: false; error: string; problems?: string[] };

/**
 * Bulk-load LDAP usernames onto existing accounts — how the institute's real
 * LDAP logins get into the portal. Planned by `planLdapUidImport` (all or
 * nothing); see there for the accepted format.
 */
export async function importLdapUidsAction(text: string): Promise<LdapImportResult> {
  try {
    await requireConsole("users");
    const store = getStore();
    const plan = planLdapUidImport(text, await store.listProfiles());
    if (plan.problems.length) {
      return { ok: false, error: "Nothing was changed — fix these lines and try again", problems: plan.problems };
    }
    if (plan.changes.length === 0 && plan.unchanged === 0) {
      return { ok: false, error: "No \"email, LDAP username\" lines found" };
    }
    // Two passes, so a uid moving from one account to another (a swap, or a
    // correction) never collides with itself under the unique index.
    for (const c of plan.changes) {
      if (c.from !== null) await store.updateProfile(c.id, { ldap_uid: null });
    }
    for (const c of plan.changes) await store.updateProfile(c.id, { ldap_uid: c.to });
    revalidatePath("/", "layout");
    return { ok: true, updated: plan.changes.length, unchanged: plan.unchanged };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function deleteUserAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireConsole("users");
    if (id === actor.id) return { ok: false, error: "You cannot delete your own account" };
    const target = await getStore().getProfile(id);
    if (!target) return { ok: false, error: "User not found" };
    const editError = userEditError(actor, target);
    if (editError) return { ok: false, error: editError };
    await getStore().deleteProfile(id);
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- bookings

export async function adminDeleteBookingAction(id: string): Promise<ActionResult> {
  try {
    await requireConsole("bookings");
    await getStore().deleteBooking(id);
    return done();
  } catch (e) {
    return fail(e);
  }
}

const OVERRIDABLE: BookingStatus[] = [
  "PENDING_WARDEN", "PENDING_FA", "PENDING_IAR", "PENDING_GH_MANAGER",
  "APPROVED", "REJECTED", "CANCELLED",
  "OCCUPIED", "VACATED", "CANCELLATION_REQUESTED", "CANCELLATION_APPROVED",
];

/** Force a booking into any status (audit-logged) — for unsticking workflows. */
export async function adminSetBookingStatusAction(
  id: string,
  status: BookingStatus,
  remark: string
): Promise<ActionResult> {
  try {
    const dev = await requireConsole("bookings");
    if (!OVERRIDABLE.includes(status)) return { ok: false, error: "Unknown status" };
    if (!remark.trim()) return { ok: false, error: "A remark is required for status overrides" };

    // The override exists to unstick a workflow, not to state something that
    // cannot be true. A guest cannot be in a room before their stay begins,
    // and a booking forced to OCCUPIED early is exactly how future bookings
    // came to read as occupied on the manager's console.
    if (status === "OCCUPIED") {
      const booking = await getStore().getBooking(id);
      if (!booking) return { ok: false, error: "Booking not found" };
      const tooEarly = occupancyNotStartedError(booking);
      if (tooEarly) return { ok: false, error: tooEarly };
    }
    await getStore().updateBookingStatus(
      id,
      { status },
      {
        action_by: dev.id,
        action_by_name: `${dev.full_name} (developer override)`,
        new_status: status,
        remarks: remark.trim(),
      }
    );
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- mail outbox

/**
 * The mail log, for the developer console.
 *
 * Developer-only, like everything else in this file — rendered bodies quote
 * guest names, purposes of visit and rejection reasons verbatim, so the outbox
 * is more sensitive than the bookings it describes.
 *
 * Bodies are deliberately **not** returned: the list answers "was this sent,
 * to whom, and did it fail", which needs a subject and a status, not 20 KB of
 * HTML per row.
 */
export async function listMailOutbox(
  status?: MailStatus
): Promise<
  | { ok: true; rows: MailOutboxSummary[]; counts: Record<MailStatus, number>; transport: string }
  | { ok: false; error: string }
> {
  try {
    await requireConsole("mail_outbox");
    const store = getStore();
    const [rows, counts] = await Promise.all([
      store.listEmails({ status, limit: 200 }),
      store.countEmailsByStatus(),
    ]);
    return {
      ok: true,
      counts,
      transport: mailConfig().transport,
      rows: rows.map((row) => ({
        id: row.id,
        booking_id: row.booking_id,
        event_key: row.event_key,
        to_emails: row.to_emails,
        cc_emails: row.cc_emails,
        subject: row.subject,
        status: row.status,
        attempts: row.attempts,
        last_error: row.last_error,
        scheduled_for: row.scheduled_for,
        sent_at: row.sent_at,
        created_at: row.created_at,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export type MailOutboxSummary = {
  id: string;
  booking_id: string | null;
  event_key: string;
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  status: MailStatus;
  attempts: number;
  last_error: string | null;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
};

/** Put a failed message back in the queue and try it immediately. */
export async function retryMailMessage(id: string): Promise<ActionResult> {
  try {
    await requireConsole("mail_outbox");
    await getStore().requeueEmail(id);
    await dispatchOutbox();
    return done();
  } catch (e) {
    return fail(e);
  }
}

/** Send whatever is queued now, rather than waiting for the cron. */
export async function flushMailOutbox(): Promise<
  { ok: true; sent: number; failed: number } | { ok: false; error: string }
> {
  try {
    await requireConsole("mail_outbox");
    const result = await drainOutbox();
    revalidatePath("/", "layout");
    return { ok: true, sent: result.sent, failed: result.failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/**
 * Prove the SMTP credentials and the route before trusting them.
 *
 * Goes through the queue like everything else rather than calling the
 * transport directly, so a successful test proves the *whole* path —
 * enqueue, claim, render, send — and not merely that a password is accepted.
 */
export async function sendTestEmail(): Promise<ActionResult> {
  try {
    const dev = await requireConsole("mail_outbox");
    const config = mailConfig();
    const now = new Date();

    const queued = await queueMessages([
      {
        eventKey: "desk.daily_report",
        booking: null,
        to: [dev.email],
        subjectText: "Guest house portal — mail test",
        standalone: true,
        // The instant, so a second test is a second message rather than a
        // duplicate the idempotency key swallows.
        stamp: `test:${now.toISOString()}`,
        doc: {
          heading: "Mail is configured correctly",
          preheader: `Test message sent via ${config.transport}.`,
          blocks: [
            {
              kind: "paragraph",
              text: "If you are reading this, the portal can queue, render and deliver mail. This message went through the outbox exactly like a real notification.",
            },
            {
              kind: "facts",
              rows: [
                ["Transport", config.transport],
                ["SMTP host", `${config.host}:${config.port}`],
                ["From", config.from],
                ["Reply-To", config.replyTo],
                ["Redirecting all mail to", config.redirectAllTo ?? "(not set — real recipients)"],
                ["Portal base URL", config.baseUrl],
                ["Requested by", `${dev.full_name} <${dev.email}>`],
              ],
            },
            ...(config.redirectAllTo
              ? []
              : [
                  {
                    kind: "callout" as const,
                    tone: "warning" as const,
                    title: "No redirect is set",
                    lines: [
                      "MAIL_REDIRECT_ALL_TO is empty, so notifications go to real requesters, wardens and parents. That is correct for production and wrong for anything else.",
                    ],
                  },
                ]),
          ],
        },
      },
    ]);

    if (queued === 0) return { ok: false, error: "Could not queue the test message" };
    // Queued messages normally leave via `after()`; here the developer is
    // waiting on the answer, so send within the action.
    const result = await dispatchOutbox();
    if (result.sent === 0 && result.failed > 0) {
      const [row] = await getStore().listEmails({ status: "FAILED", limit: 1 });
      return { ok: false, error: row?.last_error ?? "The test message could not be sent" };
    }
    return done();
  } catch (e) {
    return fail(e);
  }
}
