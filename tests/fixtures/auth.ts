/**
 * tests/fixtures/auth.ts
 *
 * Single source of truth for the auth storage-state path. The
 * `e2e/_setup/auth.setup.ts` project writes the file; e2e specs read
 * it via `test.use({ storageState })`; this module owns the absolute
 * path so the three sites stay in sync.
 *
 * No Playwright fixture (`authedPage`) is exported on purpose:
 * `test.use({ storageState: STORAGE_STATE_PATH })` is the idiomatic
 * Playwright pattern and is what the e2e specs already use. Wrapping
 * it in a custom fixture is a layer with no payoff.
 */

import path from "node:path";

/**
 * Absolute path to the Playwright storage-state file emitted by the
 * `setup` project. Gitignored under `playwright/.auth/`.
 */
export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/storage-state.json"
);
