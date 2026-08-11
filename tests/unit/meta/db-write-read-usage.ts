/**
 * AST extraction for the I1 read/write-completeness invariant
 * (read-write-completeness.test.ts). Not a test itself (no `.test.` suffix,
 * so vitest never collects it) — pure static analysis over source text.
 *
 * Two extractors, both driven off the TypeScript compiler AST (never regex
 * over source — spreads, shorthand props, multi-line chains and `.map()`
 * payloads all need real parsing):
 *
 *   readColumnsByTable(dir) — every `.from("T").select(<list>)` in lib/db,
 *     unioned per table. `<list>` may be a string literal or a `*_COLUMNS`
 *     const; embedded `table(...)` sub-selects are dropped (not scalar
 *     columns of T), `alias:source` keeps `source`.
 *
 *   extractWrites(dir) — every `.from("T").insert/update/upsert({...})` in
 *     lib/actions, with the written top-level column keys. Object literals,
 *     arrays of literals, `...spread` of a local const, a bare identifier
 *     payload (`updatePayload`) and `.map(r => ({...}))` are all resolved.
 *     Anything it can't resolve lands in `unresolved` so the test can fail
 *     loudly rather than silently under-report writes.
 */

import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type WriteSite = {
  file: string;
  line: number;
  method: "insert" | "update" | "upsert";
  table: string | null;
  keys: string[];
  unresolved: string[];
};

function sourceFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** Concatenated string value of a string literal / template / `a + b`. */
function stringOf(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const l = stringOf(node.left);
    const r = stringOf(node.right);
    return l !== null && r !== null ? l + r : null;
  }
  return null;
}

/** Parse a PostgREST select list into its top-level scalar column names. */
export function parseSelectList(list: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      segments.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) segments.push(cur);

  const cols: string[] = [];
  for (let seg of segments) {
    seg = seg.trim();
    if (!seg || seg.includes("(")) continue; // embed table(...) — not a scalar
    const colonParts = seg.split(":");
    let col = colonParts.length > 1 ? colonParts[colonParts.length - 1] : seg;
    col = col.replace(/!.*/, "").trim(); // strip !fk hints
    if (col && /^[a-z_][a-z0-9_]*$/i.test(col)) cols.push(col);
  }
  return cols;
}

/** Walk a `.select(...)` / write call's callee chain to its `.from("T")` table. */
function tableOfChain(expr: ts.Expression): string | null {
  let e: ts.Expression | undefined = expr;
  while (e) {
    if (
      ts.isCallExpression(e) &&
      ts.isPropertyAccessExpression(e.expression) &&
      e.expression.name.text === "from"
    ) {
      const arg = e.arguments[0];
      return arg && ts.isStringLiteral(arg) ? arg.text : null;
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      e = e.expression.expression;
    } else if (ts.isPropertyAccessExpression(e)) {
      e = e.expression;
    } else {
      break;
    }
  }
  return null;
}

export function readColumnsByTable(dir: string): Map<string, Set<string>> {
  const byTable = new Map<string, Set<string>>();
  for (const file of sourceFilesIn(dir)) {
    const sf = parse(file);
    const constCols = new Map<string, string[]>();
    const gatherConsts = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText().endsWith("_COLUMNS") &&
        node.initializer
      ) {
        const s = stringOf(node.initializer);
        if (s !== null) constCols.set(node.name.getText(), parseSelectList(s));
      }
      ts.forEachChild(node, gatherConsts);
    };
    gatherConsts(sf);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "select"
      ) {
        const arg = node.arguments[0];
        let cols: string[] | null = null;
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          cols = parseSelectList(arg.text);
        } else if (arg && ts.isIdentifier(arg) && constCols.has(arg.text)) {
          cols = constCols.get(arg.text)!;
        }
        if (cols) {
          const table = tableOfChain(node.expression.expression);
          if (table) {
            const set = byTable.get(table) ?? new Set<string>();
            cols.forEach((c) => set.add(c));
            byTable.set(table, set);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return byTable;
}

function collectKeys(
  node: ts.Expression | undefined,
  localConsts: Map<string, ts.Expression>,
  keys: Set<string>,
  unresolved: string[],
): void {
  if (!node) return;
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
        keys.add(p.name.getText());
      } else if (ts.isSpreadAssignment(p)) {
        if (ts.isIdentifier(p.expression) && localConsts.has(p.expression.text)) {
          collectKeys(localConsts.get(p.expression.text), localConsts, keys, unresolved);
        } else if (ts.isObjectLiteralExpression(p.expression)) {
          collectKeys(p.expression, localConsts, keys, unresolved);
        } else {
          unresolved.push(`spread:${p.expression.getText()}`);
        }
      }
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((el) => collectKeys(el, localConsts, keys, unresolved));
  } else if (ts.isIdentifier(node) && localConsts.has(node.text)) {
    collectKeys(localConsts.get(node.text), localConsts, keys, unresolved);
  } else if (ts.isCallExpression(node)) {
    // e.g. rows.map(r => ({...})) — pull object literals from the callback.
    let found = false;
    const scan = (n: ts.Node): void => {
      if (ts.isObjectLiteralExpression(n)) {
        collectKeys(n, localConsts, keys, unresolved);
        found = true;
      } else {
        ts.forEachChild(n, scan);
      }
    };
    node.arguments.forEach(scan);
    if (!found) unresolved.push(`call:${node.expression.getText()}`);
  } else {
    unresolved.push(`other:${node.getText().slice(0, 40)}`);
  }
}

export function extractWrites(dir: string): WriteSite[] {
  const sites: WriteSite[] = [];
  for (const file of sourceFilesIn(dir)) {
    const sf = parse(file);
    const localConsts = new Map<string, ts.Expression>();
    const gatherConsts = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isObjectLiteralExpression(node.initializer) ||
          ts.isArrayLiteralExpression(node.initializer))
      ) {
        localConsts.set(node.name.text, node.initializer);
      }
      ts.forEachChild(node, gatherConsts);
    };
    gatherConsts(sf);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === "insert" ||
          node.expression.name.text === "update" ||
          node.expression.name.text === "upsert")
      ) {
        const keys = new Set<string>();
        const unresolved: string[] = [];
        collectKeys(node.arguments[0], localConsts, keys, unresolved);
        sites.push({
          file: file.split("/").slice(-3).join("/"),
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          method: node.expression.name.text as WriteSite["method"],
          table: tableOfChain(node.expression.expression),
          keys: [...keys],
          unresolved,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}
