/**
 * Shape + voice-lock tests for the auth copy palette.
 *
 * Voice rule: "would you say this at a pre-trip dinner?"
 * Anti-corporate guard: no "An error occurred", no bare "error",
 * no "Please", no "Invalid", no "Authentication failed".
 *
 * Exact-match pins below are intentionally brittle per Override H —
 * changing a string requires updating this test as well, making the
 * change impossible to miss in review.
 */

import { describe, expect, it } from "vitest";
import { AUTH_COPY, type AuthCopyKey } from "@/lib/copy/auth";

describe("AUTH_COPY — shape", () => {
  it("exports an AUTH_COPY object", () => {
    expect(typeof AUTH_COPY).toBe("object");
    expect(AUTH_COPY).not.toBeNull();
  });

  it("every static string value is non-empty and under 120 chars", () => {
    for (const [key, value] of Object.entries(AUTH_COPY)) {
      if (typeof value !== "string") continue; // skip functions
      expect(value.trim().length, `${key} must not be empty`).toBeGreaterThan(0);
      expect(value.length, `${key} must be under 120 chars`).toBeLessThanOrEqual(120);
    }
  });

  it("codeSentHelper is a function returning a string", () => {
    expect(typeof AUTH_COPY.codeSentHelper).toBe("function");
    const result = AUTH_COPY.codeSentHelper("dave@example.com");
    expect(typeof result).toBe("string");
    expect(result).toContain("dave@example.com");
  });

  it("has the expected keys", () => {
    const expectedKeys: AuthCopyKey[] = [
      "emailFieldLabel",
      "passwordFieldLabel",
      "codeFieldLabel",
      "continueButton",
      "signInButton",
      "signUpButton",
      "sendCodeButton",
      "verifyCodeButton",
      "togglePasswordShow",
      "togglePasswordHide",
      "passwordHelper",
      "codeSentHelper",
      "emailMeCodeLink",
      "createAccountLink",
      "codeSentSuccess",
      "signupSuccess",
    ];
    for (const key of expectedKeys) {
      expect(AUTH_COPY, `missing key: ${key}`).toHaveProperty(key);
    }
  });
});

describe("AUTH_COPY — voice locks (Override H)", () => {
  it("emailFieldLabel is voice-locked", () => {
    expect(AUTH_COPY.emailFieldLabel).toBe("Email");
  });

  it("passwordFieldLabel is voice-locked", () => {
    expect(AUTH_COPY.passwordFieldLabel).toBe("Password");
  });

  it("emailMeCodeLink is voice-locked", () => {
    expect(AUTH_COPY.emailMeCodeLink).toBe("Email me a code instead");
  });

  it("passwordHelper is voice-locked", () => {
    expect(AUTH_COPY.passwordHelper).toBe(
      "6+ characters. Make it something you'll remember."
    );
  });

  it("codeSentHelper result is voice-locked", () => {
    expect(AUTH_COPY.codeSentHelper("test@example.com")).toBe(
      "Code's heading to test@example.com. Pop it in below."
    );
  });

  it("signInButton does not contain 'Login' or 'Log in'", () => {
    expect(AUTH_COPY.signInButton.toLowerCase()).not.toContain("login");
    expect(AUTH_COPY.signInButton.toLowerCase()).not.toContain("log in");
  });

  it("no static string contains 'Please' or 'Invalid'", () => {
    for (const [key, value] of Object.entries(AUTH_COPY)) {
      if (typeof value !== "string") continue;
      expect(value, `${key} must not contain 'Please'`).not.toMatch(/\bPlease\b/i);
      expect(value, `${key} must not contain 'Invalid'`).not.toMatch(/\bInvalid\b/i);
    }
  });

  it("no static string contains 'An error occurred'", () => {
    for (const [key, value] of Object.entries(AUTH_COPY)) {
      if (typeof value !== "string") continue;
      expect(value.toLowerCase(), `${key} corporate-voice guard`).not.toContain(
        "an error occurred"
      );
    }
  });
});
