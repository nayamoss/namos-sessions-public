# Public CFP Abuse Controls — Technical Design

## Boundary decision

Direct public Convex mutations do not provide the preferred edge/IP enforcement point. Route submission through a same-origin Cloudflare Worker endpoint that validates request size, origin metadata, anti-bot proof, and rate limits before invoking an internal Convex mutation.

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
- Fail closed for invalid proof; define a documented provider-outage posture before launch.

## Compatibility

Embeds and alternate clients need the same endpoint contract. Do not reintroduce a direct browser-accessible mutation as a fallback.
