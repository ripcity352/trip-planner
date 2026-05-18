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

## Mobile screenshot (UI changes only)

<!-- 375px-wide screenshot from iOS Safari. Don't merge UI without one. -->

## Notes

<!-- Anything reviewers (or future you) should know. -->
