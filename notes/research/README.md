# Research notes

Foundation research generated 2026-05-18 before scaffolding the Next.js app
and configuring the GitHub repo. Three documents:

- [`audience-features.md`](./audience-features.md) — target audience for the
  bachelor-party MVP, competitive landscape, gaps in the 8-goal roadmap,
  mobile UX patterns, risks the roadmap doesn't yet address.
- [`github-labels.md`](./github-labels.md) — survey of label conventions at
  exemplar repos (next.js, supabase, shadcn-ui, cal.com, posthog, expo,
  create-t3-app), best-practice consensus, and a concrete 26-label
  recommendation.
- [`audit.md`](./audit.md) — cross-reference of the two reports against the
  codebase (CLAUDE.md, roadmap.md, decisions.md, 0001_init.sql). Surfaces
  contradictions, schema mismatches, missed topics, and the final list of
  recommendations folded into the project plan.

## Important caveat

All three agents ran with `WebSearch` / `WebFetch` denied, so claims about
competitor product surfaces, demographic stats, and exemplar-repo label
lists come from training-data memory (cutoff Jan 2026) rather than live
verification. See `audit.md` §4 for the top 5 claims worth re-verifying
with web access if granted.

## What this drives

The decisions surfaced from these documents land in:

- The final GitHub label set applied by `/workflow-setup`
- Updates to `roadmap.md` (Goal 2/6 DoD additions, new "Goal 1.5 — Repo
  hygiene", new mini-goal for the manual money pool)
- New `decisions.md` entries (testing framework, co-organizer role from
  day one, per-day RSVP, photo expiry, no-real-money-without-PSP)
- New stub notes: `moderation.md`, `og-and-pwa.md`
- Repo infrastructure: issue/PR templates, Dependabot, branch protection,
  secret scanning, CI workflow
