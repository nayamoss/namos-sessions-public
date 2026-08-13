# Web App Security Headers — Technical Design

## Delivery

Use checked-in Cloudflare Worker response-header configuration. Treat dashboard-only configuration as non-authoritative.

## Baseline

- `Content-Security-Policy`: start report-only, inventory exact Clerk/Convex/storage origins, then enforce; avoid `unsafe-eval` and script `unsafe-inline`.
- `X-Content-Type-Options: nosniff`.
- `frame-ancestors 'self'` or `'none'` by route requirement; verify whether public embeds require a separate framing policy.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Minimal `Permissions-Policy` denying unused capabilities.

## Route nuance

If public embeds must be framed cross-origin, define a narrowly scoped header rule for embed routes rather than weakening the whole site. SPA fallback must not cause HTML to inherit long-lived immutable caching.

## Rollout

Capture CSP reports in staging, resolve violations, enforce, then verify actual response headers with browser/network and command-line checks.
