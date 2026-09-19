import type { Profile } from "@/lib/types";
import { isValidLdapUid, normalizeLdapUid } from "./uid";

export type LdapUidChange = { id: string; email: string; from: string | null; to: string };

export type LdapUidImportPlan = {
  changes: LdapUidChange[];
  /** Lines that already say what the profile has. */
  unchanged: number;
  /** One per bad line. Any problem means nothing is applied. */
  problems: string[];
};

/**
 * Plans a bulk "email → LDAP username" import from pasted text, for loading
 * the institute's real LDAP logins onto existing portal accounts (developer
 * console → Users & Roles → Import LDAP usernames).
 *
 * One `email, uid` pair per line; commas, tabs, semicolons or spaces separate
 * them, so a two-column spreadsheet paste works as-is. Blank lines, `#`
 * comments and an `email,…` header row are skipped.
 *
 * All or nothing: an identity mapping half-applied is worse than none, so any
 * problem — an unknown email, a malformed uid, a uid given twice, or a uid that
 * would end up on two accounts — is reported and the plan carries no changes to
 * apply. Uniqueness is judged on the *final* state, so swapping two accounts'
 * uids in one paste is allowed.
 */
export function planLdapUidImport(text: string, profiles: Profile[]): LdapUidImportPlan {
  const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));
  const problems: string[] = [];
  const wanted = new Map<string, { profile: Profile; uid: string }>();
  const lineOfUid = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fields = line.split(/[\s,;]+/).filter(Boolean);
    if (fields[0]?.toLowerCase() === "email") return;
    if (fields.length !== 2) {
      problems.push(`Line ${n}: expected "email, LDAP username", got "${line}"`);
      return;
    }
    const email = fields[0].toLowerCase();
    const uid = normalizeLdapUid(fields[1]);
    const profile = byEmail.get(email);
    if (!profile) {
      problems.push(`Line ${n}: no portal user has the email ${email}`);
      return;
    }
    if (!isValidLdapUid(uid)) {
      problems.push(`Line ${n}: "${fields[1]}" is not a valid LDAP username`);
      return;
    }
    if (wanted.has(profile.id)) {
      problems.push(`Line ${n}: ${email} is listed more than once`);
      return;
    }
    const earlier = lineOfUid.get(uid);
    if (earlier !== undefined) {
      problems.push(`Line ${n}: LDAP username ${uid} is also given on line ${earlier}`);
      return;
    }
    lineOfUid.set(uid, n);
    wanted.set(profile.id, { profile, uid });
  });

  // Would any uid end up on two accounts once everything is applied?
  const finalOwner = new Map<string, Profile>();
  for (const p of profiles) {
    const uid = wanted.get(p.id)?.uid ?? p.ldap_uid?.toLowerCase();
    if (!uid) continue;
    const other = finalOwner.get(uid);
    if (other) {
      const [kept, clash] = wanted.has(p.id) ? [other, p] : [p, other];
      problems.push(`LDAP username ${uid} for ${clash.email} already belongs to ${kept.email}`);
    } else {
      finalOwner.set(uid, p);
    }
  }

  const changes: LdapUidChange[] = [];
  let unchanged = 0;
  for (const { profile, uid } of wanted.values()) {
    if (profile.ldap_uid?.toLowerCase() === uid) unchanged++;
    else changes.push({ id: profile.id, email: profile.email, from: profile.ldap_uid ?? null, to: uid });
  }
  return { changes: problems.length ? [] : changes, unchanged, problems };
}
