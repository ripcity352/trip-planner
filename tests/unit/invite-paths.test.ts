import { describe, it, expect } from "vitest";

import { invitePreviewPath, inviteAcceptPath } from "@/lib/invites/paths";

/**
 * The load-bearing contract these paths encode (#316 / #106): the preview
 * path is the ONLY invite path safe to hand an auth flow as a `next=`
 * redirect target, because post-sign-in redirects are GET navigations.
 * The accept path is a POST-only route handler — a GET lands a 405 blank
 * page — so it must never be a redirect target.
 */
describe("invite paths", () => {
  it("invitePreviewPath is a GET-navigable preview path with no /accept suffix", () => {
    expect(invitePreviewPath("abc123")).toBe("/invite/abc123");
    expect(invitePreviewPath("abc123")).not.toMatch(/\/accept$/);
  });

  it("inviteAcceptPath targets the POST-only accept route", () => {
    expect(inviteAcceptPath("abc123")).toBe("/invite/abc123/accept");
  });
});
