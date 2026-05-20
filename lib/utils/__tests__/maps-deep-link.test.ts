/**
 * Unit tests for maps-deep-link.ts — pure URL builder.
 * TDD: these tests were written before the implementation.
 */

import { describe, it, expect } from "vitest";
import {
  buildGoogleMapsUrl,
  buildAppleMapsUrl,
  buildMapsDeepLinks,
} from "../maps-deep-link";

describe("buildGoogleMapsUrl", () => {
  it("returns a valid Google Maps search URL for a plain address", () => {
    const url = buildGoogleMapsUrl("123 Main St, Las Vegas, NV");
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?/);
    expect(url).toContain("api=1");
    expect(url).toContain("query=");
    // URLSearchParams encodes spaces as + in query strings
    expect(url).toContain("123");
    expect(url).toContain("Main");
    expect(url).toContain("St");
  });

  it("encodes special characters in the query", () => {
    const url = buildGoogleMapsUrl("O'Malley's Bar & Grill");
    expect(url).toContain("query=");
    // The raw unencoded string must not appear verbatim
    expect(url).not.toContain("O'Malley's Bar & Grill");
  });

  it("handles an address with commas and spaces", () => {
    const url = buildGoogleMapsUrl("MGM Grand, Las Vegas, NV 89109");
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?/);
    expect(url).toContain("MGM");
  });

  it("throws on empty address", () => {
    expect(() => buildGoogleMapsUrl("")).toThrow();
    expect(() => buildGoogleMapsUrl("  ")).toThrow();
  });
});

describe("buildAppleMapsUrl", () => {
  it("returns a valid Apple Maps URL for a plain address", () => {
    const url = buildAppleMapsUrl("123 Main St, Las Vegas, NV");
    expect(url).toMatch(/^https:\/\/maps\.apple\.com\/\?/);
    expect(url).toContain("q=");
    expect(url).toContain("123");
  });

  it("encodes special characters", () => {
    const url = buildAppleMapsUrl("The Venetian & Palazzo");
    // The raw ampersand must not appear in the query VALUE position
    // (it's OK in the separator role, but the value is encoded)
    expect(url).toContain("q=");
    // & in the value position would be encoded as %26
    expect(url).not.toContain("The Venetian & Palazzo");
  });

  it("throws on empty address", () => {
    expect(() => buildAppleMapsUrl("")).toThrow();
    expect(() => buildAppleMapsUrl("   ")).toThrow();
  });
});

describe("buildMapsDeepLinks", () => {
  it("returns both google and apple URLs", () => {
    const result = buildMapsDeepLinks("Wynn Las Vegas");
    expect(result).toHaveProperty("google");
    expect(result).toHaveProperty("apple");
    expect(result.google).toMatch(/google\.com\/maps/);
    expect(result.apple).toMatch(/maps\.apple\.com/);
  });

  it("both URLs contain the address content (encoded)", () => {
    const address = "3799 Las Vegas Blvd S";
    const result = buildMapsDeepLinks(address);
    // Both should contain the numeric portion of the address
    expect(result.google).toContain("3799");
    expect(result.apple).toContain("3799");
  });

  it("throws on empty address", () => {
    expect(() => buildMapsDeepLinks("")).toThrow();
  });
});
