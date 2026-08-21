# Analytics operations

Namos Sessions uses GA4 for aggregate acquisition/conversion reporting and PostHog US Cloud for consented product analytics. The browser loads neither SDK before a visitor explicitly accepts analytics.

## Required build variables

Configure these independently for production and preview deployments. They are public browser identifiers, not secrets.

- `VITE_GA_MEASUREMENT_ID`: the single GA4 web-stream measurement ID.
- `VITE_POSTHOG_KEY`: the single PostHog US project key.
- `VITE_POSTHOG_HOST`: `https://us.i.posthog.com`.
- `VITE_MARKETING_SITE_URL`: the marketing-site origin used for the Privacy link.
- `VITE_ENABLE_ANALYTICS`: leave unset/`false` in development; set `true` only for intentional local or preview validation. Production builds are enabled automatically when identifiers exist.

### Operator setup checklist

This branch intentionally contains no provider identifiers and does not create a stream or project. An authenticated operator must complete the following before enabling production capture:

1. In **GA4 Admin → Data streams**, create or reuse the single web stream for `https://app.namos-sessions.xyz`, then copy its measurement ID into `VITE_GA_MEASUREMENT_ID`.
2. In **PostHog US Cloud → Project settings**, create or reuse the single project, copy its project API key into `VITE_POSTHOG_KEY`, and set `VITE_POSTHOG_HOST=https://us.i.posthog.com`.
3. In **Cloudflare Workers → namos-sessions-webapp → Settings → Variables and Secrets**, add all five variables for Production. Use a separate preview Worker/environment for preview values. This repository deploys a Worker with static assets through `wrangler.jsonc`, not a Cloudflare Pages project. Mark `VITE_ENABLE_ANALYTICS=true` only for the environments that should send capture.
4. In **Netlify → Site configuration → Environment variables**, add the same values with Production and Deploy Preview scopes. The repository template declares the variable names, not their values.
5. In **Vercel → Project settings → Environment Variables**, add the same values for both Production and Preview; `vercel.json` must not contain these values or secret references.

`CONTENT_INTEGRATION_ENCRYPTION_KEY` is also required by Convex before connecting a CRM Airtable/Notion source. It is a server-side Convex secret, never a Vite value; the browser receives only a non-secret credential hint and sync status.

## Preview validation

1. Accept analytics in the consent banner.
2. Confirm normalized `page_view` and representative conversion events in GA4 DebugView and PostHog Live Events.
3. Confirm payloads contain only catalog-approved enum, boolean, count, and route-template properties.
4. Confirm replay starts only on opted-in `/submit/*` and `/e/*` routes, with all text and inputs masked.
5. Confirm replay is stopped on workspace, auth, portal, API-docs, unknown help fallback, and every `/embed/*` route.
6. Withdraw consent in Profile settings and verify capture stops, identity resets, and GA cookies are removed.

Record the GA4 DebugView and PostHog Live Events timestamps/project links in the release ticket after this checklist has been performed. Until an authenticated operator has completed that check, provider activation is a release gate—not evidence that capture was validated.

### Access verification — 2026-08-19

- Cloudflare Wrangler is authenticated for the Namos Labs account and has Worker write access. No Pages project is linked because this app uses a Worker deployment.
- Netlify CLI is authenticated but this worktree is not linked to a Netlify site.
- Vercel CLI is logged out.
- The GA setup automation's required Google Analytics service-account credential is absent.
- No authenticated PostHog project session or project key is available.

Accordingly, no provider project, build variable, preview deployment, DebugView event, Live Events capture, or replay was created or claimed during this release recovery. Once the GA measurement ID and PostHog project key exist, Cloudflare can be configured from the authenticated operator environment; Netlify and Vercel require linking/authentication first.

The versioned catalog and owner-facing funnel labels live in `src/lib/analytics.ts`. Historical event-operation trends are intentionally not synthesized; the organizer Analytics page reports count-only current state from the application backend.
