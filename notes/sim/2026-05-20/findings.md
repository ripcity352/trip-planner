# M4 sim — findings (synthesis)
> Run 2026-05-20 by `m4-sim-2026-05-20` team. Future-state guide written by spec-architect, then walked by three personas (celebrant David, organizer Dave, edge-attendee Marcus) and audited by a technical critic (initial pass + 4-batch re-audit after lead-prompted deep questions). All four primary filings on disk in this directory.
>
> **Final tally:** 44 persona findings filed → 40 confirmed / 3 downgraded / 3 upgraded / 1 rejected. Critic added 6 cross-cutting findings the personas couldn't surface in-character. 6 M4 ship-blockers identified; all bundle into ONE carry-back migration + ONE microcopy PR.

---

## One-page top — what to ship this week

The sim surfaced **6 real M4 ship-blockers** that bundle into **one carry-back migration + one microcopy PR**, plus two ADRs for `notes/decisions.md`. The `roadmap.md:194` STOP HERE line held under three-persona pressure. The DoD as written is correct.

### 6 ship-blockers (one migration + one microcopy PR)

**Carry-back migration ("M4 carry-back hardening"):**

1. **Member self-read SELECT policy on `itinerary_item_member_flags`** *(highest-leverage; three-persona convergence: org O5 + edge E1 + critic pre-load).* Without it, the #165 chip picker is dead-on-arrival — partial-unique `(item_id, trip_member_id, flag)` collides on second pick and user has no read-back. One additive policy:
   ```sql
   create policy "item flags: owner reads own"
     on public.itinerary_item_member_flags
     for select to authenticated
     using (trip_member_id in (select id from public.trip_members where user_id = auth.uid()));
   ```

2. **`invites.idempotency_key` column (#158).** Promised by the guide; doesn't exist in `0001_init.sql:90-99`. Drunk-double-tap on "Mint a link" is the literal stated threat model (`decisions.md:163`). Two lines:
   ```sql
   alter table public.invites add column idempotency_key uuid;
   create unique index invites_idempotency on public.invites (trip_id, idempotency_key)
     where idempotency_key is not null;
   ```

3. **`invites.token` SELECT RLS tightening (#155)** — from `is_trip_member` → `is_trip_organizer`. Safe because `accept_invite` and `invite_preview` are both SECURITY DEFINER (RLS-bypass). Page-level gate becomes belt-and-suspenders.

4. **`trips.timezone` column (#108)** — pick the right path, not quickest. UTC-mid-day-anchor breaks the moment `datetime-local` (#167) ships.
   ```sql
   alter table public.trips add column timezone text not null default 'America/Los_Angeles';
   ```
   Plus `date-fns-tz` imports at render sites (`now-next-card.tsx`, arrivals manifest, item cards).

**Microcopy PR:**

5. **Member-flag composer heading microcopy.** Adopt Marcus's strings as-is:
   - Heading: `"Anything we should know?"`
   - Subhead: `"Just for the organizer — private to you."`

   Without these keys in `lib/copy/empty-states.ts`, the #165 chip-picker PR can't pass the PR-template microcopy gate (`roadmap.md:172`).

6. **`Cocktail` chip rename to `Cocktail attire` + "Dress code:" item-card label.** Three-persona agreement on ambiguity (drink vs dress on a dress-code picker). One chip rename + one-line item-card template change. Belt-and-suspenders against mis-parse.

**Bundle the migration:** all 4 schema/RLS deltas above + the M2/M3 carry-backs (#154 column-scoped UPDATE policy on `invites.expires_at`; #166 columns `address_place_id, address_provider`; #168 columns `airline_iata, flight_number`) into ONE M4 carry-back migration file. Per `notes/database-workflow.md:75-84`, "one migration per logical change" allows themed bundles; nine schema/RLS changes share the same theme — *M4 carry-back hardening*. Five separate migrations would be noise.

### Two ADRs for `notes/decisions.md`

**A. Full-filter wins for `hide_from_celebrant`, decoy-item pattern is the workaround.** Independently surfaced by celebrant C1, organizer O2, and critic pre-load. Blur pattern would require a NEW masked-SELECT shape because `can_see_content()` is boolean. Full-filter is what M3 ships and what `persona-groom.md:41` requires. **Pair the ADR with the decoy-item pattern:** organizer fills multi-hour surprise windows with a `visibility=everyone` decoy item ("free time / regroup at 5:30"). Critic verified the pattern is RLS-tight — there's no `(trip_id, day, start_time)` uniqueness, so the decoy is structurally indistinguishable from real scheduling overlap (plausible deniability, not a leak). **Future-decisions guardrail to include in the ADR:** never ship an activity feed or recent-changes surface exposing `created_at` timestamps to the celebrant — would reveal decoys by adjacency.

**B. `#4` organizer-write-on-behalf for member-flags: M5+ on scope, principle holds with attribution.** Critic walked back the initial "principle-inversion" framing after the edge-attendee's principled defense + the `lodging_assignments` precedent. The master principle (`persona-edge-attendees.md:11-18`) protects against the app *assuming* a default — not against an organizer banking a fact a member already volunteered. With three preserve-conditions, the principle holds: (1) `written_by_trip_member_id uuid references trip_members(id)` (NOT `auth.users(id)`, per the M1 FK-retargeting convention), (2) the organizer-on-behalf INSERT policy is additive + includes `trip_member_id <> written_by_trip_member_id` defense-in-depth so an organizer can't forge member-self attribution, (3) when self-read (#1 above) lands, member-side picker surfaces organizer-written rows with a one-tap `"Dave saved this for you — keep it?"` confirm/remove affordance. **Land in M5+** on scope (3-of-4 M4 budget hats in one feature is too much), document the principle position so M5 retro reopens cleanly with the right design.

### Conditional: composer dashboard (org #1) — held at the boundary

Critic's re-audit walked back from "rejected as scope creep" to **conditional nice-to-have**. Dave's framing ("unblocking organizer cognition, not gamifying engagement") is defensible IF held strictly to:
- 3 flat lists with H2 headers
- No badges
- No counts in H1
- No "X of Y reviewed"
- No filter/sort interactivity

If those constraints can be guaranteed, ship in the M4 polish slot alongside theming + microcopy (~100 lines TSX, no schema). If any feature-creep starts, **defer the whole thing to M5** — it sits one bad PR away from completion-score territory (`killed-and-deferred.md:42-45`). The 3 queries (outstanding-RSVP, next-7-days, items-with-flags) all hit existing tables/indexes/RLS; one watch-out is `lib/db/trips.ts` materialization of the "outstanding" join against `trip_member_days`.

**My call:** ship only if explicit constraints land in a single decisions.md anti-creep entry. Otherwise defer.

---

## Out-of-scope (correctly rejected)

- **Org #11 lodging roster view** — folds into the dashboard; don't ship without it.
- **Celebrant #14 silent-veto on itinerary items** — inverting M3's organizer-write/member-read model is a post-retro decision. Hard-no for M4 even if budget exists.
- **All persona "killed-but-regretted" findings** (money pool, Group Recap, Hot Seat, Drumroll, Lock-In Day, etc.) — the sim confirmed the deferrals were correctly identified.

## One retired-ask to record in decisions.md

- **Edge #5 silent "heading back" ping for safety-coded use cases.** Critic insight: the right product answer is *text-organizer-directly* (organizer phone is on the M3 roster), not in-app push. In-app push only fires when the organizer has the app open. Record as a **retired ask** so M5 retro doesn't re-propose the killed outbox seam (`killed-and-deferred.md:26`) under safety-coded framing.

## ~10 non-blocker carry-back items (same migration/PR cycle)

- Drop `skipping this one` chip from `lib/data/member-flags.ts` — per-item RSVP `skipping` is the canonical surface; one-line edit + decisions.md entry
- `Athleisure` → `Golf casual` rename (critic sided with the read-surface personas David + Dave over Marcus's "keep it"); `spa` stays
- Add `MINT_INVITE` to #141 rate-limit ratchet (10/hour) AND to #139 fail-closed list (mirrors `ACCEPT_INVITE`); currently both omit it
- Server-proxy route `app/api/places/autocomplete/route.ts` with new `PLACES_AUTOCOMPLETE` rate-limit scope (resolves Places API key visibility — server-only, never browser-exposed even with HTTP-referrer restriction)
- Custom-chip storage = raw user text without `"Custom: "` prefix; UI derives non-preset by string-match against the preset constant
- Preview-as-celebrant toggle (org #19 + celebrant C2) — cross-surfaced finding; defer to M5+ unless trivial server-rendered alt-path exists

## Sim-level meta

- **The biggest risk this sim surfaced was organizer-narrative scope creep, not under-spec'd surfaces.** Celebrant filed 0 ship-blockers (15 findings, all M5+ or drop). Edge-attendee filed 3 ship-blockers, all 3 close with the one-line self-read policy + microcopy gate already in M4.
- **Strongest cross-persona signal:** flag-lifecycle UX cluster (self-read + delivery confirmation + write-on-behalf attribution). Self-read earns M4. The other two earn M5+ with the principle position documented.
- **16 of 21 guide §6 open questions now resolvable in-M4.** Full table in [`findings-critic.md`](./findings-critic.md). 5 remain genuinely open (chip-picker a11y, theming scope, legal voice, custom-domain mechanics, full chip empty-state strings); all 5 are operational/per-PR, not blocking-spec.

---

## What I'd do this week, in order

1. **Cut the M4 carry-back migration** with the 9 schema/RLS deltas. Foundation PR for the M4 hardening wave.
2. **Cut the microcopy PR** with the three voice fixes (Athleisure rename, Cocktail attire rename, "Dress code:" item-card label) + member-flag composer heading + subhead + the `lib/copy/empty-states.ts` keys for the three chip pickers + drop `skipping this one` from member-flags constant.
3. **Write the two ADRs in `notes/decisions.md`** (Call A: full-filter + decoy-item + activity-feed M5+ guardrail; Call B: organizer-write-on-behalf principle position with `written_by_trip_member_id` + member-confirm design constraint for M5).
4. **Make the dashboard call** — anti-creep ADR in `decisions.md` + ship in M4 IF the constraints can be guaranteed; otherwise defer with the same ADR locking the constraint set for M5 retro.
5. **Lock Places implementation** in `decisions.md`: Google + server-proxy route + new `PLACES_AUTOCOMPLETE` rate-limit scope.
6. **Record edge #5 retired-ask** in `decisions.md` (safety case → text-organizer).
7. **Leave composer dashboard (if you don't go conditional), lodging roster, silent veto, write-on-behalf, preview-as-celebrant, day-after thank-you, member-directory bios, and per-day RSVP grid for M5 retro.**

---

## Limitations of this sim

- A PostToolUse hook blocked persona Write calls; all persona findings transcribed by team-lead from SendMessage batches. Fidelity should be high; capture was less linear than the brief envisioned.
- The technical critic's file landed via Write despite the hook (hook may be scoped to a specific subagent type, or the critic ran outside the trigger window).
- Theming (Q19) and custom-domain (Q21) were the weakest sourcing areas — pre-flagged by the spec-architect and confirmed in walks; sim mostly couldn't pressure-test these without a separate spec. Both resolve at per-PR time.
- M5 money-pool absence was felt by both organizer and edge-attendee but correctly stayed deferred. Sim confirmed the deferral was correctly identified, not just punted.

---

# Per-teammate summaries (full filings on disk)

| Teammate | File | Findings | Ship-blockers (filed → post-critic) | Critic verdict net |
|---|---|---|---|---|
| Celebrant (David) | [findings-celebrant.md](./findings-celebrant.md) | 15 + 1 addendum + 1 audit | 0 → 0 | 16 confirmed; 0 rejected; 1 elevated (decoy addendum) — disciplined walk |
| Organizer (Dave) | [findings-organizer.md](./findings-organizer.md) | 19 (post cross-checks) | 3 → 2 | 15 confirmed; 1 conditional (composer dashboard); 1 folded (lodging roster); 1 downgraded (hide-from-celebrant); 1 upgraded (member self-read) |
| Edge-attendee (Marcus) | [findings-edge.md](./findings-edge.md) | 9 + 1 addendum | 3 → 2 | 9 confirmed; 1 downgraded with caveat (organizer-write-on-behalf); 1 upgraded (heading microcopy) |
| Technical critic | [findings-critic.md](./findings-critic.md) | Initial 17 pre-load findings + 32 verdicts + 4-batch re-audit | n/a | The carry-back-migration bundle + decoy-item RLS verification + 21-question delta-resolution are the highest-value synthesis outputs |
| Future-state guide | [future-state-guide.md](./future-state-guide.md) | (spec, not findings) | n/a | 21 open questions; 16 now resolvable in-M4 after walks |
