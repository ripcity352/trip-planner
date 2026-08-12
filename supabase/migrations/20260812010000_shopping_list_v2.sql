-- Shopping list v2 — attribution columns + soft-remove + extended UPDATE grant.
-- RLS is UNCHANGED: the shipped shopping_list_items_update policy already gates
-- on can_see_content(trip_id, visibility); the new columns ride that policy.
-- On-behalf assign + cross-member complete are ACTION-LAYER capabilities
-- (validated in lib/actions), deliberately NOT RLS — avoids OR-stacking risk.
-- FOOTGUN unchanged: shopping_list_items already has TWO trip_members FKs
-- (created_by + claimed_by); this adds THREE more (completed_by, removed_by,
-- claim_assigned_by) — FIVE total. NEVER add a bare
-- trip_members(...) PostgREST embed — HTTP 300. All ids stay scalar; names
-- resolve app-side via resolveMemberName.

alter table public.shopping_list_items
  add column completed_by_trip_member_id     uuid references public.trip_members(id) on delete set null,
  add column removed_by_trip_member_id       uuid references public.trip_members(id) on delete set null,
  add column removed_at                       timestamptz,
  add column claim_assigned_by_trip_member_id uuid references public.trip_members(id) on delete set null;

-- Extend the COLUMN-SCOPED update grant to add the four new mutable columns.
-- id, trip_id, created_by_trip_member_id, visibility, idempotency_key,
-- created_at stay immutable-after-insert (NOT granted). The shipped grant of
-- (name, category, bought, claimed_by_trip_member_id, cost_cents, currency)
-- remains in force from 20260811010000; grant is additive.
grant update (completed_by_trip_member_id, removed_by_trip_member_id, removed_at,
              claim_assigned_by_trip_member_id)
  on public.shopping_list_items to authenticated;
