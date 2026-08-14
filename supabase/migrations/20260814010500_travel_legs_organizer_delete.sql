-- =============================================================
-- #615 — organizer can REMOVE any member's travel leg
-- =============================================================
-- What: today travel_legs DELETE is owner-only ("travel legs: owner
-- delete"). An organizer needs to drop a leg for a member who's gone
-- quiet (drop-out, wrong/duplicate leg) without waiting on that member.
--
-- Shape: a NEW, SEPARATE permissive DELETE policy — the existing owner
-- policy is untouched. RLS OR-s permissive policies for the same
-- command, so this composes with "travel legs: owner delete" without
-- editing it. This is deliberately NOT the #574/#581 "OR is_trip_organizer
-- into the owner policy" shape (that OR-stacking inside a single WITH
-- CHECK was the HIGH-severity hole the laggards wave caught) — but note
-- that lesson is about WRITE checks. DELETE has no WITH CHECK at all, so
-- there's no shared clause to corrupt; a second policy is the clean,
-- narrow shape here. Mirrors the ride-group precedent
-- ("ride groups: creator or organizer delete",
-- 20260810040000_ride_groups.sql) — same public.is_trip_organizer(trip_id)
-- check, shipped as its own policy rather than folded into one.
--
-- Use case: organizer drop-out/cleanup only. Hard delete — the row is
-- gone, no provenance kept. The "not-silent" concern is satisfied by the
-- UI's two-tap destructive confirm (components/trip/arrivals/
-- organizer-remove-leg.tsx); per-field provenance (who changed what)
-- belongs to the deferred organizer-EDIT follow-up, not this delete-only
-- slice.
--
-- PNR privacy (#505) is not at risk: a DELETE reads no
-- confirmation_code/notes — those columns are irrelevant to a row
-- removal, unlike the manifest view's SELECT-time nulling for non-owners.
--
-- No grant changes: DELETE is already granted to authenticated (owner
-- delete works today) — this policy only widens WHICH rows an organizer
-- may delete, not what the role can do.
-- =============================================================

create policy "travel legs: organizer delete"
  on public.travel_legs
  for delete
  to authenticated
  using (public.is_trip_organizer(trip_id));

comment on policy "travel legs: organizer delete" on public.travel_legs is
  '#615. Additive to "travel legs: owner delete" (RLS ORs permissive policies — the owner policy is untouched). Lets a trip organizer delete another member''s leg (drop-out/cleanup). Hard delete, no provenance; UI enforces a two-tap destructive confirm.';

-- End of 20260814010500_travel_legs_organizer_delete.sql
