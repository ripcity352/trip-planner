-- 20260709170000_expenses_update_delete_atomic_rpc.sql
-- Correctable money (#383 + #384).
--
-- Expenses were append-only: SELECT + INSERT policies only, and the
-- create path was a non-atomic two-statement write whose
-- INSERT..RETURNING read aborted 42501 for any expense hidden from its
-- own author (Postgres applies the SELECT policy to RETURNING).
--
--   1. UPDATE + DELETE RLS on `expenses`, payer-or-organizer scoped.
--   2. Organizer-scoped ALL policy on `expense_splits` — the existing
--      payer-scoped ALL policy (dead until now) covers the payer's own
--      edit path but NOT an organizer rewriting splits on someone
--      else's expense.
--   3. `create_expense_with_splits()` — atomic create RPC. SECURITY
--      INVOKER (RLS stays the source of truth), id generated inside
--      the function, INSERT with NO RETURNING, splits written in the
--      same transaction, idempotency replay returns the ORIGINAL id.

-- =============================================================
-- 1. expenses UPDATE / DELETE (payer-or-organizer)
-- =============================================================
-- UPDATE carries BOTH `using` and `with check` so a row can't be
-- reassigned out of scope: the NEW row must still be payer-owned in a
-- trip the payer belongs to, or organizer-scoped — a plain payer can't
-- park an expense in a foreign trip or hand it to another payer.
create policy "payers and organizers can update expenses"
  on public.expenses for update
  to authenticated
  using (auth.uid() = payer_id or public.is_trip_organizer(trip_id))
  with check (
    (public.is_trip_member(trip_id) and auth.uid() = payer_id)
    or public.is_trip_organizer(trip_id)
  );

comment on policy "payers and organizers can update expenses" on public.expenses is
  '#383. Payer or (co-)organizer may correct an expense. with check re-verifies the NEW row so trip_id/payer_id cannot be reassigned to escape scope.';

create policy "payers and organizers can delete expenses"
  on public.expenses for delete
  to authenticated
  using (auth.uid() = payer_id or public.is_trip_organizer(trip_id));

comment on policy "payers and organizers can delete expenses" on public.expenses is
  '#383. Payer or (co-)organizer may delete an expense; split rows follow via the expense_splits FK cascade.';

-- =============================================================
-- 2. expense_splits: organizer edit path
-- =============================================================
-- Policies are ORed, so add an organizer-scoped ALL policy alongside
-- the M1 payer-scoped one rather than widening it. NOTE (load-bearing
-- for #384): the EXISTS subqueries of both policies run under the caller's
-- `expenses` SELECT RLS (`can_see_content`), so split writes against an
-- author-invisible parent fail 42501 — which is exactly what makes the
-- RPC below abort atomically instead of committing a splitless orphan.
create policy "organizers can manage splits"
  on public.expense_splits for all
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_organizer(e.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_organizer(e.trip_id)
    )
  );

comment on policy "organizers can manage splits" on public.expense_splits is
  '#383. (Co-)organizers rewrite split rows when correcting an expense they did not pay. Complements the M1 payer-scoped ALL policy.';

-- =============================================================
-- 3. Atomic create RPC (fixes #384 layer 1)
-- =============================================================
create or replace function public.create_expense_with_splits(
  p_trip_id uuid,
  p_amount_cents integer,
  p_description text,
  p_occurred_on date,
  p_visibility trip_visibility,
  p_idempotency_key uuid,
  p_splits jsonb,
  p_currency char(3) default 'USD'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- Generated HERE, not via INSERT..RETURNING: Postgres applies the
  -- SELECT policy (can_see_content) to a RETURNING read, which aborts
  -- 42501 for any expense hidden from its own author (#384 layer 1).
  v_expense_id uuid := gen_random_uuid();
begin
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22004';
  end if;

  -- A splitless expense silently inflates the trip total (#383's live
  -- orphan). Refuse to write one. Split amounts are computed app-side
  -- (evenSplitCents sum-exact contract) — this function just writes
  -- them, atomically with the expense row.
  if p_splits is null
     or jsonb_typeof(p_splits) <> 'array'
     or jsonb_array_length(p_splits) = 0 then
    raise exception 'at least one split required' using errcode = '22023';
  end if;

  begin
    insert into public.expenses (
      id, trip_id, payer_id, amount_cents, currency,
      description, occurred_on, visibility, idempotency_key
    )
    values (
      v_expense_id,
      p_trip_id,
      auth.uid(), -- INSERT policy requires payer = caller; no spoofing
      p_amount_cents,
      coalesce(p_currency, 'USD'),
      p_description,
      coalesce(p_occurred_on, current_date),
      p_visibility,
      p_idempotency_key
    );
  exception
    when unique_violation then
      -- Idempotency replay on expenses_idempotency(trip_id, key): the
      -- first submit committed the expense AND its splits (this
      -- function is atomic), so return the ORIGINAL id — preserving
      -- the 23505 semantics of the two-statement predecessor. The
      -- re-select runs under SELECT RLS; any row committed through
      -- this function is author-readable (see split-policy note
      -- above), so null here means an unrelated conflict — re-raise.
      select id into v_expense_id
      from public.expenses
      where trip_id = p_trip_id
        and idempotency_key = p_idempotency_key;
      if v_expense_id is null then
        raise;
      end if;
      return v_expense_id;
  end;

  -- Same transaction as the expense row: a failure here (including the
  -- 42501 an author-unreadable visibility raises via the split
  -- policies' EXISTS-under-SELECT-RLS) rolls the expense back too —
  -- an error, never a silent splitless orphan.
  insert into public.expense_splits (
    expense_id, trip_member_id, amount_cents, currency
  )
  select
    v_expense_id,
    (s ->> 'trip_member_id')::uuid,
    (s ->> 'amount_cents')::integer,
    coalesce(p_currency, 'USD')
  from jsonb_array_elements(p_splits) as s;

  return v_expense_id;
end;
$$;

comment on function public.create_expense_with_splits(uuid, integer, text, date, trip_visibility, uuid, jsonb, char) is
  '#383/#384. Atomic expense + splits create. SECURITY INVOKER — RLS is the source of truth. No INSERT..RETURNING so the SELECT policy never gates creation; returns the new (or, on idempotency replay, the ORIGINAL) expense id.';

-- SECURITY INVOKER, but still trim the default PUBLIC execute grant:
-- only signed-in users have any business calling this.
revoke execute on function public.create_expense_with_splits(uuid, integer, text, date, trip_visibility, uuid, jsonb, char) from public, anon;
grant execute on function public.create_expense_with_splits(uuid, integer, text, date, trip_visibility, uuid, jsonb, char) to authenticated;
