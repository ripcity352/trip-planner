# Research Index

> Navigation for the research dir. Each entry: one-line hook + scope + when to re-read.
> Last regenerated: 2026-05-18.

## Round 1 (initial foundation research, 2026-05-18 AM)

- [`audience-features.md`](./audience-features.md) — target audience (best-man 28–36, iPhone-dominant) + competitive landscape (Partiful, Splitwise, Splid, TripIt, Wanderlog) + roadmap gap-list + mobile UX specifics + risks. **Read:** before any UX or competitive-positioning work.
- [`audit.md`](./audit.md) — cross-check of audience + label reports against `0001_init.sql`. Identifies what the schema already supports vs. what's missing for audience-MVP recs. Recommends Goal 1.5 / Goal 2 / Goal 6 DoD additions. **Read:** before Goal 2 or 6 work.
- [`github-labels.md`](./github-labels.md) — label taxonomy derived from exemplar repos (vercel/next.js, supabase/supabase, etc.). **Read:** when creating new issues or proposing new labels.

## Round 2 (deep-research wave, 2026-05-18 PM — bach trip orchestrator focus)

### Personas (first-person; pressure-test feature design against real attendee types)

- [`persona-groom.md`](./persona-groom.md) — 32yo celebrant. **Key insights:** `groom-hidden` visibility flag must be invisible-to-the-groom; vibe tags need teeth (e.g., `no strippers`); RSVP state changes asymmetric (going broadcasts, declining whispers); veto must be silent. Includes "I'm overwhelmed, Dave handle it" button concept.
- [`persona-best-man.md`](./persona-best-man.md) — 33yo organizer, $3K floated. **Key insights:** unit of contribution is 10 seconds (polls + emoji), not 10 minutes (forms); single-Venmo-link-per-person at settle-up not per-expense; 3-tier nudge escalation (7/14/21 days); co-organizer needs spend authority cap.
- [`persona-edge-attendees.md`](./persona-edge-attendees.md) — six edge-case rants (broke, sober, dietary, late-arrival, +1 bridge, family attendee). **Master principle:** "Default attendees opt *into* exceptions. Non-default attendees should opt *into* participation, not have to opt out of assumptions." → granular data primitives, not special-case features.

### Design

- [`ux-design-principles.md`](./ux-design-principles.md) — 5 UX hold-bar principles + 3 signature patterns (Pulse Poll, **Blur Gradient** for surprise, Hype Stack). Anti-patterns (no progress bars, no notification settings, no required fields). Microcopy voice test: *"would you say this at a pre-trip dinner?"*. Home-screen wireframes + 3-tap onboarding.

### Audit / gap analysis

- [`audit-round-2.md`](./audit-round-2.md) — 20 findings. **5 critical schema-level changes** must land before Goal 2 ships: `trip_members.is_celebrant`, `visibility` enum on user-content tables, `trips.kind`, decoupled accountless attendees, idempotency keys. Plus high-value MVP adds (lodging/travel-legs/quick-tab/settlement-closer/fear-list) and kill recs (email digest stretch).

### Integration feasibility

- [`integration-feasibility.md`](./integration-feasibility.md) — verdicts on 14+ services. **Major prior-assumption flips:** Google Photos sharing API was killed Mar 2025 (LINK-OUT only, use Supabase Storage). Splitwise free-tier caps writes at 3/day (deep-link prefill only). Stripe Connect has no escrow (delayed payout ≤90d). Spotify Extended quota org-only since May 2025. iMessage group-chat deep-link does NOT exist. vCard bulk-import via Safari → Mail DOES work.

### Delight + Tooling (in flight as of 2026-05-18 PM)

- [`fun-and-delight.md`](./fun-and-delight.md) — *(saved by party/delight subagent)* delight mechanics, memory-as-product post-trip artifacts, roles-as-personality framing, per-trip-kind variants (bachelorette/ski/wedding-weekend voice).
- [`tooling-and-skills.md`](./tooling-and-skills.md) — *(saved by skills/plugins subagent)* inventory of relevant Claude Code skills/agents/plugins/MCP servers + per-goal recommendation + workflow recipes.

## How to use this index

- **Starting a new goal?** Read `audit-round-2.md` for critical schema gaps, then the persona that matches your area (organizer flows = best-man.md, member views = groom.md or edge-attendees.md), then `ux-design-principles.md` for hold-bar.
- **Designing data model changes?** `audit-round-2.md` §1–5 + `integration-feasibility.md` "Implications for the roadmap" tail.
- **Designing a feature?** Pressure-test against all six edge-attendees personas + against the master principle ("don't encode a default").
- **Writing microcopy?** `ux-design-principles.md` Personality & Voice section + the voice test.
- **Evaluating an integration?** Search `integration-feasibility.md` Summary Table — verdict + cost + headline risk per service.
