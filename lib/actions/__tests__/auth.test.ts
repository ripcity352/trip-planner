/**
 * Tests for `lib/actions/auth.ts`.
 *
 * The `signOut` action is intentionally tiny: it calls
 * `supabase.auth.signOut()` then `redirect("/login")`. We mock both
 * boundaries (the Supabase client factory + Next's `redirect`) so the
 * test runs without a real Supabase or Next request lifecycle.
 *
 * `redirect()` in Next.js works by throwing — we replicate that here so
 * the action's control flow under test mirrors production.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const signOutSpy = vi.fn().mockResolvedValue({ error: null });
const createClientMock = vi.fn().mockResolvedValue({
  auth: { signOut: signOutSpy },
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const redirectMock = vi.fn((url: string) => {
  // Next's redirect() throws a special error to short-circuit rendering.
  // We mimic that so any code after `redirect` is unreachable, matching
  // production semantics.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("signOut server action", () => {
  afterEach(() => {
    signOutSpy.mockClear();
    createClientMock.mockClear();
    redirectMock.mockClear();
  });

  it("calls supabase.auth.signOut and then redirect('/login')", async () => {
    const { signOut } = await import("@/lib/actions/auth");

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("invokes signOut BEFORE redirect (order matters: cookie clear must happen first)", async () => {
    const callOrder: string[] = [];
    signOutSpy.mockImplementationOnce(async () => {
      callOrder.push("signOut");
      return { error: null };
    });
    redirectMock.mockImplementationOnce((url: string) => {
      callOrder.push("redirect");
      throw new Error(`NEXT_REDIRECT:${url}`);
    });

    const { signOut } = await import("@/lib/actions/auth");
    await expect(signOut()).rejects.toThrow();

    expect(callOrder).toEqual(["signOut", "redirect"]);
  });

  it("logs the error and still redirects when supabase.signOut returns an error", async () => {
    // Refresh-token revocation race etc. — we'd rather strand the user
    // on /login than freeze the page mid-action.
    signOutSpy.mockResolvedValueOnce({ error: { message: "boom" } });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { signOut } = await import("@/lib/actions/auth");
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth] signOut failed:",
      "boom"
    );
    expect(redirectMock).toHaveBeenCalledWith("/login");

    consoleErrorSpy.mockRestore();
  });
});
