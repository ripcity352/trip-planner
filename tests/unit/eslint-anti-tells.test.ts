/**
 * Proof: ESLint anti-tells rules (design-system.md §"#182 ESLint anti-tells")
 *
 * Programmatically runs ESLint on known-bad and known-good inline code
 * fixtures, asserting each rule fires (or doesn't) as expected.
 *
 * Uses the project's actual eslint.config.mjs (no mock config) so this test
 * proves real lint integration, not just selector theory.
 *
 * Override C: test file lives in tests/unit/, NOT in app/(authed)/.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ESLint, Linter } from "eslint";
import { resolve } from "node:path";

// Worktree root — all ESLint paths are resolved relative to here.
const WORKTREE = resolve(__dirname, "../..");

// Canonical target path: must be inside app/(authed)/ so the scoped config object applies.
const AUTHED_FILE = "app/(authed)/_fixture-test.tsx";

let eslint: ESLint;

beforeAll(() => {
  // Use the project's real flat config (eslint.config.mjs).
  // overrideConfigFile: undefined means "auto-detect" (the default).
  eslint = new ESLint({ cwd: WORKTREE });
});

/** Helper: lint an inline code snippet as if it were AUTHED_FILE. */
async function lint(code: string): Promise<Linter.LintMessage[]> {
  const results = await eslint.lintText(code, { filePath: AUTHED_FILE });
  return results[0]?.messages ?? [];
}

/** Return only messages produced by no-restricted-syntax. */
function antiTellMessages(messages: Linter.LintMessage[]): Linter.LintMessage[] {
  return messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

// ---------------------------------------------------------------------------
// Rule (a) — light-mode bg utilities
// ---------------------------------------------------------------------------
describe("rule (a): light-mode bg utilities", () => {
  it("fires on bg-white in className", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <div className="bg-white text-black">hello</div>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/bg-white/);
    expect(msgs[0].message).toMatch(/design-system\.md/);
  });

  it("fires on bg-zinc-50 in className", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <section className="p-4 bg-zinc-50 rounded">hi</section>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/bg-zinc-50/);
  });

  it("does NOT fire on semantic surface tokens", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <div className="bg-surface-base text-ink-primary">hello</div>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on bg-white inside a comment string (not className)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `// bg-white is banned\nconst X = () => <div className="bg-surface-elevated">hi</div>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule (b) — hardcoded emoji as section/icon substitute
// ---------------------------------------------------------------------------
describe("rule (b): emoji as icon substitute in JSX text", () => {
  it("fires on emoji as direct JSX text child", async () => {
    const msgs = antiTellMessages(
      await lint(`const X = () => <span>🎉</span>;`)
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/lucide-react/);
  });

  it("fires on emoji section label pattern", async () => {
    const msgs = antiTellMessages(
      await lint(`const X = () => <div><p>📍 Location</p></div>;`)
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT fire on emoji inside a JS string variable (expression container)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const label = "🎉 congrats"; const X = () => <span>{label}</span>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on emoji in a JSXExpressionContainer string literal", async () => {
    const msgs = antiTellMessages(
      await lint(`const X = () => <span>{"🎉"}</span>;`)
    );
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule (c) — UUID-shaped string in JSX text
// ---------------------------------------------------------------------------
describe("rule (c): UUID-shaped string in JSX text", () => {
  it("fires on a UUID literal in JSX text node", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <p>ID: 550e8400-e29b-41d4-a716-446655440000</p>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/Identifier/);
  });

  it("does NOT fire on a non-UUID hyphenated string", async () => {
    const msgs = antiTellMessages(
      await lint(`const X = () => <p>trip-name-here</p>;`)
    );
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on a UUID inside an expression container (dynamic)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const id = "550e8400-e29b-41d4-a716-446655440000"; const X = () => <p>{id}</p>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule (d) — non-token border-radius on button/Button
// ---------------------------------------------------------------------------
describe("rule (d): non-token button radius", () => {
  it("fires on rounded-md on a <button>", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-md px-4 py-2">Click</button>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/rounded-none/);
    expect(msgs[0].message).toMatch(/design-system\.md/);
  });

  it("fires on bare rounded on a <button>", async () => {
    const msgs = antiTellMessages(
      await lint(`const X = () => <button className="rounded px-4">Go</button>;`)
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-lg on a <button>", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-lg">Submit</button>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-xl on a <button>", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-xl">Submit</button>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-2xl on a <button>", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-2xl px-4">Go</button>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-md on a <Button> (shadcn casing)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <Button className="rounded-md w-full">Continue</Button>;`
      )
    );
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT fire on rounded-none (hairline — allowed)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-none px-4 py-2">Click</button>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on rounded-full (pill — allowed)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-full px-6">Go</button>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on rounded-[2px] (arbitrary hairline — allowed)", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <button className="rounded-[2px] px-4">Save</button>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on rounded-md on a non-button element", async () => {
    const msgs = antiTellMessages(
      await lint(
        `const X = () => <div className="rounded-md bg-surface-elevated">Card</div>;`
      )
    );
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Known-good composite fixture — no rule should fire
// ---------------------------------------------------------------------------
describe("known-good fixture: zero anti-tell errors", () => {
  it("a correctly written authed component produces zero anti-tell messages", async () => {
    const code = `
import { ChevronRight } from "lucide-react";

const userLabel = "Nice trip";

export function TripCard({ name }: { name: string }) {
  return (
    <div className="bg-surface-elevated rounded-md border border-border p-4">
      <h2 className="text-ink-primary">{name}</h2>
      <p className="text-ink-secondary">{userLabel}</p>
      <button className="rounded-none px-4 py-2 bg-accent-heat text-white">
        <ChevronRight size={16} strokeWidth={1.75} />
        Continue
      </button>
    </div>
  );
}
    `.trim();
    const msgs = antiTellMessages(await lint(code));
    expect(msgs).toHaveLength(0);
  });
});
