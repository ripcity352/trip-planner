# Research — GitHub Label Taxonomy

> Generated 2026-05-18 by research subagent. WebSearch/WebFetch/`gh` were
> denied during the session, so this draws on the agent's training-data
> knowledge of the named repos (cutoff Jan 2026). Treat specific label names
> as illustrative — the *patterns* are what matter. Confirm against live
> label pages before applying.

## 1. Exemplar repos — observed patterns

- **vercel/next.js** uses `area:` heavily as the spine (`area: app`,
  `area: pages`, `area: turbopack`, `area: middleware`, `area: image`,
  `area: docs`) plus a parallel `kind:` axis (`kind: bug`,
  `kind: documentation`). Common: `please add a complete reproduction`,
  `linear` (issue-tracker sync), `Stale`. Notable: they do *not* use priority
  labels — internal triage happens in Linear.
- **supabase/supabase** splits by product: `auth`, `database`, `storage`,
  `realtime`, `edge-functions`, `cli`, `dashboard`, `docs`. Cross-cutting:
  `bug`, `enhancement`, `good first issue`, `help wanted`, `triage`. No public
  priority labels; priority is internal.
- **shadcn-ui/ui** keeps it tiny: `bug`, `enhancement`, `documentation`,
  `good first issue`, `question`, `wontfix`, `duplicate`, plus a few
  component-scoped tags. Minimalism is the point — one maintainer.
- **calcom/cal.com** is the maximalist contrast: ~80+ labels, heavy emoji
  prefixes (`✨ feature`, `🐛 bug`, `📚 documentation`, `🔥 hotfix`,
  `🌎 i18n`), area labels by product surface (`area: app store`,
  `area: bookings`, `area: teams`, `area: api`), seasonal `🎃 hacktoberfest`.
  Distinguishes `good first issue` (small, well-defined) from `help wanted`
  (needs contributor, may be larger).
- **posthog/posthog** uses `feature/` prefix with slash separator
  (`feature/dashboards`, `feature/insights`), plus `bug`, `enhancement`,
  `performance`.
- **expo/expo** uses `[Module]` bracket prefixes in titles plus
  `needs more info`, `needs review`, `needs validation` workflow labels.
- **t3-oss/create-t3-app** stays minimal like shadcn — bug/feature/docs/
  discussion plus `package: nextjs`, `package: trpc`, etc.

**Pattern:** small-team or solo repos converge on ~15–25 labels. Mega-repos
(cal.com, next.js) go to 50+ because they have many surfaces and external
contributors.

## 2. Best-practice consensus

- **GitHub's own docs** recommend the `key:value` (colon-prefix) convention so
  labels filter cleanly in the issues UI. The baseline already uses this.
- **Priority in labels vs. projects**: consensus is *priority belongs in a
  Project-board column or a milestone*, not a label — labels are categorical,
  priority is ordinal and changes often. Keep `priority:high` only as a "this
  is on fire" escape hatch; don't label `medium`/`low` (they're the default).
  **Recommendation: drop `priority:medium` and `priority:low`, keep
  `priority:high` as a flag.**
- **Size/effort labels (XS/S/M/L)**: useful only when outside contributors need
  to self-select (`good first issue` ≈ XS already). For a solo dev, size is
  noise. **Skip.**
- **Cross-cutting concerns** (a11y, perf, security): worth labels because they
  cut across every area and you want to find all `security` issues regardless
  of feature. Keep flat (no `area:` prefix).
- **Emoji prefixes**: useful when (a) many external contributors scan long
  lists and need visual chunking (cal.com), or (b) one label needs to pop in
  PR titles. For solo dev, pure noise and harder to type in `gh` CLI / search.
  **Skip emoji.**

## 3. Area labels for *this* project

Frontend/backend/db/infra is **wrong** here. Almost every issue in a Next.js +
Supabase app spans Server Component + Server Action + RLS policy + migration.
Splitting by *layer* means every issue gets 3 labels and the filter is
useless.

Split by **feature surface** instead — matches the roadmap and the
`/lib/db/<table>.ts` structure:

- `area:auth` — magic links, session, callback, middleware
- `area:trips` — trip CRUD, membership, invites
- `area:availability` — date polls, RSVPs
- `area:itinerary` — schedule, events
- `area:announcements` — posts + realtime channel
- `area:expenses` — splits, balances
- `area:photos` — uploads, storage
- `area:realtime` — cross-feature realtime plumbing (Supabase channels, presence)
- `area:rls` — policies, multi-tenant scoping (earns its own label because RLS
  bugs are a distinct failure mode)
- `area:infra` — Vercel, env, build, CI
- `area:ui` — shadcn primitives, design system, layout shell (rare layer-style
  exception — design tweaks really are surface-agnostic)

Defer `area:billing` until billing actually starts.

## 4. Cross-cutting labels (≤5)

- **`mobile`** — app is mobile-first; want to filter "stuff that breaks on iOS
  Safari"
- **`accessibility`** — easy to forget about a11y unless it's a filterable list
- **`security`** — rare but want them all surfaced (RLS gaps, secret leaks)
- **`dx`** — local dev / tooling / typecheck pain; flags itself as deferrable
- **`good-first-issue`** — costs nothing, future-proofs for open-sourcing or
  onboarding a friend

**Skip:** `breaking-change` (no users yet — git tag handles it later),
`performance` (folds into `area:` + issue body), `dependencies` (Dependabot
auto-labels its PRs), `discussion` (use GitHub Discussions), `wontfix` /
`duplicate` (just close with a comment for solo dev), `needs-repro` (overlaps
with `status:blocked`), `regression` (rare enough to mention in title).

## 5. Recommended final label set

Colors: type=greens/blues, priority=red, status=yellow/green, area=purples,
cross-cutting=teal.

**Type**
| Label | Color | Description |
|---|---|---|
| `type:feature` | `0E8A16` | New user-facing capability *(baseline)* |
| `type:bug` | `D73A4A` | Something broken *(baseline)* |
| `type:refactor` | `1D76DB` | Internal change, no behavior delta *(baseline)* |
| `type:research` | `5319E7` | Spike / investigation, output is notes *(baseline)* |
| `type:chore` | `CFD3D7` | Deps, config, housekeeping *(baseline)* |
| `type:docs` | `0075CA` | Docs / notes / CLAUDE.md *(new)* |

**Priority**
| `priority:high` | `B60205` | On fire / blocks roadmap *(baseline, keep)* |

*Drop `priority:medium` and `priority:low` — they're the default.*

**Status**
| `status:needs-plan` | `FBCA04` | Awaiting `/create-issue` plan *(baseline)* |
| `status:ready` | `0E8A16` | Plan approved, ready to implement *(baseline)* |
| `status:in-progress` | `FEF2C0` | Active branch open *(baseline)* |
| `status:blocked` | `E99695` | Waiting on external dep / decision *(baseline)* |

**Area** *(all new)*
| `area:auth` | `8B5CF6` | Magic links, session, callback |
| `area:trips` | `8B5CF6` | Trip CRUD, membership, invites |
| `area:availability` | `8B5CF6` | Date polls, RSVPs |
| `area:itinerary` | `8B5CF6` | Schedule, events |
| `area:announcements` | `8B5CF6` | Posts + feed |
| `area:expenses` | `8B5CF6` | Splits, balances |
| `area:photos` | `8B5CF6` | Uploads, Storage |
| `area:realtime` | `8B5CF6` | Supabase channels, presence |
| `area:rls` | `5319E7` | Policies, multi-tenant scoping *(darker — failure-mode signal)* |
| `area:ui` | `C5A3FF` | Design system, shadcn, layout *(lighter)* |
| `area:infra` | `6F42C1` | Vercel, env, CI |

**Cross-cutting** *(all new)*
| `mobile` | `0E8C8C` | Mobile-specific, iOS Safari quirks |
| `accessibility` | `0E8C8C` | a11y / keyboard / screen reader |
| `security` | `B60205` | RLS holes, secret leaks, authz gaps *(red — wakes you up)* |
| `dx` | `0E8C8C` | Local dev, tooling, typecheck, build speed |
| `good-first-issue` | `7057FF` | Self-contained, well-scoped *(GitHub default color)* |

**Total: 26 labels** — 6 type, 1 priority, 4 status, 11 area, 5 cross-cutting.
Within the 20–30 target, comprehensive without noise. No emoji. No size
labels. Single `priority:high` flag — Projects/milestones handle ordering.

**Migration from workflow-setup defaults:**
- *Drop* `priority:medium`, `priority:low`, proposed `area:frontend|backend|db`
- *Keep* everything else baseline
- *Add* the area, cross-cutting, and `type:docs` labels above

## Sources

Training-data knowledge (not live-fetched):
- vercel/next.js issues UI and contributing guide
- supabase/supabase repo labels and CONTRIBUTING.md
- shadcn-ui/ui repo labels
- calcom/cal.com labels page (emoji + Hacktoberfest)
- posthog/posthog labels (slash-prefix `feature/`)
- expo/expo `needs-*` triage labels
- GitHub Docs: "Managing labels" (key:value recommendation)
- "Conventional Labels" community pattern (colon-prefix)
- GitHub default `good first issue` color `7057FF`
