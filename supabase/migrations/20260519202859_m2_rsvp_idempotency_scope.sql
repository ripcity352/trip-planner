-- =============================================================
-- 20260519202859_m2_rsvp_idempotency_scope.sql
-- M2 — Rescope trip_members idempotency-key uniqueness to per-
-- (trip_id, user_id, idempotency_key) per the 2026-05-19 ADR
-- ("Idempotency unique-index scope is per-table"). The previous
-- Wave-2a scope (trip_id, idempotency_key) was correct for
-- accept_invite (one row per trip per actor) but violates the
-- ADR for setRsvpAction (strictly user-scoped). Per-user scope
-- works for both operations:
--   * accept_invite — caller's idempotency_key is unique within
--     their own (trip_id, user_id) scope; replay still finds the
--     existing row.
--   * setRsvpAction — strictly user-scoped, gets correct
--     per-user uniqueness without cross-user collision risk.
--
-- Atomic: drops the old index, creates the new one, and updates
-- accept_invite() to narrow its idempotency lookup by user_id.
-- =============================================================

-- =============================================================
-- 1. Rescope the partial unique index
-- =============================================================
drop index if exists public.trip_members_idempotency_key;

create unique index trip_members_idempotency_key
  on public.trip_members (trip_id, user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.trip_members.idempotency_key is
  'Client-generated UUID for mutation replay safety (accept_invite + setRsvp). Scope (trip_id, user_id, idempotency_key) — partial unique only when set, per the 2026-05-19 idempotency-scope ADR.';

-- =============================================================
-- 2. Update accept_invite() to narrow idempotency lookup by user_id
-- =============================================================
-- Functionally a no-op for current callers (each user has at most
-- one row per (trip_id, user_id) anyway) but future-proofs the
-- query against the new index shape and makes the scope explicit.
create or replace function public.accept_invite(
  p_token uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite record;
  v_existing_member_id uuid;
  v_new_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Lock the invite row to serialize concurrent accepts.
  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  if v_invite.uses_left is not null and v_invite.uses_left <= 0 then
    raise exception 'invite_exhausted' using errcode = 'P0001';
  end if;

  -- Idempotency: same (trip, user, key) returns the existing row
  -- without inserting again or decrementing uses_left. Scope now
  -- includes user_id to align with the per-(trip, user, key)
  -- unique index and the idempotency-scope ADR.
  select id into v_existing_member_id
  from public.trip_members
  where trip_id = v_invite.trip_id
    and user_id = v_user_id
    and idempotency_key = p_idempotency_key;

  if v_existing_member_id is not null then
    return v_existing_member_id;
  end if;

  -- Re-claim path: caller is already a member (perhaps via a different
  -- code path) — return their existing row, don't double-insert.
  select id into v_existing_member_id
  from public.trip_members
  where trip_id = v_invite.trip_id
    and user_id = v_user_id;

  if v_existing_member_id is not null then
    return v_existing_member_id;
  end if;

  insert into public.trip_members (
    trip_id, user_id, role, idempotency_key, rsvp_status
  )
  values (
    v_invite.trip_id, v_user_id, 'attendee', p_idempotency_key, 'pending'
  )
  returning id into v_new_member_id;

  if v_invite.uses_left is not null then
    update public.invites
    set uses_left = uses_left - 1
    where token = p_token;
  end if;

  return v_new_member_id;
end;
$$;

comment on function public.accept_invite(uuid, uuid) is
  'Idempotent accept-invite. Returns trip_members.id. Idempotency scope (trip_id, user_id, idempotency_key) per 2026-05-19 ADR. Errors: invite_not_found (P0002), invite_expired / invite_exhausted (P0001).';

-- =============================================================
-- End of 20260519202859_m2_rsvp_idempotency_scope.sql
-- =============================================================
