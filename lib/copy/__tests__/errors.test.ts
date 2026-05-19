/**
 * Sanity tests for the error-toast copy palette. Voice is human-reviewed
 * in the PR; here we only verify shape and length.
 */

import { describe, expect, it } from "vitest";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";

const EXPECTED_KEYS: readonly ErrorKey[] = [
  "network",
  "rls_denied",
  "validation_failed",
  "rate_limit",
  "idempotency_replayed",
];

// Toasts are dismissed on a glance; over ~120 chars and the user
// scrolls them away before reading.
const MAX_LENGTH = 120;

describe("ERRORS", () => {
  it("covers every key in ErrorKey", () => {
    for (const key of EXPECTED_KEYS) {
      expect(ERRORS).toHaveProperty(key);
    }
    expect(Object.keys(ERRORS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("has a non-empty string for every key", () => {
    for (const key of EXPECTED_KEYS) {
      const value = ERRORS[key];
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it(`keeps every string under ${MAX_LENGTH} characters`, () => {
    for (const key of EXPECTED_KEYS) {
      expect(ERRORS[key].length).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });
});
