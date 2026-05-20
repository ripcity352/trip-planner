# Microcopy drafts (Agent B)

> Drafts for the M4 microcopy/voice PR bundle from the 2026-05-20 sim.
> **NOT executed.** Lead reviews + executes after.
> Sources:
> - `notes/sim/2026-05-20/findings.md` (synthesis — microcopy section + carry-back items)
> - `notes/sim/2026-05-20/findings-edge.md` Finding #8 (heading microcopy reasoning)
> - `notes/sim/2026-05-20/findings-critic.md` "Voice rewrites bundle" + "Final M4 ship-blocker tally"
> - `CLAUDE.md` voice section + `notes/roadmap.md:172` (PR-template microcopy gate)
>
> **Label verification (`gh label list`):** `area:itinerary`, `area:ui`, `type:chore` all exist. No new labels needed.
> **Milestone verification:** `M4 — Trip is shippable` exists (milestone #5).
> **Cross-issue reference placeholder:** `#TBD-microcopy` = this new issue (number assigned at `gh issue create` time). `#TBD-carry-back` = the sibling carry-back-migration issue Agent A is drafting in parallel.
> **Pre-M4 state note:** `lib/data/dress-codes.ts`, `lib/data/member-flags.ts`, `lib/data/activity-tags.ts` do **not** exist yet in the repo (verified via `find`). They land as part of the #163/#164/#165 PRs. This microcopy issue locks the *constants those PRs will create*; if the PRs ship before this one, the microcopy fixes become one-line edits to the constants those PRs land.

---

## New issue

### Title

```
chore(m4): microcopy + voice fixes — chip pickers, dress-code labels, member-flag heading
```

### Labels

- `area:itinerary`
- `area:ui`
- `type:chore`

(All three verified present via `gh label list`. No new labels required.)

### Milestone

`M4 — Trip is shippable` (milestone #5)

### Body

```markdown
Bundle the microcopy and voice resolutions from the M4 pressure-test sim
(`notes/sim/2026-05-20/findings.md`) into one PR so the chip-picker PRs
(#163, #164, #165) and the item-card render can pass the PR-template
microcopy gate (`notes/roadmap.md:172`) without each one re-litigating
voice in review.

All six changes below passed the "would you say this out loud at a
pre-trip dinner?" test in the sim. Three personas (celebrant David,
organizer Dave, edge-attendee Marcus) walked the strings; the technical
critic verified scope.

## Dependency

**Hard:** depends on `#TBD-carry-back` (M4 carry-back migration) landing
first. Change #1 (member-flag composer heading + subhead) ships as part
of the #165 PR, and #165 is dead-on-arrival without the member-self-read
SELECT policy on `itinerary_item_member_flags`. That policy lives in the
carry-back migration. See `findings-edge.md` Finding #1 for the literal
failure mode (user picks chip → server saves → user re-opens picker →
sees blank → picks again → partial-unique collision).

## Changes

### 1. Member-flag composer heading + subhead

Resolves `future-state-guide.md` §6 questions #14 + #16. Addresses
edge-attendee ship-blocker (`findings-edge.md` Finding #8).

Adopt verbatim:

- **Heading:** `"Anything we should know?"`
- **Subhead:** `"Just for the organizer — private to you."`

Voice test: passes the pre-trip dinner gate. Friendly, broad enough to
cover sober / late / plus-one / dietary without labeling any one of
them. Names the privacy guarantee inline — defense against a future
"make this visible" toggle creeping in.

**Reject:** `"Dietary restrictions"` — corporate, and the persona §3
nightmare framing ("ask Priya to approve each restaurant").

**Lands in:** `lib/copy/empty-states.ts` under the `M3_UI_STRINGS`
const. New keys (suggested):
- `itinerary_item_flag_picker_heading`
- `itinerary_item_flag_picker_subhead`

(Existing `itinerary_item_flag_label = "Heads up to the organizers"` and
`itinerary_item_flag_placeholder` stay for the freeform fallback path.)

### 2. Rename `Cocktail` chip → `Cocktail attire`

Resolves `future-state-guide.md` §6 #18 (part 1).

Three-persona agreement on the underlying ambiguity: on a dress-code
picker, `Cocktail` reads as either dress or drink, and happy-hour items
render it as a drink reference. One-line edit in the preset constant
the #163 PR creates (target file: `lib/data/dress-codes.ts`).

Sources:
- celebrant: `findings-critic.md` C3 / #18 row
- organizer: `findings-critic.md` O7 — "Cocktail chip ambiguous on rendered item card"
- edge-attendee: `findings-edge.md` "`Cocktail` chip on a dress-code picker is ambiguous"

### 3. Rename `Athleisure` chip → `Golf casual`

Resolves `future-state-guide.md` §6 #3 + #18 (part 2).

Both read-surface personas (celebrant David, organizer Dave) felt
`Athleisure` as corporate. The edge-attendee defended keeping it, but
the read-surface is where the chip renders verbatim — that's where the
friction lives. `Golf casual` is plainspoken and unambiguous, and golf
items are the specific use case (per organizer O6 + celebrant C3).

Sources: `findings-critic.md` re-audit batch 3 ("Voice rewrites
bundle") + `findings.md` carry-back list.

### 4. Item-card always renders `"Dress code: <chip>"` prefix

Resolves `future-state-guide.md` §6 #18 belt-and-suspenders.

Today: `M3_UI_STRINGS.itinerary_item_dress_code_template = "Wear: {code}"`
(in `lib/copy/empty-states.ts:184`). After: `"Dress code: {code}"`.
One-line template edit; no logic change in
`components/trip/itinerary/item-card.tsx` (the existing render at
`item-card.tsx:109-114` already pulls from the template constant).

Disambiguates **any** dress-code chip that could be re-parsed as item
content — current ambiguity is `Cocktail`, but the prefix is also
future-proofing for `Spa`, `Loud shirts`, etc. Per critic O7.

### 5. Drop `skipping this one` from member-flag preset chips

Resolves `future-state-guide.md` §6 #9.

Per-item RSVP `skipping` chip is the canonical surface for "skipping
this item" — already shipped in M3 (`M3_UI_STRINGS.itinerary_rsvp_skip_chip`).
A member-flag chip duplicate ("same data, two surfaces") creates
exactly the confusion the edge-attendee narrated
(`findings-edge.md` Finding #3).

One-line edit to the preset array in `lib/data/member-flags.ts` (the
constant the #165 PR creates) — remove the `skipping this one` entry.

**Voice/ADR note for the body:** "per-item RSVP is the skipping
surface; member-flag chips are non-RSVP signals only." This locks the
intent so future-Claude doesn't re-add a `skipping` chip to the
flag picker. Recommend mirroring this line into `notes/decisions.md`
alongside the carry-back log entry.

### 6. Custom-chip storage = raw user text, no `"Custom: "` prefix

Resolves `future-state-guide.md` §6 #8.

Storage stores raw user text (e.g. `hawaiian-shirt-mandatory`). The UI
derives "this isn't a preset" by string-matching the value against the
preset constant at render time. Cleaner storage, identical UX.

Applies to `itinerary_items.dress_code` (preset list lives in
`lib/data/dress-codes.ts`) and `itinerary_item_member_flags.flag`
(preset list lives in `lib/data/member-flags.ts`). #163 and #165 ship
this storage shape; #164 (`activity_tag text[]`) already stores raw
chip text + normalizes via lowercase + trim per the issue body.

Per critic O8 and `findings-critic.md` open-question #8 resolution.

## Voice gate checklist

For PR review, paste this into the description:

- [ ] Every new string in `lib/copy/empty-states.ts` passes the
  pre-trip dinner test
- [ ] No corporate-SaaS phrasing (no "Dietary restrictions", no
  "Please specify", no "Configure your preferences")
- [ ] Subheads name the privacy guarantee inline where it applies
- [ ] No labels assigned to non-default attendees in the heading layer
- [ ] No reaction-inflation, no leaderboards, no badges added by this PR
- [ ] All voice changes reviewed against
  `notes/research/ux-design-principles.md` §voice + `CLAUDE.md` "UI voice and microcopy"

## References

- `notes/sim/2026-05-20/findings.md` — microcopy section + carry-back list
- `notes/sim/2026-05-20/findings-edge.md` Finding #8 — heading reasoning
- `notes/sim/2026-05-20/findings-critic.md` re-audit batch 3 — "Voice rewrites bundle"
- `notes/roadmap.md:172` — PR-template microcopy gate (load-bearing)
- `CLAUDE.md` "UI voice and microcopy" section

Depends on: `#TBD-carry-back`

Closes: nothing on its own — partially closes #163, #164, #165 by
locking their voice surfaces.
```

---

## Update: #163

Read via `gh issue view 163`. Current title: *feat(m4-A): dress-code preset chips with freeform Custom fallback*. Labels: `type:feature`, `area:itinerary`. Milestone: M4. The body lists Cocktail and Athleisure as initial presets. This comment locks the renames + render-prefix + custom storage shape.

### Comment to append

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, the M4 voice/microcopy
resolutions for this picker are now bundled into `#TBD-microcopy`
(microcopy PR). Locked decisions:

- **`Cocktail` → `Cocktail attire`** — three-persona agreement on
  drink-vs-dress ambiguity in a dress-code picker context
  (`findings-edge.md` "Cocktail chip ambiguous" + `findings-critic.md`
  O7).
- **`Athleisure` → `Golf casual`** — both read-surface personas
  (celebrant David, organizer Dave) felt `Athleisure` as corporate;
  `Golf casual` is plainspoken for the specific golf use case
  (`findings-critic.md` re-audit batch 3 "Voice rewrites bundle").
- **Keep `spa`** — only flagged once in `future-state-guide.md` §6;
  edge-attendee explicitly defended it (`findings-edge.md` Marcus on
  dress chips).
- **Custom-chip storage = raw user text, no `"Custom: "` prefix.** UI
  derives "non-preset" by string-matching the value against the preset
  constant at render. Cleaner storage, identical UX
  (`findings-critic.md` O8 + open-question #8 resolution).
- **Item card always renders `"Dress code: <chip>"` prefix** — one-line
  edit to `M3_UI_STRINGS.itinerary_item_dress_code_template`
  (`"Wear: {code}"` → `"Dress code: {code}"`). Belt-and-suspenders
  against any future chip re-parsable as content
  (`findings-critic.md` O7 + §6 #18).

**Cross-persona signal:** celebrant + organizer + edge-attendee all
surfaced the `Cocktail` ambiguity independently
(`findings.md` "6 ship-blockers" #6 + `findings-critic.md` open-question
#18).

**Bundled into:** `#TBD-microcopy`. This issue keeps scope on the
picker structure + freeform fallback; the voice fixes land via that PR.
```

---

## Update: #164

Read via `gh issue view 164`. Current title: *feat(m4-B): activity-tag chip picker (curated suggestions + custom-add)*. Labels: `type:feature`, `area:itinerary`. Milestone: M4. The curated list (`beach · nightlife · outdoor · food · chill · sports · culture · spa · adventure`) passed the sim's dinner test in-character.

### Comment to append

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this picker survived the M4
pressure-test sim cleanly. No voice changes from the sim — the curated
suggestions all passed the pre-trip dinner test
(`findings-critic.md` open-question #2 — activity-tag chip picker
under §6 not flagged as a voice issue).

Bundled into `#TBD-microcopy` **for empty-state microcopy key
alignment only** — i.e., this picker pulls its empty-state /
heading strings from the same `M3_UI_STRINGS` block landed by that PR.
No string rewrites to this picker's chip labels.

**Cross-persona signal:** zero findings filed against the activity-tag
chip set across all three persona walks (celebrant, organizer,
edge-attendee). Confirmed by critic re-audit batch 3.
```

---

## Update: #165

Read via `gh issue view 165`. Current title: *feat(m4-C): per-item member-flag chip picker for dietary/sober/late-arrival*. Labels: `type:feature`, `area:itinerary`. Milestone: M4. Body lists `skipping this one` in preset chips — to be removed. Body specifies `item-flag-form.tsx` as the target surface — matches `components/trip/itinerary/item-flag-form.tsx` (confirmed exists).

### Comment to append

```markdown
---

## Sim 2026-05-20 update

Per `notes/sim/2026-05-20/findings.md`, this is the flagship picker for
the M4 microcopy gate. Locked decisions:

- **Heading:** `"Anything we should know?"` — verbatim from
  edge-attendee ship-blocker `findings-edge.md` Finding #8.
- **Subhead:** `"Just for the organizer — private to you."` — names
  the privacy guarantee inline. Reject the corporate `"Dietary
  restrictions"` framing (persona §3 nightmare).
- **Drop `skipping this one` from preset chip set** — per-item RSVP
  `skipping` chip is the canonical surface for skip; the member-flag
  duplicate creates "same data, two surfaces" confusion
  (`findings-edge.md` Finding #3 + `findings-critic.md` E3 + §6 #9).
- **Custom-chip storage = raw user text**, no `"Custom: "` prefix
  (mirrors #163 — same shape, same `lib/data/member-flags.ts`
  constant pattern).

**HARD DEPENDENCY:** the member self-read SELECT policy on
`itinerary_item_member_flags` **must land in the M4 carry-back
migration FIRST** (`#TBD-carry-back`), or this picker is dead-on-
arrival — a member who picks a chip can't see what they wrote, picks
again, hits the `(item_id, trip_member_id, flag)` partial-unique
constraint, and the server action errors or silently no-ops.

The edge-attendee narrated this exact failure mode in
`findings-edge.md` Finding #1 (self-read blocked). Three-way agreement
across pre-load critic, organizer O5, and edge E1 makes this the
single highest-leverage M4 add (`findings-critic.md` "Final M4
ship-blocker tally" #1).

**Cross-persona signal:** three personas + critic pre-load converged
on the self-read gap + heading microcopy as paired ship-blockers
(`findings.md` "6 ship-blockers" #1 + #5; `findings-critic.md` cluster
in re-audit batch 1).

**Bundled into:** `#TBD-microcopy` for the heading + subhead +
preset-chip edits. The self-read RLS policy is **not** in scope here
— it lives in `#TBD-carry-back` as a one-line `create policy`
addition.
```

---

## Summary

- **1 new issue draft** — microcopy PR bundling six changes
- **3 existing-issue comment drafts** — #163, #164, #165
- **0 new labels required** — all labels verified present via `gh label list`
- **Cross-refs:** `#TBD-microcopy` (this new issue), `#TBD-carry-back` (Agent A's parallel draft)
- **Pre-M4 state caveat:** `lib/data/dress-codes.ts`, `lib/data/member-flags.ts`, `lib/data/activity-tags.ts` do not yet exist — they land via #163/#164/#165 PRs. This microcopy issue locks the constants those PRs will create.
