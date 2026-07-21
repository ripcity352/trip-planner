-- =============================================================
-- travel_legs_manifest view — owner-only confirmation_code (#505)
-- =============================================================
-- The travel-leg Confirmation # (PNR) was readable by every trip member:
-- RLS "travel legs: members read" grants full-row SELECT and the shared
-- arrivals read selected confirmation_code for everyone. A PNR + last
-- name can manage/cancel a booking, so the code is owner-only data that
-- happened to live on a trip-wide-readable row.
--
-- RLS is row-level only — this is the codebase's FIRST field-level-private
-- column. Pattern (mirrors trip_members_visible_rsvp, m1 #70): a
-- security_invoker view over the base table that nulls the private column
-- unless the row belongs to the caller. Future private fields on
-- trip-readable rows should follow this shape (see notes/decisions.md
-- "#505 — field-level-private column" ADR).
--
-- security_invoker = true so RLS on travel_legs AND trip_members runs
-- against the caller: row visibility stays "any trip member sees all
-- legs" (unchanged), and the ownership CASE resolves via the caller's
-- own trip_members row.
--
-- Writes and the owner edit-prefill are unaffected: mutations go through
-- server actions against travel_legs directly, and the owner still
-- receives their own confirmation_code through the view (the CASE lets
-- it through), so edit-form hydration keeps working.
create or replace view public.travel_legs_manifest
  with (security_invoker = true)
as
select
  tl.id,
  tl.trip_id,
  tl.trip_member_id,
  tl.kind,
  tl.depart_at,
  tl.arrive_at,
  tl.carrier,
  -- Ownership check mirrors the "travel legs: owner insert/update" RLS
  -- shape: the leg's trip_member row must belong to the caller. Any
  -- drift between this predicate and those policies would either
  -- over-expose the code or blank the owner's own edit-prefill.
  case
    when exists (
      select 1
      from public.trip_members tm
      where tm.id = tl.trip_member_id
        and tm.user_id = auth.uid()
    ) then tl.confirmation_code
    else null
  end as confirmation_code,
  tl.notes,
  tl.idempotency_key,
  tl.created_at,
  tl.airline_iata,
  tl.flight_number,
  tl.direction,
  tl.airport,
  tl.origin_label
from public.travel_legs tl;

comment on view public.travel_legs_manifest is
  'Arrivals-manifest read surface for travel_legs. Nulls confirmation_code unless the row belongs to the caller (first field-level-private column, #505). App reads (getTravelLegsByTrip) go through this view; writes stay on travel_legs.';

-- Grant hygiene (#361 / anon-oracle memory): the restore-base-table-grants
-- default ACL would hand anon SELECT on this new relation. The view holds
-- private-ish coordination data behind auth — SELECT to authenticated
-- (+ service_role for admin scripts) ONLY, nothing to anon, and no DML
-- (the view is not a write path; mutations use travel_legs via server
-- actions). NOTE: any manual local grant-repair that blanket-grants must
-- be followed by re-applying these revokes.
revoke all on public.travel_legs_manifest from public, anon, authenticated, service_role;
grant select on public.travel_legs_manifest to authenticated, service_role;
