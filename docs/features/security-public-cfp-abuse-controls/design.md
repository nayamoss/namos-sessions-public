# Public CFP Abuse Controls — Technical Design

## Boundary decision

Direct public Convex mutations do not provide the preferred edge/IP enforcement point. Route submission through a same-origin Cloudflare Worker endpoint that validates request size, origin metadata, anti-bot proof, and rate limits before invoking an internal Convex mutation.

The production implementation uses Cloudflare Turnstile in managed mode and a SQLite-backed
Durable Object per privacy-safe limiter key. The Worker and Convex HTTP handoff share a generated
secret stored only in their environment settings. Turnstile verification fails closed on invalid
proof, missing configuration, provider errors, or a five-second timeout; it never falls back to the
old direct mutation.

## Proposed flow

1. Browser submits the existing payload plus anti-bot proof to the same-origin endpoint.
2. Endpoint validates JSON shape/size and verifies the proof server-side.
3. Rate limiter applies conservative buckets for IP, form, and normalized email hash.
4. Endpoint calls an internal submission function with the existing idempotency key.
5. Convex remains authoritative for form state, limits, validation, routing, persistence, and confirmation scheduling.

## Privacy and operations

- Hash normalized email for limiter keys; do not log raw form answers or tokens.
- Configure thresholds and provider secrets only in server environment variables.
- Emit aggregate accepted/throttled/verification-failed metrics.
- Emit no email, IP, form ID, answers, idempotency key, or Turnstile token in application logs.
- Fail closed with a retryable generic response during provider or backend outages.

## Initial production controls

- Request body: 256 KiB, streamed with bounded memory and strict nested object schemas.
- IP: 30 attempts per 10 minutes. The raw address is HMACed before Durable Object lookup.
- Form: 300 verified attempts per hour. The form identifier is HMACed before lookup.
- Normalized email: 5 verified attempts per hour, HMACed before lookup.
- Turnstile: exact `cfp-submit` action and `app.namos-sessions.xyz` hostname.

All thresholds are checked-in Worker variables so operators can tune them without weakening proof
verification. The IP allowance intentionally leaves room for legitimate shared office/conference
networks; the email bucket remains the tighter per-person control.

## Compatibility

Embeds and alternate clients need the same endpoint contract. Do not reintroduce a direct browser-accessible mutation as a fallback.
