/**
 * Playwright smoke for the celebrant-weighted date poll (M2 Wave 3,
 * #75 + #76).
 *
 * Scope:
 *   - Unauthenticated visit to `/trips/<slug>/dates` is bounced by
 *     the authed layout (the only smoke we can reliably ship without
 *     the storage-state auth fixture).
 *   - Authenticated multi-actor flow is documented as `test.fixme`
 *     until the auth fixture lands. The fixme block is the spec for
 *     the day the fixture exists — it pins:
 *       1. Celebrant proposes 2 windows
 *       2. Celebrant marks window 1 `no-go`
 *       3. Non-celebrant member visits /dates — window 1 NOT visible
 *       4. Member votes yes on window 2 — aggregate count updates
 *
 * The optional two-context realtime test (window 2 disappearing
 * from member view in real time when the celebrant flips it
 * to no-go) is deferred. The deferral is intentional — it depends
 * on the same auth fixture work plus a multi-context Playwright
 * harness which doesn't exist yet. Tracking via the PR body.
 */

import { test, expect } from "@playwright/test";

import { M2_UI_STRINGS } from "@/lib/copy/empty-states";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

test.describe("Date poll — celebrant-weighted (bach)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
  });

  test("unauthenticated visit to /trips/<slug>/dates is bounced by the authed layout", async ({
    page,
  }) => {
    await page.goto("/trips/any-slug/dates");

    // The (authed) route group enforces session presence — the page
    // heading must NOT render for a logged-out caller. We don't pin
    // the exact redirect URL (auth layer evolves) — the load-bearing
    // observable is "no date-poll heading visible to anon callers".
    await expect(
      page.getByRole("heading", {
        name: M2_UI_STRINGS.datePoll_heading,
      })
    ).not.toBeVisible();
  });

  test.fixme(
    "authenticated celebrant flow: propose → mark no-go → member view hides vetoed",
    async () => {
      test.skip(
        !SUPABASE_URL || !SERVICE_ROLE_KEY,
        "Service-role key not configured — skipping authenticated date-poll path."
      );
      // Pending auth fixture (`e2e/fixtures/auth-state.ts`) which
      // lands separately. When it does:
      //   1. Seed trip + celebrant + non-celebrant member via service role
      //   2. Sign in as celebrant; visit /trips/<slug>/dates
      //   3. Click "Add a window" twice, propose two windows
      //   4. Mark window 1 as "Hard pass" — chip flips to active
      //   5. Sign in as non-celebrant; visit the same URL
      //   6. Assert window 1 label is NOT visible; window 2 IS
      //   7. Click "I'm in" on window 2; aggregate count text updates
    }
  );

  test.fixme(
    "realtime: celebrant flips no-go in one context, member view drops the candidate within 2s",
    async () => {
      // Deferred — see file docstring. Depends on:
      //   a. The auth fixture (above)
      //   b. A multi-browser-context Playwright harness
      // Spec stays here as a TODO contract.
    }
  );
});
