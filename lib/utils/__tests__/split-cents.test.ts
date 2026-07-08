/**
 * evenSplitCents (#372) — the money invariant lives here, so these tests
 * are the contract: every cent lands exactly once, no member is ever
 * more than one cent from another, and the result is deterministic
 * regardless of input order.
 */

import { describe, expect, it } from "vitest";

import { evenSplitCents } from "../split-cents";

describe("evenSplitCents", () => {
  it("splits an evenly divisible amount equally", () => {
    const out = evenSplitCents(4500, ["m-a", "m-b", "m-c"]);
    expect(out).toEqual([
      { trip_member_id: "m-a", amount_cents: 1500 },
      { trip_member_id: "m-b", amount_cents: 1500 },
      { trip_member_id: "m-c", amount_cents: 1500 },
    ]);
  });

  it("distributes the remainder one cent at a time, never losing a cent", () => {
    const out = evenSplitCents(1000, ["m-a", "m-b", "m-c"]);
    const total = out.reduce((sum, s) => sum + s.amount_cents, 0);
    expect(total).toBe(1000);
    const amounts = out.map((s) => s.amount_cents).sort((a, b) => a - b);
    expect(amounts).toEqual([333, 333, 334]);
  });

  it("is deterministic regardless of caller's member order", () => {
    const a = evenSplitCents(1001, ["m-c", "m-a", "m-b"]);
    const b = evenSplitCents(1001, ["m-b", "m-c", "m-a"]);
    expect(a).toEqual(b);
  });

  it("handles a single member (whole amount)", () => {
    expect(evenSplitCents(999, ["m-a"])).toEqual([
      { trip_member_id: "m-a", amount_cents: 999 },
    ]);
  });

  it("dedupes repeated member ids", () => {
    const out = evenSplitCents(300, ["m-a", "m-a", "m-b"]);
    expect(out).toHaveLength(2);
    expect(out.reduce((sum, s) => sum + s.amount_cents, 0)).toBe(300);
  });

  it("throws on a non-positive amount or empty member list", () => {
    expect(() => evenSplitCents(0, ["m-a"])).toThrow();
    expect(() => evenSplitCents(-5, ["m-a"])).toThrow();
    expect(() => evenSplitCents(100, [])).toThrow();
  });

  it("property: sum invariant and ≤1-cent spread hold across a sweep", () => {
    for (let amount = 1; amount <= 250; amount++) {
      for (let n = 1; n <= 7; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m-${i}`);
        const out = evenSplitCents(amount, ids);
        const total = out.reduce((sum, s) => sum + s.amount_cents, 0);
        expect(total).toBe(amount);
        const amounts = out.map((s) => s.amount_cents);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }
    }
  });
});
