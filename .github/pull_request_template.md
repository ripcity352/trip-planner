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

## Design system review (UI-touching PRs only)

- [ ] **Microcopy:** every UI string passes the voice test (*"would you say this at a pre-trip dinner?"*) — see `notes/research/ux-design-principles.md`
- [ ] **Focus ring:** every new interactive element has a visible focus ring (2px persimmon, 2px offset) — NOT shadcn default `ring-1 ring-ring/50`
- [ ] **Reduced motion:** every new animation has a `prefers-reduced-motion: reduce` fallback
- [ ] **Hairline guardrail:** if a hairline-bordered card is used, it is the only one on this screen
- [ ] **Vibecoded patterns audit:** none of — purple/violet gradients, bento grids, glassmorphism cards, side-tab borders, gradient text, centered heroes (see `notes/design-system.md` "Vibecoded-specific bans")
- [ ] **Copy palettes:** strings sourced from `/lib/copy/empty-states.ts` or `/lib/copy/errors.ts`, not inline literals
- [ ] **Visual regression:** if this PR updates a signature visual pattern, baselines regenerated under `/test/visual-fixtures/__baselines__/`

## Mobile screenshot (UI changes only)

<!-- 375px-wide screenshot from iOS Safari. Don't merge UI without one. -->

## Notes

<!-- Anything reviewers (or future you) should know. -->
