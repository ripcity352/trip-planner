-- =============================================================
-- #549 — organizer-sent RSVP confirm-prompt for offline-relayed intent
-- =============================================================
-- What: when a member tells an organizer their RSVP out-of-band (text, DM,
-- in person), the organizer sends a private, pre-filled *confirm prompt* —
-- "Dave heard you're in — tap to confirm" — rather than the app or the
-- organizer writing `trip_members.rsvp_status` directly. The member's own
-- tap is the ONLY thing that ever writes the real status column (the
-- existing setRsvpAction path). This table only holds the pending ASK.
--
-- Why a prompt, not a direct write (see issue #549): `trip_members` also
-- carries role / is_celebrant / membership on the same row, so a
-- column-scoped organizer write would need a SECURITY DEFINER RPC or a
-- column trigger — more risk for the same member-facing outcome. The
-- confirm-prompt keeps the organizer entirely OUT of the rsvp_status write
-- path: no ambiguity about whether an organizer's write is authoritative,
-- because the organizer never writes it.
--
-- Relation to #171/#550: structurally the same attribution+confirm family,
-- but LIGHTER — no member-owned row is ever mutated by the organizer, so
-- there is no on-behalf-attribution-on-the-real-row to forge. The forgery
-- surface here is only "who sent the ask", pinned by the sent_by binding.
--
-- RULE-9 note (idempotency): the natural one-active-prompt-per-member
-- unique index (rsvp_confirm_prompts_one_active) + organizer upsert-replace
-- IS the idempotency guarantee — a drunk double-tap replaces the row in
-- place rather than stacking a second ask (no nudge-spam, the whole point).
-- idempotency_key is still carried for audit/parity and passed by the
-- action, but the dedup is structural, so there is no separate partial
-- unique on it (that would fight the upsert's single conflict target).
--
-- GRANTS: this table is created AFTER 20260711180000_restore_base_table_
-- grants (which set ALTER DEFAULT PRIVILEGES for future postgres objects),
-- so DML would be inherited — but we grant explicitly to `authenticated`
-- too, so the table's access contract is legible in its own migration and
-- does not depend on a default-privilege side effect. RLS (below, same
-- migration) is the actual access-control layer; anon has no policy and is
-- denied regardless.
-- =============================================================

create table public.rsvp_confirm_prompts (
  id                     uuid primary key default gen_random_uuid(),
  -- Denormalized for RLS/scoping (announcement_reactions precedent). The
  -- INSERT policy pins it: the target + sender must both be members of THIS
  -- trip_id, so it cannot lie.
  trip_id                uuid not null references public.trips(id) on delete cascade,
  -- The member being asked to confirm.
  trip_member_id         uuid not null references public.trip_members(id) on delete cascade,
  -- The organizer who sent the ask (attribution; the sent_by binding pins
  -- this to the caller's own membership).
  sent_by_trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  -- What the organizer heard. Never 'pending' — a prompt proposes a real
  -- status the member confirms. Matches SettableRsvpStatus (going/maybe/
  -- declined) in lib/actions/rsvp.ts.
  proposed_status        rsvp_status not null,
  note                   text,
  idempotency_key        uuid,
  created_at             timestamptz not null default now(),
  constraint rsvp_confirm_prompts_status_not_pending
    check (proposed_status <> 'pending'),
  -- A prompt cannot ask a member to confirm on their own behalf.
  constraint rsvp_confirm_prompts_no_self_ask
    check (trip_member_id <> sent_by_trip_member_id),
  -- Mirror the action-layer 500-char cap at the DB (RLS/DB is the source of
  -- truth — a direct PostgREST write can't smuggle an oversized note past it).
  constraint rsvp_confirm_prompts_note_len
    check (note is null or char_length(note) <= 500)
);

-- One active prompt per member (replace-not-stack → no nudge-spam). This is
-- also the upsert conflict target and the rule-9 idempotency guarantee.
create unique index rsvp_confirm_prompts_one_active
  on public.rsvp_confirm_prompts (trip_member_id);

create index rsvp_confirm_prompts_trip_idx
  on public.rsvp_confirm_prompts (trip_id);

comment on table public.rsvp_confirm_prompts is
  '#549. A pending organizer→member RSVP confirm-prompt ("Dave heard you''re in — tap to confirm"). NEVER writes trip_members.rsvp_status — the member''s own tap via setRsvpAction does. One active per member (replace-not-stack). Deleted on confirm or dismiss.';

comment on column public.rsvp_confirm_prompts.proposed_status is
  '#549. What the organizer heard (going/maybe/declined, never pending). The member confirms it via the existing setRsvpAction path; this column is the pre-fill, not the authoritative status.';

-- =============================================================
-- RLS — same migration as the table (house rule / rule #5).
--   - member SELECT + DELETE own: sees the ask, confirms (delete after
--     setRsvpAction) or dismisses (delete).
--   - organizer SELECT (trip-scoped): reads asks in their trip — needed so
--     the roster can show an "asked" cue, AND load-bearing for the
--     upsert-replace path (Postgres INSERT ... ON CONFLICT DO UPDATE
--     rejects the update as an RLS violation unless the conflicting row is
--     SELECT-visible to the caller).
--   - organizer INSERT + UPDATE: sends / replaces the ask, attributed to
--     self (sent_by binding, anti-self-ask). No organizer DELETE — the ask
--     belongs to the member once sent (they dismiss; an organizer corrects
--     by replacing, not deleting).
-- =============================================================

alter table public.rsvp_confirm_prompts enable row level security;

grant select, insert, update, delete
  on public.rsvp_confirm_prompts to authenticated;

-- Member reads the ask addressed to them (drives the /me confirm UI).
create policy "rsvp prompts: member reads own"
  on public.rsvp_confirm_prompts for select
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = rsvp_confirm_prompts.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- Organizers read asks in their trip: enables the roster "asked" cue and
-- is load-bearing for the upsert-replace path (ON CONFLICT DO UPDATE needs
-- the conflicting row to be SELECT-visible to the caller). Scoped to the
-- caller's organized trip — a member's dismissal is invisible to organizers
-- (the row simply disappears), and organizers of other trips see nothing.
create policy "rsvp prompts: organizers read trip asks"
  on public.rsvp_confirm_prompts for select
  to authenticated
  using (public.is_trip_organizer(trip_id));

-- Organizer sends an ask to a member of their trip, attributed to self.
--   (a) caller is an organizer of the claimed trip;
--   (b) TENANCY (rule #6) — the target is a member of that same trip (pins
--       the denormalized trip_id);
--   (c) SENDER BINDING — sent_by is the caller's OWN membership in that
--       trip (cannot ghost-send under another organizer's name);
--   (the no-self-ask invariant is a table CHECK constraint).
create policy "rsvp prompts: organizer sends"
  on public.rsvp_confirm_prompts for insert
  to authenticated
  with check (
    public.is_trip_organizer(trip_id)
    and trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = rsvp_confirm_prompts.trip_id
    )
    and sent_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = rsvp_confirm_prompts.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- Organizer replaces an outstanding ask (the upsert conflict path — INSERT
-- ... ON CONFLICT (trip_member_id) DO UPDATE). USING lets an organizer
-- target any ask in their trip; WITH CHECK pins the post-state to the same
-- sender binding as INSERT. No DELETE for organizers — once sent, the ask
-- is the member's to keep or dismiss.
create policy "rsvp prompts: organizer replaces"
  on public.rsvp_confirm_prompts for update
  to authenticated
  using (public.is_trip_organizer(trip_id))
  with check (
    public.is_trip_organizer(trip_id)
    and trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = rsvp_confirm_prompts.trip_id
    )
    and sent_by_trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = rsvp_confirm_prompts.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- Member dismisses or (post-confirm) clears their own ask.
create policy "rsvp prompts: member deletes own"
  on public.rsvp_confirm_prompts for delete
  to authenticated
  using (
    trip_member_id in (
      select tm.id from public.trip_members tm
      where tm.trip_id = rsvp_confirm_prompts.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- End of 20260810020000_rsvp_confirm_prompts.sql
