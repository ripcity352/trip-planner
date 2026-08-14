-- =============================================================
-- 20260814030000_itinerary_member_write.sql
-- Any trip member can ADD a plan (itinerary item); can EDIT/DELETE plans
-- they created. Organizers keep editing/deleting anything (unchanged).
-- Member-created plans are ALWAYS visibility = 'everyone' — members never
-- get the visibility picker; only organizers can hide a plan.
--
-- This is deliberately additive: THREE NEW, SEPARATE permissive policies.
-- The three existing organizer policies (see
-- 20260520052357_m3_itinerary_announcements.sql lines ~241-261 —
-- "itinerary: organizers insert" / "... update" / "... delete") are left
-- byte-for-byte untouched. RLS ORs permissive policies together for the
-- same command, so this composes with the organizer policies without
-- editing them.
--
-- #615/laggards-wave lesson (HIGH-severity finding): NEVER OR a member
-- condition into an existing WITH CHECK clause — that silently widens
-- what the organizer policy itself allows. A brand-new policy is the only
-- safe shape when the two roles have different invariants (organizers can
-- set any visibility; members are pinned to 'everyone').
--
-- Ownership: itinerary_items.created_by references auth.users(id).
-- "own plan" = created_by = auth.uid(). If created_by were ever null,
-- `auth.uid() = created_by` evaluates to NULL (not TRUE) under standard
-- SQL three-valued logic, so a null-owned row is correctly denied rather
-- than silently permitted.
--
-- No grant changes: INSERT/UPDATE/DELETE on itinerary_items are already
-- granted to `authenticated` (the organizer paths use them today). This
-- migration only widens which ROWS an authenticated member may touch,
-- not what the role can do — see notes/decisions.md "SECURITY DEFINER
-- anon oracle" / grant-repair memory for why we don't blanket-grant here.
-- =============================================================

-- Any trip member may add a plan, attributed to themselves, visible to
-- everyone. Members never get to set a non-default visibility on insert —
-- the DB is the source of truth for that guarantee (app layer also forces
-- it, but this WITH CHECK is what actually blocks a forged request).
create policy "itinerary: members insert"
  on public.itinerary_items
  for insert
  to authenticated
  with check (
    public.is_trip_member(trip_id)
    and auth.uid() = created_by
    and visibility = 'everyone'
  );

comment on policy "itinerary: members insert" on public.itinerary_items is
  'Additive to "itinerary: organizers insert" (RLS ORs permissive policies — organizer policy untouched). Any trip member may add a plan for themselves; forced visibility = everyone.';

-- A member may edit their OWN plan. Can't reassign created_by to someone
-- else (the using/with-check both pin auth.uid() = created_by, so a
-- member can never "adopt" or steal another member's row), and can't
-- escalate visibility off 'everyone'. The existing organizer update
-- policy (full visibility range, any row) stays untouched.
create policy "itinerary: members update own"
  on public.itinerary_items
  for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by and visibility = 'everyone');

comment on policy "itinerary: members update own" on public.itinerary_items is
  'Additive to "itinerary: organizers update" (RLS ORs permissive policies — organizer policy untouched). A member may edit their OWN plan only; visibility pinned to everyone.';

-- A member may delete their OWN plan. The existing organizer delete
-- policy (any row) stays untouched.
create policy "itinerary: members delete own"
  on public.itinerary_items
  for delete
  to authenticated
  using (auth.uid() = created_by);

comment on policy "itinerary: members delete own" on public.itinerary_items is
  'Additive to "itinerary: organizers delete" (RLS ORs permissive policies — organizer policy untouched). A member may delete their OWN plan only.';

-- End of 20260814030000_itinerary_member_write.sql
