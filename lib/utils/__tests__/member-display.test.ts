/**
 * Unit tests for resolveMemberName (lib/utils/member-display.ts).
 *
 * TDD RED: these tests are written before the implementation exists.
 * Run `pnpm test` — expect failures until D1 is implemented.
 *
 * Placement: lib/utils/__tests__/ per Override C (never under app/).
 */

import { describe, it, expect } from "vitest";
import { resolveMemberName } from "@/lib/utils/member-display";

type MemberLike = { display_name?: string | null };

describe("resolveMemberName", () => {
  it("returns the display_name when the id is in the map and display_name is set", () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-1", { display_name: "Alice" }],
    ]);
    expect(resolveMemberName(map, "user-1")).toBe("Alice");
  });

  it('returns "Guest" when the id is NOT in the map (miss)', () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-1", { display_name: "Alice" }],
    ]);
    expect(resolveMemberName(map, "user-999")).toBe("Guest");
  });

  it('returns "Guest" when the id is in the map but display_name is null', () => {
    const map: ReadonlyMap<string, MemberLike> = new Map([
      ["user-2", { display_name: null }],
    ]);
    expect(resolveMemberName(map, "user-2")).toBe("Guest");
  });
});
