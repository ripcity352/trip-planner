/**
 * #367 — invite-landing CTA branch.
 *
 * The page previously decided the CTA on `isSignedIn` alone, so an
 * already-accepted member re-tapping the group-chat link (the app's
 * primary re-entry path) was offered "Count me in" again. The branch is
 * extracted to a pure resolver (house pattern: deriveStateFromHasPassword)
 * so the truth table is pinned here without rendering the page.
 */

import { describe, expect, it } from "vitest";

import { resolveInviteCta } from "../cta";

describe("resolveInviteCta (#367)", () => {
  it("anonymous viewer → sign-in, regardless of the membership flag", () => {
    expect(
      resolveInviteCta({ isSignedIn: false, viewerIsMember: false })
    ).toBe("sign-in");
    // Membership is only trustworthy on a cookie-bound call; a stray
    // true from an anon path must never change the logged-out render.
    expect(
      resolveInviteCta({ isSignedIn: false, viewerIsMember: true })
    ).toBe("sign-in");
  });

  it("signed-in non-member → accept form", () => {
    expect(
      resolveInviteCta({ isSignedIn: true, viewerIsMember: false })
    ).toBe("accept");
  });

  it("signed-in member → open-trip affordance (the invite link is a re-entry point)", () => {
    expect(
      resolveInviteCta({ isSignedIn: true, viewerIsMember: true })
    ).toBe("open-trip");
  });
});
