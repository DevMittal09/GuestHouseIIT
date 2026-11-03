# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 3 November 2026 - code analysis and cleanup

Full-codebase audit for logical and syntax issues after the Supabase removal,
LDAP removal and ldap_uid removal rounds. Five issues found and fixed.

### What was delivered

**Removed unused `isProduction` import** (`app/api/auth/google/start/route.ts`):
imported from `@/lib/env` but never called — the cookie's `secure` flag used
`process.env.NODE_ENV === "production"` directly. Fixed the lint warning.

**Removed dead `RATE_LIMITS.signIn`** (`lib/security.ts`): this was the LDAP
sign-in throttle (8 attempts per uid per 15 min). LDAP is gone; Google OAuth
has its own `RATE_LIMITS.oauth` (20 per IP per 10 min). No callers remained.

**Cleaned three stale comments**:
- `lib/security.ts` line 58: "Per LDAP username" on the removed rate limit.
- `lib/store/types.ts` line 236: "a free LDAP username" in `createProfiles`
  doc — changed to "a free email".
- `lib/store/mock.ts` line 150: orphaned "Migration 28" comment for the
  removed `academic_records` field (replaced by migration 35 institute tables).

**Updated e2e comments** (`e2e/helpers.ts`, `e2e/global-setup.ts`): removed
stale references to `RATE_LIMITS.signIn` and the LDAP sign-in throttle. The
suite now signs in via `/api/auth/test-sign-in`, not the form.

**Struck two roadmap items** ([03-roadmap.md](03-roadmap.md) §2l): the sign-in
throttle and the LDAP form are both resolved — deleted with LDAP.

### Confirmed correct

- `institute_hostels` schema: `hostel_id` (text, unique) and `hostel_name`
  (text, unique) both exist. `institute_wardens.hostel_id` and
  `profiles.hostel_name` FKs are both valid.
- Both store implementations match the `DataStore` interface.
- No broken imports from deleted modules (LDAP, Supabase, mock-login).
- No functional references to `DEV_LOGIN`, `MOCK_LOGIN`, `mockLoginEnabled`,
  `signInWithLdap`, `ldap_uid` or `password_hash` (the test's
  `admin_password_hash` is the console lock, not a login password).
- `.env.example` is clean.

### Validation

`npm run lint` (0 errors, 0 warnings), `npm run typecheck`, `npm test`
(596 tests, 34 files), `npm run build` and `npm run check:memories` all clean.
