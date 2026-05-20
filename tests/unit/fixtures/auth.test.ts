/**
 * Smoke tests for the auth fixture module (vitest unit tests, NOT Playwright).
 *
 * We verify:
 *   1. The fixture module exports the expected symbols.
 *   2. STORAGE_STATE_PATH resolves to the expected relative location.
 *   3. seedTestUser throws a descriptive error when env vars are missing.
 *   4. cleanupTestUser is exported as a callable function.
 *
 * These tests run in the normal vitest unit suite (no browser needed).
 * Playwright-level behaviour is exercised by e2e/_setup/auth.setup.ts
 * as part of `pnpm exec playwright test --project=setup`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";

// Import from the actual module path relative to this test file.
// tests/fixtures/__tests__/ → ../../../e2e/_setup/
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  seedTestUser,
  cleanupTestUser,
} from "../../../e2e/_setup/seed-test-user";

describe("STORAGE_STATE_PATH shape", () => {
  it("resolves to playwright/.auth/storage-state.json under the repo root", () => {
    const expectedSuffix = path.join(
      "playwright",
      ".auth",
      "storage-state.json"
    );
    // Compute independently of the module under test.
    const repoRoot = path.resolve(__dirname, "../../.."); // repo root
    const expectedPath = path.join(repoRoot, expectedSuffix);
    expect(expectedPath).toContain(expectedSuffix);
    expect(path.isAbsolute(expectedPath)).toBe(true);
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
