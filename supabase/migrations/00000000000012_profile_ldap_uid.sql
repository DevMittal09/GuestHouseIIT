-- Migration 12: LDAP usernames on profiles.
--
-- Sign-in moved from "institute email + shared demo password" to the
-- institute's LDAP directory (19 Sep 2026). The directory checks the password;
-- this column says which portal account an LDAP username belongs to. Roles,
-- hostels and clubs stay here — the directory knows none of them.
--
-- Deliberately not backfilled from the email address. The dummy accounts use
-- the local part of the address, but the institute directory's format is
-- unconfirmed, and a guessed identity mapping signs one person in as another. The
-- office fills this in (developer console → Users & Roles, or a bulk update);
-- until a row has one, that person uses the other sign-in door. The demo
-- personas get theirs from supabase/seed.sql.
--
-- Additive and nullable. Safe to re-run. Until it is applied, LDAP sign-in
-- finds no portal account for anyone, and saving a user from the developer
-- console fails because the update names the column.

alter table public.profiles add column if not exists ldap_uid text;

-- One portal account per LDAP username, compared the way LDAP compares uids.
create unique index if not exists profiles_ldap_uid_key
  on public.profiles (lower(ldap_uid));

comment on column public.profiles.ldap_uid is
  'Institute LDAP username; matched case-insensitively at LDAP sign-in. Null = cannot sign in with LDAP.';
