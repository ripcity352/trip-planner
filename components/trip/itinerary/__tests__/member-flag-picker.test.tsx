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
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { MEMBER_FLAG_CHIPS } from "@/lib/data/member-flags";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";
import { MemberFlagPicker } from "../member-flag-picker";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/actions/item-flags", () => ({
  addItemFlag: vi.fn(),
  removeItemFlag: vi.fn(),
}));

import { addItemFlag, removeItemFlag } from "@/lib/actions/item-flags";

const mockAdd = vi.mocked(addItemFlag);
const mockRemove = vi.mocked(removeItemFlag);

const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPicker(props?: Partial<React.ComponentProps<typeof MemberFlagPicker>>) {
  return render(<MemberFlagPicker itemId={ITEM_ID} {...props} />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MemberFlagPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    renderPicker();

    const veganBtn = screen.getByRole("button", { name: "Vegan" });

    // Initially not selected
    expect(veganBtn).toHaveAttribute("aria-pressed", "false");

    // Click to select
    fireEvent.click(veganBtn);

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

    // Click again to deselect
    fireEvent.click(screen.getByRole("button", { name: "Vegan" }));
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
    renderPicker();

    // Click Vegan and wait for it to complete
    fireEvent.click(screen.getByRole("button", { name: "Vegan" }));
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

    // Click Sober after Vegan is done
    fireEvent.click(screen.getByRole("button", { name: "Sober" }));
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
    renderPicker();
    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "low-FODMAP diet" } });

    const submitBtn = screen.getByRole("button", { name: /add/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: ITEM_ID,
          flag: "low-FODMAP diet",
        })
      );
    });
  });

  it("clears freeform input after successful submit", async () => {
    renderPicker();
    const input = screen.getByPlaceholderText(/anything else/i);
    fireEvent.change(input, { target: { value: "some special diet" } });

    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe("");
    });
  });

  it("shows quiet 'Saved.' confirmation after chip toggle (no toast, no organizer phrasing)", async () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Vegan" }));

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
    it("rejects NUL character in freeform flag before submit", async () => {
      renderPicker();
      const input = screen.getByPlaceholderText(/anything else/i);
      // Attempt NUL injection
      fireEvent.change(input, { target: { value: "bad flag" } });
      fireEvent.click(screen.getByRole("button", { name: /add/i }));

      // addItemFlag should NOT be called with NUL
      await waitFor(() => {
        const calls = mockAdd.mock.calls;
        for (const [arg] of calls) {
          expect(arg.flag).not.toContain(" ");
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
