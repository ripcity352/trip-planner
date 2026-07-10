-- =============================================================
-- invite_preview v2 — #364 (return `date`, not timestamptz) +
--                     #367 (viewer_is_member + member-only trip_slug)
-- =============================================================
--
-- What changes vs the M2 v1 (20260519191413_m2_trips_and_invites.sql):
--
--   1. `starts_at` / `ends_at` are returned as `date` — the underlying
--      `trips` columns' real type. v1 cast them to timestamptz at
--      midnight UTC "for signature alignment", which made the invite
--      landing + OG card render every trip one day early west of UTC
--      (#364). The lib/db boundary truncation shipped in #373 stays as
--      belt-and-braces; this closes the deferred RPC-return-type half.
--      Transport rule (notes/design-system.md "Parsing axis"): a
--      date-only column stays `YYYY-MM-DD` at every hop.
--
--   2. New `viewer_is_member boolean` — true iff auth.uid() is present
--      AND is a trip_member of the invite's trip. Anon callers always
--      get false. Lets `/invite/[token]` swap "Count me in" for a
--      re-entry affordance when a member re-taps the group-chat link
--      (#367).
--
--   3. New `trip_slug text` — non-null ONLY when viewer_is_member.
--      A confirmed member can already see the trip under RLS; this
--      merely lets the page link straight to /trips/<slug>. There is
--      no other RLS-safe token→trip path for a plain member (invites
--      SELECT is organizer-only since #155). Anon / non-member callers
--      always get null, so anonymous disclosure is UNCHANGED: trip
--      name, dates, host display name, bucketed attendee count.
--
-- Security posture is otherwise preserved EXACTLY from v1:
--   - SECURITY DEFINER + STABLE + `set search_path = public`
--   - deliberately anon-callable (grant to anon, authenticated)
--   - returns zero rows for expired / exhausted / missing invites and
--     soft-deleted trips (anti-enumeration: indistinguishable outcomes)
--   - attendee count stays BUCKETED (raw integer = enumeration oracle)
--
-- DROP + CREATE (not CREATE OR REPLACE): Postgres cannot change a
-- function's OUT columns in-place. Single statement window; callers
-- (invite landing, OG image) tolerate a transient failure by rendering
-- the generic fallback, and the lib/db mapper fails CLOSED
-- (viewer_is_member=false) if it ever sees the v1 shape.

drop function public.invite_preview(uuid);

create function public.invite_preview(p_token uuid)
returns table(
  trip_name text,
  starts_at date,
  ends_at date,
  host_display_name text,
  attendee_count_bucket text,
  viewer_is_member boolean,
  trip_slug text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_invite record;
  v_is_member boolean;
begin
  select
    i.trip_id     as trip_id,
    i.created_by  as created_by,
    t.name        as trip_name,
    t.slug        as trip_slug,
    t.starts_at   as trip_starts_at,
    t.ends_at     as trip_ends_at
  into v_invite
  from public.invites i
  join public.trips t on t.id = i.trip_id
  where i.token = p_token
    and (i.expires_at is null or i.expires_at > now())
    and (i.uses_left is null or i.uses_left > 0)
    and t.deleted_at is null;

  if not found then
    return;
  end if;

  -- #367: cookie-bound callers get a membership verdict. `auth.uid()`
  -- reads the caller's JWT claim (request-scoped GUC), so it works
  -- inside SECURITY DEFINER; anon callers have no claim → false.
  v_is_member := auth.uid() is not null and exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = v_invite.trip_id
      and tm.user_id = auth.uid()
  );

  return query
  select
    v_invite.trip_name::text,
    -- #364: `trips.starts_at` / `ends_at` ARE `date` columns — return
    -- them as-is. No timestamptz cast, ever (transport rule).
    v_invite.trip_starts_at,
    v_invite.trip_ends_at,
    coalesce(
      (
        select tm.display_name
        from public.trip_members tm
        where tm.trip_id = v_invite.trip_id
          and tm.user_id = v_invite.created_by
        limit 1
      ),
      (
        select p.display_name
        from public.profiles p
        where p.id = v_invite.created_by
      ),
      'a friend'
    )::text as host_display_name,
    -- Bucket cutoffs unchanged from v1 — widened so a single attendee
    -- can't be identified by their bucket flipping; floor of 3 keeps the
    -- first bucket from acting as an enumeration oracle.
    case
      when ac.cnt <= 3  then 'just-getting-started'
      when ac.cnt <= 8  then 'small-crew'
      when ac.cnt <= 20 then 'full-house'
      else                   'big-group'
    end::text as attendee_count_bucket,
    v_is_member,
    -- Slug disclosed to confirmed members only; anon / non-member → null.
    case when v_is_member then v_invite.trip_slug::text else null end
  from (
    select count(*)::int as cnt
    from public.trip_members
    where trip_id = v_invite.trip_id
  ) ac;
end;
$$;

comment on function public.invite_preview(uuid) is
  'Logged-out-safe invite preview (v2). Dates as `date` (#364), bucketed attendee count (anti-enumeration), viewer_is_member + member-only trip_slug (#367). NULL/empty if expired, exhausted, or trip soft-deleted.';

grant execute on function public.invite_preview(uuid) to anon, authenticated;
