-- =============================================================
-- Restore base DML grants dropped by a clean local `db reset` (#361)
-- =============================================================
-- Root cause: the pinned local Postgres image ships a competing
-- postgres-owned `pg_default_acl` row for tables in `public` that grants
-- only TRUNCATE/REFERENCES/TRIGGER (no DML). Every repo migration runs as
-- `postgres`, so each app table inherits that row and anon / authenticated
-- / service_role are left with no SELECT/INSERT/UPDATE/DELETE after a reset
-- — the app and the local e2e gate cannot reach any table until grants are
-- repaired by hand. Hosted Supabase provisions these grants correctly, so
-- this migration is a no-op on prod (re-granting a held privilege does
-- nothing).
--
-- Fix: explicitly grant table + sequence DML to the API roles and set
-- ALTER DEFAULT PRIVILEGES so future postgres-created objects inherit them.
-- RLS stays the actual access-control layer (CLAUDE.md rule 5) — these base
-- grants are the substrate RLS filters over, not a widening of it. Every
-- public table ships with RLS enabled in its own migration, so anon's base
-- DML is gated row-by-row by policy.
--
-- Scope is SELECT/INSERT/UPDATE/DELETE only — deliberately NOT `GRANT ALL`,
-- which would also hand anon TRUNCATE (TRUNCATE bypasses RLS) and
-- REFERENCES/TRIGGER (schema-shape privileges anon never needs).
--
-- DELIBERATELY NO function grants. Function access is governed per-migration:
-- SECURITY DEFINER functions that must not be anon-callable
-- (create_expense_with_splits, trip_member_current_role,
-- trip_member_current_is_celebrant, get_poll_vote_counts,
-- get_date_poll_vote_counts) REVOKE anon explicitly, and every other
-- function gets PUBLIC EXECUTE by default at creation. A blanket
-- `grant ... on all functions to anon` here would silently re-open every
-- one of those intentional revokes — the exact footgun the manual repair
-- carried. See notes/database-workflow.md.
-- =============================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;
