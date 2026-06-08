/**
 * Tests for `components/ui/identifier.tsx`
 *
 * Covers:
 *   1. Renders `value` verbatim in font-mono (no transform, no hashing)
 *   2. Optional `label` prop renders alongside
 *   3. `copyable=false` shows no copy affordance
 *   4. `copyable=true` shows copy button + aria-live status on success
 *   5. Copy failure surfaces ERRORS.network + logs
 *   6. Injection vectors — value is rendered as INERT TEXT (not executed,
 *      not placed in href, not via dangerouslySetInnerHTML)
 *
 * Security requirement (issue #215): every injection vector in the value
 * string must (a) appear verbatim as DOM textContent, (b) NOT be placed
 * via dangerouslySetInnerHTML, (c) NOT be coerced into an href/URL, and
 * (d) when copyable, `navigator.clipboard.writeText` receives the raw
 * value verbatim.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the copy palette so test strings are stable even if copy keys change.
vi.mock("@/lib/copy/empty-states", () => ({
  M3_UI_STRINGS: {
    identifier_copied: "Copied",
  },
}));

vi.mock("@/lib/copy/errors", () => ({
  ERRORS: {
    network: "Couldn't reach the server. Pull to retry.",
  },
}));

// Import AFTER mocks are declared so the module sees the mock.
import { Identifier } from "@/components/ui/identifier";
import { ERRORS } from "@/lib/copy/errors";

// ── Clipboard helper ──────────────────────────────────────────────────────────

let clipboardWriteText: MockInstance;

beforeEach(() => {
  clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    clipboard: { writeText: clipboardWriteText },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── 1. Basic render ───────────────────────────────────────────────────────────

describe("<Identifier /> — basic render", () => {
  it("renders the value verbatim as textContent", () => {
    render(<Identifier value="abc-123" />);
    expect(screen.getByText("abc-123")).toBeInTheDocument();
  });

  it("renders the value inside a font-mono element", () => {
    const { container } = render(<Identifier value="abc-123" />);
    // The element carrying the value must have font-mono in its className.
    const monoEl = container.querySelector(".font-mono");
    expect(monoEl).not.toBeNull();
    expect(monoEl?.textContent).toBe("abc-123");
  });

  it("renders a label when the label prop is provided", () => {
    render(<Identifier value="tok_abc" label="Token" />);
    expect(screen.getByText("Token")).toBeInTheDocument();
  });

  it("does not render a label when label prop is omitted", () => {
    const { container } = render(<Identifier value="tok_abc" />);
    // No extra label element beyond the value text
    expect(container.textContent).toBe("tok_abc");
  });
});

// ── 2. copyable=false ─────────────────────────────────────────────────────────

describe("<Identifier copyable={false} />", () => {
  it("shows no copy button when copyable is false", () => {
    render(<Identifier value="abc-123" copyable={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows no copy button when copyable is omitted", () => {
    render(<Identifier value="abc-123" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

// ── 3. copyable=true — happy path ─────────────────────────────────────────────

describe("<Identifier copyable={true} /> — happy path", () => {
  it("renders a copy button", () => {
    render(<Identifier value="abc-123" copyable />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText with the raw value on click", async () => {
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(clipboardWriteText).toHaveBeenCalledWith("abc-123")
    );
  });

  it("shows an aria-live status region after a successful copy", async () => {
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument()
    );
  });

  it("aria-live region has role=status and aria-live=polite", async () => {
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
    });
  });

  it("confirmation text comes from M3_UI_STRINGS.identifier_copied", async () => {
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Copied")
    );
  });
});

// ── 4. copyable=true — failure path ───────────────────────────────────────────

describe("<Identifier copyable={true} /> — clipboard failure", () => {
  beforeEach(() => {
    clipboardWriteText.mockRejectedValue(new Error("permission denied"));
  });

  it("surfaces ERRORS.network text on clipboard failure", async () => {
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByText(ERRORS.network)).toBeInTheDocument()
    );
  });

  it("logs [identifier] copy failed: on clipboard failure", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[identifier] copy failed:"),
        expect.anything()
      )
    );
    consoleSpy.mockRestore();
  });

  it("renders error in an aria-live=polite status region", async () => {
    render(<Identifier value="abc-123" copyable />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveTextContent(ERRORS.network);
    });
  });
});

// ── 5. Injection vectors ──────────────────────────────────────────────────────

/**
 * Each case: the `value` is an adversarial string. We assert:
 *   (a) DOM textContent === the raw input (no execution, no mangling)
 *   (b) value NOT placed via dangerouslySetInnerHTML
 *   (c) value NOT coerced into an href / URL attribute
 *   (d) when copyable, clipboard.writeText receives the raw value verbatim
 */

const INJECTION_VECTORS: Array<[string, string]> = [
  ["newline", "line1\nline2"],
  ["file URL", "file://x"],
  ["javascript: protocol", "javascript:alert(1)"],
  ["template literal fragment", "${x}"],
  ["RTL override (U+202E)", "‮evil"],
  ["10 KB string", "A".repeat(10_240)],
];

describe("<Identifier /> — injection-vector safety", () => {
  for (const [name, vector] of INJECTION_VECTORS) {
    describe(`vector: ${name}`, () => {
      it("(a) textContent equals the raw value verbatim", () => {
        const { container } = render(<Identifier value={vector} />);
        // The mono element's textContent must equal the raw input.
        const monoEl = container.querySelector(".font-mono");
        expect(monoEl?.textContent).toBe(vector);
      });

      it("(b) value is NOT placed via dangerouslySetInnerHTML", () => {
        // We assert this structurally: there must be no element whose
        // innerHTML differs from its textContent in a way that indicates
        // raw HTML injection. We verify the source file doesn't use the
        // API at all via a source-level read in the source audit below.
        const { container } = render(<Identifier value={vector} />);
        const monoEl = container.querySelector(".font-mono")!;
        // innerHTML === textContent for a pure-text node means no HTML parsed.
        expect(monoEl.innerHTML).toBe(monoEl.textContent);
      });

      it("(c) value is NOT coerced into an href or src attribute", () => {
        const { container } = render(<Identifier value={vector} />);
        // No anchor or resource element should appear.
        const links = container.querySelectorAll("a, link[href], script[src]");
        expect(links.length).toBe(0);
      });

      it("(d) copyable: clipboard.writeText receives the raw value verbatim", async () => {
        render(<Identifier value={vector} copyable />);
        fireEvent.click(screen.getByRole("button"));
        await waitFor(() =>
          expect(clipboardWriteText).toHaveBeenCalledWith(vector)
        );
      });
    });
  }
});

// ── 6. Source-level audit: no dangerouslySetInnerHTML ─────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("<Identifier /> — source audit", () => {
  const ROOT = resolve(__dirname, "../../..");
  const src = readFileSync(
    resolve(ROOT, "components/ui/identifier.tsx"),
    "utf-8"
  );

  it("does NOT use dangerouslySetInnerHTML as a JSX prop", () => {
    // Match the prop usage pattern (dangerouslySetInnerHTML={…}), not
    // any appearance in comments.
    expect(src).not.toMatch(/dangerouslySetInnerHTML\s*=\s*\{/);
  });

  it("does NOT construct any href from the value prop", () => {
    // Simple heuristic: no `href` prop with a dynamic expression.
    // A static href (e.g. on a help link) would be fine but the component
    // contract has no links, so any href is suspect.
    expect(src).not.toMatch(/href\s*=\s*\{/);
  });
});
