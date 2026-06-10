import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// ---------------------------------------------------------------------------
// Layer-3 design-system anti-tells — scoped to app/(authed)/**
// Enforces the ban list from notes/design-system.md §"#182 ESLint anti-tells"
// All rules use built-in no-restricted-syntax (no custom plugin dependency).
// ---------------------------------------------------------------------------

// Rule (b): emoji in JSX text nodes.
// Covers the most common emoji Unicode blocks via surrogate-pair ranges.
// Does NOT fire on emoji inside JS string literals or expression containers —
// only on literal JSXText children, which is the "icon substitute" pattern.
// Covers: Miscellaneous Symbols & Pictographs, Emoticons, Supplemental Symbols,
// Dingbats, Transport & Map Symbols, and common BMP symbols (★ ♥ ☆ etc.).
const EMOJI_SURROGATE_REGEX =
  "/\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF]|☀-➿/";

const authedAntiTells = {
  files: ["app/(authed)/**/*.{tsx,jsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      // -----------------------------------------------------------------------
      // (a) Light-mode utility classes in className.
      // Scoped to bg-white and bg-zinc-50 (the most common shadcn defaults).
      // The app surfaces are dark (--surface-base #100C0F). Light-mode bg
      // utilities are allowed only on legal pages / exports outside (authed).
      // Ref: design-system.md §Color "Light mode scope"
      // -----------------------------------------------------------------------
      {
        selector:
          "JSXAttribute[name.name='className'] > Literal[value=/(?:^| )(?:bg-white|bg-zinc-50)(?:$| )/]",
        message:
          "Light-mode bg utility (bg-white / bg-zinc-50) is banned in app/(authed)/. " +
          "Use a surface token (bg-surface-base, bg-surface-elevated, etc.) instead. " +
          "See design-system.md §Color — 'Light mode scope'.",
      },
      // -----------------------------------------------------------------------
      // (b) Emoji used as a section/icon substitute in JSX text.
      // Emoji is reserved for user-generated content and reactions (cap 6).
      // Icon slots use lucide-react SVG @ 1.75px stroke or custom SVG components.
      // Ref: design-system.md §Iconography + Vibecoded-specific bans
      //      "Emoji as nav/section icons"
      // -----------------------------------------------------------------------
      {
        selector: `JSXElement > JSXText[value=${EMOJI_SURROGATE_REGEX}]`,
        message:
          "Hardcoded emoji as a section label or icon substitute is banned in app/(authed)/. " +
          "Use lucide-react SVG icons (1.75px stroke) or a custom SVG component from /components/icons/. " +
          "See design-system.md §Iconography — 'Emoji as nav/section icons'.",
      },
      // -----------------------------------------------------------------------
      // (c) UUID-shaped string literal in JSX text node.
      // Raw UUIDs in rendered text mean a real ID leaked into the UI. Use a
      // typed <Identifier> component (#215) that formats or truncates the value.
      // Pattern: 8 hex chars — 4 hex chars — (UUID prefix is sufficient signal)
      // Ref: design-system.md §"#182 ESLint anti-tells" rule (c)
      // -----------------------------------------------------------------------
      {
        selector:
          "JSXElement > JSXText[value=/[0-9a-f]{8}-[0-9a-f]{4}-/]",
        message:
          "UUID-shaped string in JSX text is banned. " +
          "Use the <Identifier> component (#215) to render IDs. " +
          "See design-system.md §'#182 ESLint anti-tells' rule (c).",
      },
      // -----------------------------------------------------------------------
      // (d) Non-token border-radius class on <button> / <Button>.
      // The design system uses polar radii: hairline (rounded-none / rounded-xs /
      // rounded-[2px]) or pill (rounded-full). The 'middle' range (rounded,
      // rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-2xl,
      // rounded-3xl) is the iOS-utility vibecoded tell.
      // --radius-xs (2px) exists in globals.css as of #289 slice 1, so
      // rounded-xs is the canonical hairline class; rounded-[2px] stays
      // allowed for pre-existing call sites.
      // Lint structurally — ban the middle classes, allow the polar ones.
      // Limitation: this selector inspects string Literal classNames only; it
      // does NOT see classes passed through cn(...) / template literals (those
      // are CallExpression/TemplateLiteral args, not Literals). Same gap applies
      // to rule (a). Acceptable for a 2-dev project; the PR-template checklist
      // (#186) is the human backstop. Side-specific corners (rounded-t-md) are
      // also not matched — rare on buttons; revisit if one lands.
      // Ref: design-system.md §Radius "Polar radii, not middle radii" +
      //      §"#182 ESLint anti-tells — token re-verification" resolution (d-ii)
      // -----------------------------------------------------------------------
      {
        selector:
          "JSXOpeningElement[name.name=/^[Bb]utton$/] > JSXAttribute[name.name='className'] > Literal[value=/(?:^| )rounded(?:-sm|-md|-lg|-xl|-2xl|-3xl)?(?:$| )/]",
        message:
          "Non-token border-radius class on <button>/<Button> is banned. " +
          "Use rounded-none, rounded-xs (2px hairline token), or rounded-full (pill) only. " +
          "The 'middle' range (rounded, rounded-sm…rounded-3xl) " +
          "is the iOS-utility tell the design system rejects. " +
          "See design-system.md §Radius — 'Polar radii, not middle radii'.",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  authedAntiTells,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "e2e/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
