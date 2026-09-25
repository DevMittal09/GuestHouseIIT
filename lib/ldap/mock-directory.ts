import { normalizeLdapUid } from "./uid";
import type { Directory, DirectoryEntry } from "./types";

type MockAccount = DirectoryEntry & { password: string };

/**
 * Dummy LDAP accounts, one per seeded persona, standing in for the institute
 * directory until it is reachable. Listed with their passwords in
 * `.memories/30-credentials-and-access.md` — keep the two in step.
 *
 * This is the *directory*, not the portal's user list: it answers "is this the
 * right password for this uid", and `profiles.ldap_uid` then says which portal
 * account that uid belongs to. So the uids here match the `ldap_uid` values in
 * `lib/store/seed.ts` and `supabase/seed.sql`, and `visitor` deliberately has
 * no portal account — it is how "valid LDAP login, not registered here" is
 * tried out.
 *
 * Plaintext is fine because these passwords
 * are published. None of this is used once `LDAP_URL` is set.
 */
const ACCOUNTS: MockAccount[] = [
  // ----- Requesters -----
  { uid: "112201001", password: "Anjali@2026", mail: "112201001@smail.iitpkd.ac.in", name: "Anjali Menon" },
  { uid: "142202014", password: "Rahul@2026", mail: "142202014@smail.iitpkd.ac.in", name: "Rahul Nair" },
  { uid: "priya", password: "Priya@2026", mail: "priya@iitpkd.ac.in", name: "Dr. Priya Sharma" },
  // Faculty, and Faculty Advisor of the Cultural Affairs Council and Petrichor.
  { uid: "arun.prasad", password: "Arun@2026", mail: "arun.prasad@iitpkd.ac.in", name: "Dr. Arun Prasad" },
  { uid: "admin", password: "Director@2026", mail: "admin@iitpkd.ac.in", name: "Director's Office" },
  { uid: "petrichor", password: "Petrichor@2026", mail: "petrichor@iitpkd.ac.in", name: "Petrichor Fest Council" },
  { uid: "sec_arts", password: "SecArts@2026", mail: "sec_arts@iitpkd.ac.in", name: "Cultural Affairs Council" },
  { uid: "alumnicell", password: "AlumniCell@2026", mail: "alumnicell@iitpkd.ac.in", name: "IAR Student Cell" },
  // ----- Reviewers / Admins -----
  { uid: "warden.malhar", password: "Malhar@2026", mail: "warden.malhar@iitpkd.ac.in", name: "Dr. Suresh Kumar" },
  { uid: "warden.saveri", password: "Saveri@2026", mail: "warden.saveri@iitpkd.ac.in", name: "Dr. Lakshmi Devi" },
  { uid: "hod.cse", password: "HodCse@2026", mail: "hod.cse@iitpkd.ac.in", name: "Prof. R. Venkatesh" },
  { uid: "112301045", password: "Meera@2026", mail: "112301045@smail.iitpkd.ac.in", name: "Meera Nair" },
  // Phase 4: a department office (Direct or HOD approval) and non-teaching staff.
  { uid: "cse.office", password: "CseOffice@2026", mail: "cse.office@iitpkd.ac.in", name: "CSE Department Office" },
  { uid: "ravi.k", password: "Ravi@2026", mail: "ravi.k@iitpkd.ac.in", name: "Ravi K." },
  { uid: "iar", password: "IarOffice@2026", mail: "iar@iitpkd.ac.in", name: "IAR Office" },
  { uid: "guesthouse", password: "Manager@2026", mail: "guesthouse@iitpkd.ac.in", name: "Guest House Manager" },
  { uid: "gh.reception", password: "Reception@2026", mail: "gh.reception@iitpkd.ac.in", name: "Guest House Caretaker" },
  { uid: "developer", password: "Developer@2026", mail: "developer@iitpkd.ac.in", name: "Portal Developer" },
  // ----- In the directory, not on the portal -----
  { uid: "visitor", password: "Visitor@2026", mail: "visitor@iitpkd.ac.in", name: "Unregistered Visitor" },
];

/** One dummy login, shown on the sign-in page as a sample while this directory is in use. */
export const SAMPLE_ACCOUNT = (({ uid, password }) => ({ uid, password }))(
  ACCOUNTS.find((a) => a.uid === "priya")!
);

export class MockDirectory implements Directory {
  readonly description = "mock directory";

  async authenticate(uid: string, password: string): Promise<DirectoryEntry | null> {
    const wanted = normalizeLdapUid(uid);
    const account = ACCOUNTS.find((a) => a.uid === wanted);
    // Passwords are case-sensitive, as in LDAP; uids are not.
    if (!account || !password || account.password !== password) return null;
    return { uid: account.uid, mail: account.mail, name: account.name };
  }
}
