/**
 * #471 (account surface) — the sign-in-and-security password schemas must
 * distinguish an EMPTY new password from a TOO-SHORT one, same split as
 * the login form. Before this fix all three new-password schemas collapsed
 * both states into the generic ERRORS.validation_failed.
 *
 * Ordering trap pinned here: emptiness is checked before length, so an
 * empty field NEVER shows the too-short message.
 */

import { describe, expect, it } from "vitest";
import {
  changePasswordClientSchema,
  newPasswordClientSchema,
  setPasswordClientSchema,
} from "@/app/(authed)/account/sign-in-and-security/_form-state";
import { ERRORS } from "@/lib/copy/errors";
import type { z } from "zod";

/** First zod issue message on `path`, or null on success. */
function firstIssue(
  schema: z.ZodTypeAny,
  values: Record<string, string>,
  path: string,
): string | null {
  const result = schema.safeParse(values);
  if (result.success) return null;
  const issue = result.error.issues.find((i) => i.path[0] === path);
  return issue?.message ?? null;
}

describe("changePasswordClientSchema — #471 empty vs too-short split", () => {
  const withNewPassword = (newPassword: string) =>
    firstIssue(
      changePasswordClientSchema,
      { currentPassword: "current-pass", newPassword },
      "newPassword",
    );

  it("empty new password → the required message, never the too-short one", () => {
    expect(withNewPassword("")).toBe(ERRORS.auth_password_required);
  });

  it("3-char new password → the too-short message", () => {
    expect(withNewPassword("abc")).toBe(ERRORS.auth_password_too_short);
  });

  it("6-char new password → passes", () => {
    expect(withNewPassword("abcdef")).toBeNull();
  });

  it("empty current password → the required message", () => {
    expect(
      firstIssue(
        changePasswordClientSchema,
        { currentPassword: "", newPassword: "abcdef" },
        "currentPassword",
      ),
    ).toBe(ERRORS.auth_password_required);
  });
});

describe.each([
  ["newPasswordClientSchema", newPasswordClientSchema],
  ["setPasswordClientSchema", setPasswordClientSchema],
] as const)("%s — #471 empty vs too-short split", (_name, schema) => {
  const withNewPassword = (newPassword: string) =>
    firstIssue(schema, { newPassword }, "newPassword");

  it("empty new password → the required message, never the too-short one", () => {
    expect(withNewPassword("")).toBe(ERRORS.auth_password_required);
  });

  it("3-char new password → the too-short message", () => {
    expect(withNewPassword("abc")).toBe(ERRORS.auth_password_too_short);
  });

  it("6-char new password → passes", () => {
    expect(withNewPassword("abcdef")).toBeNull();
  });
});
