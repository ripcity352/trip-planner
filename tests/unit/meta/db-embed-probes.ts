/**
 * AST extraction of PostgREST embeds for the I4 embed-resolution invariant
 * (postgrest-embed-resolution.test.ts). Not a test (no `.test.` suffix).
 *
 * Finds every `lib/db` `.from("T").select(<list>)` whose list contains an
 * embed (`[alias:]table[!hint][!inner|!left](cols)`), resolves `${CONST}`
 * template interpolations from local string consts, and returns one probe per
 * embed-bearing select: the base table + the full resolved select string
 * (for the live REST probe) and the parsed embed descriptors (for the static
 * disambiguation guard).
 *
 * Background: #550 — adding a 2nd FK from `trip_member_days` to `trip_members`
 * made a bare `trip_members!inner(...)` embed ambiguous → PostgREST HTTP 300 →
 * prod crash. Mocked db tests and the psql RLS harness both missed it (neither
 * exercises PostgREST). See `feedback_postgrest_embed_second_fk`.
 */

import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Embed = {
  /** Table being embedded (before any `!hint` / `(`). */
  embeddedTable: string;
  /** Disambiguating hints — `!token` where token ∉ {inner,left} (FK col/constraint). */
  hints: string[];
  /** Join modifiers present (`inner` / `left`). */
  modifiers: string[];
  /** Raw embed segment text. */
  raw: string;
};

export type EmbedProbe = {
  file: string;
  line: number;
  table: string;
  select: string;
  embeds: Embed[];
};

function sourceFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

/** Split a select list at top level (commas outside parens). */
function topLevelSegments(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Parse one embed segment `[alias:]table[!h1][!h2](cols)`. */
function parseEmbed(segment: string): Embed | null {
  const seg = segment.trim();
  const parenIdx = seg.indexOf("(");
  if (parenIdx === -1) return null; // not an embed — a scalar column
  let head = seg.slice(0, parenIdx).trim();
  const colon = head.indexOf(":");
  if (colon !== -1) head = head.slice(colon + 1); // strip alias:
  const parts = head.split("!").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const [embeddedTable, ...mods] = parts;
  const modifiers = mods.filter((m) => m === "inner" || m === "left");
  const hints = mods.filter((m) => m !== "inner" && m !== "left");
  return { embeddedTable, hints, modifiers, raw: seg };
}

function embedsOf(select: string): Embed[] {
  return topLevelSegments(select)
    .map(parseEmbed)
    .filter((e): e is Embed => e !== null);
}

/** Resolve a `.select(arg)` node to its string value, expanding `${CONST}`. */
function resolveSelectString(
  arg: ts.Expression,
  stringConsts: Map<string, string>,
): string | null {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return arg.text;
  }
  if (ts.isTemplateExpression(arg)) {
    let out = arg.head.text;
    for (const span of arg.templateSpans) {
      if (ts.isIdentifier(span.expression) && stringConsts.has(span.expression.text)) {
        out += stringConsts.get(span.expression.text);
      } else {
        return null; // unresolved interpolation — don't probe a partial select
      }
      out += span.literal.text;
    }
    return out;
  }
  return null;
}

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

export function extractEmbedProbes(dir: string): EmbedProbe[] {
  const probes: EmbedProbe[] = [];
  for (const file of sourceFilesIn(dir)) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const stringConsts = new Map<string, string>();
    const gather = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isStringLiteral(node.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(node.initializer))
      ) {
        stringConsts.set(node.name.text, node.initializer.text);
      }
      ts.forEachChild(node, gather);
    };
    gather(sf);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "select" &&
        node.arguments[0]
      ) {
        const select = resolveSelectString(node.arguments[0], stringConsts);
        if (select) {
          const embeds = embedsOf(select);
          if (embeds.length > 0) {
            const table = tableOfChain(node.expression.expression);
            if (table) {
              probes.push({
                file: file.split("/").slice(-3).join("/"),
                line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                table,
                select,
                embeds,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return probes;
}
