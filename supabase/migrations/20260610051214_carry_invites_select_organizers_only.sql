-- =============================================================
-- CARRY 2e (#155): tighten invites SELECT RLS to organizers-only
-- =============================================================
-- What: drop the M1 member-level SELECT policy on public.invites and
-- replace it with an organizer-gated one keyed on is_trip_organizer
-- (which includes co_organizer since 20260519191413_m2_*).
--
-- Why: invite tokens are an organizer affordance. The M1 policy
-- ("members can see invites for their trips", is_trip_member) let ANY
-- trip member `select token from invites` directly — raw multi-use
-- tokens readable by non-organizers. The organizer-gated page at
-- /trips/[tripId]/invites was the only protection (page-level gate);
-- this makes the row level the authoritative gate (defense-in-depth,
-- per CLAUDE.md rule 5: RLS is the source of truth for access control).
--
-- Invitee path unaffected: accept_invite + invite_preview are
-- SECURITY DEFINER and bypass RLS by design.
--
-- Rollback: recreate the dropped policy verbatim —
--   create policy "members can see invites for their trips"
--     on public.invites for select
--     to authenticated
--     using (public.is_trip_member(trip_id));
-- =============================================================

drop policy "members can see invites for their trips" on public.invites;

create policy "organizers can see invites for their trips"
  on public.invites for select
  to authenticated
  using (public.is_trip_organizer(trip_id));

comment on policy "organizers can see invites for their trips" on public.invites is
  'Invite tokens are an organizer affordance (#155). Organizers + co-organizers only; members route through SECURITY DEFINER invite_preview/accept_invite.';
