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
import { getStore } from "@/lib/store";
import type { BookingStatus, Profile, Role, RoomType } from "@/lib/types";
import { REQUESTER_ROLES, ROLE_LABELS } from "@/lib/types";
import { occupancyNotStartedError } from "@/lib/workflow";
import type { ActionResult } from "./bookings";

/**
 * Every admin mutation funnels through here, so the console password is
 * enforced on the **actions**, not merely by hiding the UI. A crafted request
 * with a developer persona cookie but no unlock still gets nothing.
 */
async function requireDeveloper(): Promise<Profile> {
  const user = await requireUser();
  if (user.role !== "developer") throw new Error("Developer access required");
  if (!(await isAdminUnlocked())) {
    throw new Error("Developer console is locked — enter the console password again");
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
    if (user.role !== "developer") return { ok: false, error: "Developer access required" };

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
    await requireDeveloper();

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
    await requireDeveloper();
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
    await requireDeveloper();
    await getStore().deleteFormConfig(role);
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- guest houses & rooms

export async function createGuestHouseAction(name: string): Promise<ActionResult> {
  try {
    await requireDeveloper();
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
    await requireDeveloper();
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
    await requireDeveloper();
    await getStore().updateGuestHouse(id, { serves_meals: servesMeals === true });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGuestHouseAction(id: string): Promise<ActionResult> {
  try {
    await requireDeveloper();
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
    await requireDeveloper();
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
    await requireDeveloper();
    await getStore().updateRoom(id, { is_active: isActive });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRoomAction(id: string): Promise<ActionResult> {
  try {
    await requireDeveloper();
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
});

export type UserFormInput = z.input<typeof userSchema>;

export async function createUserAction(input: UserFormInput): Promise<ActionResult> {
  try {
    await requireDeveloper();
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid user" };
    await getStore().createProfile(parsed.data);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(id: string, input: UserFormInput): Promise<ActionResult> {
  try {
    const dev = await requireDeveloper();
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid user" };
    if (id === dev.id && parsed.data.role !== "developer") {
      return { ok: false, error: "You cannot remove your own developer role" };
    }
    await getStore().updateProfile(id, parsed.data);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUserAction(id: string): Promise<ActionResult> {
  try {
    const dev = await requireDeveloper();
    if (id === dev.id) return { ok: false, error: "You cannot delete your own account" };
    await getStore().deleteProfile(id);
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- bookings

export async function adminDeleteBookingAction(id: string): Promise<ActionResult> {
  try {
    await requireDeveloper();
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
    const dev = await requireDeveloper();
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
