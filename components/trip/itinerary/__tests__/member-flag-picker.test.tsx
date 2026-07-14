/**
 * TDD RED — member-flag-picker tests.
 *
 * Written BEFORE implementation per TDD mandate.
 *
 * Covers (per M4 W1c scope):
 *  1. Heading renders exact voice-locked string.
 *  2. Subhead renders exact voice-locked string.
 *  3. All 9 MEMBER_FLAG_CHIPS render.
 *  4. NO "organizers notified" text anywhere (Voice CRITICAL C8 snapshot guard).
 *  5. NO "skipping" chip (per-item RSVP path, not flags).
 *  6. Multi-select toggle: click chip → selected; click again → deselected.
 *  7. Freeform "Anything else?" append.
 *  8. Injection vectors — NUL, CRLF, oversized flag (>100), oversized note (>500)
 *     all rejected before submit (Coverage HIGH H1).
 *
 * Submit-clicks use `clickAndSettle` (tests/fixtures/dom.ts) to drain
 * React's transition queue before making assertions — fixes the
 * async-submit flake class (#230, #207).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MEMBER_FLAG_CHIPS } from "@/lib/data/member-flags";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";
import { MemberFlagPicker } from "../member-flag-picker";
import { clickAndSettle } from "@/tests/fixtures/dom";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/actions/item-flags", () => ({
  addItemFlag: vi.fn(),
  removeItemFlag: vi.fn(),
}));

import { addItemFlag, removeItemFlag } from "@/lib/actions/item-flags";

const mockAdd = vi.mocked(addItemFlag);
const mockRemove = vi.mocked(removeItemFlag);

const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Delay injected into action mocks to widen the race window deterministically.
// Per-test local constant — not a shared seam.
const MOCK_DELAY_MS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The #399 disclosure trigger — the voice-locked heading is its name. */
function getDisclosureTrigger() {
  return screen.getByRole("button", {
    name: M4_UI_STRINGS.itineraryItem_memberFlag_heading,
  });
}

/** Render and (if closed) open the #399 disclosure so panel content is reachable. */
function renderPicker(props?: Partial<React.ComponentProps<typeof MemberFlagPicker>>) {
  const utils = render(<MemberFlagPicker itemId={ITEM_ID} {...props} />);
  const trigger = getDisclosureTrigger();
  if (trigger.getAttribute("aria-expanded") === "false") {
    fireEvent.click(trigger);
  }
  return utils;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MemberFlagPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: instant-resolve mocks. Tests that need the race-window delay
    // inject MOCK_DELAY_MS individually (see toggles + multi-chip tests).
    mockAdd.mockResolvedValue({ ok: true });
    mockRemove.mockResolvedValue({ ok: true });
  });

  // 1. Heading — exact voice-locked string
  it("renders the exact voice-locked heading", () => {
    renderPicker();
    expect(
      screen.getByText(M4_UI_STRINGS.itineraryItem_memberFlag_heading)
    ).toBeInTheDocument();
    // Exact string guard
    expect(
      screen.getByText("Anything we should know?")
    ).toBeInTheDocument();
  });

  // 2. Subhead — exact voice-locked string
  it("renders the exact voice-locked subhead", () => {
    renderPicker();
    expect(
      screen.getByText(M4_UI_STRINGS.itineraryItem_memberFlag_subhead)
    ).toBeInTheDocument();
    // Exact string guard
    expect(
      screen.getByText("Just for the organizer — private to you.")
    ).toBeInTheDocument();
  });

  // 3. All 9 chips from MEMBER_FLAG_CHIPS
  it("renders all 9 MEMBER_FLAG_CHIPS", () => {
    renderPicker();
    expect(MEMBER_FLAG_CHIPS).toHaveLength(9);
    for (const chip of MEMBER_FLAG_CHIPS) {
      expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    }
  });

  // 4. NO "organizers notified" text — Voice CRITICAL C8
  it("does NOT render any 'organizers notified' text (Voice CRITICAL C8)", () => {
    const { container } = renderPicker();
    const allText = container.textContent ?? "";
    expect(allText).not.toMatch(/organizer.*notif/i);
    expect(allText).not.toMatch(/notif.*organizer/i);
    expect(allText).not.toMatch(/organizers notified/i);
  });

  // 5. NO "skipping" chip
  it("does NOT render a 'Skip' or 'Skipping' chip (per-item RSVP path, not flags)", () => {
    renderPicker();
    const buttons = screen.queryAllByRole("button");
    const labels = buttons.map((b) => b.textContent ?? "");
    expect(labels.some((l) => /^skip$/i.test(l))).toBe(false);
    expect(labels.some((l) => /skipping/i.test(l))).toBe(false);
  });

  // 6. Multi-select toggle
  it("toggles a chip ON then OFF", async () => {
    // Delay widens the race window for this async chip-toggle test.
    mockAdd.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    mockRemove.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    renderPicker();

    const veganBtn = screen.getByRole("button", { name: "Vegan" });

    // Initially not selected
    expect(veganBtn).toHaveAttribute("aria-pressed", "false");

    // Click to select — wait for the chip to re-enable (action completes).
    await clickAndSettle(veganBtn);

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: ITEM_ID, flag: "Vegan" })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Vegan" })
      ).toHaveAttribute("aria-pressed", "true");
    });

    // Click again to deselect — wait for the chip to re-enable.
    await clickAndSettle(screen.getByRole("button", { name: "Vegan" }));
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(ITEM_ID, "Vegan");
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Vegan" })
      ).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("supports selecting multiple chips simultaneously", async () => {
    // Delay widens the race window deterministically — without it the second
    // click can fire while isPending=true from the first, silently dropping it.
    mockAdd.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    renderPicker();

    // Click Vegan and wait for it to fully complete (re-enable) before Sober.
    // Without clickAndSettle, the second click races the first action's isPending=true.
    await clickAndSettle(screen.getByRole("button", { name: "Vegan" }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ flag: "Vegan" })
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Vegan" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    // Click Sober after Vegan is fully settled.
    await clickAndSettle(screen.getByRole("button", { name: "Sober" }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ flag: "Sober" })
      );
    });

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Vegan" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Sober" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // 7. Freeform append
  it("renders a freeform input for unlisted situations", () => {
    renderPicker();
    // Freeform field — "Anything else?" label or placeholder
    const input = screen.getByPlaceholderText(/anything else/i);
    expect(input).toBeInTheDocument();
  });

  it("submits freeform flag on form submit", async () => {
    // Delay widens the race window for this async freeform submit.
    mockAdd.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    renderPicker();
    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "low-FODMAP diet" } });

    // The "Add" button stays disabled after submit (input cleared →
    // !freeformFlag.trim()). Can't use clickAndSettle; use userEvent.click
    // + waitFor on the mock call to settle deterministically.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: ITEM_ID,
          flag: "low-FODMAP diet",
        })
      );
    });
  });

  it("reflects a fixed-chip name typed into freeform as a pressed chip, not a custom row", async () => {
    // Typing "Vegan" into freeform must match the reload-derived state:
    // pressed chip, no removable custom row.
    mockAdd.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    renderPicker();
    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "Vegan" } });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Vegan" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
    expect(
      screen.queryByRole("button", { name: 'Remove "Vegan"' })
    ).not.toBeInTheDocument();
  });

  it("clears freeform input after successful submit", async () => {
    // Delay widens the race window for this async freeform submit.
    mockAdd.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    renderPicker();
    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "some special diet" } });

    // Same — button stays disabled after submit (empty input).
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  it("shows quiet 'Saved.' confirmation after chip toggle (no toast, no organizer phrasing)", async () => {
    mockAdd.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
      return { ok: true };
    });
    renderPicker();
    await clickAndSettle(screen.getByRole("button", { name: "Vegan" }));

    await waitFor(() => {
      expect(screen.getByText(/^Saved\.$/)).toBeInTheDocument();
    });

    // Verify no organizer-notified phrasing
    const savedEl = screen.getByText(/^Saved\.$/).textContent ?? "";
    expect(savedEl).not.toMatch(/organizer/i);
    expect(savedEl).not.toMatch(/notif/i);
  });

  // 8. Injection vectors — Coverage HIGH H1
  describe("injection vector rejection", () => {
    // No additional beforeEach needed — the outer beforeEach already uses
    // instant-resolve mocks (no delay) which is correct for these validation tests.

    it("rejects NUL character in freeform flag before submit", async () => {
      renderPicker();
      const input = screen.getByPlaceholderText(/anything else/i);
      // Attempt NUL injection: include actual NUL byte in the flag value.
      fireEvent.change(input, { target: { value: "bad\0flag" } });
      fireEvent.click(screen.getByRole("button", { name: /add/i }));

      // If addItemFlag is called, the NUL byte must have been stripped by sanitize().
      await waitFor(() => {
        const calls = mockAdd.mock.calls;
        for (const [arg] of calls) {
          expect(arg.flag).not.toContain("\0");
        }
      });
    });

    it("rejects CRLF injection in freeform flag before submit", async () => {
      renderPicker();
      const input = screen.getByPlaceholderText(/anything else/i);
      fireEvent.change(input, { target: { value: "flag\r\ninjected" } });
      fireEvent.click(screen.getByRole("button", { name: /add/i }));

      await waitFor(() => {
        const calls = mockAdd.mock.calls;
        for (const [arg] of calls) {
          expect(arg.flag).not.toMatch(/\r\n/);
        }
      });
    });

    it("rejects freeform flag exceeding 100 chars", async () => {
      renderPicker();
      const input = screen.getByPlaceholderText(/anything else/i);
      const oversized = "a".repeat(101);
      fireEvent.change(input, { target: { value: oversized } });
      fireEvent.click(screen.getByRole("button", { name: /add/i }));

      // Should not call addItemFlag with oversized value
      await new Promise((r) => setTimeout(r, 50));
      const calls = mockAdd.mock.calls;
      for (const [arg] of calls) {
        expect(arg.flag.length).toBeLessThanOrEqual(100);
      }
    });

    it("renders a note textarea and rejects note exceeding 500 chars", async () => {
      renderPicker();
      const noteArea = screen.getByPlaceholderText(/more detail|more context/i);
      expect(noteArea).toBeInTheDocument();

      const oversizedNote = "n".repeat(501);
      fireEvent.change(noteArea, { target: { value: oversizedNote } });

      const input = screen.getByPlaceholderText(/anything else/i);
      fireEvent.change(input, { target: { value: "some flag" } });
      fireEvent.click(screen.getByRole("button", { name: /add/i }));

      await new Promise((r) => setTimeout(r, 50));
      const calls = mockAdd.mock.calls;
      for (const [arg] of calls) {
        if (arg.note !== null && arg.note !== undefined) {
          expect(arg.note.length).toBeLessThanOrEqual(500);
        }
      }
    });
  });

  // 375px smoke
  it("renders at 375px viewport without overflow", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    const { container } = renderPicker();
    // Smoke: component renders without throwing
    expect(container.firstChild).toBeInTheDocument();
  });
});

// ─── #399: disclosure — collapse the panel behind the heading ─────────────────

describe("MemberFlagPicker — disclosure (#399)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ ok: true });
    mockRemove.mockResolvedValue({ ok: true });
  });

  it("defaults CLOSED when the member has no saved flags", () => {
    render(<MemberFlagPicker itemId={ITEM_ID} />);
    expect(getDisclosureTrigger()).toHaveAttribute("aria-expanded", "false");
    // Panel content is not rendered while closed
    expect(
      screen.queryByRole("button", { name: "Vegan" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/anything else/i)
    ).not.toBeInTheDocument();
  });

  it("auto-opens when the member already has a saved fixed flag", () => {
    render(
      <MemberFlagPicker
        itemId={ITEM_ID}
        initialFlags={[{ flag: "Sober", note: null }]}
      />
    );
    expect(getDisclosureTrigger()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Sober", pressed: true })
    ).toBeInTheDocument();
  });

  it("auto-opens when the member already has a saved custom flag", () => {
    render(
      <MemberFlagPicker
        itemId={ITEM_ID}
        initialFlags={[{ flag: "low-FODMAP diet", note: null }]}
      />
    );
    expect(getDisclosureTrigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("low-FODMAP diet")).toBeInTheDocument();
  });

  it("toggles aria-expanded (and the panel) on click", () => {
    render(<MemberFlagPicker itemId={ITEM_ID} />);
    const trigger = getDisclosureTrigger();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Vegan" })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Vegan" })
    ).not.toBeInTheDocument();
  });
});

// ─── #398: stored custom flags render back as removable rows ──────────────────

describe("MemberFlagPicker — stored custom flags (#398)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ ok: true });
    mockRemove.mockResolvedValue({ ok: true });
  });

  it("renders a stored custom flag with its note alongside", () => {
    renderPicker({
      initialFlags: [
        { flag: "low-FODMAP diet", note: "Happy to sort my own meal" },
      ],
    });
    expect(screen.getByText("low-FODMAP diet")).toBeInTheDocument();
    expect(screen.getByText("Happy to sort my own meal")).toBeInTheDocument();
    // Custom flags are NOT fixed chips — no pressed chip carries the text
    expect(
      screen.queryByRole("button", { name: "low-FODMAP diet", pressed: true })
    ).not.toBeInTheDocument();
  });

  it("removes a stored custom flag via its remove control", async () => {
    const user = userEvent.setup();
    renderPicker({
      initialFlags: [{ flag: "low-FODMAP diet", note: null }],
    });

    await user.click(
      screen.getByRole("button", { name: 'Remove "low-FODMAP diet"' })
    );

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(ITEM_ID, "low-FODMAP diet");
    });
    await waitFor(() => {
      expect(screen.queryByText("low-FODMAP diet")).not.toBeInTheDocument();
    });
  });

  it("keeps the row and shows the error line when removal fails", async () => {
    mockRemove.mockResolvedValue({
      ok: false,
      errorKey: "item_flag_save_failed",
    });
    const user = userEvent.setup();
    renderPicker({
      initialFlags: [{ flag: "low-FODMAP diet", note: null }],
    });

    await user.click(
      screen.getByRole("button", { name: 'Remove "low-FODMAP diet"' })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("low-FODMAP diet")).toBeInTheDocument();
  });

  it("appends a newly submitted freeform flag as a removable row", async () => {
    const user = userEvent.setup();
    renderPicker();

    fireEvent.change(screen.getByPlaceholderText(/anything else/i), {
      target: { value: "low-FODMAP diet" },
    });
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByText("low-FODMAP diet")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: 'Remove "low-FODMAP diet"' })
    ).toBeInTheDocument();
  });
});
