/**
 * AST extraction for the I8 date-only parse invariant
 * (date-only-parse.test.ts). Not a test itself (no `.test.` suffix).
 *
 * THE HAZARD (#350/#351, audit P0#2): the JS spec parses a bare date-only
 * string (`new Date('2027-03-12')`) as UTC midnight, not local — so anywhere
 * west of UTC it renders one calendar day early ("Mar 11"). Every date-only
 * Postgres column value must be parsed via `parseDateOnly` / `parseISO` (both
 * local-midnight) or the component-form `new Date(y, m, d)` — NEVER the native
 * single-string `new Date(<date-only value>)`.
 *
 * This extractor finds `new Date(<arg>)` calls whose argument READS a date-only
 * column — a property access whose property name is one of the schema's `date`
 * columns (starts_at / ends_at / starts_on / ends_on / closes_on / occurred_on
 * / date / day). It IGNORES:
 *   - `new Date()` (now) and `new Date(y, m, d)` / `new Date(ms)` (2+ args or a
 *     numeric arg — the safe local-component / epoch forms), and
 *   - `new Date(<timestamptz column>)` (created_at / expires_at / arrive_at /
 *     depart_at) — a full ISO instant with offset parses correctly.
 *
 * A `date`-column property access inside `new Date(...)` is the exact bug; a
 * timestamptz one is not, so keying on the column name (from the schema) is the
 * precise discriminator.
 */

import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Postgres `date`-typed columns (no time-of-day) whose value hits the UTC
 * off-by-one bug if passed to native `new Date(string)`. Sourced from the
 * migration `create table` DDL. `date` / `day` are generic but any REAL
 * date-only column value is a violation regardless of the holder's name.
 */
export const DATE_ONLY_COLUMNS = new Set([
  "starts_at",
  "ends_at",
  "starts_on",
  "ends_on",
  "closes_on",
  "occurred_on",
  "date",
  "day",
]);

export type DateOnlyMisparse = {
  file: string;
  line: number;
  arg: string;
};

const SKIP_DIRS = new Set(["__tests__", "node_modules"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return SKIP_DIRS.has(name) ? [] : walk(full);
    }
    return (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".d.ts") &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
      ? [full]
      : [];
  });
}

/** The property name a `new Date` argument reads, if it's a member access. */
function accessedProperty(arg: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(arg)) return arg.name.text;
  // `row["starts_at"]`
  if (
    ts.isElementAccessExpression(arg) &&
    arg.argumentExpression &&
    ts.isStringLiteral(arg.argumentExpression)
  ) {
    return arg.argumentExpression.text;
  }
  return null;
}

export function findDateOnlyMisparses(roots: string[]): DateOnlyMisparse[] {
  const hits: DateOnlyMisparse[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const sf = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "Date" &&
          node.arguments &&
          node.arguments.length === 1
        ) {
          const prop = accessedProperty(node.arguments[0]);
          if (prop && DATE_ONLY_COLUMNS.has(prop)) {
            hits.push({
              file: file.split("/").slice(-3).join("/"),
              line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              arg: node.arguments[0].getText().slice(0, 60),
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return hits;
}
