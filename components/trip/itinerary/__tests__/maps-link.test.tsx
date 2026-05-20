/**
 * Unit tests for MapsLink component.
 * TDD: written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapsLink } from "../maps-link";

describe("MapsLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders both Apple Maps and Google Maps links", () => {
    render(<MapsLink address="123 Main St, Las Vegas, NV" />);

    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href") ?? "");

    expect(hrefs.some((h) => h.includes("maps.apple.com"))).toBe(true);
    expect(hrefs.some((h) => h.includes("google.com/maps"))).toBe(true);
  });

  it("all links open in a new tab (target=_blank)", () => {
    render(<MapsLink address="Wynn Las Vegas" />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });
  });

  it("renders accessible link text", () => {
    render(<MapsLink address="Bellagio Hotel" />);
    // Both links should have visible text
    expect(screen.getByText("Apple Maps")).toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
  });

  it("encodes the address in both URLs — raw apostrophe does not appear verbatim", () => {
    render(<MapsLink address="O'Brien's Pub" />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href") ?? "");
    // The raw unencoded form must not appear in the URL
    hrefs.forEach((href) => {
      // URLSearchParams encodes ' as %27, so the raw apostrophe must be absent
      expect(href).not.toContain("O'Brien's Pub");
    });
  });

  it("both links contain the address content", () => {
    render(<MapsLink address="3799 Las Vegas Blvd" />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href") ?? "");
    hrefs.forEach((href) => {
      expect(href).toContain("3799");
    });
  });
});
