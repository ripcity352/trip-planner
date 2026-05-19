# Branch protection + secret scanning + push protection audit

- **Date:** 2026-05-19
- **Repo:** `ripcity352/trip-planner`
- **Auditor:** Claude Code (background agent, read-only `gh api`)

## Method

Read-only queries via `gh api`:

```bash
# 1. Branch protection on main
gh api repos/ripcity352/trip-planner/branches/main/protection 2>/dev/null

# 2. Security + analysis (secret scanning, push protection)
gh api repos/ripcity352/trip-planner 2>/dev/null | jq '.security_and_analysis'

# 3. Dependabot config (local file)
ls -la .github/dependabot.yml

# 4. CODEOWNERS (local file)
ls -la .github/CODEOWNERS
```

No write operations were performed. This report documents current state
and recommends follow-ups for the maintainer (`ripcity352`).

## Findings

### 1. Branch protection on `main`

| Check | Status | Value |
|---|---|---|
| `required_pull_request_reviews` set | ✓ pass | `required_approving_review_count: 0`, `dismiss_stale_reviews: true` — PR is required, zero approvals enforced (solo-dev friendly) |
| `required_status_checks` includes `typecheck · lint · test · build` | ✓ pass | `contexts: ["typecheck · lint · test · build"]`, `strict: true` (branch must be up-to-date) |
| `enforce_admins` | ⚠ gap | `enabled: false` — admins (i.e. `ripcity352`) can bypass protection. Acceptable for solo emergencies, but worth a conscious decision |
| `restrictions` | ✓ pass | Not present — no explicit push restrictions; protection applies to everyone non-admin |
| `required_linear_history` | ✓ pass | `enabled: true` — squash/rebase only, no merge commits |
| `allow_force_pushes` | ✓ pass | `enabled: false` |
| `allow_deletions` | ✓ pass | `enabled: false` |
| `required_conversation_resolution` | ✓ pass (bonus) | `enabled: true` — must resolve PR comments before merge |
| `required_signatures` | N/A | `enabled: false` — not required by project policy |
| `require_code_owner_reviews` | ⚠ gap | `false` — CODEOWNERS file exists but isn't enforced on PRs |

### 2. Secret scanning + push protection

| Check | Status | Value |
|---|---|---|
| `secret_scanning.status` | ✗ fail | `disabled` |
| `secret_scanning_push_protection.status` | ✗ fail | `disabled` |
| `secret_scanning_validity_checks.status` | ✗ fail | `disabled` |
| `secret_scanning_non_provider_patterns.status` | ⚠ gap | `disabled` (optional, but useful) |
| `dependabot_security_updates.status` | ✓ pass | `enabled` |

GitHub offers secret scanning + push protection **for free on public
repos**. The repo is presumed public (Hobby tier hosting on Vercel), so
there's no cost barrier — these are simply not enabled yet.

### 3. Dependabot

| Check | Status | Value |
|---|---|---|
| `.github/dependabot.yml` exists | ✓ pass | Present (1294 bytes) |

### 4. CODEOWNERS

| Check | Status | Value |
|---|---|---|
| `.github/CODEOWNERS` exists | ✓ pass | Present (711 bytes) |
| Enforced via `require_code_owner_reviews` | ⚠ gap | Not enforced (see §1) — file is informational only |

## Recommendations

### Priority 1 — security gaps (low effort, high payoff)

**1.1 Enable secret scanning + push protection.** Push protection blocks
commits containing detected secrets *before* they hit the remote, which
is the single highest-leverage guardrail for a solo/duo team that
sometimes works at 1am.

```bash
gh api -X PATCH repos/ripcity352/trip-planner \
  -F security_and_analysis[secret_scanning][status]=enabled \
  -F security_and_analysis[secret_scanning_push_protection][status]=enabled \
  -F security_and_analysis[secret_scanning_validity_checks][status]=enabled
```

If the API call returns `422` or `403`, the feature must be enabled via
the web UI — see "Manual follow-ups" below.

### Priority 2 — protection tightening (judgment call)

**2.1 Decide on `enforce_admins`.** Currently off. Turning it on means
even `ripcity352` cannot push to `main` directly or bypass the required
status check. For a two-person project where one person owns the repo,
leaving it off is defensible (lets the owner unblock emergencies). But
the explicit decision should be logged in `notes/decisions.md`.

To turn on:
```bash
gh api -X POST repos/ripcity352/trip-planner/branches/main/protection/enforce_admins
```

**2.2 Decide on `require_code_owner_reviews`.** CODEOWNERS exists; right
now it's documentation only. Enforcing it means PRs touching paths owned
by a specific user require *their* approval. With two devs and a small
repo, this is mostly redundant (the other dev reviews everything
anyway). Recommend: leave off until the team grows.

### Priority 3 — nice-to-have

**3.1 Enable non-provider secret patterns.** Catches custom patterns
(e.g. anything matching a generic key shape). Set:

```bash
gh api -X PATCH repos/ripcity352/trip-planner \
  -F security_and_analysis[secret_scanning_non_provider_patterns][status]=enabled
```

## Manual follow-ups for `ripcity352`

Some settings may require the web UI on free/Hobby plans or for first-time
enablement. If the `gh api` commands above fail:

1. **Secret scanning + push protection:**
   `https://github.com/ripcity352/trip-planner/settings/security_analysis`
   → enable "Secret scanning" and "Push protection".

2. **Branch protection** (if any `gh api` PATCH fails):
   `https://github.com/ripcity352/trip-planner/settings/branches`
   → edit rule for `main`.

3. **Log the `enforce_admins` decision** in `notes/decisions.md` once
   made — either way (on or off), the rationale belongs in the audit
   trail.

## Summary

- **6 checks pass** (PR required, status checks, linear history, no
  force push / deletion, conversation resolution, dependabot, CODEOWNERS
  file, dependabot.yml).
- **3 checks fail** — all in the secret-scanning family (scanning,
  push protection, validity checks).
- **2 gaps** — `enforce_admins` and `require_code_owner_reviews` are
  off; both are defensible defaults for a 2-person team but should be
  conscious decisions, not accidents.
- **Top recommendation:** enable secret scanning + push protection
  (one `gh api` call or one click in the web UI). Zero downside, free
  on public repos, blocks the most common "oops I committed a key"
  failure mode.
