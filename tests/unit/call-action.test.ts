/**
 * Tests for `lib/ui/call-action.ts` (#431).
 *
 * The helper is the class-level fix for uncaught server-action
 * rejections: it must pass resolved results through untouched (both
 * envelope arms) and convert a REJECTED await (middleware-edge 429 raw
 * JSON, network drop) into `{ ok: false, errorKey: "network" }` so every
 * existing `if (!result.ok)` branch handles it and code after the await
 * (pending-flag resets) always runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { callAction } from "@/lib/ui/call-action";
import type { ErrorKey } from "@/lib/copy/errors";

describe("callAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a resolved ok result through untouched", async () => {
    const result = await callAction(() =>
      Promise.resolve({ ok: true as const })
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes a resolved ok result with extra payload through untouched", async () => {
    const payload = {
      ok: true as const,
      item: { id: "itm-1" },
    };
    const result = await callAction(() => Promise.resolve(payload));
    expect(result).toBe(payload);
  });

  it("passes a resolved error envelope through untouched", async () => {
    const failure = {
      ok: false as const,
      errorKey: "not_organizer" as ErrorKey,
    };
    const result = await callAction(() => Promise.resolve(failure));
    expect(result).toBe(failure);
  });

  it("converts a rejection into the network envelope instead of rethrowing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await callAction<{ ok: true } | { ok: false; errorKey: ErrorKey }>(
      () => Promise.reject(new TypeError("fetch failed"))
    );

    expect(result).toEqual({ ok: false, errorKey: "network" });
    // Structured log: error NAME only — no payloads, no user data.
    expect(consoleError).toHaveBeenCalledWith(
      "[call-action] server action rejected",
      { name: "TypeError" }
    );
  });

  it("logs non-Error rejections as unknown", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await callAction<{ ok: true } | { ok: false; errorKey: ErrorKey }>(
      // Deliberately a non-Error rejection — exercising the "unknown" path.
      () => Promise.reject("raw string rejection")
    );

    expect(result).toEqual({ ok: false, errorKey: "network" });
    expect(consoleError).toHaveBeenCalledWith(
      "[call-action] server action rejected",
      { name: "unknown" }
    );
  });

  it("also guards a synchronous throw inside the action wrapper", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await callAction<{ ok: true } | { ok: false; errorKey: ErrorKey }>(
      () => {
        throw new Error("boom");
      }
    );

    expect(result).toEqual({ ok: false, errorKey: "network" });
  });
});
