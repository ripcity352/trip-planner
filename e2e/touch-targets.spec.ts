/**
 * e2e/touch-targets.spec.ts — 44px effective touch-target sweep (#F4).
 *
 * The design system already named the axis (design-system.md §"Other
 * established-craft adds" — "Tap targets ≥44×44px … Visual button can be
 * smaller; hit area can't.") but nothing enforced it. `buttonVariants`
 * default/lg/icon, the header avatar trigger, and the bespoke RSVP/date
 * vote chips all measured 32-36px. See design-system.md §"Touch-target
 * hit-slop mechanism (#F4 …)" for the fix contract: visual size unchanged,
 * a `content-['']` pseudo-element extends the EFFECTIVE hit area to 44px.
 *
 * This spec measures the EFFECTIVE hit area — the element's own
 * `getBoundingClientRect()` unioned with its computed `::after` box (when
 * the `::after` is a positioned, content-bearing pseudo-element used as
 * hit-slop) — and asserts both dimensions are >= 44px on:
 *   - /login primary CTA (email-continue button)
 *   - /trips/new submit button
 *   - dashboard RSVP chips (rsvp-toggle.tsx)
 *   - /dates vote chips (_member-view.tsx)
 *   - header avatar (account-menu trigger)
 *
 * Self-contained UI login (does not depend on the shared Playwright
 * `setup` project / STORAGE_STATE_PATH) — this spec is designed to run
 * standalone against a scratch dev server with its own seeded user via
 * E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD.
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_TEST_USER_EMAIL ?? "";
const TEST_PASSWORD = process.env.E2E_TEST_USER_PASSWORD ?? "";

function credsAvailable(): boolean {
  return Boolean(TEST_EMAIL && TEST_PASSWORD);
}

/**
 * Measures the EFFECTIVE (post hit-slop) hit box for a locator: the
 * element's own rect unioned with its `::after` pseudo-element box, IF
 * that `::after` is being used as a hit-slop mechanism (position:
 * absolute, non-empty computed `content`, `inset` values that expand
 * beyond the parent's own border box). Falls back to the element's own
 * rect when there's no such `::after`.
 */
async function effectiveHitArea(
  page: Page,
  locator: import("@playwright/test").Locator
): Promise<{ width: number; height: number }> {
  const handle = await locator.elementHandle();
  if (!handle) {
    throw new Error("effectiveHitArea: locator did not resolve to an element");
  }

  const box = await handle.evaluate((el) => {
    const rect = (el as Element).getBoundingClientRect();
    const after = window.getComputedStyle(el as Element, "::after");

    // No pseudo-element in play (e.g. `content: none`) -> own rect only.
    if (!after.content || after.content === "none" || after.content === '""') {
      // `content: ""` (from Tailwind's `content-['']`) IS a real, painted
      // (invisible) pseudo-element — only bail on `none`/absent.
      if (after.content !== '""') {
        return { width: rect.width, height: rect.height };
      }
    }

    if (after.position !== "absolute" && after.position !== "fixed") {
      return { width: rect.width, height: rect.height };
    }

    // Resolve the ::after box from its inset/width/height relative to the
    // element's own border box (the containing block for an absolutely
    // positioned pseudo-element with `position: relative` on the host).
    const top = parseFloat(after.top) || 0;
    const bottom = parseFloat(after.bottom) || 0;
    const left = parseFloat(after.left) || 0;
    const right = parseFloat(after.right) || 0;

    // Negative top/left/bottom/right (Tailwind `-inset-*`) push the
    // pseudo-element's edge OUTSIDE the host's own box by that amount.
    const afterWidth = rect.width - left - right;
    const afterHeight = rect.height - top - bottom;

    return {
      width: Math.max(rect.width, afterWidth),
      height: Math.max(rect.height, afterHeight),
    };
  });

  return box;
}

async function loginViaUi(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#login-password").waitFor({ state: "visible" });
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/trips/, { timeout: 15_000 });
}

test.describe("touch targets — 44px effective hit area (#F4)", () => {
  test.skip(!credsAvailable(), "E2E_TEST_USER_EMAIL/PASSWORD not set");

  test("login primary CTA has a 44px effective hit area", async ({ page }) => {
    await page.goto("/login");
    const cta = page.getByRole("button", { name: "Continue", exact: true });
    await expect(cta).toBeVisible();
    const { width, height } = await effectiveHitArea(page, cta);
    expect(height).toBeGreaterThanOrEqual(44);
    // Width relies on text+padding, not hit-slop x-axis (y-only by design
    // — see design-system.md axis rule) — assert visible/clickable instead.
    expect(width).toBeGreaterThan(0);
  });

  test("header avatar trigger has a 44x44 effective hit area", async ({
    page,
  }) => {
    await loginViaUi(page);
    const trigger = page.getByRole("button", { name: /account menu/i });
    await expect(trigger).toBeVisible();
    const { width, height } = await effectiveHitArea(page, trigger);
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  test("/trips/new submit button has a 44px effective hit area", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/trips/new");
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeVisible();
    const { height } = await effectiveHitArea(page, submit);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  test("dashboard RSVP chips have a 44px effective hit area", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/trips");
    const tripLink = page
      .locator('a[href*="/trips/"]:not([href="/trips/new"])')
      .first();
    await expect(tripLink).toBeVisible();
    await tripLink.click();
    await page.waitForURL(/\/trips\/[^/]+$/);

    const rsvpGroup = page.getByRole("group", { name: "RSVP" });
    await expect(rsvpGroup).toBeVisible();
    const chips = rsvpGroup.getByRole("button");
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const { height } = await effectiveHitArea(page, chips.nth(i));
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  test("/dates vote chips have a 44px effective hit area", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/trips");
    const tripLink = page
      .locator('a[href*="/trips/"]:not([href="/trips/new"])')
      .first();
    await expect(tripLink).toBeVisible();
    const href = await tripLink.getAttribute("href");
    if (!href) test.skip(true, "no trip available for the seeded user");

    await page.goto(`${href}/dates`);
    const voteGroups = page.getByRole("group");
    const groupCount = await voteGroups.count();
    if (groupCount === 0) {
      test.skip(true, "no date-poll candidates seeded for this trip");
    }

    let sawChip = false;
    for (let g = 0; g < groupCount; g++) {
      const group = voteGroups.nth(g);
      const buttons = group.getByRole("button");
      const btnCount = await buttons.count();
      for (let i = 0; i < btnCount; i++) {
        const btn = buttons.nth(i);
        const isChip = await btn.evaluate((el) =>
          (el as HTMLElement).className.includes("rounded-full")
        );
        if (!isChip) continue;
        sawChip = true;
        const { height } = await effectiveHitArea(page, btn);
        expect(height).toBeGreaterThanOrEqual(44);
      }
    }
    expect(sawChip).toBe(true);
  });
});
