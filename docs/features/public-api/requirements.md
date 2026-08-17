# Public API — Requirements

**Type:** Feature  
**Status:** In Review  
**Priority:** High  
**Last Updated:** 2026-08-11

## Problem Statement

Takumi Talks has internal Convex functions and a browser-facing repository adapter, but no
stable external HTTP contract. `convex/http.ts` exports an empty router, so organizers cannot
retrieve their events or published schedule from another system, and no safe integration path
exists for the rest of the application.

The external API must be a product surface rather than a raw Convex proxy: versioned,
documented, event-scoped, permissioned, retry-safe, observable, and safe for public schedule
consumers. It must preserve the application rules already enforced by its organizer, reviewer,
speaker, CFP, scheduling, and delivery flows.

## User Stories

**As an** organizer, **I want to** create a scoped API token and give it to a trusted
integration **so that** it can read or administer only the events and program data I allow.

**As a** public website developer, **I want to** retrieve a published event schedule and speaker
directory without credentials **so that** I can show current program content without exposing
private program data.

**As an** integration developer, **I want to** use a versioned OpenAPI-described contract,
predictable errors, pagination, and idempotency **so that** retries and future Takumi changes do
not break my integration.

## Acceptance Criteria

- GIVEN a published event, WHEN a client requests its public schedule, sessions, or speakers,
  THEN it receives only the documented public projection and no unpublished, PII, review, task,
  availability, storage, or internal-identifier data.
- GIVEN a token limited to one event and `agenda:read`, WHEN it requests another event or a
  write endpoint, THEN it receives an authorization-safe `404`/`403` problem response and no
  resource-existence detail.
- GIVEN the same idempotent request is retried with the same key and identical payload, WHEN the
  original succeeds, THEN the API returns the same stored response and performs no second side
  effect; a changed payload for that key returns `409`.
- GIVEN an organizer opens Settings → Developer API, WHEN they create a token, THEN the plaintext
  token appears once, can be copied, and is never renderable again; they can later view its masked
  prefix, scopes, event grants, expiry, last use, rotate it, or revoke it.
- GIVEN an API write, WHEN its business rule is rejected, THEN it enforces the same validation as
  the app path (event membership, close dates, status transitions, room/track/speaker ownership,
  and speaker/reviewer ownership) and returns `application/problem+json`.
- GIVEN OpenAPI is generated/validated in CI, WHEN a documented endpoint changes, THEN contract
  tests detect the mismatch before release.

## Functional Requirements

- FR-001: Serve all external API paths beneath `/api/v1`; never expose Convex function names as
  API paths.
- FR-002: Commit an OpenAPI 3.1 document covering every shipped endpoint, request schema,
  response schema, error response, security scheme, pagination parameter, and example.
- FR-003: Expose a safe unauthenticated subset for a single published event by slug: event,
  schedule, sessions, and speakers. There is no public event-list endpoint.
- FR-004: Authenticate private API traffic with revocable, hashed personal access tokens (PATs)
  and enforce explicit event grants plus scopes on every request.
- FR-005: Support the existing app domains: events/configuration, forms, CFP submissions,
  speakers/documents, evaluations, agenda/conflicts, tasks, availability, portal forms, and
  communications. Credentials, seed controls, data-adapter configuration, raw storage IDs,
  confirmation capabilities, and direct database access remain excluded.
- FR-006: Make writes that create or trigger side effects idempotent with `Idempotency-Key`.
- FR-007: Record request ID, actor/token fingerprint, event, operation, target, status, and
  timestamp for every private API request; redact bearer tokens, provider secrets, and sensitive
  form values from logs.
- FR-008: Use cursor pagination for all collection endpoints and allowlisted filters/sorts only.
- FR-009: Provide Settings → Developer API as the owner/admin entry point for token management,
  API documentation, and audit-log viewing. The page header remains identity-only; controls live
  in the content toolbar/body.
- FR-010: Keep public response caching and rate limits explicit; invalidate public schedule
  projections on publication changes.

## Non-Functional Requirements

- NFR-001: Maintain the existing `<200ms` perceived list/tab-switch budget; API collection reads
  must avoid N+1 queries and enforce `limit <= 100`.
- NFR-002: Use OpenAPI 3.1 bearer security definitions, RFC 9457 problem details, and the current
  IETF `Idempotency-Key` work as the contract foundations. These standards choices are supported
  by the [OpenAPI specification](https://spec.openapis.org/oas/v3.1.1.html),
  [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), and the
  [HTTPAPI idempotency-key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/07/).
- NFR-003: A public request must never cause an Airtable API call in the judged deployment.
  Convex remains the public API’s first backend; Airtable support is a separately tested follow-on.
- NFR-004: Never store a recoverable PAT; only a cryptographic hash and non-secret display prefix
  persist.
- NFR-005: No API token, PII-only response, or developer-management page may be indexed or
  cached by a shared cache.

## Out of Scope

- Webhooks, OAuth application registration, SDK generation/distribution, GraphQL, bulk imports,
  and a public event directory.
- Browser CORS access from arbitrary origins.
- Replacing the app’s Clerk sign-in or speaker/reviewer portal authorization with token auth.
- Sending email through raw provider credentials or exposing any email integration secret.
- Claiming the API is Airtable-backed until API services and cache/rate-limit tests run against a
  live Airtable configuration.

## Success Metrics

- An external OpenAPI client completes the seeded event → agenda write → publish → public-read
  round trip without manual database access.
- 100% of tested token/event/scope combinations deny unauthorized data access.
- A retry suite proves no duplicate CFP submission, decision task, schedule publish, or delivery
  action for each idempotent endpoint.
- The public schedule endpoint has a documented p95 latency and cache-hit rate before release.
