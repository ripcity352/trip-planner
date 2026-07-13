-- =============================================================
-- 20260713090000_set_trip_celebrant_rpc.sql
-- Celebrant assignment — the one role edit no code path could perform.
--
-- Gap: create_trip_with_organizer inserts is_celebrant=false ("set in a
-- later step" — M2), setMemberRoleAction refuses celebrant rows, and the
-- #418 hardening (20260710070000_trip_members_rls_hardening.sql) pins
-- is_celebrant immutable via WITH CHECK for every non-founder writer.
-- Downstream features (hide_from_celebrant visibility, the celebrant-
-- weighted date poll, the celebrant badge) shipped waiting for a
-- celebrant that nothing could ever set.
--
-- Shape (operator-approved): a SECURITY DEFINER RPC rather than relaxing
-- the #418 WITH CHECK pins. The pins stay exactly as shipped — direct
-- PostgREST writes still cannot flip is_celebrant; this function is the
-- single sanctioned path, and it re-checks authorization in-function.
--
-- Semantics:
--   * caller must be the trip FOUNDER (role='organizer' — the seat
--     minted once by create_trip_with_organizer, the same predicate as
--     public.is_trip_founder); co_organizers do NOT qualify.
--   * p_member_id NULL   → clear the trip's celebrant (nobody holds it).
--   * p_member_id set    → that member (must belong to p_trip_id)
--     becomes the celebrant; any previous celebrant is cleared in the
--     same statement sequence. One function body = one transaction, so
--     the trip_members_one_celebrant partial unique index can never
--     trip mid-swap.
--   * Naturally idempotent: replaying the same call is a no-op.
-- =============================================================

create or replace function public.set_trip_celebrant(
  p_trip_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- FOUNDER gate. SECURITY DEFINER bypasses RLS, so this in-function
  -- check IS the access control — same predicate as is_trip_founder()
  -- but inlined so the empty search_path stays airtight.
  if v_user_id is null or not exists (
    select 1
    from public.trip_members
    where trip_id = p_trip_id
      and user_id = v_user_id
      and role = 'organizer'
  ) then
    raise exception 'set_trip_celebrant: caller is not the trip founder'
      using errcode = '42501';
  end if;

  -- Target must be a member of THIS trip (multi-tenant rule 6 — a
  -- member id from another trip must miss loudly, not silently no-op).
  if p_member_id is not null and not exists (
    select 1
    from public.trip_members
    where trip_id = p_trip_id
      and id = p_member_id
  ) then
    raise exception 'set_trip_celebrant: target is not a member of this trip'
      using errcode = '42501';
  end if;

  -- Clear the current holder (unless they ARE the target — replay no-op).
  update public.trip_members
     set is_celebrant = false
   where trip_id = p_trip_id
     and is_celebrant
     and (p_member_id is null or id <> p_member_id);

  -- Crown the target. Cleared-first ordering means the
  -- trip_members_one_celebrant partial unique index never sees two.
  if p_member_id is not null then
    update public.trip_members
       set is_celebrant = true
     where trip_id = p_trip_id
       and id = p_member_id
       and not is_celebrant;
  end if;
end;
$$;

comment on function public.set_trip_celebrant(uuid, uuid) is
  'Founder-only celebrant assignment. Clears any existing celebrant on the trip, then sets is_celebrant on p_member_id (NULL = just clear). SECURITY DEFINER because the #418 WITH CHECK pins deliberately make is_celebrant immutable to every direct writer; this RPC is the single sanctioned path and enforces the founder gate + trip-membership check in-function. Atomic (one body = one transaction) and naturally idempotent.';

-- SECURITY DEFINER anon-oracle lockdown (project incident lesson —
-- PostgREST exposes every executable public function as an RPC, and
-- functions get EXECUTE granted to PUBLIC by default): revoke from
-- public AND anon, grant only to authenticated, in this same migration.
revoke execute on function public.set_trip_celebrant(uuid, uuid) from public, anon;
grant  execute on function public.set_trip_celebrant(uuid, uuid) to authenticated;

-- =============================================================
-- End of 20260713090000_set_trip_celebrant_rpc.sql
-- =============================================================
