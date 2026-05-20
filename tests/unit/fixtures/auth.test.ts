/**
 * Smoke tests for the auth fixture surface (vitest unit tests, NOT
 * Playwright).
 *
 * We verify:
 *   1. STORAGE_STATE_PATH points at the gitignored
 *      `playwright/.auth/storage-state.json`.
 *   2. seedTestUser throws a descriptive error when env vars are
 *      missing (so a developer running e2e locally without setup
 *      sees a clear message instead of a hard crash).
 *   3. TEST_USER_EMAIL / TEST_USER_PASSWORD defaults exist for the
 *      deterministic test user (`e2e-test@example.com`).
 *   4. cleanupTestUser is callable so a future global teardown can
 *      wire it without contract drift.
 *
 * These tests run in the normal vitest unit suite (no browser
 * needed). Playwright-level behaviour is exercised by
 * e2e/_setup/auth.setup.ts as part of
 * `pnpm exec playwright test --project=setup`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";

import { STORAGE_STATE_PATH } from "../../fixtures/auth";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  seedTestUser,
  cleanupTestUser,
} from "../../../e2e/_setup/seed-test-user";

describe("STORAGE_STATE_PATH (single source of truth)", () => {
  it("points at playwright/.auth/storage-state.json under the repo root", () => {
    const expectedSuffix = path.join(
      "playwright",
      ".auth",
      "storage-state.json"
    );
    expect(STORAGE_STATE_PATH.endsWith(expectedSuffix)).toBe(true);
    expect(path.isAbsolute(STORAGE_STATE_PATH)).toBe(true);
  });
});

describe("TEST_USER_EMAIL / TEST_USER_PASSWORD defaults", () => {
  it("exports TEST_USER_EMAIL with a deterministic default", () => {
    expect(typeof TEST_USER_EMAIL).toBe("string");
    expect(TEST_USER_EMAIL.length).toBeGreaterThan(0);
  });

  it("exports TEST_USER_PASSWORD with a deterministic default", () => {
    expect(typeof TEST_USER_PASSWORD).toBe("string");
    expect(TEST_USER_PASSWORD.length).toBeGreaterThan(0);
  });

  it("defaults TEST_USER_EMAIL to e2e-test@example.com when env var is absent", () => {
    const envOverride = process.env["E2E_TEST_USER_EMAIL"];
    if (!envOverride) {
      expect(TEST_USER_EMAIL).toBe("e2e-test@example.com");
    }
  });
});

describe("seedTestUser — env-var guard", () => {
  const originalUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const originalKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  beforeEach(() => {
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
  });

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env["NEXT_PUBLIC_SUPABASE_URL"] = originalUrl;
    } else {
      delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    }
    if (originalKey !== undefined) {
      process.env["SUPABASE_SERVICE_ROLE_KEY"] = originalKey;
    } else {
      delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    }
  });

  it("throws a descriptive error when SUPABASE_URL and SERVICE_ROLE_KEY are missing", async () => {
    // seedTestUser reads the env vars at call time (not module-load time),
    // so stripping them in beforeEach is sufficient.
    await expect(seedTestUser()).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/
    );
  });
});

describe("cleanupTestUser — exports", () => {
  it("is exported as a function", () => {
    expect(typeof cleanupTestUser).toBe("function");
  });
});
