-- =============================================================
-- #350: trips end-before-start CHECK constraint
-- =============================================================
-- What: adds a CHECK constraint enforcing ends_at >= starts_at on
-- public.trips.
--
-- Why: lib/actions/trips.ts previously skipped server-side cross-field
-- date validation with a comment claiming "the DB check constraint
-- catches it" -- but no such constraint existed (pg_constraint showed
-- only pkey, slug unique, created_by fkey). PR #351 added zod-level
-- validation (the app-layer backstop) but the DB-level constraint the
-- comment promised was left as a follow-up -- this is that follow-up.
--
-- NULL semantics (deliberate): both starts_at and ends_at are nullable
-- (a trip can exist before dates are set). Standard SQL CHECK
-- semantics already do the right thing here -- a CHECK expression that
-- evaluates to NULL (because either operand is NULL) is treated as
-- passing, not failing. So this constraint only rejects rows where
-- BOTH dates are present AND ends_at < starts_at; it never blocks a
-- trip with one or both dates unset. No COALESCE/IS NULL guard needed.
--
-- Prod audit (2026-07-07): the shared Supabase project is currently
-- PAUSED (auto-pause after ~1 week idle, see notes/database-workflow.md
-- "Two environments"), so the pre-flight violating-row audit could not
-- run. The PR carrying this migration is therefore HELD: do not merge
-- until the project is restored (human-run Management API curl, see
-- that doc) and this returns 0 on prod:
--   select count(*) from public.trips
--   where starts_at is not null and ends_at is not null
--     and ends_at < starts_at;
-- If it returns >0, resolve those rows first (or rework this as
-- NOT VALID + later VALIDATE) -- adding a plain CHECK while violating
-- rows exist fails the whole migration, leaving main ahead of prod.
-- App layer has rejected ends_at < starts_at since PR #351, so no new
-- violations accrue while the PR holds.
-- =============================================================

alter table public.trips
  add constraint trips_end_after_start
  check (ends_at is null or starts_at is null or ends_at >= starts_at);

comment on constraint trips_end_after_start on public.trips is
  'Rejects ends_at < starts_at when both are set (#350). NULL dates pass by design -- a trip can exist before either date is chosen.';

-- End of 20260707132310_trips_end_after_start_check.sql
