/**
 * Tests for `components/trip/shopping-list/ShoppingQuickAdd.tsx` (Task 7a) —
 * the always-visible single-line quick-add at the top of the list.
 *
 * Covers: Enter-to-add (clear + focus + key-rotate on success, keep text +
 * key on failure), empty/whitespace no-op, per-keystroke sanitize (NUL/CRLF
 * stripped on EVERY onChange, not just submit — `sanitize_every_keystroke`),
 * and paste-split (multi-line → confirm gate → N adds each with a distinct
 * key; single-line → no confirm, fills normally).
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const addShoppingItemMock = vi.fn();
vi.mock("@/lib/actions/shopping-list", () => ({
  addShoppingItem: (...args: unknown[]) => addShoppingItemMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

async function renderQuickAdd() {
  const { ShoppingQuickAdd } = await import(
    "@/components/trip/shopping-list/ShoppingQuickAdd"
  );
  render(<ShoppingQuickAdd tripId={TRIP_ID} />);
}

function getInput() {
  return screen.getByPlaceholderText(
    SHOPPING_LIST_UI_STRINGS.quickAddPlaceholder
  );
}

/** Fires a native paste event carrying `text` on `input`. */
function pasteInto(input: HTMLElement, text: string) {
  const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, "clipboardData", {
    value: { getData: () => text },
  });
  input.dispatchEvent(pasteEvent);
  return pasteEvent;
}

beforeEach(() => {
  refreshMock.mockReset();
  addShoppingItemMock.mockReset();
  addShoppingItemMock.mockResolvedValue({ ok: true });
});

describe("<ShoppingQuickAdd />", () => {
  it("renders a labelled quick-add input", async () => {
    await renderQuickAdd();
    expect(getInput()).toBeInTheDocument();
  });

  it("Enter with text calls addShoppingItem({tripId, name}, key)", async () => {
    const user = userEvent.setup();
    await renderQuickAdd();
    await user.type(getInput(), "Tequila{Enter}");
    expect(addShoppingItemMock).toHaveBeenCalledTimes(1);
    const [input, key] = addShoppingItemMock.mock.calls[0];
    expect(input).toEqual({ tripId: TRIP_ID, name: "Tequila" });
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("on ok:true clears the field, keeps focus, rotates the key, and refreshes", async () => {
    const user = userEvent.setup();
    await renderQuickAdd();
    const input = getInput();
    await user.type(input, "Tequila{Enter}");

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(refreshMock).toHaveBeenCalled();

    await user.type(input, "Limes{Enter}");
    const firstKey = addShoppingItemMock.mock.calls[0][1];
    const secondKey = addShoppingItemMock.mock.calls[1][1];
    expect(secondKey).not.toBe(firstKey);
  });

  it("on failure keeps the text, shows a role=alert error, and reuses the same key on retry", async () => {
    addShoppingItemMock.mockResolvedValueOnce({
      ok: false,
      errorKey: "shopping_list_save_failed",
    });
    addShoppingItemMock.mockResolvedValueOnce({ ok: true });

    const user = userEvent.setup();
    await renderQuickAdd();
    const input = getInput();
    await user.type(input, "Tequila{Enter}");

    expect(input).toHaveValue("Tequila");
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(ERRORS.shopping_list_save_failed);

    await user.type(input, "{Enter}");
    const firstKey = addShoppingItemMock.mock.calls[0][1];
    const secondKey = addShoppingItemMock.mock.calls[1][1];
    expect(secondKey).toBe(firstKey);
  });

  it("empty or whitespace-only Enter does not call addShoppingItem", async () => {
    const user = userEvent.setup();
    await renderQuickAdd();
    await user.type(getInput(), "{Enter}");
    await user.type(getInput(), "   {Enter}");
    expect(addShoppingItemMock).not.toHaveBeenCalled();
  });

  it("sanitizes NUL and CR/LF on every keystroke, not just submit", async () => {
    const user = userEvent.setup();
    await renderQuickAdd();
    const input = getInput();

    // Fire raw change events (userEvent.type can't type control chars
    // like NUL reliably) to inspect state after EVERY onChange, per
    // sanitize_every_keystroke — the assertion must not be submit-only.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "Te\0quila" } });
    expect(input).toHaveValue("Tequila");

    fireEvent.change(input, { target: { value: "Tequila\r\n Run" } });
    expect(input).toHaveValue("Tequila Run");

    fireEvent.change(input, { target: { value: "Tequila\nRun\r" } });
    expect(input).toHaveValue("TequilaRun");

    // A normal keystroke after the sanitized ones still lands cleanly —
    // confirms sanitize runs on every change, not a one-shot cleanup.
    await user.type(input, "!");
    expect(input).toHaveValue("TequilaRun!");
  });

  it("multi-line paste shows a confirm gate instead of filling the input", async () => {
    await renderQuickAdd();
    const input = getInput();
    pasteInto(input, "Tequila\nLimes\nSalt");

    expect(input).toHaveValue("");
    expect(
      await screen.findByText(
        SHOPPING_LIST_UI_STRINGS.pasteAddConfirm_template.replace(
          "{count}",
          "3"
        )
      )
    ).toBeInTheDocument();
    expect(addShoppingItemMock).not.toHaveBeenCalled();
  });

  it("confirming a multi-line paste adds each line with its own distinct key, then clears and refreshes", async () => {
    const user = userEvent.setup();
    await renderQuickAdd();
    const input = getInput();
    pasteInto(input, "Tequila\r\n Limes \n\nSalt\r");

    await user.click(
      await screen.findByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.pasteAddConfirmCta,
      })
    );

    expect(addShoppingItemMock).toHaveBeenCalledTimes(3);
    const names = addShoppingItemMock.mock.calls.map((call) => call[0].name);
    expect(names).toEqual(["Tequila", "Limes", "Salt"]);
    const keys = addShoppingItemMock.mock.calls.map((call) => call[1]);
    expect(new Set(keys).size).toBe(3);
    expect(refreshMock).toHaveBeenCalled();
    expect(input).toHaveValue("");
    expect(
      screen.queryByText(
        SHOPPING_LIST_UI_STRINGS.pasteAddConfirm_template.replace(
          "{count}",
          "3"
        )
      )
    ).not.toBeInTheDocument();
  });

  it("a per-line failure mid-batch does not abort the rest — all 3 lines are attempted and the error surfaces", async () => {
    addShoppingItemMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        errorKey: "shopping_list_save_failed",
      })
      .mockResolvedValueOnce({ ok: true });

    const user = userEvent.setup();
    await renderQuickAdd();
    const input = getInput();
    pasteInto(input, "Tequila\nLimes\nSalt");

    await user.click(
      await screen.findByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.pasteAddConfirmCta,
      })
    );

    expect(addShoppingItemMock).toHaveBeenCalledTimes(3);
    const names = addShoppingItemMock.mock.calls.map((call) => call[0].name);
    expect(names).toEqual(["Tequila", "Limes", "Salt"]);
    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(ERRORS.shopping_list_save_failed);
  });

  it("cancelling a multi-line paste confirm makes no calls", async () => {
    const user = userEvent.setup();
    await renderQuickAdd();
    const input = getInput();
    pasteInto(input, "Tequila\nLimes");

    await user.click(
      await screen.findByRole("button", {
        name: SHOPPING_LIST_UI_STRINGS.cancelCta,
      })
    );

    expect(addShoppingItemMock).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        SHOPPING_LIST_UI_STRINGS.pasteAddConfirm_template.replace(
          "{count}",
          "2"
        )
      )
    ).not.toBeInTheDocument();
  });

  it("single-line paste does not show a confirm and lets default fill-in happen", async () => {
    await renderQuickAdd();
    const input = getInput();
    const event = pasteInto(input, "Tequila");
    expect(event.defaultPrevented).toBe(false);
    expect(addShoppingItemMock).not.toHaveBeenCalled();
  });
});
