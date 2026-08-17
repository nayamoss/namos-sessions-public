# Public Events API — Technical Design

> **Partly superseded (2026-08-16).** This feature was designed when the app was
> single-tenant. It is now multi-tenant — see `docs/features/multi-tenant-organizations/`.
> Concretely: an API key is now scoped to the single event it was issued for, where this
> document describes it as instance-wide. Statements below about there being no
> `organizations` table no longer hold. Everything else still applies.

## Database / Schema Changes

### Current Schema (affected tables)
`convex/schema.ts`:
```ts
events: defineTable({
  name: v.string(), slug: v.string(), type: v.optional(v.string()), websiteUrl: v.optional(v.string()),
  location: v.optional(v.string()), timezone: v.string(), startDate: v.number(), endDate: v.number(),
  theme: v.optional(v.string()), logoStorageKey: v.optional(v.string()), backgroundStorageKey: v.optional(v.string()),
  exhibitorsEnabled: v.boolean(), sponsorsEnabled: v.boolean(), defaultOnboardingTemplateId: v.optional(v.id("task_templates")),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_slug", ["slug"]),
```
No `organizations`/`orgId` table exists. `organizers` is a flat table of `{ userId, email, role
(owner|admin), onboardingCompletedAt, createdAt }` — every organizer manages the same, single set
of events. There is no `api_keys` table today.

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| events | RENAME | `startDate` → `startsAt` | `v.number()` | same epoch-ms semantics, name only |
| events | RENAME | `endDate` → `endsAt` | `v.number()` | same epoch-ms semantics, name only |
| events | CHANGE | `status` literals | `"draft"→"DRAFT"`, `"published"→"ACTIVE"`, `"archived"→"ARCHIVED"` | value rename, not just the column |
| events | ADD COLUMN | `description` | `v.optional(v.string())` | new |
| events | ADD COLUMN | `contactEmail` | `v.optional(v.string())` | new |
| events | ADD COLUMN | `logoFileId` | `v.optional(v.string())` | new; distinct from existing `logoStorageKey` — see Technical Decisions |
| events | ADD COLUMN | `programPublishedAt` | `v.optional(v.number())` | new, epoch ms |
| — | NEW TABLE | `api_keys` | see below | |

```ts
api_keys: defineTable({
  label: v.string(),                 // organizer-chosen name, e.g. "Zapier integration"
  keyHash: v.string(),                // sha256 of the raw key; raw key never stored
  keyPrefix: v.string(),              // `sk_live_` plus 8 random chars, shown for identification
  createdByUserId: v.string(),        // organizer's Clerk identity.subject
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
}).index("by_keyHash", ["keyHash"]),
```

### Migration
This touches every existing reader/writer of `events.startDate`/`endDate`/`status` — this is the
single biggest risk in this feature (see Risks below). Files with `startDate`/`endDate`
references today: `convex/eventValidation.ts`, `convex/schema.ts`, `convex/seed.ts`,
`convex/events.ts`, `convex/publicForms.ts`, `src/data/types.ts`,
`src/components/availability/AvailabilityEditor.tsx`, `src/pages/portal/PortalAvailability.tsx`,
`src/pages/settings/EventDetails.tsx`, `src/pages/public/SubmissionPage.tsx`,
`src/pages/program/{Readiness,Availability,Agenda}.tsx`,
`src/pages/onboarding/OnboardingWizard.tsx`, and 5 test files.

Files with `events.status` literal `"draft"/"published"/"archived"` specifically (NOT the
same-named literals on `submissions`, `evaluations`, or `submission_forms`, which are unrelated
domains and must NOT be touched): `convex/events.ts`, `convex/schema.ts`, `convex/seed.ts`,
`src/pages/settings/EventDetails.tsx`, `src/pages/dashboard/DashboardHome.tsx`, plus any test
fixture that constructs an `events` row.

Migration steps, in order:
1. Add the new/renamed fields as additional optional columns first (`startsAt`, `endsAt`,
   uppercase `status` as a *second* optional field) rather than a hard rename, so existing rows
   don't break mid-deploy.
2. Write a one-off Convex mutation (`convex/migrations/eventsRenameFields.ts`, run manually via
   `npx convex run`) that backfills `startsAt = startDate`, `endsAt = endDate`,
   `status = uppercase(status)` for every existing row.
3. Update every file listed above to read/write the new field names.
4. Once all reads/writes are migrated and the backfill has run in every environment (dev +
   prod Convex deployments), drop `startDate`/`endDate` and the lowercase status literal from the
   schema.
5. Seed data (`convex/seed.ts`) gets the new field names and adds sample values for
   `description`, `contactEmail`, `logoFileId`, `programPublishedAt` on at least one seeded event.

Because this repo is single-tenant (no per-org migration boundary) and the events table is
expected to be small, a single backfill mutation run once per environment is sufficient — no
batching/cursor logic needed.

---

## Backend / API

### Affected Existing Endpoints
None — `convex/http.ts` is currently an empty router. `convex/events.ts`'s existing
`list`/`get`/`getBySlug`/`save` queries and mutations are internal (Convex client SDK only) and
are unaffected by adding a new HTTP route, aside from reading/writing the renamed fields per the
migration above.

### New Endpoints
| Method | Path | Request Body | Response |
|--------|------|---------------|----------|
| GET | `/api/v1/events` | none (Bearer token in `Authorization` header) | `{ data: Event[] }` — see schema below |

Convex HTTP action, `convex/http.ts`:
```ts
http.route({
  path: "/api/v1/events",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    // 1. extract + validate Bearer token → 401 if missing/malformed
    // 2. hash token, look up api_keys by_keyHash, reject if not found or revokedAt set → 401
    // 3. patch lastUsedAt (fire-and-forget mutation)
    // 4. return { data: <all events, all statuses> } shaped per Event Object below
  }),
});
```

**Event object** (documented + returned):
```
id                  string   Convex document id
name                string
slug                string
status              "DRAFT" | "ACTIVE" | "ARCHIVED"
websiteUrl          string | null
location            string | null
timezone             string
startsAt            string   ISO 8601 (converted from the stored epoch-ms number)
endsAt              string   ISO 8601
description         string | null
programPublishedAt  string | null   ISO 8601
contactEmail        string | null
logoFileId          string | null
createdAt           string   ISO 8601
updatedAt           string   ISO 8601
```
No `orgId` field — see Technical Decisions.

### Validation & Business Logic
- Missing/malformed `Authorization` header → `401` `{ code: "unauthorized", message: "Missing or malformed API key." }`
- Well-formed but unknown/revoked key → `401` `{ code: "unauthorized", message: "Invalid or revoked API key." }`
- Any unhandled error inside the handler → `500` `{ code: "internal_error", message: "Something went wrong." }`, with the cause logged through the Convex runtime's supported server console. No Node-only Sentry integration is claimed for HTTP actions.
- `400`/`403` are documented for parity with opensession's page (malformed query params;
  key valid but disabled account) but this endpoint has no query params and no per-key
  permission tiers yet, so they are reserved/unreachable today — call this out explicitly on the
  docs page rather than silently omitting them, so the contract doesn't change shape later.
- No background jobs/queues/webhooks.

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/App.tsx` | Add `<Route path="/api-docs" element={<ApiDocs />} />` outside `<RequireAuth>`, alongside `/e/:eventSlug/:feed`. Add `<Route path="/settings/api" element={<ApiKeys />} />` inside the existing authenticated settings routes. |
| `src/pages/settings/EventDetails.tsx` | Update any inline status label/badge logic to the new `DRAFT`/`ACTIVE`/`ARCHIVED` values. |
| `src/pages/dashboard/DashboardHome.tsx` | Update status filtering/labels to new enum values. |
| Settings nav (wherever `/settings/email`, `/settings/event`, etc. are listed as nav links — check `AppLayout.tsx`/settings layout) | Add an "API" nav entry linking to `/settings/api`. |

### New Components

**ApiDocs**
- File: `src/pages/public/ApiDocs.tsx`
- Props: none (route-level page, reads no route params)
- Location: public route `/api-docs`, no `AppLayout`, no `AuthGuard` — same pattern as
  `EmbedPage.tsx`/`SubmissionPage.tsx`. Rendered standalone with its own minimal header (product
  name/logo, link back to marketing site or `/sign-in`).
- Layout: a conventional API-reference shell, not a marketing column or card stack:
  - compact product header across the top;
  - sticky section navigation on the left;
  - readable contract documentation in the center;
  - sticky request/response code rail on wide screens, stacked after the operation on narrow
    screens.
- Elements:
  1. **Product header** — Takumi Talks identity, "API reference" context, and a quiet link back
     to the product. It establishes that this is documentation before the endpoint content.
  2. **Section navigation** — Overview, Authentication, List events, Event object, and Errors.
     Anchor links use the browser's native document behavior and remain visible on desktop.
  3. **Overview** — "Events API" title, concise purpose, version/base URL metadata, and the
     response format. Use restrained typography; no decorative badge cluster.
  4. **Authentication** — explain `Authorization: Bearer <key>` and conditionally link
     "Settings → API" when `useAuth().isSignedIn` is true; plain text otherwise.
  5. **Operation** — a descriptive heading, "List all events", is primary. A full-width endpoint
     strip below it shows the unmistakable HTTP method label `GET REQUEST` and
     `/api/v1/events`; the method is supporting metadata, never the only prominent copy.
  6. **Code rail / Request** — dark, horizontally scrollable code surface containing:
     ```
     curl https://<your-domain>/api/v1/events \
       -H "Authorization: Bearer sk_live_..."
     ```
     The same rail shows a realistic `200 OK` JSON response and stays aligned with the operation
     rather than becoming an unrelated oversized block later on the page.
  7. **Response contract** — explicitly show `200 OK` and `{ data: Event[] }`, followed by a
     dense field definition list with field name, type/nullability, and description for every
     documented field. No bordered table and no generic gray card around the entire schema.
  8. **Errors** — show the shared `{ code, message, details }` envelope and one row per status
     (400, 401, 403, 500). State that 400/403 are reserved/currently unreachable.
  9. **Footer note** — "No rate limit today — fair use applies."
  - No empty/loading/error state needed — this is static content, no data fetching.
- Behavior: purely static/read-only page. The one dynamic bit is the "Settings → API" link,
  which is a real `<Link>` to `/settings/api` when `useAuth().isSignedIn` is true, and plain
  unlinked text otherwise.
- Data: none from Convex. Optionally reads Clerk's `useAuth()` for the sign-in check above.
- Third-party: none new. Uses existing Clerk `useAuth` hook already used elsewhere in the app.

**ApiKeys**
- File: `src/pages/settings/ApiKeys.tsx`
- Props: none (route-level page)
- Location: `/settings/api`, inside the existing authenticated settings shell (same layout as
  `EmailDelivery.tsx`/`EventDetails.tsx` — organizer-only, gated by the existing
  `RequireAuth`/organizer check).
- Elements:
  - Page header: title "API" only through `AppLayout`. The body begins with
    `text-sm text-muted-foreground` copy: "Manage keys for the Events API."
  - Toolbar row below header: empty on the left (no filters — keys list is small), "Generate key"
    button on the right (`bg-[#40745C] text-white rounded-[6px]`, no border/shadow).
  - Content area:
    - **Keys list**: one card per key (`bg-neutral-100 rounded-[12px] p-4`, stacked
      `space-y-3`, no dividers): label (bold), key prefix (`font-mono text-sm
      text-muted-foreground`, e.g. `sk_live_a1b2c3d4••••••••`), "Created <date>" and "Last used
      <date>" or "Never used" (`text-sm text-muted-foreground`), "Revoke" button (secondary style
      `bg-neutral-200`, right-aligned) that opens a `Dialog` confirmation ("This immediately stops
      the key from working. This can't be undone." / Cancel / Revoke [destructive: dark red bg,
      white text]).
    - **Empty state** (no keys yet): card (`bg-neutral-100 rounded-[12px] p-8`), centered, Lucide
      `KeyRound` icon (size 40, muted), heading "No API keys yet", subtext "Generate a key to
      start pulling your events into another tool.", CTA button "Generate key" (same accent style
      as the header button).
  - **Generate key flow**: clicking "Generate key" opens the canonical inline `DetailPane`, which
    pushes the list narrower on desktop and stacks below it on small screens, with a `label` text input ("What's this key for?",
    placeholder "e.g. Zapier integration"), Cancel + "Generate" buttons. On submit, calls the
    repository operation, then the pane's content swaps to a one-time reveal: the raw key in a
    `font-mono` selectable text block with a "Copy" button and the text "This is the only time
    you'll see this key — store it somewhere safe.", then a "Done" button that closes the pane
    and refreshes the list (raw key is never shown again after this).
  - Loading state: skeleton rows (`bg-neutral-100 rounded-[12px] h-16 animate-pulse`) while the
    keys query is in flight.
  - Error state: inline `text-sm text-destructive` line below the toolbar if the generate/revoke
    mutation fails, with a "Try again" link — no modal.
- Behavior: "Generate key" opens the inline pane described above. "Revoke" opens the confirmation
  Dialog; confirming calls the revoke mutation and removes the card from the list (optimistic or
  on mutation success). Copy button uses `navigator.clipboard.writeText`.
- Data: repository methods backed by organizer-gated Convex functions —
  `list` (query, organizer-only, returns `{ id, label, keyPrefix, createdAt, lastUsedAt,
  revokedAt }[]`, never the hash), `generate` (server action, organizer-only, creates the row, returns
  the raw key exactly once), `revoke` (mutation, organizer-only, sets `revokedAt`).
- Third-party: none new.

---

## State / Data Flow
- **ApiDocs**: fully static JSX, no data flow beyond the Clerk `isSignedIn` check for the one
  conditional link.
- **ApiKeys**: `useRepo().apiKeys.list()` → renders cards/empty state. "Generate" calls
  `useRepo().apiKeys.generate()`, result (raw key) held in local component state only, never
  persisted client-side beyond the pane's lifetime, cleared on close. "Revoke" calls
  `useRepo().apiKeys.revoke()`; the page refreshes its list after successful writes. The Convex
  transport maps these operations to organizer-gated functions; Airtable fails closed.
- **GET /api/v1/events**: external caller → Convex HTTP action → hash+lookup in `api_keys` →
  `ctx.db.query("events").collect()` → map to the documented shape → JSON response.

---

## Auth / Permissions
- `/api-docs`: public, no auth, no organizer check — anyone with the URL can read it.
- `/settings/api` (UI): organizer only (owner or admin role), same `assertOrganizer` guard used
  by every other settings/`convex/events.ts` mutation. Never client-input-derived — checked via
  `requireIdentity`/`assertOrganizer` server-side in Convex, per this account's
  database-backed-role standard.
- `GET /api/v1/events` (HTTP): key-based, not session-based. Any valid, non-revoked key returns
  the same data — there are no per-key scopes/permissions yet (documented as a known gap, not a
  silent omission).

---

## Edge Cases & Error States
- No events exist yet → `{ data: [] }`, `200`. Docs page shows this explicitly in the schema
  section ("data is always an array, possibly empty").
- Key revoked mid-use → next request after revocation returns `401` immediately (no caching of
  key validity).
- Organizer deletes their last remaining key → `ApiKeys` page falls back to its empty state; any
  external integration using the deleted key starts getting `401`s (expected, documented on the
  docs page: "revoking a key breaks anything using it immediately").
- Migration edge case: any in-flight request or open browser tab reading `event.startDate` during
  the deploy window that ships the rename — mitigated by shipping the additive backfill (step 1–2
  above) before the field-name cutover (step 3–4), so there's no window where a row has one name
  but not the other.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| `orgId` on the Event object | **Omit it.** Document its absence explicitly on the API docs page rather than faking a value. | **Superseded — the app is now multi-tenant** (`organizations` table, see `docs/features/multi-tenant-organizations/`). The original rationale was that no `organizations` table existed, so a fake/constant `orgId` would be misleading API surface. Now that a real one exists, exposing `orgId` on the public Event object is a reasonable additive change, but it is deliberately not part of the tenancy fix — the API surface change should be designed on its own. |
| `logoFileId` vs. existing `logoStorageKey` | New, separate field — do not repurpose `logoStorageKey`. | `logoStorageKey` is Convex file-storage-specific and not meant for external consumption as-is. `logoFileId` is a new, API-facing field; how it's populated (e.g. mirrored from `logoStorageKey` on save, or independently set) is an implementation detail for the build phase, not a design blocker. |
| Additive-then-cutover migration vs. a single hard rename | Additive first (Migration steps 1–4) | The events table is read/written from ~18 files across Convex functions, pages, and tests (see Migration section). A hard rename in one commit risks a broken deploy window; additive-then-cutover has zero downtime risk at the cost of one extra migration mutation. |
| Raw API key storage | Never stored — only `keyHash` (sha256) + `keyPrefix` (first 8 chars, cosmetic) persisted. | Standard practice; matches how this account already treats every other secret (see global "never hardcode secrets" rule) — a leaked database dump must not leak usable keys. |
| Key scope | **Per-event.** A key returns only the event it was issued for. | Superseded. This originally read "instance-wide (any key, any organizer, sees all events)" because no org boundary existed. That was a cross-tenant read: keys are issued per-event (`convex/apiKeys.ts`) but `http.ts` called an unscoped `listForApi`. `http.ts` now passes the authenticated key's own `eventId`. Broader per-key scoping (read-only vs. read-write) remains a future improvement. |

## Dependencies
**Requires:** nothing outstanding — the dedicated Clerk application, Convex JWT template, and
development/production Convex deployments were provisioned and verified on 2026-08-12.
**Enables:** future endpoints (`GET /api/v1/events/:slug`, speakers, sessions) can reuse the same
`api_keys` auth helper once it exists.

## Risks & Mitigations
- **Risk:** the `startDate`/`endDate`/status rename touches ~18-24 files across backend, pages,
  and tests — the largest part of this issue's blast radius, larger than the API endpoint itself.
  **Mitigation:** the plan below sequences schema/migration work as its own phase, fully done and
  tested, before any API or UI work starts on top of it. Do not parallelize the rename with the
  new endpoint/pages.
- **Risk:** an API key with no scoping returns every event regardless of status (including
  drafts) to anyone holding a valid key. **Mitigation:** this is documented as an explicit,
  intentional decision above (single-tenant, no per-key scopes yet) — not a silent gap. Flagged
  again here so it isn't missed in review.
- **Risk:** revoked/leaked keys have no rotation reminder or expiry. **Mitigation:** out of
  scope for this issue; note it in the docs page footer and revisit if abuse becomes a problem.
