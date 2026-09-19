import { LdapDirectory, type LdapConfig } from "./ldap-directory";
import { MockDirectory } from "./mock-directory";
import type { Directory } from "./types";

export { DirectoryUnavailableError, type Directory, type DirectoryEntry } from "./types";

/**
 * Picks the directory from the environment, like `getStore()` and
 * `getMailer()`:
 *
 * | Condition        | Directory       | Accounts come from                  |
 * | ---------------- | --------------- | ----------------------------------- |
 * | `LDAP_URL` set   | `LdapDirectory` | the institute LDAP server           |
 * | otherwise        | `MockDirectory` | `lib/ldap/mock-directory.ts`        |
 *
 * `.env.example` documents the variables.
 */
export function getDirectory(): Directory {
  const config = ldapConfig();
  return config ? new LdapDirectory(config) : new MockDirectory();
}

/**
 * True while sign-in checks the dummy accounts. The sign-in page uses it to
 * show a sample login — never shown once a real directory is configured.
 */
export function isMockDirectory(): boolean {
  return !process.env.LDAP_URL?.trim();
}

/**
 * Whether people sign in with an address. False for the dummy accounts and a
 * `uid` / `sAMAccountName` directory, where someone typing their email has
 * made a mistake worth pointing out; true when `LDAP_UID_ATTRIBUTE` is `mail`
 * or `userPrincipalName`.
 */
export function directoryUsesEmailUsernames(): boolean {
  const attribute = process.env.LDAP_UID_ATTRIBUTE?.trim().toLowerCase();
  return !isMockDirectory() && (attribute === "mail" || attribute === "userprincipalname");
}

function ldapConfig(): LdapConfig | null {
  const url = process.env.LDAP_URL?.trim();
  if (!url) return null;
  const baseDn = process.env.LDAP_BASE_DN?.trim();
  // A URL without a base is a half-configured deployment. Failing loudly beats
  // quietly falling back to the dummy accounts, whose passwords are published.
  if (!baseDn) throw new Error("LDAP_URL is set but LDAP_BASE_DN is not");
  return {
    url,
    baseDn,
    bindDn: process.env.LDAP_BIND_DN?.trim() || null,
    bindPassword: process.env.LDAP_BIND_PASSWORD ?? null,
    uidAttribute: process.env.LDAP_UID_ATTRIBUTE?.trim() || "uid",
    startTls: process.env.LDAP_STARTTLS === "true",
  };
}
