-- Shopping list: one flat member-write table per trip. Clones ride_groups
-- column/RLS/idempotency hygiene + announcements setter patterns.
-- FOOTGUN: TWO FKs into trip_members (created_by + claimed_by). NEVER add a bare
-- trip_members(...) PostgREST embed to the columns select — returns HTTP 300.
-- Both ids stay scalar; names resolve app-side via resolveMemberName.

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_trip_member_id uuid references public.trip_members(id) on delete set null,
  claimed_by_trip_member_id uuid references public.trip_members(id) on delete set null,
  name text not null,
  category text,
  bought boolean not null default false,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  currency char(3) not null default 'USD',
  visibility public.trip_visibility not null default 'everyone',
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  constraint shopping_list_items_name_not_blank check (length(btrim(name)) > 0),
  constraint shopping_list_items_name_len      check (length(name) <= 200),
  constraint shopping_list_items_category_len  check (category is null or length(category) <= 80)
);

create unique index shopping_list_items_idempotency
  on public.shopping_list_items (trip_id, created_by_trip_member_id, idempotency_key)
  where idempotency_key is not null;

create index shopping_list_items_trip on public.shopping_list_items (trip_id);

alter table public.shopping_list_items enable row level security;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.can_see_content(trip_id, visibility));

create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id and tm.user_id = auth.uid()
    )
  );

-- UPDATE gate symmetric with read; column scope (grant below) pins the immutable cols.
create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (public.can_see_content(trip_id, visibility))
  with check (public.can_see_content(trip_id, visibility));

create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (
    created_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = shopping_list_items.trip_id and tm.user_id = auth.uid()
    )
    or public.is_trip_organizer(trip_id)
  );

revoke all on public.shopping_list_items from public, anon, authenticated;
grant select, insert, delete on public.shopping_list_items to authenticated;
-- COLUMN-SCOPED update: only mutable coordination columns. Omitting
-- visibility/trip_id/created_by/idempotency_key/id makes them immutable-after-insert.
grant update (name, category, bought, claimed_by_trip_member_id, cost_cents, currency)
  on public.shopping_list_items to authenticated;
