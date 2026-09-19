import type { Client as LdapClient, Entry } from "ldapts";
import { normalizeLdapUid } from "./uid";
import { DirectoryUnavailableError, type Directory, type DirectoryEntry } from "./types";

export type LdapConfig = {
  url: string;
  baseDn: string;
  /** Service account used to find the user's DN. Unset means an anonymous search. */
  bindDn: string | null;
  bindPassword: string | null;
  /** The attribute people type as their username. `uid` on OpenLDAP; `sAMAccountName` on AD. */
  uidAttribute: string;
  /** Upgrade a plain `ldap://` connection with StartTLS before any password is sent. */
  startTls: boolean;
};

const TIMEOUT_MS = 8000;

/**
 * The institute's LDAP server, by the usual search-then-bind:
 *
 * 1. bind as the service account (or anonymously) and search `baseDn` for the
 *    one entry whose `uidAttribute` equals the username — so students and
 *    staff can live under different OUs without the portal knowing the layout;
 * 2. bind as that entry's DN with the typed password. Success *is* the check.
 *
 * A fresh connection per sign-in: sign-ins are rare, and a pooled connection
 * left bound as the last user would be a trap.
 */
export class LdapDirectory implements Directory {
  constructor(private readonly config: LdapConfig) {}

  get description(): string {
    return this.config.url;
  }

  async authenticate(uid: string, password: string): Promise<DirectoryEntry | null> {
    // An empty password is an *unauthenticated* bind (RFC 4513 §5.1.2), which
    // many servers accept as success. Without this check, a blank password
    // would sign anyone in as anyone.
    if (!password) return null;
    const wanted = normalizeLdapUid(uid);
    const { Client, EqualityFilter, InvalidCredentialsError } = await import("ldapts");

    const client: LdapClient = new Client({
      url: this.config.url,
      timeout: TIMEOUT_MS,
      connectTimeout: TIMEOUT_MS,
    });

    let entry: Entry;
    try {
      if (this.config.startTls) await client.startTLS();
      if (this.config.bindDn) await client.bind(this.config.bindDn, this.config.bindPassword ?? "");
      const { searchEntries } = await client.search(this.config.baseDn, {
        scope: "sub",
        filter: new EqualityFilter({ attribute: this.config.uidAttribute, value: wanted }),
        attributes: ["mail", "cn", "displayName"],
        sizeLimit: 2,
      });
      // None: no such user. Two: an ambiguous uid, which must not sign in as
      // whichever the server happened to list first.
      if (searchEntries.length !== 1) {
        await client.unbind().catch(() => undefined);
        return null;
      }
      entry = searchEntries[0];
    } catch (e) {
      await client.unbind().catch(() => undefined);
      throw new DirectoryUnavailableError(e);
    }

    try {
      await client.bind(entry.dn, password);
    } catch (e) {
      if (e instanceof InvalidCredentialsError) return null;
      throw new DirectoryUnavailableError(e);
    } finally {
      await client.unbind().catch(() => undefined);
    }

    return {
      uid: wanted,
      mail: firstValue(entry.mail),
      name: firstValue(entry.displayName) ?? firstValue(entry.cn),
    };
  }
}

function firstValue(value: Entry[string] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) return null;
  return typeof first === "string" ? first : first.toString("utf8");
}
