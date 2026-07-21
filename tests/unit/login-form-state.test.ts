/**
 * #471 — the login password schema must distinguish an EMPTY password
 * ("enter your password") from a TOO-SHORT one ("needs at least 6
 * characters"). Before this fix both collapsed to the generic
 * ERRORS.validation_failed, so the user couldn't tell which problem
 * to fix.
 *
 * Ordering trap pinned here: emptiness is checked before length, so an
 * empty field NEVER shows the too-short message.
 */

import { describe, expect, it } from "vitest";
import { passwordSchema } from "@/app/login/_form-state";
import { ERRORS } from "@/lib/copy/errors";

/** First zod issue message on the `password` path, or null on success. */
function passwordIssue(password: string): string | null {
  const result = passwordSchema.safeParse({ email: "a@b.com", password });
  if (result.success) return null;
  const issue = result.error.issues.find((i) => i.path[0] === "password");
  return issue?.message ?? null;
}

describe("passwordSchema — #471 empty vs too-short split", () => {
  it("empty password → the required message, never the too-short one", () => {
    expect(passwordIssue("")).toBe(ERRORS.auth_password_required);
  });

  it("3-char password → the too-short message", () => {
    expect(passwordIssue("abc")).toBe(ERRORS.auth_password_too_short);
  });

  it("6-char password → passes", () => {
    expect(passwordIssue("abcdef")).toBeNull();
  });

  it("neither state maps to the generic validation_failed", () => {
    expect(passwordIssue("")).not.toBe(ERRORS.validation_failed);
    expect(passwordIssue("abc")).not.toBe(ERRORS.validation_failed);
  });
});
