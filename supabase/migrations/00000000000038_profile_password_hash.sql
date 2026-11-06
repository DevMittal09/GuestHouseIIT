-- ============================================================================
-- Migration 38 - A password hash on a profile (6 Nov 2026)
-- ============================================================================
--
-- WHY
--
-- The owner asked for **email and password as the primary sign-in door, for
-- the time being**, because signing in as each of the test roles through
-- Google OAuth is slow to set up and slower to repeat. Google OpenID Connect
-- stays built and stays the intended method (`lib/oidc.ts`,
-- `GOOGLE-SIGN-IN.md`); this is the door beside it, and the account picker
-- (`/mock-login`) is unchanged underneath both.
--
-- This column existed once before. `production_migration` added it in early
-- November, and the integration of 6 Nov 2026 withdrew the whole door on two
-- grounds, both of which are answered in the code this migration serves:
--
--   1. **It bypassed the second factor.** `setUserPasswordAction` asked only
--      for the console unlock - a shared secret, default `0000` - so anyone
--      holding it could set the developer's password and sign in as them.
--      There is no such action now: a password is set by the seed or by SQL,
--      and when a console field is built it takes `{ stepUp: true }` like
--      `deleteUserAction`. See `.memories/03-roadmap.md`.
--   2. **Four characters was the whole policy.** Nothing writes this column
--      from user input any more, so there is no policy to get wrong here;
--      the one that comes with the console field is named in the roadmap.
--
-- WHAT THIS ADDS
--
--   * `profiles.password_hash` - scrypt, 16-byte salt, 64-byte key, written
--     `scrypt$<salt hex>$<hash hex>` by `hashSecret()` and compared by
--     `verifySecret()` (`lib/crypto.ts`), which is the same pair the
--     developer's TOTP recovery codes already use. **Null means the account
--     has no password**, and the door refuses it rather than letting anyone
--     in: see `signInWithPassword` in `app/actions/auth.ts`.
--
-- The hash is deliberately **not** added to `profiles_v`. That view is what
-- every store read returns as a `Profile`, so a hash left out of it cannot
-- reach a page, a server action's return value or a browser. `getPasswordHash`
-- reads the base table, and it is the only reader.
--
-- Nothing is backfilled. Additive, nullable, and safe to re-run.
-- ============================================================================

alter table public.profiles
  add column if not exists password_hash text;

comment on column public.profiles.password_hash is
  'scrypt hash of the account password, as hashSecret() writes it: scrypt$<salt hex>$<hash hex>. Null means no password is set and the email/password door refuses the account. Deliberately absent from profiles_v so it cannot reach a Profile object.';
