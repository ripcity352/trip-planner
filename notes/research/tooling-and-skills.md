# Tooling & Skills Survey — Party Trip

> Source: Claude Code skill/agent/plugin survey, 2026-05-18. Inspected `~/.claude/agents/`, `~/.claude/skills/` (dotfiles), `~/.claude/plugins/cache/`, `installed_plugins.json`, project `.claude/`, `notes/roadmap.md`, `notes/collaboration.md`.

This is the "what's in our toolbox and how do we use it" doc for the Party Trip app. Opinionated. Read it before you go hunting for skills.

---

## 1. Inventory (the curated short list)

We have a LOT installed (15 plugins, ~80 skills via plugins, 13 global agents, 30+ dotfiles skills). Most are noise for this stack. Below is the curated set that maps to **Next.js 16 + Supabase + Vercel + Tailwind/shadcn + mobile-first PWA**.

### Frontend (UI / components)

| Tool | Type | Use when |
|---|---|---|
| `vercel:nextjs` | skill | App Router design questions: RSC vs client, layouts, Server Actions, caching, middleware/proxy |
| `vercel:shadcn` | skill | Adding/composing shadcn components, theming, CLI usage |
| `vercel:react-best-practices` | skill | Auto-trigger after editing multiple `.tsx` files — quality checklist |
| `vercel:next-cache-components` | skill | Goals 4 (realtime) + 5 (itinerary) — `use cache`, `cacheTag`, PPR |
| `vercel:turbopack` | skill | Only if HMR/build perf bites us |
| `frontend-design:frontend-design` | skill | Goal 6 (theming pass) — opinionated visual direction beyond defaults |
| `everything-claude-code:frontend-patterns` | skill | React/Next state, perf, UI patterns — supplement to `vercel:nextjs` |
| `everything-claude-code:coding-standards` | skill | TS/React universal standards (matches our strict-mode rule) |

### Backend (DB / API / data layer)

| Tool | Type | Use when |
|---|---|---|
| `supabase:supabase` | skill | **ANY** Supabase task — RLS, auth, storage, realtime, CLI, MCP |
| `supabase:supabase-postgres-best-practices` | skill | Schema design, query optimization, indexes |
| `everything-claude-code:postgres-patterns` | skill | Reinforces above; mostly redundant — prefer `supabase:supabase-postgres-best-practices` |
| `everything-claude-code:backend-patterns` | skill | Server Action / API route design conventions |
| `database-reviewer` | agent (global, opus) | Run after schema migrations; review query patterns |

### Auth

| Tool | Type | Use when |
|---|---|---|
| `supabase:supabase` (auth section) | skill | Magic-link flow (our path), JWT/RLS, session handling in middleware/proxy.ts |
| `vercel:auth` | skill | **Skip** — covers Clerk/Auth0/Descope, not Supabase Auth. Anti-recommendation for us. |

### Deployment / DevEx

| Tool | Type | Use when |
|---|---|---|
| `vercel:deploy` (command) | command | `pnpm dlx vercel` deploys preview/prod |
| `vercel:env` (command) | command | Pull/sync env vars — **owner-only path** per CLAUDE.md |
| `vercel:status` (command) | command | Show recent deployments / env overview |
| `vercel:vercel-cli` | skill | CLI usage patterns |
| `vercel:deployments-cicd` | skill | Goal 1.5 — `--prebuilt`, CI workflows |
| `vercel:env-vars` | skill | `.env` discipline, OIDC tokens |
| `vercel:verification` | skill | End-to-end "is the deployed thing actually working" |
| `vercel:bootstrap` | skill | First-time project linking — already done, skip |
| `vercel:knowledge-update` | skill | Auto-injected — corrects outdated Vercel knowledge |

### Quality / Review

| Tool | Type | Use when |
|---|---|---|
| `code-reviewer` | agent (global, opus) | After any non-trivial change |
| `security-reviewer` | agent (global, opus) | Before commits touching auth/RLS/server actions/env |
| `pr-review-toolkit:review-pr` | command | Multi-agent review across changed files (comments, tests, errors, types, simplify) |
| `simplify` | skill | Post-implementation polish |
| `everything-claude-code:security-review` | skill | Auth/inputs/secrets checklist — overlaps with `security-reviewer` agent |
| `refactor-cleaner` | agent | Dead-code cleanup after a goal lands |

### Workflow / Process

| Tool | Type | Use when |
|---|---|---|
| `superpowers:writing-plans` | skill | Start of any non-trivial goal — produces a plan file |
| `superpowers:executing-plans` | skill | Execute a plan in a fresh session with review checkpoints |
| `superpowers:test-driven-development` | skill | Goal data-layer / business logic (matches our "no trivial tests" rule) |
| `superpowers:verification-before-completion` | skill | **High-value** — forces evidence before "done" claims |
| `superpowers:systematic-debugging` | skill | When tests fail or behavior is mysterious |
| `superpowers:using-git-worktrees` | skill | If goals start overlapping; otherwise skip |
| `superpowers:requesting-code-review` / `receiving-code-review` | skill | Before opening / when responding to PR feedback |
| `feature-dev:feature-dev` | command | Alternative to superpowers for a single-session feature — slower (asks lots of questions) |
| `planner` | agent (global, opus) | Lighter-weight planning than `superpowers:writing-plans` |
| `tdd-guide` | agent (global, sonnet) | Day-to-day TDD enforcement |
| `pr-cycle` | skill | Full create → review → merge cycle |
| `create-issue` | skill | Triage a bug into a labeled GH Issue |
| `create-roadmap` | skill | We already have `notes/roadmap.md` — use sparingly |
| `whereami` | skill | "Where am I in this project?" recap |
| `e2e` | skill | Playwright test generation + run + artifact upload |

### Realtime

No dedicated skill — `supabase:supabase` covers Realtime under its triggers. That's enough for Goal 4. If we hit scaling issues, fall back to Supabase docs (via MCP `search_docs`).

### Mobile / PWA

No first-party skill. Goal 6 PWA work (manifest, apple-touch-icon, Add-to-Home-Screen) → `vercel:nextjs` for manifest patterns + Playwright iOS Safari emulation for testing. **Gap — see §5.**

### Plugins we have but don't need

`shopify@`, `shopify-ai-toolkit@`, `claude-md-management@` (situational), `skill-creator@` (only when authoring skills), `figma@` (only if we start a Figma design system — out of scope for MVP), `github@` (helpful for `gh` automation; keep), `voltagent-subagents` (generic role-based agents like `mobile-developer`, `frontend-developer` — overlap heavily with our global agents; **disable**).

---

## 2. Per-goal recommendations

For each goal, the 2–4 highest-leverage skills/agents.

**Goal 1 — Foundation deployed** *(in progress)*
- `vercel:bootstrap` (one-time link) → `vercel:env-vars` (pull `.env.local`)
- `supabase:supabase` (server.ts / browser.ts / middleware.ts clients, initial migration with RLS)
- `vercel:nextjs` (App Router scaffolding)
- `code-reviewer` (close-out review)

**Goal 1.5 — Repo hygiene**
- `vercel:deployments-cicd` (CI workflow shape)
- `everything-claude-code:tdd-workflow` (Vitest + Playwright bootstrapping)
- `e2e` (first Playwright test)
- Manual: branch protection / dependabot via `gh` CLI

**Goal 2 — Auth + Trip creation**
- `supabase:supabase` (magic link, RLS, SECURITY DEFINER fn for invite accept)
- `vercel:nextjs` (Server Actions for create-trip, route handlers for `/auth/callback`)
- `database-reviewer` (review RLS policies for `trips`, `trip_members`, `invites`, `trip_member_days`)
- `security-reviewer` (auth flow + invite token validation)

**Goal 3 — Availability poll**
- `vercel:nextjs` (Server Actions, RSC for aggregated view)
- `supabase:supabase-postgres-best-practices` (indexes on `availability(trip_id, date)`)
- `e2e` (Playwright thumb-friendly mobile flow)

**Goal 4 — Announcements + realtime**
- `supabase:supabase` (Realtime channel setup, RLS for write-org/read-member)
- `vercel:next-cache-components` (`updateTag` after announcement post)
- `vercel:nextjs` (server action + optimistic UI)

**Goal 5 — Itinerary builder**
- `vercel:nextjs` (day-by-day RSC, dynamic params)
- `supabase:supabase` (CRUD with RLS)
- `vercel:next-cache-components` (cache itinerary list, tag on mutation)
- ICS export: implement directly, no skill needed

**Goal 6 — MVP polish + ship**
- `frontend-design:frontend-design` (theming pass — be deliberate about aesthetic)
- `e2e` (iOS Safari + Android Chrome Playwright runs)
- `vercel:verification` (full-stack "does it work" pass)
- `security-reviewer` + rate-limiting via `supabase:supabase`

**Goal 6.5 — Money pool**
- `supabase:supabase` (new tables + RLS)
- `vercel:nextjs` (server action for mark-paid)
- `code-reviewer`

**Goal 7 — Expenses + photos**
- `supabase:supabase` (Storage policies, expiring photos)
- `database-reviewer` (settlement algorithm + balance views)
- `superpowers:test-driven-development` (settlement algorithm — non-trivial logic, needs unit tests)
- `security-reviewer` (Storage upsert needs INSERT+SELECT+UPDATE — easy footgun)

**Goal 8 — Multi-tenant pivot**
- `superpowers:writing-plans` (this is the biggest goal; plan first)
- `vercel:nextjs` (marketing route group, dashboard listing)
- `frontend-design:frontend-design` (marketing landing)
- `supabase:supabase` (broaden RLS from one-trip to any-trip)

---

## 3. MCP servers

Inspected `.mcp.json` in each plugin cache. Installed and configured:

| MCP Server | Status | Recommendation |
|---|---|---|
| `supabase` (HTTP, `mcp.supabase.com/mcp`) | configured, needs OAuth | **KEEP — high value.** Lets Claude run `execute_sql` against staging, `search_docs` against current Supabase docs, and `get_advisors` for RLS audits without leaving the session. Authenticate once via OAuth flow. |
| `vercel` (HTTP, `mcp.vercel.com`) | configured, OAuth | **KEEP.** Read-only: search docs, list projects/deployments, inspect logs. Useful for "why did the preview fail?" |
| `playwright` (stdio, `npx @playwright/mcp@latest`) | configured | **KEEP for Goals 1.5, 6.** Browser automation in-session; iOS-Safari user-agent emulation. |
| `github` (HTTP, GitHub Copilot MCP, requires PAT) | configured | **CONDITIONAL.** Only useful if `GITHUB_PERSONAL_ACCESS_TOKEN` is set. `gh` CLI covers 90% of needs without it. Either set the token or remove. |
| `figma` (HTTP, `mcp.figma.com/mcp`) | configured, OAuth | **DISABLE.** No Figma source-of-truth for this project. |
| `shopify`, `shopify-ai-toolkit` | configured | **DISABLE.** Irrelevant. |

**Specific answer: Does the Supabase MCP help with migrations / staging DB?** Yes, substantially. Per the supabase skill: use `execute_sql` (MCP) to iterate on schema *without* writing migration history, then commit with `supabase migration new` when ready. Also `get_advisors` flags unsafe RLS configs. This is the single highest-ROI MCP server for our stack — authenticate it now.

**Action items:**
1. Trigger Supabase OAuth from a Claude session (it'll prompt).
2. Trigger Vercel OAuth same way.
3. Set `GITHUB_PERSONAL_ACCESS_TOKEN` or disable `github` plugin.
4. Disable: `figma@`, `shopify@`, `shopify-ai-toolkit@`, `voltagent-core-dev@` in `~/.claude/settings.json` → `enabledPlugins`.

---

## 4. Workflow recipes

### Recipe A: "Starting Goal X"

```
1. /superpowers:writing-plans   → produces plans/goal-N.md (or use `planner` agent for shorter goals)
2. Open a feature branch:        feat/goal-N-short-name
3. /superpowers:executing-plans (fresh session) — step through phases with review checkpoints
4. For each phase that's data-layer/algorithmic: invoke superpowers:test-driven-development
5. /pr-cycle when done
```

### Recipe B: "I just wrote a new server action"

```
1. Did it touch /lib/db/*?         → Yes: tdd-guide agent (we require tests there)
2. security-reviewer agent          (Supabase service-role check, input validation w/ zod)
3. code-reviewer agent              (immutability, RSC vs client boundary)
4. Did it change RLS?              → Yes: database-reviewer agent + supabase MCP get_advisors
5. Verify: superpowers:verification-before-completion
```

### Recipe C: "Adding a schema migration"

```
1. Read existing migrations:        ls supabase/migrations
2. Iterate via Supabase MCP:        execute_sql (NOT apply_migration — per supabase skill rule)
3. When stable:                     pnpm dlx supabase migration new <name>
4. Add RLS policies in same file    (project rule — see CLAUDE.md)
5. database-reviewer agent          for index/policy review
6. Local verify:                    pnpm dlx supabase db reset
7. Supabase MCP get_advisors        for RLS lint
8. Then typecheck/lint/test before commit
```

### Recipe D: "Reviewing my PR before opening it"

```
1. /pr-review-toolkit:review-pr     (multi-agent: comments + tests + silent failures + types + simplify)
2. superpowers:requesting-code-review (formats request for the other dev)
3. gh pr create with template       (Goal 1.5 templates require linked issue + iOS Safari screenshot)
```

### Recipe E: "Debugging on mobile"

```
1. Playwright MCP:                  browser_navigate to preview URL with iOS user agent + 375x812 viewport
2. browser_console_messages         for runtime errors
3. browser_network_requests         for slow / failing API calls
4. Vercel MCP:                      list deployments → inspect logs of the failing function
5. If RLS-related:                  supabase MCP execute_sql with the user's JWT context
6. Real iOS Safari devtools:        connect iPhone → Mac Safari → Develop menu (no skill, manual)
```

### Recipe F: "Responding to PR review feedback"

```
1. /superpowers:receiving-code-review (forces verification of suggestions, not blind agreement)
2. Apply fixes
3. simplify skill if the reviewer flagged complexity
4. Re-run typecheck/lint/test/build
```

---

## 5. What's missing — proposed project-local skills

Create these under `/Users/carlchang/Projects/Party Trip/.claude/skills/` if pain points emerge. Don't pre-build; only add when you've felt the gap twice.

| Proposed skill | Scope | Why |
|---|---|---|
| `partytrip-rls-audit` | Wrap `supabase MCP get_advisors` + a checklist specific to our tables (`trips`, `trip_members`, `invites`, `availability`, `announcements`, `itinerary_items`, `expenses`, `expense_splits`, `photos`, `money_pool_entries`) ensuring every one has SELECT/INSERT/UPDATE/DELETE policies and that none rely on `user_metadata`. | Generic supabase skill doesn't know our schema. RLS is our auth model. |
| `partytrip-mobile-qa` | Playwright recipe: emulate iPhone 12 / Pixel 5 / iPhone SE, hit `/login`, `/trips/[id]`, `/trips/[id]/availability`, screenshot each, fail if any horizontal scroll or tap target <44px. | Goal 6 acceptance includes "Mobile QA across iOS Safari and Android Chrome." Should be reproducible. |
| `partytrip-server-action-checklist` | Pre-commit checklist: zod-validated input? auth check via `getUser()`? called via `/lib/db/*` (not direct supabase.from)? revalidatePath/Tag after mutation? rate-limited? | We'll write a lot of these in Goals 2–7; one place to enforce the rules. |
| `partytrip-migration-template` | Generate a migration scaffold: CREATE TABLE + ALTER TABLE ENABLE ROW LEVEL SECURITY + 4 policies + GRANT to anon/authenticated + index. | Forces the "RLS policies in the same migration" rule from CLAUDE.md. |

Also consider a project-local agent `partytrip-reviewer` that combines `code-reviewer` + `security-reviewer` + our CLAUDE.md rules in one prompt — but only after we've felt friction from running them separately.

---

## 6. Anti-recommendations (skills that look useful but aren't)

| Skill / Agent | Why to skip |
|---|---|
| `vercel:auth` | Covers Clerk/Auth0/Descope. We're on Supabase magic links. Will steer you wrong. |
| `vercel:next-forge` | next-forge is a Turborepo monorepo starter. We're a single Next app. |
| `vercel:ai-sdk`, `vercel:ai-gateway`, `vercel:chat-sdk`, `vercel:workflow`, `vercel:vercel-sandbox` | No AI features planned. Defer until/unless added. |
| `vercel:vercel-firewall` | Goal 8+ at earliest. |
| `vercel:vercel-storage` | Lists Blob/Edge Config/Neon/Upstash. We use Supabase Storage. Only useful if we adopt Upstash for rate limiting (Goal 6) — and even then `supabase:supabase` covers a Supabase-based limiter. |
| `everything-claude-code:tdd` & `tdd-workflow` | Push **80%+ coverage including unit/integration/E2E**. Conflicts with our rule: *"Don't add tests for trivial things; do add them for data-layer and business logic."* Use selectively — invoke for `/lib/db/*` and algorithms (settlement, ICS), NOT for every component. |
| `everything-claude-code:coding-standards` "no comments" sections vs our "comments for non-obvious WHY" | Mostly aligned; just don't let the skill push toward zero comments. |
| `voltagent-subagents/*` (frontend-developer, backend-developer, mobile-developer, fullstack-developer, ui-designer, api-designer, etc.) | Generic role agents. Overlap heavily with our curated global agents and dilute the per-task model selection rules in `~/dotfiles/claude/rules/performance.md`. Disable the plugin. |
| `feature-dev:feature-dev` | High-friction (lots of clarifying questions). Use `superpowers:writing-plans` + `superpowers:executing-plans` instead — faster and produces an artifact. |
| `shopify*`, `figma*` | Wrong domain. Disable. |
| `everything-claude-code:postgres-patterns` | Strictly inferior to `supabase:supabase-postgres-best-practices` for our stack. |
| `claude-md-management:claude-md-improver` | Our CLAUDE.md is already curated. Re-run only when the project shape changes materially (e.g., Goal 8 multi-tenant pivot). |

---

## 7. Recommended `enabledPlugins` after pruning

Edit `~/.claude/settings.json`:

```json
"enabledPlugins": {
  "everything-claude-code@everything-claude-code": true,
  "superpowers@claude-plugins-official": true,
  "playwright@claude-plugins-official": true,
  "supabase@claude-plugins-official": true,
  "vercel@claude-plugins-official": true,
  "frontend-design@claude-plugins-official": true,
  "pr-review-toolkit@claude-plugins-official": true,
  "skill-creator@claude-plugins-official": true,
  "github@claude-plugins-official": true,
  "voltagent-core-dev@voltagent-subagents": false,
  "claude-md-management@claude-plugins-official": false,
  "figma@claude-plugins-official": false,
  "shopify@claude-plugins-official": false,
  "shopify-ai-toolkit@claude-plugins-official": false,
  "feature-dev@claude-plugins-official": false
}
```

Re-enable any of the `false` ones on demand for a specific session.

---

## 8. TL;DR action list

1. Authenticate the Supabase MCP server (one-time OAuth).
2. Authenticate the Vercel MCP server (one-time OAuth).
3. Disable: `voltagent-core-dev`, `figma`, `shopify`, `shopify-ai-toolkit`, `feature-dev`, `claude-md-management` (re-enable when needed).
4. Either set `GITHUB_PERSONAL_ACCESS_TOKEN` or disable the `github` plugin (gh CLI is sufficient).
5. For Goal 1.5 onward, default to: `superpowers:writing-plans` → `superpowers:executing-plans` → `pr-review-toolkit:review-pr` → `/pr-cycle`.
6. For every Supabase task: invoke `supabase:supabase` first.
7. For every server action: pair `security-reviewer` + `code-reviewer` agents before commit.
8. Build the four project-local skills (§5) only if/when you feel the friction.
