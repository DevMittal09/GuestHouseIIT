/** What the directory says about a person once their password has checked out. */
export type DirectoryEntry = {
  /** Normalized — see `normalizeLdapUid`. This is what `profiles.ldap_uid` is matched against. */
  uid: string;
  mail: string | null;
  name: string | null;
};

/**
 * An LDAP directory, reduced to the one question sign-in asks. Two
 * implementations, picked from the environment by `getDirectory()` the way
 * `lib/store/index.ts` picks a data store.
 */
export interface Directory {
  /** Human-readable, for logs: "mock directory" or the LDAP URL. */
  readonly description: string;
  /**
   * The entry when `uid` exists and `password` is its password; `null` for any
   * wrong username/password combination (deliberately indistinguishable).
   * Throws `DirectoryUnavailableError` when the directory cannot answer.
   */
  authenticate(uid: string, password: string): Promise<DirectoryEntry | null>;
}

/** The directory could not be asked — down, misconfigured, or timed out. */
export class DirectoryUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`LDAP directory unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "DirectoryUnavailableError";
  }
}
