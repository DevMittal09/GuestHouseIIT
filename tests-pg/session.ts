import type { Profile } from "@/lib/types";

/** The account a test is acting as - read by the mocked `@/lib/auth`. */
let current: Profile | null = null;

export function signedIn(): Profile | null {
  return current;
}

export function setSignedIn(profile: Profile | null): void {
  current = profile;
}
