import { describe, it, expect } from "vitest";
import { formatCost } from "../format-cost";

describe("formatCost", () => {
  it("returns null when there is no cost", () => {
    expect(formatCost(null, "USD", 5)).toBeNull();
  });

  it("renders whole-dollar amounts without cents", () => {
    expect(formatCost(45000, "USD", 0)).toBe("$450");
  });

  it("renders non-whole amounts with cents", () => {
    expect(formatCost(4599, "USD", 0)).toBe("$45.99");
  });

  it("omits the per-head suffix when inCount is 0", () => {
    expect(formatCost(45000, "USD", 0)).toBe("$450");
  });

  it("omits the per-head suffix when inCount is 1", () => {
    expect(formatCost(45000, "USD", 1)).toBe("$450");
  });

  it("appends a per-head estimate when inCount is 2 or more", () => {
    expect(formatCost(45000, "USD", 5)).toBe("$450 · ~$90/head if 5 in");
  });

  it("rounds the per-head estimate to whole currency units", () => {
    // 100 / 3 = 33.33... -> rounds to 33
    expect(formatCost(10000, "USD", 3)).toBe("$100 · ~$33/head if 3 in");
  });

  it("is currency-aware for non-USD currencies", () => {
    expect(formatCost(45000, "EUR", 5)).toBe("€450 · ~€90/head if 5 in");
  });

  it("trims Postgres char(3) padding on the currency code", () => {
    expect(formatCost(4500, "USD ", 0)).toBe("$45");
  });
});
