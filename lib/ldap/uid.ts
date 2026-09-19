/**
 * LDAP usernames (`uid`) as the portal stores and compares them. No Node
 * imports: the developer console's user form and the sign-in form use these
 * too.
 *
 * The dummy accounts use the local part of the institute address (a student's
 * roll number, a member of staff's mailbox name). The real directory's format
 * is unconfirmed, so this pattern is deliberately permissive: short, no
 * spaces, and `@` allowed, because a directory that logs people in by `mail`
 * or `userPrincipalName` (`LDAP_UID_ATTRIBUTE`) has usernames that *are*
 * addresses. Anything else is refused before it reaches the directory, which
 * also keeps odd characters out of the search filter (`EqualityFilter` escapes
 * them anyway). Widen it if the institute's uids turn out to need more.
 */
export const LDAP_UID_PATTERN = /^[a-z0-9][a-z0-9._@+-]{0,127}$/;

/** Trimmed and lowercased — LDAP compares `uid` case-insensitively. */
export function normalizeLdapUid(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLdapUid(value: string): boolean {
  return LDAP_UID_PATTERN.test(normalizeLdapUid(value));
}

export const LDAP_UID_ERROR =
  "An LDAP username is letters, digits and . _ - + @ only, with no spaces (e.g. 112201001 or priya)";
