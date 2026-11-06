# Archived: email + password sign-in (6 Nov 2026)

One folder per feature that was built and then withdrawn, kept verbatim so it
can be restored rather than rebuilt. The convention and its rules are in
`AGENTS.md` ("`archive/` is withdrawn features, not code") - **nothing here is
compiled, linted, tested or bundled**, and nothing in `app/`, `components/` or
`lib/` may `import` from this folder.

## What this was

`production_migration` (midhunpiitpkd, 2-4 Nov 2026) replaced the LDAP form and
the mock account picker with an **email + password** door:

- `profiles.password_hash text` - scrypt, 16-byte salt, timing-safe compare
  (`hashSecret` / `verifySecret` in `lib/crypto.ts`, which stay in the tree -
  they are also what the developer's TOTP recovery codes use).
- `signInWithPassword(prev, formData)` in `app/actions/auth.ts` - throttled per
  address through `RATE_LIMITS.passwordLogin`, refusing an account whose
  `account_status` is not `active`, audited on success and on failure.
- `getPasswordHash` / `setPasswordHash` on `DataStore`, implemented in both
  stores (`password_hashes` keyed by `lower(email)` in the mock store).
- `setUserPasswordAction(id, password)` in `app/actions/admin.ts`, and the
  "Set password" field in `components/admin/users-manager.tsx`.
- An email and password form in `components/login-form.tsx`, rendered by
  `components/site/sign-in-panel.tsx`.

## Why it was withdrawn

The owner's decision on 6 Nov 2026, during the `main` / `production_migration`
integration, on these grounds:

1. **It bypassed the second factor.** `deleteUserAction` requires
   `requireConsole("users", { stepUp: true })` - a TOTP proof inside the last
   ten minutes. `setUserPasswordAction` required only `requireConsole("users")`.
   So anyone holding the console unlock (a shared secret, default `0000`) could
   set the developer's password and sign in as them, which is a shorter path to
   every protected operation than the one the step-up exists to guard.
2. **Four characters.** `password.length < 4` was the whole policy. No
   complexity rule, no self-service change, no reset, no expiry, no rotation.
3. **Google OpenID Connect is already built and verified** (`lib/oidc.ts`,
   `app/api/auth/google/*`, `GOOGLE-SIGN-IN.md`) and is the institute's
   intended method. A second credential store is a second thing to operate and
   a second thing to get wrong, for no capability the portal lacked.

What replaced it: nothing new. Google for production, the account picker
(`/mock-login`) while Google is unconfigured, and the LDAP action intact
underneath - the arrangement `main` already had.

## Restoring it

Do not copy these files over the current ones - they are the whole file as it
stood on `production_migration`, and the tree has moved since. Take the pieces:

1. **Schema.** `alter table public.profiles add column if not exists
   password_hash text;` as a new migration. Nothing is backfilled; a null hash
   means that account has no password and the door refuses it.
2. **Store.** Add `getPasswordHash(email)` / `setPasswordHash(email, hash)` to
   `lib/store/types.ts` and to both stores - the bodies are in
   `postgres-store.ts` and `mock-store.ts` here. `PROFILE_COLUMNS` in
   `lib/store/postgres.ts` must gain `password_hash`, or the allow-list refuses
   the write.
3. **Rate limit.** Put `passwordLogin: { limit: 8, windowSeconds: 15 * 60 }`
   back in `RATE_LIMITS` (`lib/security.ts`).
4. **Action.** `signInWithPassword` from `auth-actions.ts`, and add
   `signInRefusal(profile)` from `lib/user-groups.ts` to it - migration 36's
   sign-in gate, which this version predates on one of its two branches.
5. **Console.** `setUserPasswordAction` from `admin-actions.ts` **with
   `{ stepUp: true }`** and a minimum length worth having, and the field from
   `users-manager.tsx`.
6. **Form.** The email and password inputs from `login-form.tsx`, and the
   branch in `sign-in-panel.tsx` that renders them.

Fix the two defects above as part of the restore, not after it.
