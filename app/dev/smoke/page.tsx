/**
 * /dev/smoke — design system token smoke page.
 *
 * Renders one of each primitive with computed CSS variable values printed
 * as data-* attributes. Used by the Playwright theme-smoke spec and for
 * manual verification on mobile Safari.
 *
 * NOT linked from any nav; remove in M5 productionisation pass.
 */
export const metadata = {
  title: "Smoke — design system",
  robots: { index: false },
};

export default function SmokePage() {
  return (
    <main
      className="min-h-screen p-8 space-y-12"
      style={{ backgroundColor: "var(--surface-base)", color: "var(--ink-primary)" }}
    >
      <header className="space-y-1">
        <p className="text-xs font-mono" style={{ color: "var(--ink-secondary)" }}>
          /dev/smoke — design system primitives
        </p>
      </header>

      {/* Hero type */}
      <section data-primitive="hero-type" className="space-y-2">
        <p className="text-xs font-mono" style={{ color: "var(--ink-tertiary)" }}>
          hero-type / Fraunces / wonk=1 / 56–72px
        </p>
        <h1
          className="font-heading text-6xl font-semibold leading-none tracking-tight hero-type"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          Bachelor Weekend
        </h1>
      </section>

      {/* Body copy */}
      <section data-primitive="body-copy" className="space-y-2">
        <p className="text-xs font-mono" style={{ color: "var(--ink-tertiary)" }}>
          body / Switzer / 16px / regular
        </p>
        <p className="text-base leading-relaxed" style={{ maxWidth: "40ch" }}>
          The plan is loose, the vibe is locked. Dave&apos;s got the itinerary.
          You just have to show up.
        </p>
      </section>

      {/* Mono caption */}
      <section data-primitive="mono-caption" className="space-y-2">
        <p className="text-xs font-mono" style={{ color: "var(--ink-tertiary)" }}>
          caption / JetBrains Mono / 12px / medium
        </p>
        <p
          className="text-xs font-mono font-medium tracking-wide"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          12 DAYS AWAY · 7 GOING · 2 MAYBE
        </p>
      </section>

      {/* Primary button */}
      <section data-primitive="primary-button" className="space-y-2">
        <p className="text-xs font-mono" style={{ color: "var(--ink-tertiary)" }}>
          primary button / accent-heat fill / radius 2px
        </p>
        <button
          type="button"
          className="px-5 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: "var(--accent-heat)",
            color: "var(--surface-base)",
            borderRadius: "2px",
          }}
        >
          I&apos;m going
        </button>
      </section>

      {/* Hairline chip */}
      <section data-primitive="hairline-chip" className="space-y-2">
        <p className="text-xs font-mono" style={{ color: "var(--ink-tertiary)" }}>
          hairline chip / 1px border / ink-tertiary
        </p>
        <span
          className="inline-block px-3 py-1 text-xs font-mono"
          style={{
            border: "1px solid var(--ink-tertiary)",
            color: "var(--ink-secondary)",
          }}
        >
          maybe
        </span>
      </section>

      {/* Surface-elevated card */}
      <section data-primitive="surface-elevated-card" className="space-y-2">
        <p className="text-xs font-mono" style={{ color: "var(--ink-tertiary)" }}>
          surface-elevated card / radius 8px
        </p>
        <div
          className="p-5 space-y-1"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderRadius: "8px",
          }}
        >
          <p className="text-sm font-semibold">Friday Night — Arrival</p>
          <p className="text-xs" style={{ color: "var(--ink-secondary)" }}>
            Check in · Dinner · No agenda
          </p>
        </div>
      </section>

      {/* Token dump — lets Playwright read resolved values without getComputedStyle */}
      <section data-primitive="token-dump" className="space-y-1 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-mono mb-3" style={{ color: "var(--ink-tertiary)" }}>
          resolved token values (read by Playwright via data-* attrs)
        </p>
        <TokenRow name="--surface-base" value="#100c0f" />
        <TokenRow name="--accent-heat" value="#ff6a3d" />
        <TokenRow name="--ink-primary" value="#f3e9d2" />
      </section>
    </main>
  );
}

function TokenRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex gap-4 text-xs font-mono" data-token={name} data-value={value}>
      <span style={{ color: "var(--ink-secondary)" }}>{name}</span>
      <span style={{ color: "var(--accent-heat-text)" }}>{value}</span>
      <span
        className="inline-block w-4 h-4 rounded-sm border"
        style={{ backgroundColor: value, borderColor: "var(--border)" }}
      />
    </div>
  );
}
