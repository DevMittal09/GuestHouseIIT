-- ============================================================================
-- Repair, 13 Oct 2026 - retire Supabase Auth users and their passwords
-- Compatible with the Supabase SQL Editor
--
-- IMPORTANT:
-- 1. Back up the database before running this script.
-- 2. Apply migration 31 first.
-- 3. Verify that public.profiles no longer references auth.users.
-- 4. This deletes ALL rows from auth.users, not just seeded accounts.
-- 5. Verify that no other application or integration depends on these users.
-- 6. Disable the Email/password provider separately in the Supabase Dashboard.
-- ============================================================================

-- ------------------------------------------------------------
-- Stop at the first error.
--
-- Without this, psql runs on after a failure: section 0's safety check is
-- raised, the transaction in section 2 aborts, every statement in it is
-- "ignored until end of transaction block", and the script still prints
-- section 3's verification block underneath - which reads like a result.
-- Verified 14 Oct 2026 in a throwaway Postgres, against a database held at
-- migration 30.
-- ------------------------------------------------------------

\set ON_ERROR_STOP on

-- ------------------------------------------------------------
-- 0. Safety check: refuse to continue if profiles still
--    references auth.users.
-- ------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND contype = 'f'
          AND confrelid = 'auth.users'::regclass
    ) THEN
        RAISE EXCEPTION
            'SAFETY CHECK FAILED: public.profiles still references auth.users. Apply migration 31 and verify the foreign key before proceeding.';
    END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1. Inspect the Auth users that would be deleted.
--    Review these results before proceeding to Section 2.
-- ------------------------------------------------------------

SELECT
    u.id,
    u.email,
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = u.id
    ) AS has_portal_profile
FROM auth.users u
ORDER BY u.email;

-- ------------------------------------------------------------
-- 2. DELETE ALL AUTH USERS.
--
-- IMPORTANT:
-- This is destructive. Run this section only after reviewing
-- Section 1 and confirming your backup and dependencies.
--
-- The transaction ensures that if a deletion statement fails,
-- the changes in this section are rolled back.
-- ------------------------------------------------------------

BEGIN;

DO $$
BEGIN
    -- Recheck the foreign-key condition immediately before deletion.
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND contype = 'f'
          AND confrelid = 'auth.users'::regclass
    ) THEN
        RAISE EXCEPTION
            'SAFETY CHECK FAILED: public.profiles still references auth.users. No Auth users will be deleted.';
    END IF;
END;
$$;

-- Delete identities explicitly for compatibility with schemas
-- where auth.identities does not cascade on auth.users deletion.
DELETE FROM auth.identities
WHERE user_id IN (
    SELECT id
    FROM auth.users
);

-- Delete every remaining Supabase Auth user.
DELETE FROM auth.users;

COMMIT;

-- ------------------------------------------------------------
-- 3. Verify the resulting state.
-- ------------------------------------------------------------

SELECT
    (SELECT COUNT(*) FROM auth.users) AS remaining_auth_users,
    (SELECT COUNT(*) FROM public.profiles) AS remaining_profiles,
    (SELECT COUNT(*) FROM public.bookings) AS remaining_bookings;

-- ------------------------------------------------------------
-- 4. Check authenticated RLS policies.
--    Expected: 0 after migration 31, according to the audit.
-- ------------------------------------------------------------

SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd
FROM pg_policies
WHERE 'authenticated' = ANY(roles)
  AND schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- Count of remaining authenticated policies:
SELECT COUNT(*) AS remaining_authenticated_policies
FROM pg_policies
WHERE 'authenticated' = ANY(roles)
  AND schemaname IN ('public', 'storage');