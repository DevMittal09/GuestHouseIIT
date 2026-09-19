import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import type { DirectoryEntry } from "./types";

/**
 * Which portal account a verified directory entry belongs to.
 *
 * `profiles.ldap_uid` first — set from the developer console, one at a time or
 * by bulk import. Then, only when `LDAP_LINK_BY_EMAIL=true`, the profile whose
 * email is the entry's `mail` attribute, provided that profile has no LDAP
 * username yet; the uid is recorded on it, so from then on it is an ordinary
 * `ldap_uid` match. That lets real LDAP accounts attach themselves to the
 * portal's existing users on first sign-in instead of being typed in.
 *
 * Off by default because it trusts the directory's `mail` to be set by the
 * institute, not by the user — confirm that with the LDAP administrators
 * before enabling it.
 *
 * Matching in memory rather than adding a `getProfileByLdapUid` keeps this off
 * the `DataStore` interface, which would otherwise need implementing twice.
 * Lives here rather than in `app/actions/auth.ts` because every export of a
 * "use server" module is a callable endpoint.
 */
export async function profileForDirectoryEntry(entry: DirectoryEntry): Promise<Profile | null> {
  const store = getStore();
  const profiles = await store.listProfiles();
  const linked = profiles.find((p) => p.ldap_uid?.toLowerCase() === entry.uid);
  if (linked) return linked;

  if (process.env.LDAP_LINK_BY_EMAIL !== "true" || !entry.mail) return null;
  const mail = entry.mail.trim().toLowerCase();
  const byEmail = profiles.find((p) => p.email.toLowerCase() === mail && !p.ldap_uid);
  if (!byEmail) return null;
  await store.updateProfile(byEmail.id, { ldap_uid: entry.uid });
  console.info(`[auth] linked LDAP uid ${entry.uid} to ${byEmail.email} by email`);
  return { ...byEmail, ldap_uid: entry.uid };
}
