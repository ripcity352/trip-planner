# Deployment Readiness

> Source of truth for every env-var, dashboard setting, and external-
> service prerequisite the production deploy depends on. Born of the
> M2 retro (NEW-3, NEW-5, L2): every wave that adds a new dependency
> appends a row here as part of its PR body. The closure wave checks
> every row before flipping the milestone.
>
> Lives separately from `.env.example` because `.env.example` documents
> *what each var does for a dev*. This file documents *what the prod
> deploy will fail to do without it*. Same fact in different framing.
>
> Dated 2026-05-20 — landed alongside the M3 execution plan.

---

## How to use this file

1. **Before opening a wave PR that introduces a new env var or
   dashboard setting:** add a row to the table below in the same PR,
   tagged with the milestone (M1/M2/M3/…).
2. **At the start of every milestone's Wave 0:** the bootstrap agent
   re-runs the verification commands at the bottom of this file
   against the production project. Any row that no longer verifies =
   the wave halts and surfaces.
3. **At every closure wave:** the closure agent walks the verification
   commands one more time. Failure here blocks the milestone flip.
4. **When you rotate a secret:** flip the `Last verified` date,
   open an issue with the `security` label so the other dev sees it,
   re-pull / re-copy per the role rules in `CLAUDE.md`.

---

## Required env vars (Vercel Production environment)

| Var | What breaks without it | Owner | Milestone added | Last verified |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server both fail to talk to Supabase. App is dead on first request. | Supabase project URL | M1 | 2026-05-19 (#125 production smoke) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as above. RLS-gated reads return 401. | Supabase Settings → API | M1 | 2026-05-19 |
| `SUPABASE_SERVICE_ROLE_KEY` | Magic-link callback can't exchange code; SECURITY DEFINER functions still work for end users (RLS), but server-side ops (`generateLink`, admin user creation for the e2e fixture) fail. **Service-role; never client-exposed.** | Supabase Settings → API | M1 | 2026-05-19 |
| `NEXT_PUBLIC_SITE_URL` | `lib/auth/safe-next.ts` falls back to a relative origin → magic-link redirect resolves to the wrong host on cross-origin Resend clicks. | Vercel project | M2 | 2026-05-19 |
| `KV_REST_API_URL` *(or `UPSTASH_REDIS_REST_URL`)* | Rate-limit shim runs in allow-with-warning mode → no abuse defense. Login still works (after #125). | Vercel Marketplace "Upstash for Redis" integration | M2 (#124) | 2026-05-19 |
| `KV_REST_API_TOKEN` *(or `UPSTASH_REDIS_REST_TOKEN`)* | Same as above. | Same | M2 (#124) | 2026-05-19 |
| `SENTRY_DSN` *(server)* + `NEXT_PUBLIC_SENTRY_DSN` *(client)* | No error reporting in production; the diagnostic `console.error` (#134) still surfaces in Vercel runtime logs but Sentry breadcrumbs go silent. | Sentry project | M1 | 2026-05-19 |
| `SENTRY_AUTH_TOKEN` | Source maps don't upload; stack traces in Sentry are minified. | Sentry org → Auth Tokens | M1 | 2026-05-19 |
| `RESEND_API_KEY` *(consumed by Supabase Auth, not the app)* | Outgoing magic-link emails route through the project-wide Supabase email cap (3/hr free tier) → real users hit `over_email_send_rate_limit` past 3 attempts. | Resend dashboard | M2 (PM session 2026-05-19) | 2026-05-19 |
| `GOOGLE_PLACES_API_KEY` | `/api/places/autocomplete` 502s with `places_proxy_failed`; W2a address-autocomplete UI falls back to freeform. Without billing on the Google Cloud project, the upstream returns 403. | Google Cloud project (`ripcity352`) | M4 (#166, W0c) | **NOT YET VERIFIED — M4 blocker for W0c smoke** |

**Note on KV_* vs UPSTASH_* dual-name resolution:** `lib/rate-limit/index.ts`
reads both prefixes via `__resolveUpstashCreds()`, preferring `KV_*`
when present so the production source of truth (Vercel) wins over a
stale local override. See ADR 2026-05-19 (late PM) in
`notes/decisions.md`.

---

## Required Supabase dashboard settings

| Setting | Path | What breaks without it | Last verified |
|---|---|---|---|
| **Redirect URL allowlist** includes production domain | Authentication → URL Configuration → Redirect URLs | Magic-link callbacks fail; Supabase rejects the redirect after `verifyOtp` / `exchangeCodeForSession`. Must include `https://travelston.com/auth/callback` + Vercel preview wildcard `https://*.vercel.app/auth/callback`. | 2026-05-19 |
| **Site URL** matches production | Authentication → URL Configuration → Site URL | Email-template `{{ .SiteURL }}` interpolates wrong → links 404 on click. Currently `https://travelston.com`. | 2026-05-19 |
| **Custom SMTP (Resend)** wired | Project Settings → Auth → SMTP Settings | Without it: Supabase's free-tier project-wide email cap (3/hr) bricks magic-link sign-ins past the third attempt. The 2026-05-19 retro caught this within minutes of going live. | 2026-05-19 |
| **Email Templates → Magic Link** uses the cross-device-safe variant | Authentication → Email Templates → Magic Link | If template emits `{{ .ConfirmationURL }}` (PKCE-bound), cross-device clicks fail with `pkce_code_verifier_not_found` (#137). Template must emit a `token_hash` link consumable by `verifyOtp`. **Wave 0c (M3) flips this.** | 2026-05-20 (Wave 0c #137) |
| **Realtime publication includes the right tables** | Database → Replication → Publications → `supabase_realtime` | Without `date_poll_votes` in the publication, PulsePoll renders but never updates live. M3 adds `announcements`. | 2026-05-19 (M2) / 2026-05-20 (M3 Wave 1 #79) |

---

## Required Vercel dashboard settings

| Setting | Path | What breaks without it | Last verified |
|---|---|---|---|
| **Deployment Protection — Preview SSO off** | Project → Settings → Deployment Protection | Designers / collaborator can't open preview URLs without Vercel team access (Hobby caps team at 1). Data leak risk low because previews point at staging Supabase. ADR: `notes/decisions.md` 2026-05-19 "Vercel preview SSO". | 2026-05-19 |
| **Production custom domain `travelston.com`** | Project → Settings → Domains | Without it: magic-link emails resolve to `*.vercel.app` which collides with Supabase site-URL config and breaks the callback. | 2026-05-19 |
| **Build & Output: Node 20.x runtime** | Project → Settings → General → Node.js Version | Some packages may break on older Node. Confirm parity with `.nvmrc` if present. | 2026-05-19 |

---

## Required Resend dashboard settings

| Setting | Path | What breaks without it | Last verified |
|---|---|---|---|
| **Verified domain on Resend** | Resend → Domains | Without it: sender restricted to `onboarding@resend.dev` + addresses already in the Resend Audience. Real attendees outside the audience can't receive magic-link emails. Tracked: #135. | **NOT YET VERIFIED — blocker for M4 send-to-real-attendees**. M3 still uses the sandbox sender on the developer's own email. |
| **Outbound DKIM + SPF on the verified domain's DNS** | Domain registrar → DNS | Without it: emails land in spam for many providers. | Tracked under #135. |

---

## Verification commands (run at every milestone Wave 0 + closure)

```bash
# 1. Env-var presence on the production environment.
#    Requires `vercel link` against the prod project.
vercel env ls production

# 2. Confirm prod URL is publicly reachable and serves the expected HTML.
curl -sI https://travelston.com | head -5
#    Expect: HTTP/2 200, x-vercel-cache (HIT|MISS|STALE)

# 3. Confirm preview URLs noindex (data privacy).
curl -sI "$(vercel ls --json | jq -r '.[0].url')" | grep -i 'x-robots-tag'
#    Expect: x-robots-tag: noindex

# 4. Confirm Supabase Auth callback round-trips end-to-end.
#    Real magic-link sign-in via the production URL, in a real browser
#    at 375px (see m3-execution-plan.md Override A). MCP-driven OK.

# 5. Confirm Resend outgoing log shows the latest magic-link delivery.
#    Resend dashboard → Logs → most recent send → status: delivered.

# 6. Confirm Sentry has received the latest "test" event.
#    Sentry dashboard → Issues → filter `release:latest` non-empty.
```

The Wave 0 closure of any milestone *must* re-run #2, #3, #4 against
the production URL. The closure wave of any milestone *must* re-run
all six. Failures block the milestone flip.

---

## When a row stops verifying

- If env-var row fails: open a `security` issue, rotate the secret if
  it's stale, re-add via `vercel env add`, redeploy.
- If a Supabase dashboard row fails: fix in the dashboard, paste a
  screenshot of the post-fix state into the wave PR's `Production
  walk` section.
- If a Resend row fails: surface the cap or DNS issue in a new issue
  with the `infra` label; treat as a wave blocker only if the wave
  itself depends on outbound email.

A row that fails for a *different* reason than what the column
describes — e.g., the Vercel env-var is present but malformed —
counts as a hard-stop trigger per `m3-execution-plan.md` Appendix B.

---

## What we deliberately do NOT track here

- Local-dev env vars (those live in `.env.example`).
- Staging-Supabase-specific config (preview deploys read it via the
  Supabase Vercel integration; verify with the same `vercel env ls`
  shape but the `preview` environment).
- Things any framework default handles correctly (e.g., HTTPS via
  Vercel; HSTS is already on).

The aim is the *minimal load-bearing list* — anything broader becomes
ignored noise inside a wave.
