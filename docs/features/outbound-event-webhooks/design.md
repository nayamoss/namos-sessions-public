# Outbound Event Webhooks — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
No webhook tables exist. **Correction, 2026-08-12, post-merge:** #93 (merged as PR #98) did
**not** rename `events.startDate`/`endDate`/lowercase `status` internally — it deliberately kept
internal storage unchanged and maps to the documented public shape only at the response boundary,
in `convex/publicEventsApi.ts`'s `projectPublicEvent()`. The originally-planned schema rename
(Phase 1 below) never happened and is **no longer needed** — this is a lower-risk outcome than
this doc originally assumed, not a blocker. `events` today (unchanged by #93) still has
`startDate`/`endDate: v.number()` and `status: v.union(v.literal("draft"), v.literal("published"),
v.literal("archived"))`, plus the new optional `description`/`contactEmail`/`logoFileId`/
`programPublishedAt` fields #93 did add. This feature's payload builder must call
`projectPublicEvent()` (or an equivalent mapping) rather than assuming `events.status` is already
uppercase or `events.startsAt` exists as a column.

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| — | NEW TABLE | `webhooks` | see below | |
| — | NEW TABLE | `webhook_deliveries` | see below | |

```ts
webhooks: defineTable({
  url: v.string(),
  eventTypes: v.array(v.union(
    v.literal("event.created"), v.literal("event.updated"),
    v.literal("event.published"), v.literal("event.archived"),
  )),
  signingSecret: v.string(),          // shown once at creation, like the #93 API key reveal
  enabled: v.boolean(),
  createdByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}),
webhook_deliveries: defineTable({
  webhookId: v.id("webhooks"),
  eventType: v.string(),
  payload: v.string(),                // JSON string, so a redelivery resends byte-identical body
  attempt: v.number(),                // 1, 2, 3...
  status: v.union(v.literal("pending"), v.literal("success"), v.literal("failed"), v.literal("exhausted")),
  responseStatus: v.optional(v.number()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
}).index("by_webhook", ["webhookId"]),
```

### Migration
Purely additive — two new tables, nothing renamed. No backfill needed; existing data is
unaffected. **#93 is merged (PR #98, 2026-08-12) so this feature is unblocked** — the previous
hard dependency on a schema rename no longer applies (see the correction above); the only real
dependency was `api_keys`/`projectPublicEvent()` existing, which they now do.

---

## Backend / API

### Affected Existing Endpoints
| Method | Path | Change |
|--------|------|--------|
| (Convex mutation) | `events.save` | After a successful create/update, diff old vs. new `status` (lowercase `draft`/`published`/`archived`, as stored — do not compare against uppercase values) to determine the event type (`event.created` if new row, `event.published` if status became `published`, `event.archived` if it became `archived`, else `event.updated`), then call a new `webhooks.enqueueDeliveries` mutation with the payload built via `projectPublicEvent()` so the webhook body matches `/api/v1/events`'s documented shape exactly. |

### New Endpoints
| Method | Path | Request Body | Response |
|--------|------|---------------|----------|
| — | (Convex functions, not HTTP) | `webhooks.list/create/update/remove` (organizer-only), `webhookDeliveries.listForWebhook`, `webhookDeliveries.redeliver` | standard Convex query/mutation shapes |

No new public HTTP route is needed for this feature — the new HTTP direction is *outbound*
(Namos Sessions calling the organizer's URL), not inbound.

**Delivery mechanism:**
```ts
// convex/webhookDelivery.ts — internal action, scheduled via ctx.scheduler
export const send = internalAction({
  args: { deliveryId: v.id("webhook_deliveries") },
  handler: async (ctx, { deliveryId }) => {
    // 1. load delivery + its webhook
    // 2. sign: HMAC-SHA256(payload, webhook.signingSecret) → hex digest
    // 3. POST payload to webhook.url with header X-Takumi-Signature: sha256=<digest>
    // 4. record responseStatus + status (success on 2xx, failed otherwise)
    // 5. on failed and attempt < 3: schedule a retry via ctx.scheduler.runAfter with backoff
    //    (e.g. 30s, then 2min, then 5min), incrementing attempt; on the 3rd failure mark
    //    "exhausted"
  },
});
```
Payload shape (JSON body):
```json
{
  "type": "event.published",
  "id": "<delivery id, for idempotency on the receiver side>",
  "createdAt": "2026-08-12T00:00:00.000Z",
  "data": { /* same Event object shape documented in #93's /api-docs */ }
}
```

### Validation & Business Logic
- Webhook URL must be `https://` (reject `http://` at creation — organizer-facing validation
  error, not a 500 later).
- Signing secret generated server-side at creation (`crypto.randomBytes`-equivalent in Convex's
  runtime), shown once, never re-displayed — same one-time-reveal pattern as #93's API keys.
- Retries: exponential backoff, max 3 attempts, then `exhausted` — no infinite retry loop.
- "Redeliver" button re-sends the exact stored `payload` string as a fresh delivery row
  (attempt 1), so it's usable for both "my endpoint was briefly down" and "let me re-test my
  Zapier zap."

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/settings/ApiKeys.tsx` (from #93) | Add a "Webhooks" section below the existing API keys list — same page, not a new route, per FR-005. Consider renaming the page/route from "API" to "API & Webhooks" in the settings nav if it reads oddly otherwise — implementer's call, not a design blocker. |
| `src/pages/public/ApiDocs.tsx` (from #93) | Add a "Webhooks" section after the existing Errors card, per FR-006/FR-007. |

### New Components

**WebhooksSection** (rendered inside `ApiKeys.tsx`, not a separate route)
- Location: `/settings/api`, below the existing API-keys list, separated by whitespace only
  (`mt-12` — no `<hr>`, per the design system rules).
- Elements:
  - Section heading "Webhooks" (`text-lg font-semibold`) + subtitle "Get a push the moment an
    event changes." (`text-sm text-muted-foreground`).
  - Toolbar row: "Add webhook" button on the right (`bg-[#40745C] text-white rounded-[6px]`).
  - Webhook list: one `bg-neutral-100 rounded-[12px] p-4` card per webhook, `space-y-3` stack —
    URL (`font-mono text-sm`, truncated with ellipsis if long), event-type chips (plain text,
    comma-separated, `text-sm text-muted-foreground` — e.g. "created, published"), enabled/
    disabled toggle (`Switch` component), "View log" link, "Delete" button (`bg-neutral-200`).
  - Empty state: `bg-neutral-100 rounded-[12px] p-8`, centered, Lucide `Webhook` icon (size 40,
    muted), "No webhooks yet", "Get events pushed to Airtable, Zapier, or your own site the
    moment something changes.", CTA "Add webhook".
  - Add/edit flow: `Sheet` — URL text input (validated `https://`), checkbox group for event
    types (`event.created`/`event.updated`/`event.published`/`event.archived`), Cancel + Save.
    On create success, Sheet swaps to a one-time secret reveal (same pattern as the API key
    reveal): signing secret in a `font-mono` selectable block + Copy button + "This is the only
    time you'll see this secret." + Done.
  - Delivery log (`View log` opens a flex-sibling detail panel, `w-[420px]`, per the Detail
    Panel layout rule — never `position: fixed`): list of deliveries, newest first, each row —
    event type, timestamp, status badge (success = sage, failed/exhausted = dark red, pending =
    neutral), response code if any, "Redeliver" button per row. Empty state: "No deliveries yet."
  - Loading state: skeleton rows, same style as #93's API keys list.
  - Error state: inline `text-sm text-destructive` below the toolbar.
- Behavior: Add opens the Sheet; Save calls `webhooks.create`; toggling the `Switch` calls
  `webhooks.update({ enabled })` directly (no confirmation needed — reversible); Delete opens a
  `Dialog` confirmation ("Deletes this webhook and stops all future deliveries. Past delivery
  history is kept." / Cancel / Delete); "View log" opens the detail panel; "Redeliver" calls
  `webhookDeliveries.redeliver`.
- Data: `useQuery(api.webhooks.list)`, `useMutation` for create/update/remove,
  `useQuery(api.webhookDeliveries.listForWebhook, { webhookId })` when the log panel is open,
  `useMutation(api.webhookDeliveries.redeliver)`.

**ApiDocs "Webhooks" section** (added to #93's page, same file)
- Elements: heading "Webhooks", one-paragraph intro, event-types list (`event.created` /
  `event.updated` / `event.published` / `event.archived` — one line each), example payload
  (dark `<pre>` block, same styling as the existing curl/response examples), signature
  verification snippet (dark `<pre>`, showing `HMAC-SHA256(payload, secret)` compared against
  `X-Takumi-Signature`), and a short "Connecting to Airtable" callout card (`bg-neutral-100
  rounded-[12px] p-6`): "Create an Airtable Automation with a 'When a webhook is received'
  trigger, paste its URL here, then map the payload's `data` fields to your table columns in the
  Automation." with a link to Airtable's own docs for that trigger.
- Behavior/data: static, same as the rest of `/api-docs`.

---

## State / Data Flow
- Event save (organizer edits an event in the dashboard) → `events.save` mutation → diffs
  old/new status → `webhooks.enqueueDeliveries` inserts one `webhook_deliveries` row per enabled,
  subscribed webhook → schedules `webhookDelivery.send` via `ctx.scheduler.runAfter(0, ...)`.
- `webhookDelivery.send` → HTTP POST to the organizer's URL → patches its own delivery row with
  the result → on failure, schedules its own retry (same action, incremented attempt) until
  `exhausted`.
- Settings UI: reactive Convex queries re-render the webhook list and delivery log automatically
  on any of the above — no manual polling/refetch in the frontend.

---

## Auth / Permissions
- `webhooks.*` and `webhookDeliveries.*` Convex functions: organizer-only (`assertOrganizer`),
  same pattern as #93's `apiKeys.*`.
- The webhook URL itself is not authenticated by us — the receiver (Airtable Automation,
  Zapier catch hook, the organizer's own endpoint) is responsible for verifying the
  `X-Takumi-Signature` header if it wants to confirm the request really came from Namos Sessions.
  This is standard for outbound webhooks and is documented on `/api-docs`, not a gap.

---

## Edge Cases & Error States
- Organizer's endpoint is down when an event changes → delivery retries 3x with backoff, then
  `exhausted`; visible in the delivery log, not silently dropped.
- Organizer deletes a webhook mid-retry → in-flight scheduled retries for that webhook's
  deliveries should check `enabled`/existence before sending and no-op if the webhook is gone.
- Event changes rapidly (e.g. two saves in one second) → each save enqueues its own delivery;
  no de-duplication/coalescing in this version — documented as a known simplification, not a bug,
  since single-tenant volume is low.
- Malformed/`http://` webhook URL → rejected at creation with an inline validation message, never
  reaches the delivery worker.

---

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Webhooks live inside `/settings/api` rather than a new route | One page, new section | Keeps "how organizers get data out" in one place; matches the design system's whitespace-only separation rule instead of a new nav entry for a closely related concern. |
| Retry via Convex scheduler, not a queue service | `ctx.scheduler.runAfter` self-rescheduling action | No new infra (no queue/worker service) — Convex's own scheduler is sufficient at single-tenant volume; revisit if delivery volume grows. |
| Payload stored as a JSON string on the delivery row | `v.string()`, not `v.any()`/nested object | Guarantees a byte-identical "Redeliver" — re-signing a re-serialized object could subtly differ (key order, number formatting) from the original signed body. |
| No Airtable-specific connector code | Generic signed webhook + a docs callout | Airtable's own Automations "incoming webhook" trigger is the receiving end; building a bespoke Airtable client would duplicate what Airtable already provides, and this app already moved off treating Airtable as a first-class backend (see INDEX.md cut log, 2026-08-08). |

## Dependencies
**Requires:** #93 (public-events-api) merged and browser-verified first — this feature's
`events.save` hook and payload shape depend on #93's final field names (`startsAt`/`endsAt`,
`DRAFT`/`ACTIVE`/`ARCHIVED`) and Event object shape.
**Enables:** future webhook event types (speaker/session changes) can reuse the same
`webhooks`/`webhook_deliveries` tables and delivery worker.

## Risks & Mitigations
- **Risk:** starting this before #93 merges means building against field names that are about to
  change underneath it. **Mitigation:** hard sequencing dependency stated above and in plan.md —
  do not start Phase 1 until #93 is merged.
- **Risk:** a slow or hanging organizer endpoint could tie up the scheduler if not timeout-bound.
  **Mitigation:** the delivery action must set an explicit fetch timeout (e.g. 10s) and treat a
  timeout as a failed attempt, not a hung one.
- **Risk:** signing secrets sitting in `webhooks.signingSecret` in plaintext (not hashed, unlike
  #93's API keys) because the server needs the raw secret to sign every outgoing request.
  **Mitigation:** this is a legitimate architectural difference from API keys (server can't sign
  with a hash), not an oversight — document it, and treat this table with the same care as any
  other secret-bearing table (no exposing it in any list/log endpoint beyond the one-time reveal
  at creation).
