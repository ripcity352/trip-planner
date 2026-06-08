/**
 * Unit tests for useDisplayName (lib/hooks/use-display-name.ts).
 *
 * TDD RED: written before the implementation exists.
 * Placement: lib/hooks/__tests__/ per Override C (never under app/).
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDisplayName } from "@/lib/hooks/use-display-name";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

type MemberLike = { display_name?: string | null };

const FALLBACK = M3_UI_STRINGS.roster_member_fallback_name; // "Guest"

describe("useDisplayName", () => {
  it("returns display_name when id is present in map with a display_name", () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-1", { display_name: "Alice" }],
    ]);
    const { result } = renderHook(() => useDisplayName(map, "user-1"));
    expect(result.current).toBe("Alice");
  });

  it("returns fallback when id is absent from map (miss)", () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-1", { display_name: "Alice" }],
    ]);
    const { result } = renderHook(() => useDisplayName(map, "user-999"));
    expect(result.current).toBe(FALLBACK);
  });

  it("returns fallback when map is empty", () => {
    const map: ReadonlyMap<string, MemberLike> = new Map();
    const { result } = renderHook(() => useDisplayName(map, "user-1"));
    expect(result.current).toBe(FALLBACK);
  });

  it("returns fallback when display_name is null", () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-2", { display_name: null }],
    ]);
    const { result } = renderHook(() => useDisplayName(map, "user-2"));
    expect(result.current).toBe(FALLBACK);
  });

  it("returns fallback when display_name is undefined", () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-3", {}],
    ]);
    const { result } = renderHook(() => useDisplayName(map, "user-3"));
    expect(result.current).toBe(FALLBACK);
  });

  describe("memoization stability", () => {
    it("returns the same string reference when args do not change on rerender", () => {
      const map: ReadonlyMap<string, MemberLike> = new Map([
        ["user-1", { display_name: "Bob" }],
      ]);
      const { result, rerender } = renderHook(() => useDisplayName(map, "user-1"));
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    });

    it("updates the result when the map reference changes with a new value", () => {
      const map1: ReadonlyMap<string, MemberLike> = new Map([
        ["user-1", { display_name: "Bob" }],
      ]);
      const map2: ReadonlyMap<string, MemberLike> = new Map([
        ["user-1", { display_name: "Robert" }],
      ]);
      const { result, rerender } = renderHook(
        ({ m, id }: { m: ReadonlyMap<string, MemberLike>; id: string }) =>
          useDisplayName(m, id),
        { initialProps: { m: map1, id: "user-1" } },
      );
      expect(result.current).toBe("Bob");
      rerender({ m: map2, id: "user-1" });
      expect(result.current).toBe("Robert");
    });

    it("updates the result when the id changes", () => {
      const map: ReadonlyMap<string, MemberLike> = new Map([
        ["user-1", { display_name: "Alice" }],
        ["user-2", { display_name: "Charlie" }],
      ]);
      const { result, rerender } = renderHook(
        ({ id }: { id: string }) => useDisplayName(map, id),
        { initialProps: { id: "user-1" } },
      );
      expect(result.current).toBe("Alice");
      rerender({ id: "user-2" });
      expect(result.current).toBe("Charlie");
    });
  });

  describe("no-local-part guarantee", () => {
    it("never returns an email-local-part even if a member object has an email-like field", () => {
      // The member type only exposes display_name — extra fields must be ignored.
      // Cast through unknown to simulate a consumer passing an extended object.
      const memberWithEmail = { display_name: null } as MemberLike;
      // Attach an email field that should NOT influence output
      (memberWithEmail as unknown as { email: string }).email =
        "john.doe@example.com";

      const map: ReadonlyMap<string, MemberLike> = new Map([
        ["user-email", memberWithEmail],
      ]);
      const { result } = renderHook(() =>
        useDisplayName(map, "user-email"),
      );

      // Must return the fallback, never "john.doe" or anything resembling a local-part
      expect(result.current).toBe(FALLBACK);
      expect(result.current).not.toContain("@");
      expect(result.current).not.toContain("john.doe");
    });

    it("returns the declared display_name — not any email — when both are present", () => {
      const memberWithEmail = { display_name: "Johnny" } as MemberLike;
      (memberWithEmail as unknown as { email: string }).email =
        "johnny@example.com";

      const map: ReadonlyMap<string, MemberLike> = new Map([
        ["user-email-2", memberWithEmail],
      ]);
      const { result } = renderHook(() =>
        useDisplayName(map, "user-email-2"),
      );

      expect(result.current).toBe("Johnny");
      expect(result.current).not.toContain("@");
    });
  });
});
