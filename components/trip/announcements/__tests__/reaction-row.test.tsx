/**
 * Tests for `components/trip/announcements/reaction-row.tsx`.
 * TDD: written before implementation (RED phase).
 *
 * The row owns four responsibilities, exercised here in jsdom:
 *   1. Render count chips ONLY for emoji with a non-zero count, in the
 *      fixed REACTION_EMOJI order, plus a quiet add affordance.
 *   2. Mark the caller's own reactions with aria-pressed.
 *   3. The add affordance expands the full fixed-set picker (all 6).
 *   4. On tap: optimistic toggle, fire toggleReactionAction with the
 *      desired end state, roll back + surface copy-palette error copy
 *      on failure.
 *
 * The server action is mocked — its own behavior is covered in
 * lib/actions/__tests__/announcement-reactions.test.ts.
 *
 * Submit-clicks use `clickAndSettle` (tests/fixtures/dom.ts) to drain
 * React's transition queue before asserting (#230/#207 flake class).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { clickAndSettle } from "@/tests/fixtures/dom";

const toggleReactionActionMock = vi.fn();

vi.mock("@/lib/actions/announcement-reactions", () => ({
  toggleReactionAction: (...args: unknown[]) =>
    toggleReactionActionMock(...args),
}));

import { ReactionRow } from "@/components/trip/announcements/reaction-row";
import { REACTION_EMOJI } from "@/lib/reactions/constants";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

const ANN_ID = "22222222-2222-4222-8222-222222222222";

function ariaFor(emoji: string): string {
  return M5_UI_STRINGS.reactions_toggle_aria_template.replace(
    "{emoji}",
    emoji
  );
}

describe("<ReactionRow />", () => {
  beforeEach(() => {
    toggleReactionActionMock.mockReset();
    toggleReactionActionMock.mockResolvedValue({ ok: true, active: true });
  });

  it("renders a count chip per non-zero emoji and no zero-count chips", () => {
    render(
      <ReactionRow
        announcementId={ANN_ID}
        initialCounts={{ "🔥": 2, "🍻": 1 }}
        initialMine={[]}
      />
    );

    expect(
      screen.getByRole("button", { name: ariaFor("🔥") })
    ).toHaveTextContent("2");
    expect(
      screen.getByRole("button", { name: ariaFor("🍻") })
    ).toHaveTextContent("1");
    // 👍 has no count and the picker is collapsed — not rendered.
    expect(
      screen.queryByRole("button", { name: ariaFor("👍") })
    ).not.toBeInTheDocument();
  });

  it("marks the caller's own reactions with aria-pressed=true", () => {
    render(
      <ReactionRow
        announcementId={ANN_ID}
        initialCounts={{ "🔥": 2, "🍻": 1 }}
        initialMine={["🍻"]}
      />
    );

    expect(screen.getByRole("button", { name: ariaFor("🍻") })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: ariaFor("🔥") })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("expands the full fixed-set picker from the add affordance", async () => {
    render(
      <ReactionRow announcementId={ANN_ID} initialCounts={{}} initialMine={[]} />
    );

    const addButton = screen.getByRole("button", {
      name: M5_UI_STRINGS.reactions_add_aria,
    });
    await clickAndSettle(addButton);

    for (const emoji of REACTION_EMOJI) {
      expect(
        screen.getByRole("button", { name: ariaFor(emoji) })
      ).toBeInTheDocument();
    }
  });

  it("meets the 44px tap-target axis on every button (min-h-11/min-w-11)", () => {
    render(
      <ReactionRow
        announcementId={ANN_ID}
        initialCounts={{ "🔥": 1 }}
        initialMine={[]}
      />
    );

    for (const btn of screen.getAllByRole("button")) {
      expect(btn.className).toMatch(/min-h-11/);
      expect(btn.className).toMatch(/min-w-11/);
    }
  });

  it("toggles ON optimistically and calls the action with the desired end state", async () => {
    render(
      <ReactionRow
        announcementId={ANN_ID}
        initialCounts={{ "🔥": 1 }}
        initialMine={[]}
      />
    );

    const chip = screen.getByRole("button", { name: ariaFor("🔥") });
    await clickAndSettle(chip);

    // Optimistic: pressed + incremented before/without realtime.
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveTextContent("2");
    expect(toggleReactionActionMock).toHaveBeenCalledWith({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: true,
    });
  });

  it("toggles OFF an own reaction and drops a now-zero chip", async () => {
    toggleReactionActionMock.mockResolvedValue({ ok: true, active: false });
    render(
      <ReactionRow
        announcementId={ANN_ID}
        initialCounts={{ "🔥": 1 }}
        initialMine={["🔥"]}
      />
    );

    const chip = screen.getByRole("button", { name: ariaFor("🔥") });
    await clickAndSettle(chip);

    expect(toggleReactionActionMock).toHaveBeenCalledWith({
      announcementId: ANN_ID,
      emoji: "🔥",
      active: false,
    });
    // Count fell to zero and the picker is collapsed — chip disappears.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: ariaFor("🔥") })
      ).not.toBeInTheDocument()
    );
  });

  it("rolls back the optimistic toggle and shows copy-palette error copy on failure", async () => {
    toggleReactionActionMock.mockResolvedValue({
      ok: false,
      errorKey: "reaction_save_failed",
    });
    render(
      <ReactionRow
        announcementId={ANN_ID}
        initialCounts={{ "🔥": 1 }}
        initialMine={[]}
      />
    );

    const chip = screen.getByRole("button", { name: ariaFor("🔥") });
    await clickAndSettle(chip);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ERRORS.reaction_save_failed
      )
    );
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveTextContent("1");
  });
});
