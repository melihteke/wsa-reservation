-- WSA Reservations: add the super admin role.
-- Run this file ON ITS OWN (as a separate query) before 0004_superadmin.sql: Postgres can't use a
-- new enum value in the same transaction that adds it.
alter type public.user_role add value if not exists 'superadmin';
