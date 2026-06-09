<!--
Keep PRs small. One feature = one branch = one preview URL.
The `/pr-cycle` skill expects this structure.
-->

## What

<!-- One-paragraph summary. Link the issue. -->

Closes #

## Why

<!-- Roadmap goal or user need. Reference notes/roadmap.md when applicable. -->

## Test plan

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Manually verified on mobile Safari (iPhone) — attach screenshot below if UI-touching
- [ ] Manually verified on Desktop Chrome — attach screenshot if non-trivial

<!-- If schema migration: -->
- [ ] Migration applied to local Supabase
- [ ] RLS policies in the same migration
- [ ] `pnpm dlx supabase db diff` shows expected changes

## Microcopy review (UI-touching PRs)

- [ ] **Microcopy review**: any new UI string sourced from `lib/copy/*` or `lib/data/*` (no inline JSX literals). Voice passes "would you say this at a pre-trip dinner?" test.

## Design system review (UI-touching PRs only)

- [ ] **Microcopy:** every UI string passes the voice test (*"would you say this at a pre-trip dinner?"*) — see `notes/research/ux-design-principles.md`
- [ ] **Focus ring:** every new interactive element has a visible focus ring (2px persimmon, 2px offset) — NOT shadcn default `ring-1 ring-ring/50`
- [ ] **Reduced motion:** every new animation has a `prefers-reduced-motion: reduce` fallback
- [ ] **Hairline guardrail:** if a hairline-bordered card is used, it is the only one on this screen
- [ ] **Vibecoded patterns audit:** none of — purple/violet gradients, bento grids, glassmorphism cards, side-tab borders, gradient text, centered heroes (see `notes/design-system.md` "Vibecoded-specific bans")
- [ ] **Copy palettes:** strings sourced from `/lib/copy/empty-states.ts` or `/lib/copy/errors.ts`, not inline literals
- [ ] **Visual regression:** if this PR updates a signature visual pattern, baselines regenerated under `/test/visual-fixtures/__baselines__/`
- [ ] **Governing section quoted:** name the `notes/design-system.md` §section(s) this UI change implements or honors, and quote the load-bearing rule below (e.g. *"§Date and time — Relative tier: `22h`, never `about 22 hours ago`"*). If no section governs it, that's a spec gap — open a follow-up before merging.

  > _governing section + rule:_
- [ ] **v3 contracts:** where applicable, the change conforms to the relevant `## Component & content contracts (v3)` contract — Component bindings (#183), Verbs table (#184), Empty-state register (#185), RSVP chip shape (#208), Error-surface (#209), Destructive-action (#210).
- [ ] **`<Identifier>` label voice:** if a caller passes `<Identifier label=…>`, the label string passes the "would you say it at a pre-trip dinner?" test (e.g. "link to send your crew", not "Invitation URL").
- [ ] **Anti-tells CI:** the #182 ESLint anti-tells passed without an `eslint-disable` (light-mode utilities, emoji-as-icon, UUID-in-JSX, non-token button radius); if one was needed, justify it in Notes.

## Mobile screenshot (UI changes only)

<!-- 375px-wide screenshot from iOS Safari. Don't merge UI without one. -->

## Notes

<!-- Anything reviewers (or future you) should know. -->
