/**
 * Proof: ESLint anti-tells rules (design-system.md §"#182 ESLint anti-tells")
 *
 * Programmatically runs ESLint on known-bad and known-good inline code
 * fixtures, asserting each rule fires (or doesn't) as expected.
 *
 * Uses the project's actual eslint.config.mjs (no mock config) so this test
 * proves real lint integration, not just selector theory.
 *
 * All 22 lint results are precomputed once in beforeAll via Promise.all so
 * individual `it` blocks are instant synchronous assertions — eliminating the
 * per-test timeout exposure that caused intermittent flake under full-suite
 * worker contention (#318).
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

// ---------------------------------------------------------------------------
// Fixture definitions — one entry per it() case.
// Each key must be unique; it is used to look up precomputed messages below.
// ---------------------------------------------------------------------------
const FIXTURES = {
  // rule (a): light-mode bg utilities
  "a-bg-white": `const X = () => <div className="bg-white text-black">hello</div>;`,
  "a-bg-zinc-50": `const X = () => <section className="p-4 bg-zinc-50 rounded">hi</section>;`,
  "a-semantic-tokens": `const X = () => <div className="bg-surface-base text-ink-primary">hello</div>;`,
  "a-comment-not-classname": `// bg-white is banned\nconst X = () => <div className="bg-surface-elevated">hi</div>;`,

  // rule (b): emoji as icon substitute in JSX text
  "b-emoji-jsx-text": `const X = () => <span>🎉</span>;`,
  "b-emoji-section-label": `const X = () => <div><p>📍 Location</p></div>;`,
  "b-emoji-js-string": `const label = "🎉 congrats"; const X = () => <span>{label}</span>;`,
  "b-emoji-expression-container": `const X = () => <span>{"🎉"}</span>;`,

  // rule (c): UUID-shaped string in JSX text
  "c-uuid-jsx-text": `const X = () => <p>ID: 550e8400-e29b-41d4-a716-446655440000</p>;`,
  "c-non-uuid-hyphenated": `const X = () => <p>trip-name-here</p>;`,
  "c-uuid-expression-container": `const id = "550e8400-e29b-41d4-a716-446655440000"; const X = () => <p>{id}</p>;`,

  // rule (d): non-token border-radius on button/Button
  "d-rounded-md-button": `const X = () => <button className="rounded-md px-4 py-2">Click</button>;`,
  "d-rounded-bare-button": `const X = () => <button className="rounded px-4">Go</button>;`,
  "d-rounded-lg-button": `const X = () => <button className="rounded-lg">Submit</button>;`,
  "d-rounded-xl-button": `const X = () => <button className="rounded-xl">Submit</button>;`,
  "d-rounded-2xl-button": `const X = () => <button className="rounded-2xl px-4">Go</button>;`,
  "d-rounded-md-Button-shadcn": `const X = () => <Button className="rounded-md w-full">Continue</Button>;`,
  "d-rounded-none-allowed": `const X = () => <button className="rounded-none px-4 py-2">Click</button>;`,
  "d-rounded-full-allowed": `const X = () => <button className="rounded-full px-6">Go</button>;`,
  "d-rounded-arbitrary-allowed": `const X = () => <button className="rounded-[2px] px-4">Save</button>;`,
  "d-rounded-md-non-button": `const X = () => <div className="rounded-md bg-surface-elevated">Card</div>;`,

  // known-good composite fixture
  "known-good": `
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
  `.trim(),
} as const;

type FixtureKey = keyof typeof FIXTURES;

// ---------------------------------------------------------------------------
// Precomputed results — populated once in beforeAll.
// ---------------------------------------------------------------------------
let results: Record<FixtureKey, Linter.LintMessage[]>;

/** Return only messages produced by no-restricted-syntax. */
function antiTellMessages(messages: Linter.LintMessage[]): Linter.LintMessage[] {
  return messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

beforeAll(async () => {
  // Single ESLint instance using the project's real flat config (eslint.config.mjs).
  // overrideConfigFile: undefined means "auto-detect" (the default).
  const eslint = new ESLint({ cwd: WORKTREE });

  const t0 = Date.now();

  // Lint all fixtures concurrently — one well-bounded async batch instead of
  // 22 individually timeout-exposed lintText calls inside each it().
  const entries = Object.entries(FIXTURES) as [FixtureKey, string][];
  const linted = await Promise.all(
    entries.map(async ([key, code]) => {
      const lintResults = await eslint.lintText(code, { filePath: AUTHED_FILE });
      return [key, lintResults[0]?.messages ?? []] as [FixtureKey, Linter.LintMessage[]];
    })
  );

  results = Object.fromEntries(linted) as Record<FixtureKey, Linter.LintMessage[]>;

  const elapsed = Date.now() - t0;
  // Timing assertion: batch lint of all fixtures must complete well under the hook budget.
  // Inner guard is half the 60s hook timeout so a slow batch fails with a readable message
  // before vitest's generic 60s hook timeout fires.
  if (elapsed > 30_000) {
    throw new Error(`beforeAll lint batch took ${elapsed}ms — unexpectedly slow (budget: 30s)`);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Rule (a) — light-mode bg utilities
// ---------------------------------------------------------------------------
describe("rule (a): light-mode bg utilities", () => {
  it("fires on bg-white in className", () => {
    const msgs = antiTellMessages(results["a-bg-white"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/bg-white/);
    expect(msgs[0].message).toMatch(/design-system\.md/);
  });

  it("fires on bg-zinc-50 in className", () => {
    const msgs = antiTellMessages(results["a-bg-zinc-50"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/bg-zinc-50/);
  });

  it("does NOT fire on semantic surface tokens", () => {
    const msgs = antiTellMessages(results["a-semantic-tokens"]);
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on bg-white inside a comment string (not className)", () => {
    const msgs = antiTellMessages(results["a-comment-not-classname"]);
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule (b) — hardcoded emoji as section/icon substitute
// ---------------------------------------------------------------------------
describe("rule (b): emoji as icon substitute in JSX text", () => {
  it("fires on emoji as direct JSX text child", () => {
    const msgs = antiTellMessages(results["b-emoji-jsx-text"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/lucide-react/);
  });

  it("fires on emoji section label pattern", () => {
    const msgs = antiTellMessages(results["b-emoji-section-label"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT fire on emoji inside a JS string variable (expression container)", () => {
    const msgs = antiTellMessages(results["b-emoji-js-string"]);
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on emoji in a JSXExpressionContainer string literal", () => {
    const msgs = antiTellMessages(results["b-emoji-expression-container"]);
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule (c) — UUID-shaped string in JSX text
// ---------------------------------------------------------------------------
describe("rule (c): UUID-shaped string in JSX text", () => {
  it("fires on a UUID literal in JSX text node", () => {
    const msgs = antiTellMessages(results["c-uuid-jsx-text"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/Identifier/);
  });

  it("does NOT fire on a non-UUID hyphenated string", () => {
    const msgs = antiTellMessages(results["c-non-uuid-hyphenated"]);
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on a UUID inside an expression container (dynamic)", () => {
    const msgs = antiTellMessages(results["c-uuid-expression-container"]);
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule (d) — non-token border-radius on button/Button
// ---------------------------------------------------------------------------
describe("rule (d): non-token button radius", () => {
  it("fires on rounded-md on a <button>", () => {
    const msgs = antiTellMessages(results["d-rounded-md-button"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].message).toMatch(/rounded-none/);
    expect(msgs[0].message).toMatch(/design-system\.md/);
  });

  it("fires on bare rounded on a <button>", () => {
    const msgs = antiTellMessages(results["d-rounded-bare-button"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-lg on a <button>", () => {
    const msgs = antiTellMessages(results["d-rounded-lg-button"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-xl on a <button>", () => {
    const msgs = antiTellMessages(results["d-rounded-xl-button"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-2xl on a <button>", () => {
    const msgs = antiTellMessages(results["d-rounded-2xl-button"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on rounded-md on a <Button> (shadcn casing)", () => {
    const msgs = antiTellMessages(results["d-rounded-md-Button-shadcn"]);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT fire on rounded-none (hairline — allowed)", () => {
    const msgs = antiTellMessages(results["d-rounded-none-allowed"]);
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on rounded-full (pill — allowed)", () => {
    const msgs = antiTellMessages(results["d-rounded-full-allowed"]);
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on rounded-[2px] (arbitrary hairline — allowed)", () => {
    const msgs = antiTellMessages(results["d-rounded-arbitrary-allowed"]);
    expect(msgs).toHaveLength(0);
  });

  it("does NOT fire on rounded-md on a non-button element", () => {
    const msgs = antiTellMessages(results["d-rounded-md-non-button"]);
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Known-good composite fixture — no rule should fire
// ---------------------------------------------------------------------------
describe("known-good fixture: zero anti-tell errors", () => {
  it("a correctly written authed component produces zero anti-tell messages", () => {
    const msgs = antiTellMessages(results["known-good"]);
    expect(msgs).toHaveLength(0);
  });
});
