-- #504: multi-day itinerary items lose their end date.
--
-- itinerary_items stores `day date` + `start_time`/`end_time` as bare
-- `time without time zone`, so the schema structurally cannot represent an
-- item that ends on a later day — the end *date* was discarded at write
-- time (isoToDbTime collapses the end instant to HH:mm:ss and rehydration
-- reused the start `day`).
--
-- Adds a nullable `end_day date`. NULL means "same-day item" (ends on
-- `day`), which keeps every existing row valid with no backfill. The value
-- is derived server-side from the endTime instant in the trip's timezone
-- (lib/actions/itinerary.ts via isoToDbDate).
--
-- No RLS changes: this is a new column on an existing table, fully covered
-- by the table's existing itinerary_items policies.

alter table public.itinerary_items
  add column end_day date;

comment on column public.itinerary_items.end_day is
  'Trip-local calendar date the item ends (derived from the endTime instant in the trip timezone). NULL = same-day item, ends on `day`. #504.';
