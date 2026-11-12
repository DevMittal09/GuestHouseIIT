import "server-only";

import type { Gender, Profile } from "./types";
import type { SelfDetails } from "./self-details";
import { getStore } from "./store";

const VALID_GENDERS: Gender[] = ["male", "female", "other"];

function normalizeGender(raw: string | null | undefined): Gender | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (VALID_GENDERS.includes(lower as Gender)) return lower as Gender;
  if (lower === "m") return "male";
  if (lower === "f") return "female";
  return null;
}

/**
 * Build self-details for a requester from the profile and the institute
 * tables. Called once on the server and handed to the form.
 */
export async function selfDetailsFor(user: Profile): Promise<SelfDetails> {
  const store = getStore();
  const name = user.full_name?.trim() || null;

  try {
    if (user.role === "student") {
      const student = await store.findStudent(user.email);
      return {
        name: student?.full_name?.trim() || name,
        gender: null,
        id_number: student?.aadhar_number?.trim() || null,
      };
    }
    if (
      user.role === "employee" ||
      user.role === "warden" ||
      user.role === "deputy_warden" ||
      user.role === "assistant_warden"
    ) {
      const employee = await store.findEmployee(user.email);
      return {
        name: employee?.full_name?.trim() || name,
        gender: normalizeGender(employee?.gender),
        id_number: null,
      };
    }
  } catch {
    // Institute table missing or unreachable - fall back to profile only.
  }

  return { name, gender: null, id_number: null };
}
