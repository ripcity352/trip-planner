-- =============================================================
-- 20260815010000_itinerary_item_comments.sql
-- Flat comment thread on itinerary items ("plans").
--
-- Near-verbatim clone of 20260813010000_poll_comments.sql — same table
-- shape, same RLS pattern, same grants. Parent is `itinerary_items`
-- (not `polls`); visibility routes through the item's OWN
-- can_see_content(trip_id, visibility), the same helper itinerary_items'
-- own SELECT policy already uses (20260520052357_m3_itinerary_
-- announcements.sql: "itinerary: members read via visibility").
--
-- Scope: ONE flat thread per item, no nesting/replies. Comments are
-- immutable once posted — no UPDATE policy (absence is the load-bearing
-- guarantee — see the note below).
--
-- NO UPDATE POLICY — comments are immutable once posted. The ABSENCE of
--   a permissive UPDATE policy is itself the load-bearing immutability
--   guarantee: RLS default-denies, so even if a future #361-style
--   blanket grant-repair re-grants UPDATE at the table-privilege level,
--   there is still no policy that would authorize a row to be touched
--   (mirrors poll_comments / shopping_item_comments).
--
-- Grants (REQUIRED, #361 hygiene): revoke all from public/anon/
--   authenticated, then grant only select/insert/delete to
--   authenticated. No UPDATE grant — there is no UPDATE path.
-- =============================================================

create table public.itinerary_item_comments (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references public.itinerary_items(id) on delete cascade,
  -- Denormalized for RLS/scoping (poll_comments precedent). The INSERT
  -- policy pins it to the parent item's trip_id so it cannot lie.
  trip_id               uuid not null references public.trips(id) on delete cascade,
  -- ON DELETE SET NULL (not cascade): a departed member's comment stays
  -- in the thread as an orphaned/organizer-delete-only row (author
  -- fallback resolves to "Someone" app-side) rather than vanishing.
  author_trip_member_id uuid references public.trip_members(id) on delete set null,
  body                  text not null,
  idempotency_key       uuid,
  created_at            timestamptz not null default now(),
  constraint itinerary_item_comments_body_not_blank check (length(btrim(body)) > 0),
  constraint itinerary_item_comments_body_len       check (length(body) <= 500)
);

create unique index itinerary_item_comments_idempotency
  on public.itinerary_item_comments (item_id, author_trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index itinerary_item_comments_item_idx on public.itinerary_item_comments(item_id);
create index itinerary_item_comments_trip_idx on public.itinerary_item_comments(trip_id);

comment on table public.itinerary_item_comments is
  'Flat comment thread on itinerary items ("plans"). Visibility inherited from the parent item via can_see_content(item.trip_id, item.visibility). Immutable once posted — no UPDATE policy (absence is the load-bearing guarantee, survives a #361 blanket grant-repair). Delete: author or organizer. Author fallback is "Someone" (announcements_author_fallback), resolved app-side — never .email.';

comment on column public.itinerary_item_comments.trip_id is
  'Denormalized from the parent item for scoping; INSERT policy enforces it matches itinerary_items.trip_id (child-RLS trip_id pin).';

comment on column public.itinerary_item_comments.author_trip_member_id is
  'ON DELETE SET NULL — a departed author leaves the comment in place, orphaned (organizer-delete-only after that; app resolves display name to "Someone").';

-- =============================================================
-- RLS — same migration as the table, per house rule.
-- =============================================================

alter table public.itinerary_item_comments enable row level security;

create policy "itinerary_item_comments: members read via parent visibility"
  on public.itinerary_item_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.itinerary_items i
      where i.id = itinerary_item_comments.item_id
        and i.trip_id = itinerary_item_comments.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "itinerary_item_comments: author insert via parent visibility"
  on public.itinerary_item_comments
  for insert
  to authenticated
  with check (
    author_trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = itinerary_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.itinerary_items i
      where i.id = itinerary_item_comments.item_id
        and i.trip_id = itinerary_item_comments.trip_id
        and public.can_see_content(i.trip_id, i.visibility)
    )
  );

create policy "itinerary_item_comments: author or organizer delete"
  on public.itinerary_item_comments
  for delete
  to authenticated
  using (
    author_trip_member_id in (
      select tm.id
      from public.trip_members tm
      where tm.trip_id = itinerary_item_comments.trip_id
        and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

-- NOTE: no UPDATE policy — comments are immutable once posted.

-- =============================================================
-- Grants (#361 hygiene — REQUIRED).
-- =============================================================

revoke all on public.itinerary_item_comments from public, anon, authenticated;
grant select, insert, delete on public.itinerary_item_comments to authenticated;

-- =============================================================
-- Realtime publication add — guarded, no-op when the
-- supabase_realtime publication doesn't exist (bare CI Postgres).
-- NOTE: the UI must NOT hard-depend on this — see the #349 pattern
-- (router.refresh() on the viewer's own mutation) in item-comment-section.tsx.
-- =============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.itinerary_item_comments';
  end if;
end
$$;

-- =============================================================
-- End of 20260815010000_itinerary_item_comments.sql
-- =============================================================
