-- =============================================================
-- #574 — co-traveler tagging for travel_legs (shared flights)
-- =============================================================
-- What: lets ANY trip member who logs a flight tag the other members on
-- the same flight, so a shared flight is entered once. Each tag creates a
-- pending, ATTRIBUTED travel_legs row for the tagged member; the tagged
-- member confirms (adopts) or dismisses (deletes) it. Recording, not
-- assuming — the persona-edge-attendees principle (rule #8), generalized
-- from #171 (itinerary_item_member_flags) and #550 (trip_member_days) to a
-- third table.
--
-- Unlike #550/#549 this is NOT organizer-gated: the person holding the
-- confirmation email is usually a regular attendee. Safe because the tag
-- only ever creates a pending, forgery-proof-attributed row the target must
-- opt into — the worst a member can do is create a dismissible, attributed
-- row (rate-limited, non-anonymous). See notes/decisions.md 2026-08-10 ADR.
--
-- Simpler than #550: tagging is a pure INSERT fan-out (one fresh row per
-- tagged member), NOT an upsert, so there is NO on-behalf UPDATE or DELETE
-- policy. Confirm = the target's own UPDATE clearing written_by; dismiss =
-- the target's own DELETE — both ride the existing owner policies.
--
-- ⚠️ 2nd-FK PostgREST trap (took the crew page down 2026-08-10): written_by
-- is a SECOND FK from travel_legs to trip_members. Verified NO
-- travel_legs->trip_members PostgREST embed exists repo-wide (the manifest
-- view uses an exists() subquery, not an embed; every lib/db read selects
-- plain columns), so no bare embed goes ambiguous (HTTP 300). written_by is
-- exposed on the manifest view as a PLAIN column, never an embed.
-- =============================================================

-- ---- 1. Attribution column ----------------------------------
-- FK -> trip_members(id), NOT auth.users(id): matches trip_member_id's shape
-- and the #550/#171 convention. Nullable: pre-migration rows and normal
-- self-written legs carry NULL; only a tag sets it (to the TAGGER's own
-- trip_member_id). `on delete set null`: if the tagging member's membership
-- is deleted, attribution nulls and the leg reads as self-owned — the
-- least-bad option (cascade would delete the tagged member's leg; restrict
-- would block the tagger's removal).
alter table public.travel_legs
  add column written_by_trip_member_id uuid
    references public.trip_members(id) on delete set null;

comment on column public.travel_legs.written_by_trip_member_id is
  '#574. NULL for self-logged legs (the default). Set to the TAGGER''s own trip_member_id when a member tags a co-traveler onto a shared flight. Detection of an unconfirmed tag: written_by_trip_member_id is not null AND <> trip_member_id. The tagged member''s confirm (own UPDATE clears this to NULL) or dismiss (own DELETE) is the consent path (rule #8). FK is `on delete set null`.';

-- Index the attribution FK: the app never looks legs UP by tagger (it
-- detects pending tags within an already-trip-scoped result), but this
-- keeps the FK off a seq-scan when a trip_members row is deleted and
-- `on delete set null` fires. Partial — only tagged rows carry a value.
create index travel_legs_written_by_idx
  on public.travel_legs (written_by_trip_member_id)
  where written_by_trip_member_id is not null;

-- ---- 2. TIGHTEN the owner INSERT policy ---------------------
-- Recreate "travel legs: owner insert" verbatim + one added WITH CHECK
-- clause: a member's own INSERT may NOT carry attribution (written_by must
-- be NULL). This closes the OR-stacking hole from the member direction —
-- it stops a member forging tagger attribution on their own leg via the
-- self path. Only "members tag co-travelers" (below) may set written_by.
drop policy "travel legs: owner insert" on public.travel_legs;

create policy "travel legs: owner insert"
  on public.travel_legs
  for insert
  to authenticated
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
    and written_by_trip_member_id is null
  );

comment on policy "travel legs: owner insert" on public.travel_legs is
  'M3 owner-insert, tightened by #574: a member inserts their OWN leg AND must leave written_by_trip_member_id NULL. The null clause closes the RLS OR-stacking hole (stops a member forging tagger attribution on their own row). Only "members tag co-travelers" may set written_by.';

-- ---- 3. TIGHTEN the owner UPDATE policy ---------------------
-- Recreate "travel legs: owner update" verbatim + the same WITH CHECK
-- clause. This makes a member's own edit of their leg ALWAYS land
-- written_by = NULL, which doubles as the [I'm on it] confirm: adopting a
-- pending tagged leg (editing it, or the dedicated confirm action) clears
-- the attribution. USING is unchanged (any of the member's own rows,
-- including a pending tag whose trip_member_id is theirs); WITH CHECK pins
-- the post-state to null attribution. DELETE/SELECT unaffected.
drop policy "travel legs: owner update" on public.travel_legs;

create policy "travel legs: owner update"
  on public.travel_legs
  for update
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = travel_legs.trip_id
        and tm.user_id = auth.uid()
    )
    and written_by_trip_member_id is null
  );

comment on policy "travel legs: owner update" on public.travel_legs is
  'M3 owner-update, tightened by #574: a member updates their OWN leg AND the post-state must leave written_by_trip_member_id NULL. This closes forge-attribution from the member direction and doubles as the confirm-clear (adopting a pending tagged leg nulls its attribution). Only "members tag co-travelers" (INSERT) sets written_by; there is deliberately no on-behalf UPDATE.';

-- ---- 4. ADD the tag-on-behalf INSERT policy -----------------
-- Three load-bearing clauses (mirror #171/#550), simplified because
-- travel_legs carries trip_id directly (no member->trip subquery needed):
--   (a) WRITER BINDING + TENANCY (rule #6) — written_by is the caller's OWN
--       membership in THIS leg's trip. A member of trip A has no membership
--       in trip B, so cannot tag into B; and cannot ghost-write under
--       another member's name.
--   (b) TARGET TENANCY — the tagged member must belong to the SAME trip.
--   (c) ANTI-FORGERY — trip_member_id <> written_by_trip_member_id, so a
--       tag can never claim the target logged the leg themselves.
-- Together with the tightened owner INSERT/UPDATE (self path forces
-- written_by NULL), these are the TABLE-WIDE guarantee that tag attribution
-- cannot be faked from EITHER direction. NO on-behalf UPDATE/DELETE — the
-- tagger creates the pending row; only the target manages it after.
create policy "members tag co-travelers"
  on public.travel_legs
  for insert
  to authenticated
  with check (
    written_by_trip_member_id in (
      select w.id from public.trip_members w
      where w.trip_id = travel_legs.trip_id
        and w.user_id = auth.uid()
    )
    and trip_member_id in (
      select t.id from public.trip_members t
      where t.trip_id = travel_legs.trip_id
    )
    and trip_member_id <> written_by_trip_member_id
  );

comment on policy "members tag co-travelers" on public.travel_legs is
  '#574. Additive to "travel legs: owner insert" (stacks via OR). Lets any trip member tag a co-traveler onto a shared flight with forgery-proof attribution: written_by must be the caller''s own membership in the leg''s trip (writer-binding + tenancy), the target must belong to the same trip, and target <> writer (anti-forgery). INSERT only — creating a pending, attributed leg the target confirms (own UPDATE clears written_by) or dismisses (own DELETE). Deliberately NO on-behalf UPDATE or DELETE: a tagger must not be able to edit or erase another member''s leg.';

-- ---- 5. Expose written_by on the manifest view --------------
-- Add written_by_trip_member_id to travel_legs_manifest so reads can detect
-- pending tags (written_by not null AND <> trip_member_id) for the confirm
-- affordance and the "Added by X · unconfirmed" marker. PLAIN column, not an
-- embed — no PostgREST 300 risk. All other columns and the #505
-- confirmation_code ownership CASE are reproduced verbatim.
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
  tl.origin_label,
  -- #574: attribution — NULL for self-logged/confirmed legs; the tagger's
  -- trip_member_id for an unconfirmed tag. Not private (the manifest already
  -- surfaces "Added by X"), so no ownership CASE.
  tl.written_by_trip_member_id
from public.travel_legs tl;

comment on view public.travel_legs_manifest is
  'Arrivals-manifest read surface for travel_legs. Nulls confirmation_code unless the row belongs to the caller (first field-level-private column, #505). #574 adds written_by_trip_member_id (plain — pending-tag detection). App reads (getTravelLegsByTrip) go through this view; writes stay on travel_legs.';

-- Grant hygiene (#361 / anon-oracle memory): `create or replace view` keeps
-- the existing ACL, but re-assert to be explicit and survive any local
-- grant-repair. SELECT to authenticated ONLY; nothing to anon; no DML.
revoke all on public.travel_legs_manifest from public, anon, authenticated, service_role;
grant select on public.travel_legs_manifest to authenticated;

-- End of 20260810030000_travel_legs_cotraveler_tagging.sql
