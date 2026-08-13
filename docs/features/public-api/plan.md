# Public API

**Phase 17 · 40–55h · Beyond the competition brief**

## Outcome

Ship a stable, documented REST API for every supported Namos Sessions capability, shaped like
OpenSession's versioned API: discover events, retrieve public schedules, and administer the
program from another product. The contract is **`/api/v1`**, described by a committed OpenAPI
3.1 document and backed by the same domain services as the app — never by exposing Convex
function names or database documents directly.

The app remains event-scoped, not multi-tenant. An integration token is issued to a human
organizer and is limited to explicitly granted event IDs and scopes. It is not an organization
credential.

## Why this is a new feature

The existing repository/transport API is an internal frontend-to-backend boundary. It exposes
implementation-shaped operations and trusts app identity; it is not safe or stable for third
parties. `convex/http.ts` currently exposes no HTTP routes. The former public-embeds feature
only proposed unauthenticated HTML pages and is cut; it is not an API.

This feature must not delay requirements 1–6. Its first useful delivery is public event and
published-schedule reads. Private write APIs follow only after the required app flows are live
verified.

## Product decisions to approve before implementation

Recommended defaults are deliberately recorded here so the implementation does not silently
make policy decisions.

| Decision | Recommended default | Reason |
|---|---|---|
| API audience | Organizer integrations first; speaker/reviewer access only via the existing portal | Avoids exporting a second end-user auth system before there is a customer need. |
| Public data | `GET` event, schedule, sessions, speakers only when the event and schedule are published | Matches the existing public-data rule; never leak drafts, submissions, contact info, notes, evaluations, tasks, or availability. |
| Authentication | `Authorization: Bearer tt_live_…` personal access tokens (PATs), plus Clerk user JWT support for first-party tooling | PATs support servers and automation. Do not reuse browser sessions as long-lived integration credentials. |
| Scoping | Token has explicit event grants and named scopes; every private URL also contains `{eventId}` | Deny cross-event access even for an organizer who belongs to several events. |
| Write safety | Require `Idempotency-Key` on every POST/PATCH/DELETE that can create, send, publish, or change status | Prevent duplicate submissions, decisions, tasks, email sends, and schedules after retries. |
| Webhooks | Deferred until v1 resources and audit logs are proven | Delivery, retries, signing, and replay protection are a product of their own. |
| Public CORS | Disabled by default; allow only configured origins for browser API consumers | Public reads can otherwise become an uncontrolled cross-origin data feed. |
| Versioning | URL versioning (`/api/v1`); additive fields only during v1; deprecate before removal | Keeps an integration from breaking when the UI evolves. |

Naya must approve the PAT lifecycle (expiry policy, maximum token lifetime, and whether users
can create tokens themselves) before Phase B. Until then, no external write endpoint ships.

## Contract conventions

- Base URL: `https://{deployment}/api/v1`; JSON only, UTF-8, timestamps as RFC 3339 UTC strings.
- Resource IDs are opaque strings. Convex IDs, storage IDs, encryption envelopes, Clerk IDs,
  idempotency records, and raw email-provider errors never appear in responses.
- Lists use cursor pagination: `?limit=50&cursor=…`, maximum 100. Responses are
  `{ data, page: { nextCursor, hasMore } }`. No offset pagination.
- Filtering and sort fields are resource allowlists; unsupported filters return a structured
  validation error, never an ignored parameter.
- All results use `{ data, meta? }`; errors use
  `{ error: { code, message, requestId, details? } }`. `details` contains field errors only,
  never authorization or internal database diagnostics.
- Use `401` for missing/invalid authentication, `403` for a valid token lacking scope/event
  access, `404` for inaccessible private resources, `409` for a domain conflict or idempotency
  key reused with a different body, `422` for valid JSON that fails business validation, and
  `429` with `Retry-After` for limits.
- Return `X-Request-Id` on every response; write audit entries with the actor, token fingerprint,
  event, action, target, request ID, and result. Never log bearer tokens or request bodies with
  sensitive answers.
- `GET` is safe. `POST` creates/action-runs, `PATCH` makes partial changes, and `DELETE` is
  limited to resources whose app equivalent supports deletion. Do not make destructive actions
  look like generic updates.

## v1 resource surface

The OpenAPI document is the exact source of truth. This inventory defines its intended coverage.

| Area | Read endpoints | Write/action endpoints | Required scope |
|---|---|---|---|
| Events | `GET /events`, `GET /events/{eventId}`, `GET /events/slug/{slug}` | `POST /events`, `PATCH /events/{eventId}` | `events:read`, `events:write` |
| Event configuration | rooms, tracks, tags, forms, reusable fields | CRUD where supported by the app | `events:read/write`, `forms:read/write` |
| CFP | public form definition by slug/form ID; authenticated submission reads | public form submit/draft where configured; organizer create/update/status/tag/decision | `public:cfp`, `submissions:read/write` |
| Speakers and files | event speakers; caller's own portal profile/documents | organizer speaker updates; caller's own profile/document upload flow | `speakers:read/write`, `portal:self` |
| Review | plans, assignments, aggregate-safe evaluations; caller's review queue | save evaluation, create plan, assign reviewers | `evaluations:read/write`, `reviews:self` |
| Agenda | agenda, rooms/track views, conflicts; public published schedule | save item, schedule/clear, publish/unpublish | `agenda:read/write`, `agenda:publish` |
| Tasks and availability | organizer event view or caller's own records | create/update task; caller's own availability | `tasks:read/write`, `availability:read/write`, `portal:self` |
| Forms and responses | portal form definitions and caller's responses | submit portal form | `portal:self` |
| Communications | delivery log and templates, with recipient addresses redacted unless `comms:pii` | send/test/retry only once the existing delivery service is live-proven | `comms:read/send` |
| API administration | current token metadata and audit events | create, rotate, revoke token; list/update webhook subscriptions in a later phase | `api:manage` |

The following application internals are explicitly out of v1: email provider credentials,
confirmation capabilities, raw form-answer exports without a PII scope, storage URLs,
organizer membership changes, seed controls, data-backend selection, and direct access to
Convex/Airtable tables. File endpoints return short-lived upload/download URLs only after a
scope and ownership check; no storage key is public.

### Public read subset

Unauthenticated endpoints are intentionally small:

- `GET /public/events/{eventSlug}`
- `GET /public/events/{eventSlug}/schedule`
- `GET /public/events/{eventSlug}/sessions`
- `GET /public/events/{eventSlug}/speakers`

They return only a published event and confirmed, timed, roomed, published agenda items plus
accepted speaker display fields. They must not make an event discoverable by listing all slugs.
Use cache-control with a short surrogate TTL and invalidate on schedule publish/unpublish.

## Architecture

```
HTTP request
  -> /api/v1 router (normalization, request ID, CORS, JSON limits)
  -> auth resolver (public | Clerk JWT | PAT)
  -> policy check (scope + event grant + actor ownership)
  -> API service (input validation, idempotency, response projection)
  -> existing domain service / repository contract
  -> Convex product data (and, later, the tested Airtable adapter where supported)
```

1. Add a server-only API layer under `convex/api/` (router, auth, policy, serializers,
   validation, idempotency, audit). `convex/http.ts` only registers routes; it contains no
   business rules.
2. Extract domain operations currently embedded in Convex functions into server-side services so
   the UI adapter and HTTP API share authorization-independent business invariants. Do **not**
   call client repository transports from Convex HTTP actions.
3. Add tables/indexes for `api_tokens`, `api_token_event_grants`, `api_idempotency_keys`, and
   `api_audit_log`. Store only a one-way token hash plus non-secret prefix/name/last-used and
   expiration/revocation metadata. Encrypt no bearer token because it must never be recoverable.
4. Define a serializer per resource. It is the PII boundary, maps Convex data to API DTOs, and
   hides fields not covered by scope. Never use object spread to serialize database records.
5. Keep current Cloudflare/Airtable traffic private. Public v1 initially targets Convex; adding
   Airtable requires server-side API services plus KV cache/rate protection, not browser access.

## Delivery phases

### A — API foundation and public read slice (8–12h)

1. Write `docs/api/openapi.v1.yaml` for the public event/schedule/session/speaker endpoints,
   shared error/page schemas, examples, and security schemes; validate it in CI.
2. Implement HTTP request normalization, CORS allowlist, correlation IDs, strict JSON/body-size
   limits, response serializer tests, and the public visibility policy.
3. Implement public read endpoints from a single published-event projection; add cache headers
   and invalidation when a schedule changes publication state.
4. Publish generated reference docs as a static route or checked-in artifact, with curl examples.

### B — tokens, scopes, audit, and event administration (10–14h)

1. Add PAT create/list/rotate/revoke flows available only to the API-manage organizer role.
2. Add hash comparison, expiry/revocation, token/event grants, per-token rate limits, and audit
   logging; mask token prefixes in every UI/log response.
3. Deliver event, room, track, tag, and agenda list/write endpoints using shared domain services.
4. Enforce idempotency on each write and document replay behaviour; run authorization matrix tests
   for owner, admin, reviewer, speaker, expired token, revoked token, wrong event, and public.

### C — program workflow resources (12–16h)

1. Add forms, submissions, speakers, reviews, tasks, availability, and portal-form endpoints in
   dependency order.
2. Reuse existing server validation for conditional fields, close dates, status transitions,
   category routing, speaker ownership, availability, conflict detection, and task completion.
3. Add explicit asynchronous action responses for email sends and schedule publish (`202` only
   if work actually continues asynchronously; otherwise return the updated resource).
4. Redact reviewer feedback and contact details by default; add narrowly scoped PII projections
   only with deliberate approval and tests.

### D — operational hardening and release (10–13h)

1. Add contract tests generated from OpenAPI, integration tests against a seeded Convex deployment,
   pagination/load tests, fuzzed validation tests, and an API-specific security review.
2. Add quota metrics, audit-log retention policy, API health/readiness checks, request tracing,
   structured errors, and a documented deprecation policy.
3. Test a sample external integration end-to-end: create token, list its event, create a session,
   schedule it idempotently, publish, and verify only the permitted public projection appears.
4. Consider signed webhooks only after this release: event selection, HMAC signature, timestamp,
   delivery ID, retry/backoff, replay protection, delivery log, and endpoint verification UI.

### E — Developer API settings UI (4–6h)

**Location:** authenticated `/settings/developer-api`, in Configure navigation below Email
delivery. `PageHeader` contains only “Developer API”; `ContentToolbar` below it holds “Create
token.” The route and page are intentionally not public.

**UI Spec**

- Add `src/pages/settings/DeveloperApi.tsx`, with no props, using `useRepo()`.
- Add a lazy route in `src/App.tsx` and a `Code2` navigation item in
  `src/components/AppLayout.tsx`.
- Render an introductory sentence, “Open API reference” link, a masked-token table, an inline
  creation form, a one-time plaintext-token result, and a paginated recent-audit table.
- The token table contains name, prefix, scopes, event access, expiry, last-used, status, and an
  actions dropdown. The empty state reads: “No API tokens yet. Create one to connect an external
  tool.” Loading renders five skeleton rows; loading failure is an inline destructive alert with a
  Retry button.
- The inline create form contains a token-name text input, event-grant checkboxes, scope choice
  buttons, a styled expiry menu (30 days / 90 days / 1 year / Never), Cancel, and Create token.
  Create is disabled until name, one scope, and one event are selected.
- On success, show the plaintext value in a read-only input, Copy token button, exact warning
  “Copy this token now. It will not be shown again.”, and an “I’ve saved it” button that clears
  the value. Never put it in a toast, URL, local storage, or audit row.
- Rotate uses inline confirmation; revoke uses the existing `AlertDialog` with a destructive
  confirmation. Both refresh masked token and audit lists and show success/failure Sonner toasts.
- Use existing light/dark token styles: `space-y-4`, `rounded-lg bg-card p-6`, `bg-muted`,
  `text-muted-foreground`, `text-destructive`; no shadows, visible borders, native selects, or
  controls inside page headers.

**Tasks**

1. [ ] T041: Implement token-management and audit repository contracts, Convex functions, and
   masked DTOs.
2. [ ] T042: Build `DeveloperApi.tsx` with every loading, empty, error, create, copy, rotate, and
   revoke state described above.
3. [ ] T043: Wire `/settings/developer-api` and the Configure navigation entry.
4. [ ] T044: Browser-test token creation, plaintext dismissal, copy, rotation, revocation, and
   audit visibility with an organizer; verify non-organizers cannot reach the data.

## Acceptance criteria

- A checked-in, linted OpenAPI 3.1 spec documents every shipped endpoint and exactly matches
  automated contract tests.
- Public requests cannot enumerate unpublished events or expose any draft agenda item,
  submission, PII, reviewer note, task, availability record, storage key, or internal ID.
- A valid token works only for its scopes and explicitly granted events; rotated/revoked/expired
  tokens fail immediately without revealing whether the event exists.
- Every mutating endpoint safely retries with the same `Idempotency-Key`, rejects a changed
  replay body, and cannot duplicate side effects such as submissions, decisions, tasks, sends,
  or publishes.
- API writes preserve all existing UI-path invariants and are visible in the app without a second
  schema or business-rule implementation.
- A 500-row list stays inside the existing performance budget; cursor pagination does not cause
  N+1 reads, and public schedule responses are cacheable.
- An OpenAPI-driven client can complete the documented external integration against a live seeded
  Convex deployment, with audit evidence for each request.

## Risks and cut line

This is a 40–55h platform feature, beyond the competition brief and not appropriate to start
before the demo's requirements 1–6 are verified. The recommended cut line is after Phase A:
keep a genuinely useful, safe, documented public schedule API; do not claim an "entire app API"
until private resources, PAT controls, audit logs, and idempotency have shipped.

Do not ship a superficially broad API by proxying raw Convex functions, using a single permanent
admin key, or exposing all existing public-embed data. Those shortcuts undermine event isolation,
PII protection, and the application's idempotency guarantees.
