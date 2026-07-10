-- =============================================================
-- trip_member_days date-change reconcile (#388)
-- =============================================================
-- What: replaces public.seed_trip_member_days_for_trip() so a
-- trips.starts_at/ends_at UPDATE now BOTH inserts missing in-range
-- days for going members (unchanged M1 behavior) AND deletes rows
-- that fall outside the new range.
--
-- Why: the M1 seed triggers snapshot the date range at write time.
-- Before #388 that staleness was harmless (zero readers); now the
-- /me chips and the roster headcount read the table, so a date
-- shuffle would leave phantom out-of-range rows inflating nothing
-- visible today but poisoning future consumers (#47 proration).
-- In-range rows are untouched — a member's opt-in/opt-out choices
-- survive a range shrink-then-grow only for days that stayed in
-- range, which is the honest outcome (a day that left the trip no
-- longer has an attendance question to answer).
--
-- Deliberately kept: the "both dates non-null" guard. Clearing a
-- trip's dates does NOT delete attendance rows — non-destructive
-- posture; the rows become invisible (no range → no chips) and
-- reconcile on the next date set.
--
-- The trigger binding (trips_seed_member_days_on_date_change,
-- AFTER UPDATE OF starts_at, ends_at) is unchanged — CREATE OR
-- REPLACE swaps the body under the existing trigger.
-- =============================================================

create or replace function public.seed_trip_member_days_for_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.starts_at is not null and new.ends_at is not null then
    -- Fan out missing days for going members (M1 behavior, unchanged).
    insert into public.trip_member_days (trip_member_id, date, status)
    select tm.id, d.date::date, 'going'::trip_member_day_status
    from public.trip_members tm
    cross join generate_series(new.starts_at::timestamp, new.ends_at::timestamp, interval '1 day') as d(date)
    where tm.trip_id = new.id and tm.rsvp_status = 'going'
    on conflict (trip_member_id, date) do nothing;

    -- #388: reconcile — drop rows that fell out of the new range for
    -- EVERY member of this trip (not just going; a maybe member's
    -- hand-toggled rows go stale identically).
    delete from public.trip_member_days tmd
    using public.trip_members tm
    where tmd.trip_member_id = tm.id
      and tm.trip_id = new.id
      and (tmd.date < new.starts_at or tmd.date > new.ends_at);
  end if;
  return new;
end;
$$;

comment on function public.seed_trip_member_days_for_trip() is
  'AFTER UPDATE OF starts_at, ends_at on trips. Fans out trip_member_days for every going member across the new range AND deletes rows outside it (#388 reconcile). Idempotent via on conflict; a NULL date range leaves rows untouched.';

-- End of 20260710060200_member_days_reconcile.sql
