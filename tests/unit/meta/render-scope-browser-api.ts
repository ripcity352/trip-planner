/**
 * AST scan for the I9 render-scope-browser-API invariant
 * (render-scope-browser-api.test.ts). Not a test (no `.test.` suffix).
 *
 * Finds browser-global reads (`window.*`, `document.*`, `localStorage.*`,
 * `sessionStorage.*`, `navigator.*`, `location.*`, bare `matchMedia(...)`) that
 * execute DURING RENDER in a `"use client"` component — the hydration-mismatch
 * class (#254). Those are: the module top level, a component function body
 * directly, or a `useState` / `useReducer` / `useMemo` initializer (all run on
 * the SSR pass, where the browser globals don't exist).
 *
 * SAFE positions (NOT flagged): `useEffect` / `useLayoutEffect` / `useCallback`
 * callbacks, event handlers, and plain helper functions — they run after mount
 * / on demand, never during the render pass. A helper's own safety depends on
 * WHO calls it (call-graph), which this lexical scan does not chase; it flags
 * only the render-time positions above, which is where the real bugs land.
 * Canonical correct pattern: components/trip/arrivals/arrivals-manifest.tsx
 * (default on SSR, read localStorage in an effect, upgrade via setState).
 */

import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BROWSER_GLOBALS = new Set([
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
  "location",
  "matchMedia",
]);

const RENDER_HOOKS = new Set(["useState", "useReducer", "useMemo"]);

export type RenderScopeViolation = {
  file: string;
  line: number;
  global: string;
  reason: "module-scope" | "render-body" | "hook-initializer";
};

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walkFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

function isClientComponent(sql: string): boolean {
  // The "use client" directive must be the first statement (allowing comments).
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(sql);
}

/** Nearest enclosing function-like node, or undefined at module scope. */
function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let p = node.parent;
  while (p) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p)
    ) {
      return p;
    }
    p = p.parent;
  }
  return undefined;
}

/** True if `fn` is the callback argument of a call to one of `names`. */
function isCallbackArgTo(fn: ts.FunctionLikeDeclaration, names: Set<string>): boolean {
  const call = fn.parent;
  if (!call || !ts.isCallExpression(call)) return false;
  if (!call.arguments.includes(fn as ts.Expression)) return false;
  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : "";
  return names.has(name);
}

/** True if `fn` looks like a React component (PascalCase name or default export). */
function isComponentFunction(fn: ts.FunctionLikeDeclaration): boolean {
  const isPascal = (s: string) => /^[A-Z]/.test(s);
  if (ts.isFunctionDeclaration(fn) && fn.name) return isPascal(fn.name.text);
  const parent = fn.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return isPascal(parent.name.text);
  }
  if (parent && ts.isExportAssignment(parent)) return true; // export default () => ...
  if (ts.isFunctionDeclaration(fn) && !fn.name) return true; // export default function() {}
  return false;
}

/** The browser-global object identifier of a `global.x` / `global(...)` ref. */
function browserGlobalRef(node: ts.Node): string | null {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    BROWSER_GLOBALS.has(node.expression.text)
  ) {
    return node.expression.text;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    BROWSER_GLOBALS.has(node.expression.text)
  ) {
    return node.expression.text; // bare matchMedia(...) etc.
  }
  return null;
}

export function findRenderScopeBrowserApi(dirs: string[]): RenderScopeViolation[] {
  const violations: RenderScopeViolation[] = [];
  const files = dirs.flatMap((d) => walkFiles(d));

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!isClientComponent(src)) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      const global = browserGlobalRef(node);
      if (global) {
        const fn = enclosingFunction(node);
        let reason: RenderScopeViolation["reason"] | null = null;
        if (!fn) {
          reason = "module-scope";
        } else if (isCallbackArgTo(fn, RENDER_HOOKS)) {
          reason = "hook-initializer";
        } else if (isComponentFunction(fn)) {
          // Directly in a component body (not inside a nested fn) — render pass.
          reason = "render-body";
        }
        // else: useEffect/useCallback/handler/helper — deferred, safe.
        if (reason) {
          violations.push({
            file: file.split("/").slice(-4).join("/"),
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            global,
            reason,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return violations;
}
