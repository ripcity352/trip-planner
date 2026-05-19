// notes/design-system.tailwind.snippet.ts
//
// v1 — revised 2026-05-19 post multi-perspective vibecoded review.
// See notes/design-system.md changelog for v0 → v1 deltas.
//
// Reference snippet for tailwind.config.ts when implementing M1 issue #69.
// NOT a working config — this is the token-mapping spec only. Copy the
// `theme.extend` block into the real config and add the Tailwind base.
//
// Companion to notes/design-system.md.

import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    fontFamily: {
      // Pair: Fraunces (display, OFL) + Switzer (body, OFL via Fontshare)
      // + JetBrains Mono (numerics, OFL).
      //
      // Vibecoded no-fly list (do NOT add any of these as fallbacks):
      //   Inter, Roboto, Space Grotesk, Helvetica, Arial, SF Pro,
      //   Poppins, Open Sans, Geist Sans, Geist Mono, Plus Jakarta Sans.
      display: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
      sans: ["var(--font-switzer)", "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
    },

    extend: {
      // ─── Color — semantic tokens read CSS variables ───────────────────
      // Bachelor theme defines the variables in globals.css; future themes
      // rebind the same names. Components reference Tailwind names only.
      colors: {
        surface: {
          base: "hsl(var(--surface-base) / <alpha-value>)",
          elevated: "hsl(var(--surface-elevated) / <alpha-value>)",
          sunken: "hsl(var(--surface-sunken) / <alpha-value>)",
          paper: "hsl(var(--surface-paper) / <alpha-value>)",
          loading: "hsl(var(--ink-tertiary) / 0.08)",
          error: "hsl(var(--surface-elevated) / <alpha-value>)",
          // surface-secret is a gradient/texture — use via
          // bg-[image:var(--surface-secret)] on the Blur Gradient slot.
        },
        ink: {
          primary: "hsl(var(--ink-primary) / <alpha-value>)",
          secondary: "hsl(var(--ink-secondary) / <alpha-value>)",
          tertiary: "hsl(var(--ink-tertiary) / <alpha-value>)",
          "on-paper": "hsl(var(--ink-on-paper) / <alpha-value>)",
        },
        accent: {
          heat: "hsl(var(--accent-heat) / <alpha-value>)",
          "heat-text": "hsl(var(--accent-heat-text) / <alpha-value>)",
          "heat-soft": "hsl(var(--accent-heat) / 0.16)",
          secret: "hsl(var(--accent-secret) / <alpha-value>)",
        },
        // Focus ring is an alias of accent-heat-text per WCAG 2.2 SC 2.4.11.
        ring: "hsl(var(--accent-heat-text) / <alpha-value>)",
      },

      // ─── Type scale ───────────────────────────────────────────────────
      // Mobile-first at 375px. Display sizes use Fraunces variable axes;
      // wonk=1 ONLY at >= 40px (per v1 review — wonk reads precious below).
      // No "label" tier — uppercase-tracked labels are AI tell #14.
      // JetBrains Mono caption in normal case replaces the eyebrow role.
      fontSize: {
        hero: ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],     // 56–72px (clamp in component)
        "display-lg": ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.015em", fontWeight: "600" }],   // 40
        display: ["2rem", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "500" }],     // 32 (Fraunces wonk=0)
        headline: ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.005em", fontWeight: "500" }], // 24 (Fraunces wonk=0)
        title: ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],                              // 18 Switzer
        body: ["1rem", { lineHeight: "1.5", fontWeight: "400" }],                                   // 16 Switzer
        "body-sm": ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],                          // 14 Switzer
        caption: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],   // 12 JetBrains Mono — replaces eyebrow labels
      },

      // ─── Spacing — Tailwind default (4px grid) + editorial extensions ─
      // Use editorial-* tokens for major section breaks; the "editorial breath."
      spacing: {
        "editorial-sm": "4rem",     // 64
        "editorial": "6rem",        // 96
        "editorial-lg": "8rem",     // 128
        "editorial-xl": "12rem",    // 192
      },

      // ─── Radius — polar, not middle ───────────────────────────────────
      // Buttons go hairline (2px); cards stay 8px. The 4-8px "middle radii"
      // zone is itself a vibecoded tell — distinctive sites go polar.
      borderRadius: {
        none: "0",
        xs: "0.125rem",  // 2 — buttons, chips, inputs (hairline)
        sm: "0.25rem",   // 4 — reserved; generally don't use
        DEFAULT: "0.5rem", // 8
        md: "0.5rem",    // 8 — standard cards
        lg: "1rem",      // 16 — hero photo cards, sheets
        xl: "1.5rem",    // 24 — Disposable Cam roll, polaroid grid
        full: "9999px",  // avatars only — never buttons
      },

      // ─── Shadow — long and warm, accent leaks into the halo ───────────
      // surface-shift > drop shadow for default elevation. Only use these
      // for the Blur Gradient, modals/sheets, and Lock-In Day.
      boxShadow: {
        warm: "0 12px 32px -8px rgba(255, 106, 61, 0.10), 0 4px 16px -4px rgba(0, 0, 0, 0.40)",
        secret: "0 8px 24px -6px rgba(58, 79, 255, 0.15)",
        sheet: "0 -8px 32px -4px rgba(0, 0, 0, 0.60)",
        hairline: "inset 0 0 0 1px hsl(var(--ink-tertiary) / 0.40)", // for hairline-border cards
      },

      // ─── Motion ───────────────────────────────────────────────────────
      // CSS-friendly subset. Spring easings live in /lib/design/motion.ts
      // (use Motion library's visualDuration + bounce — NOT raw spring()
      // with overshoot, which is the bouncy-elastic vibecoded tell).
      transitionDuration: {
        instant: "0ms",
        fast: "120ms",
        base: "220ms",
        slow: "420ms",
        theatrical: "2200ms",  // reduced from v0's 2500ms — Hype Stack now ends at 1900ms + dismissal pause
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(0.32, 0.72, 0, 1)",  // Vision-Pro-style: fast approach, smooth landing
      },

      // ─── Max content width — we don't pretend to be a desktop app ─────
      maxWidth: {
        prose: "40rem", // 640 — readable max for body content
        hero: "48rem",  // 768 — hero photo cards
      },

      // ─── Backdrop filter — NOT used as live filter (Safari janks) ─────
      // Kept here for the rare case where a static pre-rendered texture
      // ISN'T appropriate. Default Blur Gradient uses static SVG/PNG.
      backdropBlur: {
        gauze: "16px",
      },
      backdropSaturate: {
        muted: "80%",
      },

      // ─── Animation — shimmer for loading state surface ────────────────
      animation: {
        // 1.4s shimmer for skeleton blocks. Capped at 4s total in the
        // component (after that, swap to error state — indefinite shimmer
        // reads "hung").
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [
    // require("tailwindcss-animate"), // shadcn convention
  ],
} satisfies Config;

export default config;

// ─── CSS variable bindings (paste into globals.css) ─────────────────────
//
// Bachelor theme is default; future themes rebind these on
// [data-theme="generic"], [data-theme="bachelorette"], etc.
//
// HSL components (h s% l%) — not full hsl() — so Tailwind can compose
// with `/ <alpha-value>`.
//
// :root,
// :root[data-theme="bachelor"] {
//   /* Surface */
//   --surface-base:     14 9% 6%;     /* #100C0F — warm near-black */
//   --surface-elevated: 350 9% 10%;   /* #1A1517 */
//   --surface-sunken:   24 17% 4%;    /* #0A0708 */
//   --surface-paper:    42 53% 90%;   /* #F2EAD6 — used ONLY for legal pages, ICS exports, money receipts */
//   --surface-secret:   linear-gradient(135deg, hsl(var(--surface-elevated)) 0%, hsl(346 13% 12%) 100%); /* texture for Blur Gradient slot — pre-rendered preferred */
//
//   /* Ink */
//   --ink-primary:    42 60% 89%;   /* #F3E9D2 — hot wax cream; 11:1 against base, passes WCAG AAA */
//   --ink-secondary:  36 14% 60%;   /* #A89E89 */
//   --ink-tertiary:   34 11% 40%;   /* #6B6356 */
//   --ink-on-paper:   34 22% 11%;   /* #1F1A14 — for legal pages on cream surface */
//
//   /* Accent */
//   --accent-heat:        14 100% 62%;  /* #FF6A3D — persimmon; fills, large display only (fails 4.5:1 for body) */
//   --accent-heat-text:   16 100% 70%;  /* #FF8A65 — brightened; for inline body links + focus ring; 4.6:1 against base */
//   --accent-secret:      232 100% 62%; /* #3A4FFF — electric night-sky; celebrant-private only */
// }
//
// /* Optional themes for future templates (M5+) */
// :root[data-theme="generic"] {
//   --surface-base:     220 13% 7%;
//   --surface-elevated: 220 11% 11%;
//   --surface-sunken:   220 13% 5%;
//   --accent-heat:      var(--user-accent, 232 100% 67%);  /* organizer-set */
//   --accent-heat-text: var(--user-accent-text, 232 100% 75%);
//   --accent-secret:    52 100% 67%;
//   /* …ink + surface-paper unchanged */
// }
//
// /* Reduced motion — disable shimmer, disable flicker, instant transitions */
// @media (prefers-reduced-motion: reduce) {
//   *, *::before, *::after {
//     animation-duration: 0.01ms !important;
//     animation-iteration-count: 1 !important;
//     transition-duration: 0.01ms !important;
//   }
// }
//
// /* Skip-to-content link (paired with components/a11y/skip-to-content.tsx) */
// .skip-to-content {
//   position: absolute;
//   left: -9999px;
// }
// .skip-to-content:focus {
//   left: 1rem;
//   top: 1rem;
//   z-index: 50;
//   padding: 0.5rem 1rem;
//   background: hsl(var(--surface-elevated));
//   color: hsl(var(--ink-primary));
//   outline: 2px solid hsl(var(--accent-heat-text));
//   outline-offset: 2px;
//   border-radius: 0.125rem;
// }
