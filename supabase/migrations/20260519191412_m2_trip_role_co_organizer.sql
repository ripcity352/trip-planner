-- =============================================================
-- 20260519191412_m2_trip_role_co_organizer.sql
-- M2 — add `co_organizer` to the `trip_role` enum.
--
-- This is split into its own migration because Postgres rejects using
-- a newly-added enum value in the same transaction it was added
-- ("unsafe use of new value" — SQLSTATE 55P04). The Supabase migration
-- runner wraps each file in a transaction, so the value has to be
-- committed before any downstream object can reference it.
--
-- Downstream changes (is_trip_organizer() update, accept_invite,
-- create_trip_with_organizer, etc.) live in
-- 20260519191413_m2_trips_and_invites.sql.
-- =============================================================

alter type public.trip_role add value if not exists 'co_organizer';
