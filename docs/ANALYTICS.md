# Analytics operations

Namos Sessions uses GA4 for aggregate acquisition/conversion reporting and PostHog US Cloud for consented product analytics. The browser loads neither SDK before a visitor explicitly accepts analytics.

## Required build variables

Configure these independently for production and preview deployments. They are public browser identifiers, not secrets.

- `VITE_GA_MEASUREMENT_ID`: the single GA4 web-stream measurement ID.
- `VITE_POSTHOG_KEY`: the single PostHog US project key.
- `VITE_POSTHOG_HOST`: `https://us.i.posthog.com`.
- `VITE_MARKETING_SITE_URL`: the marketing-site origin used for the Privacy link.
- `VITE_ENABLE_ANALYTICS`: leave unset/`false` in development; set `true` only for intentional local or preview validation. Production builds are enabled automatically when identifiers exist.

Cloudflare binding prompts and Netlify template variables are declared in the repository. Vercel build variables must be added in Project Settings → Environment Variables for both Production and Preview because `vercel.json` must not contain environment values or secret references.

## Preview validation

1. Accept analytics in the consent banner.
2. Confirm normalized `page_view` and representative conversion events in GA4 DebugView and PostHog Live Events.
3. Confirm payloads contain only catalog-approved enum, boolean, count, and route-template properties.
4. Confirm replay starts only on opted-in `/submit/*` and `/e/*` routes, with all text and inputs masked.
5. Confirm replay is stopped on workspace, auth, portal, API-docs, unknown help fallback, and every `/embed/*` route.
6. Withdraw consent in Profile settings and verify capture stops, identity resets, and GA cookies are removed.

The versioned catalog and owner-facing funnel labels live in `src/lib/analytics.ts`. Historical event-operation trends are intentionally not synthesized; the organizer Analytics page reports count-only current state from the application backend.
