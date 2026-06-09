# Self-hosted fixture fonts (#217 determinism follow-up)

Latin-subset woff2 files used only by `notes/mockups/home.html` (the
visual-regression fixture) so the pixel-diff baseline doesn't depend on
CDN webfont availability or cross-OS delivery differences.

| File | Face | Source | License |
|---|---|---|---|
| `Fraunces-latin-var.woff2` | Fraunces variable (opsz 9–144, wght 100–900) | fonts.gstatic.com (Google Fonts, v38 latin subset) | SIL OFL 1.1 — see `Fraunces-OFL.txt` |
| `JetBrainsMono-latin-500.woff2` | JetBrains Mono 500 (static instance) | fonts.gstatic.com (Google Fonts, v24 latin subset) | SIL OFL 1.1 — see `JetBrainsMono-OFL.txt` |

Switzer is **not** duplicated here — the fixture references the app's own
`public/fonts/switzer/Switzer-Variable.woff2` (the `next/font/local`
source), so no additional Fontshare-licensed file enters the repo.

Both fonts above are licensed under the SIL Open Font License 1.1, which
permits redistribution provided the copyright notice and license text
accompany the files — the canonical upstream `OFL.txt` for each is
committed next to its woff2. They are not sold; they are bundled solely
as test fixtures.
