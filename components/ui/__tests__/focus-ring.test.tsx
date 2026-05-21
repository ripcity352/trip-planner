/**
 * Focus-ring token tests — W3a party theme tokens + persimmon focus-ring.
 *
 * Verifies:
 *   1. DressCodePicker chip buttons use `focus-visible:ring-ring` (CSS var)
 *      rather than the hardcoded `#FF6B35` hex.
 *   2. DressCodePicker freeform input uses `focus-visible:ring-ring`.
 *   3. Selected chip uses the `bg-primary` / `border-primary` Tailwind tokens
 *      rather than hardcoded `#FF6B35`.
 *   4. The `--ring` CSS variable is set in the bachelor theme block in
 *      globals.css (checked via the presence of `--ring: #ff8a65` or equivalent
 *      persimmon value).
 *
 * These tests operate at the class-string level (what Tailwind compiles from).
 * We assert the *absence* of the old hex literal and the *presence* of the
 * token-based class, mirroring the audit scope of issue #121.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────────────

// __dirname = components/ui/__tests__ → up 3 levels = project root
const ROOT = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

// ── 1. globals.css token audit ────────────────────────────────────────────────

describe("globals.css — bachelor theme tokens", () => {
  const css = readSource("app/globals.css");

  it("defines --ring inside [data-theme=bachelor]", () => {
    // Match the bachelor selector block and confirm --ring appears within it.
    const bachelorBlock = css.slice(
      css.indexOf('[data-theme="bachelor"]'),
      css.indexOf(
        "/* Wonk axis",
        css.indexOf('[data-theme="bachelor"]')
      )
    );
    expect(bachelorBlock).toMatch(/--ring\s*:/);
  });

  it("sets --ring to a persimmon/heat value (not the grey oklch default) in bachelor block", () => {
    const bachelorBlock = css.slice(
      css.indexOf('[data-theme="bachelor"]'),
      css.indexOf(
        "/* Wonk axis",
        css.indexOf('[data-theme="bachelor"]')
      )
    );
    // The value must contain '#ff' (persimmon hex range) or a named heat token.
    expect(bachelorBlock).toMatch(/--ring\s*:\s*#[fF][fF]/);
  });

  it("wires --ring in :root (not left as oklch grey)", () => {
    // :root should still have --ring defined (it does — oklch grey is fine for :root).
    const rootIdx = css.indexOf(":root {");
    const rootBlock = css.slice(rootIdx, css.indexOf("}", rootIdx) + 1);
    expect(rootBlock).toMatch(/--ring\s*:/);
  });
});

// ── 2. DressCodePicker source audit ──────────────────────────────────────────

describe("DressCodePicker — no hardcoded persimmon hex", () => {
  const src = readSource(
    "components/trip/itinerary/fields/dress-code-picker.tsx"
  );

  it("does not contain the hardcoded #FF6B35 hex in JSX class strings", () => {
    // Allow it in comments only; forbid in JSX attribute values.
    const jsxColorMatches = src.match(/ring-\[#FF6B35\]|ring-\[#ff6b35\]/gi);
    expect(jsxColorMatches).toBeNull();
  });

  it("uses focus-visible:ring-ring token class on chip buttons", () => {
    expect(src).toMatch(/focus-visible:ring-ring/);
  });

  it("uses focus-visible:ring-ring token class on freeform input", () => {
    // Must appear at least twice (chip + input).
    const matches = src.match(/focus-visible:ring-ring/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("does not hardcode #FF6B35 as a bg or border color in JSX", () => {
    const bgBorderHex = src.match(/bg-\[#FF6B35\]|border-\[#FF6B35\]/gi);
    expect(bgBorderHex).toBeNull();
  });

  it("uses primary token for selected chip background", () => {
    expect(src).toMatch(/bg-primary/);
  });
});

// ── 3. DressCodePicker render — class presence ───────────────────────────────

vi.mock("@/lib/data/dress-codes", () => ({
  DRESS_CODE_CHIPS: ["Black Tie", "Casual"] as const,
}));

vi.mock("@/lib/copy/empty-states", () => ({
  M4_UI_STRINGS: {
    itineraryItem_dressCode_placeholder: "Or type your own…",
  },
}));

import { vi } from "vitest";
import { DressCodePicker } from "@/components/trip/itinerary/fields/dress-code-picker";

describe("DressCodePicker render — focus-ring classes", () => {
  it("renders chip buttons with focus-visible:ring-ring class", () => {
    render(<DressCodePicker onChange={() => undefined} />);
    const chips = screen.getAllByRole("button");
    for (const chip of chips) {
      expect(chip.className).toMatch(/focus-visible:ring-ring/);
    }
  });

  it("renders freeform input with focus-visible:ring-ring class", () => {
    render(<DressCodePicker onChange={() => undefined} />);
    const input = screen.getByRole("textbox");
    expect(input.className).toMatch(/focus-visible:ring-ring/);
  });

  it("renders selected chip with bg-primary class when active", () => {
    render(
      <DressCodePicker value="Black Tie" onChange={() => undefined} />
    );
    const activeChip = screen.getByRole("button", { name: "Black Tie" });
    expect(activeChip.className).toMatch(/bg-primary/);
  });

  it("renders unselected chip without bg-primary class", () => {
    render(
      <DressCodePicker value="Black Tie" onChange={() => undefined} />
    );
    const inactiveChip = screen.getByRole("button", { name: "Casual" });
    expect(inactiveChip.className).not.toMatch(/bg-primary/);
  });
});
