# Outbound Event Webhooks — Implementation Plan

> ✅ #93 merged as PR #98 (2026-08-12) — this feature is unblocked, start whenever.
>
> **Correction, 2026-08-12:** #93 did NOT rename `events.startDate`/`endDate`/lowercase `status`
> internally — it maps to the documented shape only at the response boundary
> (`convex/publicEventsApi.ts`'s `projectPublicEvent()`). Build this feature's payload the same
> way: call `projectPublicEvent()` for the webhook body, and diff `events.save`'s status against
> the actual stored lowercase values (`draft`/`published`/`archived`), not uppercase. See
> design.md's Migration section for the full correction.

## Phase 1: Schema
- [ ] T001: Add `webhooks` and `webhook_deliveries` tables to `convex/schema.ts` per design.md.

## Phase 2: Enqueue on Event Change
- [ ] T002: `convex/webhooks.ts` — `list`/`create`/`update`/`remove` (organizer-only), URL
      validated as `https://` at creation, signing secret generated + returned once on create.
- [ ] T003: `convex/webhooks.ts` — `enqueueDeliveries(eventId, eventType, payload)` internal
      mutation: inserts one `webhook_deliveries` row per enabled webhook subscribed to
      `eventType`, schedules `webhookDelivery.send` for each via `ctx.scheduler.runAfter(0, ...)`.
- [ ] T004: Update `convex/events.ts`'s `save` mutation to diff old vs. new status (stored
      lowercase: `draft`/`published`/`archived`) after a successful write and call
      `enqueueDeliveries` with the correct event type
      (`event.created`/`event.updated`/`event.published`/`event.archived`) and the payload built
      via `projectPublicEvent()` from `convex/publicEventsApi.ts`, so it's byte-identical in shape
      to `/api/v1/events`'s response.

## Phase 3: Delivery Worker
- [ ] T005: `convex/webhookDelivery.ts` — `send` internal action: HMAC-SHA256 sign, POST with a
      10s timeout, record `responseStatus`/`status` on the delivery row, self-reschedule with
      backoff (30s/2min/5min) up to 3 attempts, then mark `exhausted`.
- [ ] T006: `convex/webhookDeliveries.ts` — `listForWebhook` query (organizer-only),
      `redeliver` mutation (re-sends the stored `payload` string as a fresh delivery row).
- [ ] T007: Manual verification: point a webhook at a local echo server (e.g.
      `webhook.site` or a throwaway Convex http action), change an event's status in the app,
      confirm the POST arrives with a valid signature; then point it at a dead URL and confirm 3
      retries + `exhausted` show up in the delivery log.

## Phase 4: Frontend UI (REQUIRED — see UI Spec below)

> ⚠️ A feature is NOT done until it is visible and usable in the UI.

### UI Spec

**WebhooksSection** — added to `src/pages/settings/ApiKeys.tsx` (from #93), below the API keys
list, `mt-12` whitespace separation, no `<hr>`:
- Section heading "Webhooks" (`text-lg font-semibold`) + subtitle "Get a push the moment an
  event changes." Toolbar: "Add webhook" button, right-aligned, same accent style as the API
  keys page.
- Webhook list: `bg-neutral-100 rounded-[12px] p-4` cards, `space-y-3` — URL (`font-mono text-sm`,
  truncated), event-type chips as plain comma-separated text, enabled `Switch`, "View log" link,
  "Delete" button.
- Empty state: `bg-neutral-100 rounded-[12px] p-8`, Lucide `Webhook` icon (size 40, muted), "No
  webhooks yet", "Get events pushed to Airtable, Zapier, or your own site the moment something
  changes.", CTA "Add webhook".
- Add/edit `Sheet`: URL input (validated `https://`), event-type checkboxes, Cancel/Save. On
  create, swaps to one-time secret reveal (font-mono block + Copy + "only time you'll see this" +
  Done).
- Delivery log: flex-sibling detail panel (`w-[420px]`, never `position: fixed`) — rows of event
  type, timestamp, status badge (success=sage, failed/exhausted=dark red, pending=neutral),
  response code, "Redeliver" button. Empty: "No deliveries yet."
- Delete: `Dialog` confirm — "Deletes this webhook and stops all future deliveries. Past delivery
  history is kept." / Cancel / Delete.
- Loading: skeleton rows matching the API keys list style. Error: inline
  `text-sm text-destructive` below the toolbar.
- Data: `useQuery(api.webhooks.list)`, create/update/remove mutations, `useQuery
  (api.webhookDeliveries.listForWebhook, { webhookId })` when a log panel is open,
  `useMutation(api.webhookDeliveries.redeliver)`.

**ApiDocs "Webhooks" section** — added to `src/pages/public/ApiDocs.tsx` (from #93), after the
existing Errors card:
- Heading "Webhooks", intro paragraph, event-types list, example payload (dark `<pre>`, matching
  existing code-block styling), signature-verification snippet (dark `<pre>`), and a "Connecting
  to Airtable" callout card (`bg-neutral-100 rounded-[12px] p-6`) explaining the Airtable
  Automations "When a webhook is received" trigger, with a link to Airtable's docs.

### Tasks
- [ ] T008: Build `WebhooksSection` with every element above; wire to Phase 2/3
      queries/mutations; handle loading, empty, error states.
- [ ] T009: Add the "Webhooks" section + "Connecting to Airtable" callout to `ApiDocs.tsx`.
- [ ] T010: Verify end-to-end in a real browser: add a webhook pointed at a test endpoint, change
      an event, confirm the delivery log shows a success within seconds; kill the test endpoint,
      change the event again, confirm 3 retries then `exhausted` in the log; click Redeliver on a
      past delivery and confirm a fresh attempt appears; delete the webhook and confirm no further
      deliveries occur.

## Task Dependencies
Everything here depends on #93 being merged first (see the hard dependency note at the top).
Within this issue: Phase 1 blocks Phase 2, Phase 2 blocks Phase 3 (delivery needs something to
deliver), Phase 4's `WebhooksSection` needs Phase 2+3; the `ApiDocs` addition needs nothing but is
easiest written last so its example payload can be copy-checked against a real delivery.

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Feature is accessible and usable in the UI, not just implemented in the backend
- [ ] A real delivery's signature verifies correctly using the documented HMAC method
- [ ] Failed deliveries retry with backoff and land in `exhausted`, not silently disappear
- [ ] Redeliver produces a byte-identical payload to the original
- [ ] Full test suite green
- [ ] Docs updated if needed (this folder)
