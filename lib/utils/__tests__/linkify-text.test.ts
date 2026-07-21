/**
 * Unit tests for linkify-text.ts — pure URL-detection tokenizer.
 * TDD: written before the implementation (RED phase).
 *
 * #469 — announcement bodies with URLs must become tappable links.
 * SECURITY: only http/https (and www.-prefixed, upgraded to https) may
 * ever produce a "link" token — anything else (javascript:, data:, etc.)
 * must stay plain text.
 */

import { describe, it, expect } from "vitest";
import { linkifyText } from "../linkify-text";

describe("linkifyText", () => {
  it("returns a single text token for plain text with no URL", () => {
    expect(linkifyText("Don't forget your passports.")).toEqual([
      { type: "text", value: "Don't forget your passports." },
    ]);
  });

  it("detects a bare https URL and wraps it in a link token", () => {
    const tokens = linkifyText("Check https://example.com/trip for details.");
    expect(tokens).toEqual([
      { type: "text", value: "Check " },
      {
        type: "link",
        value: "https://example.com/trip",
        href: "https://example.com/trip",
      },
      { type: "text", value: " for details." },
    ]);
  });

  it("detects an http URL", () => {
    const tokens = linkifyText("http://example.com");
    expect(tokens).toEqual([
      { type: "link", value: "http://example.com", href: "http://example.com" },
    ]);
  });

  it("detects a www.-prefixed URL and upgrades the href to https", () => {
    const tokens = linkifyText("Airbnb: www.airbnb.com/rooms/123");
    expect(tokens).toEqual([
      { type: "text", value: "Airbnb: " },
      {
        type: "link",
        value: "www.airbnb.com/rooms/123",
        href: "https://www.airbnb.com/rooms/123",
      },
    ]);
  });

  it("strips trailing punctuation from a URL at the end of a sentence", () => {
    const tokens = linkifyText("See https://example.com/trip.");
    expect(tokens).toEqual([
      { type: "text", value: "See " },
      {
        type: "link",
        value: "https://example.com/trip",
        href: "https://example.com/trip",
      },
      { type: "text", value: "." },
    ]);
  });

  it("handles multiple URLs in one string", () => {
    const tokens = linkifyText("https://a.com and https://b.com");
    expect(tokens).toEqual([
      { type: "link", value: "https://a.com", href: "https://a.com" },
      { type: "text", value: " and " },
      { type: "link", value: "https://b.com", href: "https://b.com" },
    ]);
  });

  it("preserves newline characters inside surrounding text tokens", () => {
    const tokens = linkifyText("Day 1\nhttps://example.com\nDay 2");
    expect(tokens).toEqual([
      { type: "text", value: "Day 1\n" },
      { type: "link", value: "https://example.com", href: "https://example.com" },
      { type: "text", value: "\nDay 2" },
    ]);
  });

  it("does NOT linkify a javascript: scheme", () => {
    const tokens = linkifyText("javascript:alert(1)");
    expect(tokens).toEqual([{ type: "text", value: "javascript:alert(1)" }]);
  });

  it("does NOT linkify a data: scheme", () => {
    const tokens = linkifyText("data:text/html,<script>alert(1)</script>");
    expect(tokens).toEqual([
      { type: "text", value: "data:text/html,<script>alert(1)</script>" },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(linkifyText("")).toEqual([]);
  });
});
