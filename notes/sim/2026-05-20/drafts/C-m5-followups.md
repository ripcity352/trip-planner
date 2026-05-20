# M5+ follow-up drafts (Agent C)

> **Status:** DRAFTS — for lead review before any live `gh` execution.
> **Source:** M4 pressure-test sim, run 2026-05-20 (`notes/sim/2026-05-20/`).
> **Dedup check (2026-05-20):** ran `gh issue list --milestone "M5 — Earned post-trip" --limit 30` + targeted searches for "dashboard organizer composer", "preview celebrant", "write-on-behalf member flag", "bio member directory". No live M5 dupes for any of the four issues below. Closed issue #31 (Crew Cards) is the historical precedent that Issue 4 explicitly distinguishes from per `killed-and-deferred.md:29` revival criteria.
> **Count:** 4 new issues drafted. None converted to update-comments (no dupes surfaced).
> **Labels verified against `gh label list`:** `type:feature`, `area:trips`, `area:itinerary` all exist.

---

## Issue 1: feat(m5): organizer composer dashboard with hard anti-creep constraints

**Title:** `feat(m5): organizer composer dashboard with hard anti-creep constraints`

**Labels:** `type:feature`, `area:trips`

**Milestone:** `M5 — Earned post-trip`

**Body:**

```markdown
## What

A read-only `/trips/[tripId]/organizer` route surfacing **three flat lists** for organizer cognition-unblocking on Tuesday night at 11pm:

1. Outstanding RSVP list (members who joined but haven't day-RSVP'd) with days-since-invite
2. Next 7 days items (chronological)
3. Items with member-flag rows (so the organizer knows where attention is concentrated)

No new schema. All three queries hit existing tables / existing indexes / existing RLS.

## Why it surfaced in the sim

- **Organizer Finding #1** (`notes/sim/2026-05-20/findings-organizer.md:6-13`): Dave opens the trip on T-7 and the M3 dashboard shows now/next + trip name + RSVP state. M4 ships six chip-picker composers on item-edit forms, but no aggregated "what's outstanding / at risk / next 7 days" surface.
- **Persona anchor:** `notes/research/persona-best-man.md:21` + `:109` — the "11pm Tuesday yo what's the total again" cognition-unblocking ask. The best-man framing is *unblocking organizer cognition*, NOT gamifying engagement. That distinction is load-bearing.
- **Cross-roll:** Finding #11 (lodging roster view) folds into this — don't ship the roster as a standalone surface.

## Why it didn't earn M4

- **Critic re-audit verdict** (`notes/sim/2026-05-20/findings-critic.md:444-457`): walked back from initial "rejected as scope creep" to **conditional nice-to-have**. Dave's framing is defensible IF held strictly to the anti-creep constraints below.
- **Synthesis call** (`notes/sim/2026-05-20/findings.md:57-68`): "ship only if explicit constraints land in a single decisions.md anti-creep entry. Otherwise defer." The dashboard sits **one bad PR away from completion-score territory** (hard-banned per `notes/killed-and-deferred.md:42-45` — progress bars, completion scores, streaks).
- **STOP HERE line:** `notes/roadmap.md:194` is firm about stopping at the M4 ship. The M4 budget is already loaded with the carry-back migration (9 schema/RLS deltas) + microcopy PR + ADRs. The conditional is the kind of "fit it in if you can" item that quietly breaks the milestone.
- **My read:** the safer call is defer to M5 retro. Ship only if the real-trip retro confirms Dave actually felt the cognition gap and the anti-creep constraints can be codified into an ADR pinned to the implementation PR.

## Design constraints (REQUIRED for revival)

These constraints are load-bearing — they are what separate this from a completion-score / engagement-gamification pattern. They must be codified into an ADR (`notes/decisions.md`) before any UI work starts.

- **3 flat lists with H2 headers only.** No grouping primitives, no tabs, no collapsible sections.
- **No badges.** Not on items, not on the H2 headers, not anywhere.
- **No counts in H1 / page title.** "(3 outstanding)" in a heading is a teaser disguised as utility.
- **No "X of Y reviewed" framing anywhere.** That's a completion-score smell.
- **No filter / sort / interactivity.** Read-only. The user's job is to scan and act elsewhere.
- **No "complete your dashboard" prompts** (covered by `CLAUDE.md` "What NOT to do" but worth stating again — this is where that anti-pattern would sneak in).

## Anti-patterns to watch for (cite `killed-and-deferred.md`)

- **`killed-and-deferred.md:42-45`** hard-bans progress bars, completion scores, streaks, achievement unlocks. The dashboard is the surface where any of these would creep in. If a PR adds a "3 of 8 days RSVP'd" pill, kill that PR.
- **`killed-and-deferred.md:51-52`** bans naming the last-to-RSVP person. The outstanding-RSVP list shows names by design (the organizer needs to know who to text); the rendering must avoid any "X is holding up the group" framing — order alphabetically or by days-since-invite ASC, NOT by "most behind."
- **`CLAUDE.md` rule #11** (roles add micro-affordances, not gates): this is an organizer-private surface; do not gate other features behind it.

## Schema posture (verified by critic re-audit)

- **No schema additions needed.** All three queries read existing tables with existing RLS and indexes (`notes/sim/2026-05-20/findings-critic.md:453-455`).
- **One implementation watch-out:** query (a) "outstanding" needs `lib/db/trips.ts` to materialize the LEFT JOIN against `trip_member_days` (else N+1). Pin this in the implementation issue when reviving.

## Revival path

1. Real-trip retro confirms Dave (or the equivalent organizer role) actually missed the cognition-unblocking surface during the M4 trip.
2. Open an ADR in `notes/decisions.md` codifying the anti-creep constraints above as the *definition* of what's being shipped.
3. Ship as ~100 lines of TSX, no schema, behind a single PR. If any creep emerges in review, close the PR and defer further.

## References

- `notes/sim/2026-05-20/findings.md:57-68` (synthesis — conditional approval framing)
- `notes/sim/2026-05-20/findings-organizer.md:6-13` (Finding #1)
- `notes/sim/2026-05-20/findings-organizer.md:94-100` (Finding #11 — folds in)
- `notes/sim/2026-05-20/findings-critic.md:444-457` (re-audit batch 2)
- `notes/research/persona-best-man.md:21, :109` (cognition-unblocking, not gamification)
- `notes/killed-and-deferred.md:42-45` (hard-bans on completion-score patterns)
- `notes/roadmap.md:194` (STOP HERE)
```

---

## Issue 2: feat(m5): organizer "preview as celebrant" toggle for visibility verification

**Title:** `feat(m5): organizer "preview as celebrant" toggle for visibility verification`

**Labels:** `type:feature`, `area:trips`

**Milestone:** `M5 — Earned post-trip`

**Body:**

```markdown
## What

A `?as_celebrant=true` query path (or equivalent server-rendered alt view) that lets an organizer sanity-check what the celebrant sees — specifically, that items marked `visibility=hide_from_celebrant` actually disappear from the celebrant's view.

## Why it surfaced in the sim

This is a **cross-persona finding** — surfaced **independently from BOTH SIDES of the visibility wall**. That's an unusually strong "real gap" signal.

- **Organizer Finding #19** (`notes/sim/2026-05-20/findings-organizer.md:160-167`): Dave sets `visibility=hide_from_celebrant` on the gag-gift item and wants to sanity-check it actually disappears from David's view. He has no incognito magic-link path; he's trusting RLS abstractly. One wrong visibility enum and the surprise is dead.
- **Celebrant Finding C2** (`notes/sim/2026-05-20/findings-celebrant.md:15-22`): David's persona-side counterpart — recorded explicitly as "failure mode lives in organizer." No "view as celebrant" toggle exists. The workaround (organizer asks celebrant to screenshot) defeats the surprise.
- **Surfaced via DM cross-check** during the sim — Dave DM'd David, David DM'd back, both filed independently. That's the cross-persona signal you can't get from a single-perspective walk.

The anxiety is real and specific: the organizer is trusting a boolean RLS predicate (`can_see_content()`) with the integrity of the celebrant's surprise. One typo in a visibility enum and the load-bearing M3 surprise-machinery breaks silently.

## Why it didn't earn M4

- **Critic verdict** (`notes/sim/2026-05-20/findings-critic.md:278-281`): implementation is non-trivial. Two paths, both M5+ on scope:
  1. Server-rendered alt view with `is_trip_celebrant()` substituted in evaluation — requires altering the SECURITY DEFINER function to take an override, or wrapping the query in a transaction with `set local role` semantics.
  2. Or a `?as_celebrant=true` query path with corresponding test coverage proving the impersonation can't leak.
  Both are **role-impersonation primitives**. That's not a UI tweak; that's a new authorization shape.
- **Synthesis call** (`notes/sim/2026-05-20/findings.md:89`): "defer to M5+ unless trivial server-rendered alt-path exists" — it isn't trivial.
- **M4 budget reality:** the M4 carry-back migration is already 9 schema/RLS deltas (`notes/sim/2026-05-20/findings-critic.md:355-368`). Adding a role-impersonation primitive on top breaks `notes/roadmap.md:194` STOP HERE.

## Design constraints (REQUIRED for revival)

- **Ship as `?as_celebrant=true` query path** with explicit test coverage proving:
  1. Organizer-only access to the toggle (`is_trip_organizer()` check on the route)
  2. The view returns exactly what `is_trip_celebrant()=true` evaluation would return — no leaks of `hide_from_celebrant` rows
  3. Audit-log entry on each toggle use (organizer wrote to celebrant view — useful trail if surprise leaks)
- **Read-only on the celebrant view.** The organizer in preview mode cannot mutate; mutation paths use the organizer's real role. No accidental "write as celebrant" surface.
- **Visible mode indicator.** The preview view must be obviously-distinct from the real organizer view (e.g., banner: "Previewing as celebrant — switch back"). The organizer should never confuse the two contexts. Microcopy passes the dinner-test (`CLAUDE.md` voice rules).

## Anti-patterns to watch for

- **Do not implement via cookie/session role-swap.** That risks the preview-mode banner being missed and an organizer writing into the wrong view. Query-param is more explicit and harder to lose.
- **Do not surface this as a `view as <any role>` general-purpose primitive.** The specific use case is `as_celebrant` for surprise-verification. Generalizing to "preview as any member" reintroduces the labeling-the-edge-attendee anti-pattern (per `notes/research/persona-edge-attendees.md:11-18`).
- **Do not add a celebrant-side notification** ("the organizer previewed the trip as you"). That's surveillance theater; the celebrant should not know the preview happened.

## Revival path

1. Real-trip retro confirms the organizer-side surprise-verification anxiety actually fired during the M4 trip (Dave felt it, or the equivalent organizer DM'd the celebrant to verify, defeating the surprise).
2. Pick the implementation path: query-param wrapper around `is_trip_celebrant()` evaluation is the recommended approach (lower surface than altering the SECURITY DEFINER function).
3. Ship with explicit test coverage for the three guarantees in the design constraints above.

## References

- `notes/sim/2026-05-20/findings-organizer.md:160-167` (Finding #19 — organizer-side)
- `notes/sim/2026-05-20/findings-celebrant.md:15-22` (Finding C2 — celebrant-side)
- `notes/sim/2026-05-20/findings-critic.md:278-281` (critic verdict: M5+, non-trivial impl)
- `notes/sim/2026-05-20/findings.md:89` (synthesis defer)
- `notes/roadmap.md:194` (STOP HERE — M4 budget capped)
- `supabase/migrations/20260519123255_m1_foundation.sql:128-172` (`can_see_content()` — the RLS surface this preview must respect)
```

---

## Issue 3: feat(m5): organizer-write-on-behalf for member-flags with written_by attribution

**Title:** `feat(m5): organizer-write-on-behalf for member-flags with written_by attribution`

**Labels:** `type:feature`, `area:itinerary`

**Milestone:** `M5 — Earned post-trip`

**Body:**

```markdown
## What

Extend `itinerary_item_member_flags` to support organizer-write-on-behalf with explicit attribution and member-side confirm. Three preserve-conditions (below) are LOAD-BEARING — they are what keeps the master principle intact.

## Master-principle position (CRITICAL — DO NOT DROP THIS)

This was the most important re-audit move in the sim. The initial framing — "organizer-write-on-behalf inverts the master principle" — was **walked back** after the edge-attendee's principled defense + the `lodging_assignments` precedent. The synthesis verdict (`notes/sim/2026-05-20/findings.md:55`):

> **"M5+ on scope, principle holds with attribution."**

The principle from `notes/research/persona-edge-attendees.md:11-18` reads:

> *"Default attendees opt into exceptions. Non-default attendees should opt into participation, not have to opt out of assumptions."*

The principle protects against the app *assuming* a default about the attendee. **Transcribing a fact the attendee specifically volunteered (via DM in March) is recording, not assuming.** The distinction is everything.

- **Edge-side verdict on principle cost** (`notes/sim/2026-05-20/findings-edge.md:98`): *"Marcus's gut reaction to 'Dave banked my shellfish flag before I logged in' is relief, not violation — the alternative is the chef-venue lock missing the flag because Marcus is 22 days out juggling a job hunt."*
- **Existing precedent in schema:** `supabase/migrations/20260520052357_m3_itinerary_announcements.sql:131-149` — `lodging_assignments` is **already** organizer-writes-on-behalf for room assignment. That isn't principle-inversion; it's a recording of an offline-negotiated fact.
- **Therefore:** the principle holds with the three preserve-conditions below. **Misrecording this as principle-inversion would close the door forever; the synthesis decided it is M5+ on scope, NOT on principle.**

## Why it surfaced in the sim

- **Organizer Finding #4** (`notes/sim/2026-05-20/findings-organizer.md:33-40`): chef-lunch venue lock at T-7; Marcus told Dave in March via text DM about shellfish allergy; M4 has no path to bank it without Marcus opening the app. Workaround: Dave keeps the flag in his Google Sheet (defeats the app).
- **Edge-attendee addendum** (`notes/sim/2026-05-20/findings-edge.md:90-100`): explicitly defends the principle compatibility — Marcus reads the converse of Dave's filing and lands at "relief, not violation." Files at ship-blocker severity from his chair.
- **Persona anchor:** `notes/research/persona-best-man.md:69` — the asymmetric-labor problem. The unit of attendee contribution is 10 seconds (Marcus DM'd the allergy), not 10 minutes (Marcus opens the app, navigates, picks the chip). The asymmetry is the gap the app has to close.

## Why it didn't earn M4

- **3-of-4 M4 budget hats in one feature**: column add + RLS policy add + new UI flow (member-confirm picker) + microcopy. The carry-back migration is already at 9 schema/RLS deltas; this would push to 11.
- **Self-read fix is the M4 ship** (`notes/sim/2026-05-20/findings.md:14-22`): the carry-back migration adds the additive SELECT policy on `itinerary_item_member_flags` for owner-self-read. That closes the cross-persona ship-blocker. Write-on-behalf is the *next* step, not the *required* step.
- **STOP HERE constraint** (`notes/roadmap.md:194`): M4 ships the structured-input wave + carry-back hardening. Role-extending writes are M5.

## Three preserve-conditions (REQUIRED for revival)

These three conditions are what make the principle hold. **All three must ship together** — landing the column without the member-confirm UI would be the principle-inversion failure mode.

### 1. Attribution column

```sql
alter table public.itinerary_item_member_flags
  add column written_by_trip_member_id uuid references public.trip_members(id);
```

- **NOT** `auth.users(id)` — this follows the M1 FK-retargeting convention (`notes/database-workflow.md:256-271`) and matches the existing `trip_member_id` column shape on the same table.
- Nullable: existing rows (pre-migration) have no `written_by`; new owner-written rows can set it to the same value as `trip_member_id` or leave null (TBD at implementation — recommend setting to `trip_member_id` for consistency).

### 2. Additive INSERT policy (DO NOT replace the existing owner-only INSERT)

Keep current `"item flags: owner insert"` (M3 migration:514-525) UNCHANGED. Add a second policy:

```sql
create policy "item flags: organizer insert on behalf"
  on public.itinerary_item_member_flags
  for insert to authenticated
  with check (
    public.is_trip_organizer(
      (select trip_id from public.itinerary_items where id = item_id)
    )
    and written_by_trip_member_id in (
      select id from public.trip_members where user_id = auth.uid()
    )
    and trip_member_id <> written_by_trip_member_id
  );
```

- **The third clause (`trip_member_id <> written_by_trip_member_id`) is load-bearing defense-in-depth.** Without it, an organizer could insert a flag claiming the member wrote it themselves — forged self-attribution. The clause is the schema-level guarantee that attribution cannot be forged in the organizer-on-behalf path.
- **The second clause** binds `written_by_trip_member_id` to the actual `auth.uid()` of the writer — the organizer cannot ghost-write under another organizer's name either.

### 3. Member-confirm UI surface

When the self-read SELECT policy lands (this is **shipping in the M4 carry-back migration** — see `notes/sim/2026-05-20/findings.md:16-22`), the member-side picker surfaces organizer-written rows distinctly with a one-tap confirm/remove affordance.

- **Detection:** `written_by_trip_member_id is not null and written_by_trip_member_id <> trip_member_id` ⇒ organizer-written row.
- **Voice candidate** (per edge-attendee proposal, `findings-edge.md:99`): `"Dave saved this for you — keep it?"` with `[Keep]` / `[Remove]` buttons. Passes the dinner-test.
- **Affirmative consent:** the row exists silently; the affordance is the consent path. Removal is a `DELETE` the owner is already authorized for via the M3 owner-delete policy (M3 migration:527-537).

## Anti-patterns to watch for

- **Do NOT extend the existing owner-only INSERT policy** by widening its `with check`. Two additive policies are easier to audit and easier to revoke individually if the on-behalf path needs to be killed.
- **Do NOT skip the member-confirm UI as a "v2 polish" item.** Without it, the principle inverts at runtime — the organizer writes the flag, the member never sees it, the master principle from `persona-edge-attendees.md:11-18` is violated in practice even if intact in schema.
- **Do NOT label organizer-written rows as "verified" or "organizer-confirmed" anywhere visible to the celebrant or other members.** Attribution is for the *owning member's* confirm flow, not for social signaling. (See `notes/killed-and-deferred.md:53` — group-visible labels of member state are anti-pattern.)
- **`killed-and-deferred.md` revival criteria:** this issue is NOT on the killed list (#31 Crew Cards is a different feature). The asymmetric-labor problem is named in research and the principle position is documented; revival depends on M5 retro confirming the asymmetry was felt.

## Revival path

1. M5 retro confirms the asymmetric-labor problem actually fired during the M4 trip (an attendee volunteered a fact via DM and the organizer had no in-app path to bank it without the attendee re-opening the app).
2. Ship all three preserve-conditions in a single migration + UI PR. **Do not split.**
3. Pair with `security-reviewer` agent (per CLAUDE.md project-rule for any server-action with role-extension).

## References

- `notes/sim/2026-05-20/findings.md:55` (ADR-B synthesis call)
- `notes/sim/2026-05-20/findings-organizer.md:33-40` (Finding #4)
- `notes/sim/2026-05-20/findings-edge.md:90-100` (Marcus's principled defense — quote this in the implementation PR)
- `notes/sim/2026-05-20/findings-critic.md:429-442` (re-audit batch 1 — schema verdict)
- `notes/research/persona-edge-attendees.md:11-18` (master principle — quote it in the implementation PR)
- `notes/research/persona-best-man.md:69` (asymmetric-labor problem)
- `supabase/migrations/20260520052357_m3_itinerary_announcements.sql:131-149` (`lodging_assignments` precedent)
- `notes/database-workflow.md:256-271` (FK-retargeting convention)
- `CLAUDE.md` rule #11 (roles add micro-affordances, not gates — this issue preserves that by attribution + confirm)
```

---

## Issue 4: feat(m5): member-directory bare bios (optional, no relational framing)

**Title:** `feat(m5): member-directory bare bios (optional, no relational framing)`

**Labels:** `type:feature`, `area:trips`

**Milestone:** `M5 — Earned post-trip`

**Body:**

```markdown
## What

A **bare one-line bio column** on `trip_members`. Optional, default-empty. Renders inline on the existing M3 roster. Nothing else.

**Specifically NOT shipping:**
- No "how do you know the celebrant?" / "how do you know the group of honor?" field
- No sparse-card UI (use the existing roster row format with bio inline)
- No avatars / photos as a required field
- No relational framing of any kind

## Critical distinction from Crew Cards (#31, KILLED)

This is **not** a revival of Crew Cards. Per `notes/killed-and-deferred.md:29`:

> *#31 Crew Cards / member directory (with "how do you know the celebrant?" field) — The "how do you know" field is exactly the +1 Bridge persona's anxiety wedge. Sparse cards look clique-coded.*
>
> *What would change to revive: **A bare member-bio column (optional, auto-default) without the framing-around-celebrant question**, if the +1 anxiety actually surfaces post-trip.*

The revival criteria explicitly carve out the bare bio column as the path that survives. This issue ships **only** that path. Anything that drifts toward the killed Crew Cards shape — relational fields, dedicated card UI, "how do you know" prompts — should be rejected in PR review.

## Why it surfaced in the sim

- **Celebrant Finding #15** (`notes/sim/2026-05-20/findings-celebrant.md:141-148`): David scanning the roster at T-7 realizes FIL's-friend Tom doesn't know anyone. The failure mode lives in Tom (and in Tasha, the +1 Bridge persona, by overlay).
- **Edge-attendee Tasha-overlay** (`notes/research/persona-edge-attendees.md:89-97`): the +1 Bridge persona's anxiety wedge is explicitly the "I know two people; I've been calling someone 'Brian' for two days and I'm 90% sure it's 'Ryan'" failure mode. The persona ask: **member directory with one-line bio**, NOT Crew Cards.
- **Cross-persona signal:** filed by celebrant (#15) AND surfaced by edge-attendee Tasha-overlay. This isn't just a celebrant concern — the cross-friend-group anxiety is real for the +1 Bridge attendee whose failure mode the celebrant is trying to prevent.

## Why it didn't earn M4

- **M3 already ships 80% of the "meet the crew" ask** (`notes/sim/2026-05-20/findings-celebrant.md:144`): roster + phone numbers + vCard. Tom can already call the names. The bio column is incremental polish for the cross-friend-group case, not load-bearing for the trip's basic function.
- **M4 has no schema budget for non-load-bearing additions** — the carry-back migration already includes 9 schema/RLS deltas (`notes/sim/2026-05-20/findings-critic.md:355-368`); a bio column is the kind of "fit it in" item that erodes STOP HERE discipline.
- **STOP HERE** (`notes/roadmap.md:194`): "Stop here. Use it for the real trip. Come back to M5 only after a retrospective surfaces what the trip actually needed." The bio column is a *retrospective* deliverable by definition — we won't know if Tom/Tasha felt the gap until the real trip happens.

## Design constraints (REQUIRED for revival)

- **Bare optional one-line bio column on `trip_members`.** Example shape:
  ```sql
  alter table public.trip_members
    add column bio text;
  ```
  No `not null`, no default, no length-cap-as-asterisked-validation. Free text, optional.
- **NO "how do you know the celebrant?" or equivalent relational field.** This is the explicit killed dimension (`killed-and-deferred.md:29`). The bio is whatever the member wants to put there — `"Ryan, lives in Austin, was at Cabo"` is exactly the persona-side example (`persona-edge-attendees.md:94`). The member chooses what to say.
- **NO sparse-card UI.** Render inline on the existing M3 roster row. A bio is one extra line under the name + phone + vCard. The card-grid format from killed #31 looked clique-coded; don't re-introduce it.
- **NO required field markers.** Per `CLAUDE.md` "What NOT to do" — *"No required fields with asterisks anywhere."* Bio is opt-in; default-empty roster still works for trips where nobody writes one.
- **NO "complete your profile" prompts.** Default-empty is acceptable forever. Per `CLAUDE.md` "What NOT to do" — *"No tooltips, onboarding banners, 'complete your profile' prompts."*
- **Member-self-write only.** Editing your own bio is self-write; reading bios is `is_trip_member()`. No organizer-on-behalf write here (different feature, different issue).

## Anti-patterns to watch for

- **Crew Cards drift** — if PR review surfaces requests for "how do you know each other?" or "+1 bridge" framing, **stop and re-read `killed-and-deferred.md:29`.** That is the exact dimension that got killed.
- **"+1" / "Newcomer" badges** — `persona-edge-attendees.md:100` explicitly names these as Hurts. The bio surface must not generate any per-member status labels.
- **Algorithmic pairing / icebreaker prompts** — `persona-edge-attendees.md:101-103` also Hurts. The bio is read-only browsing; no app-mediated social affordances on top.
- **Required-field asterisks** (`CLAUDE.md` "What NOT to do"). Bio is opt-in or it's wrong.
- **Per-trip vs per-user storage:** the column lives on `trip_members`, not `users`. A member can write different bios for different trips (bachelor vs work-trip), and bios are private to the trip. This matches the multi-tenant rule (CLAUDE.md #6).

## Revival path

1. M5 retro confirms the +1 Bridge / FIL's-friend-Tom anxiety actually fired during the M4 trip (someone outside the core friend group felt the "don't know anyone" gap).
2. Ship the bare bio column with the constraints above. One column, one inline render on the roster, one self-edit affordance. ~50 lines of TSX + one migration.
3. Re-read `killed-and-deferred.md:29` before opening the implementation PR. Pin a comment on the PR linking back to the killed-and-deferred entry as the negative-constraint reference.

## References

- `notes/sim/2026-05-20/findings-celebrant.md:141-148` (Finding #15 — celebrant-side)
- `notes/sim/2026-05-20/findings.md:107` (synthesis defer to M5 retro)
- `notes/research/persona-edge-attendees.md:89-97` (Tasha / +1 Bridge persona — Helps + Hurts list)
- `notes/research/persona-groom.md:50` (celebrant-side acknowledgment of the cross-friend-group gap)
- `notes/killed-and-deferred.md:29` (the negative-constraint reference — what NOT to ship)
- `CLAUDE.md` "What NOT to do" (required-field bans, completion-score bans)
- `notes/roadmap.md:194` (STOP HERE)
```

---

## Notes for the lead

- **Hard rule observed:** no live `gh` calls beyond reads (label list, M5 milestone query, targeted dupe searches).
- **No dedup conversions required.** All four issues are net-new; no live M5 issues collide. Closed #31 is referenced as the negative-constraint reference for Issue 4.
- **Master-principle wording in Issue 3** is verbatim-aligned with the synthesis ADR-B (`findings.md:55`) and the edge-side verdict (`findings-edge.md:90-100`). If the lead wants to soften or expand this, the load-bearing sentence is: *"The principle protects against the app assuming a default about the attendee. Transcribing a fact the attendee specifically volunteered is recording, not assuming."* — that's what keeps M5 revival from re-opening as principle-inversion.
- **Cross-issue link suggestion:** when these are filed, consider adding a comment on the M4 carry-back migration PR linking to Issue 3 (the self-read SELECT policy in the carry-back is the schema prereq for Issue 3's member-confirm UI). That keeps the M5 revival path clean.
