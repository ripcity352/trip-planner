import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression guard for #316: the new-invitee OTP flow dead-ended on a
 * blank 405 because the not-authed bounce sent the user back to the
 * POST-only `/invite/[token]/accept` route as a GET `next=` target.
 *
 * The bounce must hand `/login` a GET-navigable `next` (the preview
 * page), never the POST-only accept route.
 */

const { getUserMock, acceptInviteActionMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  acceptInviteActionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

// Should never be reached on the not-authed path; mock so the module
// imports cleanly and we can assert it is NOT called.
vi.mock("@/lib/actions/invites", () => ({
  acceptInviteAction: acceptInviteActionMock,
}));

import { POST } from "@/app/invite/[token]/accept/route";

describe("POST /invite/[token]/accept — not-authed bounce", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    acceptInviteActionMock.mockReset();
  });

  it("bounces an anonymous POST to /login with a GET-safe next (the preview page, NOT the POST-only accept route)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const token = "tok123";

    const req = new NextRequest(
      `https://travelston.com/invite/${token}/accept`,
      { method: "POST" }
    );
    const res = await POST(req, { params: Promise.resolve({ token }) });

    expect(res.status).toBe(303);

    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    const nextParam = new URL(location!).searchParams.get("next");

    // The bug: next must be the GET-navigable preview, never /accept.
    expect(nextParam).toBe(`/invite/${token}`);
    expect(nextParam).not.toContain("/accept");

    expect(acceptInviteActionMock).not.toHaveBeenCalled();
  });
});
