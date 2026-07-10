-- =============================================================
-- Drop orphaned public.availability (2026-07-08 ADR: availability
-- drop decision; Refs #371)
-- =============================================================
-- What: drops public.availability and its own dependent objects
-- (2 RLS policies, 3 indexes incl. pkey, status CHECK, FK to
-- trip_members, updated_at default) explicitly.
--
-- Why: the table has zero readers/writers. Repo sweep (2026-07-08
-- audit + re-verified in this PR): no `.from("availability")` calls,
-- no `lib/db/availability.ts`, no `/trips/[tripId]/availability`
-- route. The date poll shipped on `trip_member_days` at `/dates`
-- (M2) and superseded the per-date availability grid this table was
-- created for in 0001_init. Row count is 0 on prod and 0 locally.
--
-- Deliberately NOT touched: public.trip_member_days — explicitly
-- kept; #388 builds UI on it in the next wave.
--
-- No CASCADE needed (nothing external would be eaten): pg_depend
-- shows no views, no triggers, and no inbound FKs referencing
-- availability — every dependent object lives on the table itself
-- and is dropped with it. The explicit drops below are for
-- reviewability; `drop table` alone would remove the same set.
-- =============================================================

-- RLS policies (from 20260519123255_m1_foundation.sql)
drop policy if exists "members can read availability"   on public.availability;
drop policy if exists "members write own availability"  on public.availability;

-- Secondary indexes (pkey + its index go with the table)
drop index if exists public.availability_idempotency;
drop index if exists public.availability_trip_member_idx;

-- The table (takes pkey, status CHECK, trip_member_id FK,
-- updated_at default with it)
drop table if exists public.availability;

-- End of 20260709170200_drop_availability.sql
