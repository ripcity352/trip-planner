/**
 * tests/fixtures/auth.ts
 *
 * Playwright fixture that provides an `authedPage` — a page pre-loaded
 * with the storage-state from the `setup` project. Any test file that
 * needs an authenticated browser context imports and uses this fixture.
 *
 * Usage:
 *   import { test, expect } from "@/tests/fixtures/auth";
 *
 *   test("authenticated user sees dashboard", async ({ authedPage }) => {
 *     await authedPage.goto("/trips");
 *     await expect(authedPage.locator("h1")).toBeVisible();
 *   });
 *
 * The fixture reads STORAGE_STATE_PATH at fixture setup time. If the
 * file does not exist (i.e., the setup project hasn't run yet), it
 * skips rather than failing with an opaque error.
 */

import path from "node:path";
import fs from "node:fs";
import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";

export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/storage-state.json"
);

interface AuthFixtures {
  /** A `Page` pre-seeded with the auth storage state from the setup project. */
  authedPage: Page;
}

export const test = base.extend<AuthFixtures>({
  /* eslint-disable react-hooks/rules-of-hooks -- `use` is Playwright's fixture callback, not a React hook */
  authedPage: async ({ browser }, use) => {
    if (!fs.existsSync(STORAGE_STATE_PATH)) {
      test.skip(
        true,
        `Auth storage state not found at ${STORAGE_STATE_PATH}. ` +
          "Run `pnpm exec playwright test --project=setup` first."
      );
      // Unreachable — test.skip throws. Satisfies the type checker.
      await use(null as unknown as Page);
      return;
    }

    const context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  /* eslint-enable react-hooks/rules-of-hooks */
});
