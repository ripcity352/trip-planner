# Open Graph + PWA plan

> Both deliverables are flagged as first-class by the audience research
> but neither is owned by a single existing goal. Capture the spec here
> so they land in Goal 2 (OG card) and Goal 6 (PWA manifest).

## Open Graph card (Goal 2)

The OG card is what renders when a trip invite link is pasted into
iMessage / WhatsApp / Slack. Per audience research §4(b), this is the
moment a groomsman decides whether to engage.

### Routes that need a card

- `/trips/[slug]` — trip dashboard
- `/invite/[token]` — invite landing
- (Goal 1) `/` — placeholder home page (low-effort default)

### Card spec (per route)

```
Title:       "<Trip name> · <dates>"
Description: "<count> coming · hosted by <organizer display name>"
Image:       1200x630, host avatar + trip name on solid background
Site name:   "Trip Planner" (or final product name)
```

### Implementation note

Use Next.js `generateMetadata` per route. For the dynamic image, use
Next.js `ImageResponse` from `next/og` — server-rendered, no external
service.

**Auth surface caveat:** the invite page is pre-auth, so its OG fields
must not leak attendee names or itinerary. Only show trip name, dates,
and organizer display name (already publicly readable per RLS).

## PWA manifest (Goal 6)

Per audience research §4(a), Add-to-Home-Screen on iOS Safari is the
80%-of-native feel that bachelor-party attendees will actually use
during the trip.

### Files needed

```
/app/manifest.ts            // Next.js conventions
/public/icon-192.png
/public/icon-512.png
/public/apple-touch-icon.png   // 180x180 for iOS
```

### `manifest.ts` shape

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trip Planner',
    short_name: 'Trips',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

### iOS-specific extras

iOS Safari ignores most of `manifest.json` and needs separate `<link>`
tags. Add to root layout `<head>`:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Trips" />
```

### Validation

After Goal 6 deploys: scan a trip URL with the Twitter/iMessage preview
debugger and verify the OG card renders. Add to home screen on an iPhone
and verify the standalone shell works.
