-- Two-section travel model (#477). Additive column adds on an already
-- RLS'd table. Existing row-level policies cover the new columns —
-- no policy changes, no grant changes, no new indexes.

alter table public.travel_legs
  add column direction    text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  add column airport      text,
  add column origin_label text;

-- The default is a one-shot backfill for pre-existing (arrival) rows.
-- Drop it so future inserts must state direction explicitly (rule 8).
alter table public.travel_legs alter column direction drop default;

comment on column public.travel_legs.direction is
  '#477. inbound = getting there (writes arrive_at); outbound = heading home (writes depart_at). Backfilled to inbound (legacy legs were arrivals); default dropped post-backfill — writes must be explicit.';
comment on column public.travel_legs.airport is
  '#477. Free-text airport, e.g. "LAX". Optional. Drives manifest ride-share grouping (client-side, by airport + ~60min window).';
comment on column public.travel_legs.origin_label is
  '#477. Optional "from JFK" label, inbound only. Free text; not a structured origin.';
