# Communications, Reminders, and Calendar Invite Delivery/Recovery — Design

**Last Updated:** 2026-08-17
**Status:** Planned — not implemented

## Current implementation (verified 2026-08-17)

| Concern | Location | State |
|---|---|---|
| Templates | `comms_templates` (`convex/schema.ts:568-584`) — kinds `submission_confirmation`, `acceptance`, `rejection`, `consolidated_decision`, `reminder`, `calendar_invite`, `custom`; `convex/comms.ts:24-70`; editor `CommTemplateEditor.tsx` | Complete |
| Token resolution | `resolveCommTemplate` + `CommTemplateTokens` (speakerName, eventName, sessionTitle, portalUrl, scheduleTime, location, videoUrl); `src/test/comms-template-tokens.test.ts` | Complete |
| Previews | `comms.previewDecision`, `previewReminder`, `previewConsolidatedDecision` | Complete |
| Sends | `convex/commsActions.ts` — `sendDecision`, `sendReminder`, `sendConsolidatedDecision`; each `assertEventOrganizerAction` first | Complete |
| Rendering | React Email components in `src/emails/`, rendered server-side via `@react-email/render` | Complete |
| Calendar | ICS built from `agenda_items.calendarUid` / `calendarSequence`; sequence bumped only on title/room/time/url/location change (`convex/agenda.ts:243-252`); attached as `text/calendar; charset=utf-8; method=REQUEST` | Complete |
| Delivery | `convex/emailDelivery.ts` + `email_integrations` (Resend / SES, `credentialEnvelope`) | Complete |
| Evidence | append-only `comms_log`; written **before** outcome for confirmations (`convex/schema.ts:667-672`) | Complete |
| Reviewer nudges | `convex/reviewerRemindersActions.ts` | Complete |
| Notifications | `notifications` table incl. `comms_delivery_failed`; `notificationEmailActions` | Complete |
| Scheduling | **absent** — no `convex/crons.ts`; `ctx.scheduler` used only as `runAfter(0)` in `notifications.ts:94`, `portalFormResponses.ts:91`, `publicForms.ts:306` | **Missing** |
| Retry | **absent** | **Missing** |

## Schema changes

### New — `comms_schedules`

One row per event per automated communication kind. Configuration is data, not code (FR-002).

```ts
comms_schedules: defineTable({
  eventId: v.id("events"),
  // Only kinds that make sense unattended. Decisions are deliberately excluded: an acceptance
  // must never be sent by a timer.
  kind: v.union(v.literal("task_overdue_reminder"), v.literal("task_due_soon_reminder")),
  enabled: v.boolean(),
  templateId: v.optional(v.id("comms_templates")),
  // Hours before (due_soon) or after (overdue) the task due date at which a speaker becomes
  // eligible.
  offsetHours: v.number(),
  // Minimum hours between two reminders to the same speaker for the same kind.
  cooldownHours: v.number(),
  // Set when the schedule is first enabled. Tasks that were already overdue before this moment
  // are never retro-reminded (NFR-004).
  activatedAt: v.optional(v.number()),
  lastRunAt: v.optional(v.number()),
  lastRunSummary: v.optional(v.string()),
  updatedByUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"])
  .index("by_enabled", ["enabled"]),
```

### New — `comms_dispatch_keys`

The idempotency ledger for automated sends (NFR-002).

```ts
comms_dispatch_keys: defineTable({
  eventId: v.id("events"),
  speakerId: v.id("speakers"),
  kind: v.string(),
  // Floor of now to the cooldown window. Two passes inside one window produce the same key.
  windowStart: v.number(),
  commsLogId: v.optional(v.id("comms_log")),
  createdAt: v.number(),
}).index("by_key", ["eventId", "speakerId", "kind", "windowStart"])
  .index("by_event", ["eventId"]),
```

### Changed — `comms_log`

```ts
// Both optional: rows written before retry bookkeeping existed stay valid.
attemptCount: v.optional(v.number()),        // 1 for a first attempt
lastAttemptAt: v.optional(v.number()),
retryOfLogId: v.optional(v.id("comms_log")), // links a retry back to the failure it recovers
// "schedule:task_overdue_reminder" for automated sends, "user:<subject>" for manual ones.
dispatchedBy: v.optional(v.string()),
```

`comms_log` stays append-only. A retry **inserts** a new row referencing the old one; nothing is
mutated.

## Convex functions

### New — `convex/crons.ts`

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Hourly, not per-minute: the shortest meaningful reminder cadence here is hours, and an hourly
// pass keeps the dispatch cheap on a free-tier deployment.
crons.hourly("comms reminder dispatch", { minuteUTC: 5 }, internal.commsScheduler.dispatchDue);
export default crons;
```

### New — `convex/commsScheduler.ts`

```ts
// Dispatch only. It must not send. One slow provider must never stall the pass (FR-001).
export const dispatchDue = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. runQuery(internal.commsScheduler.enabledSchedules) — index by_enabled
    // 2. for each schedule:
    //      runQuery(internal.commsScheduler.eligibleSpeakers, { scheduleId })
    //        → speakers with an onboarding_task past/near due, task not completed,
    //          task.updatedAt >= schedule.activatedAt, speaker email non-empty
    //      for each eligible speaker:
    //        runMutation(internal.commsScheduler.claimDispatch, { ..., windowStart })
    //          → inserts into comms_dispatch_keys; returns false if the key already exists
    //        if claimed: ctx.scheduler.runAfter(0, internal.commsScheduler.sendScheduledReminder, {...})
    // 3. runMutation(internal.commsScheduler.recordRun, { scheduleId, summary })
  },
});

export const sendScheduledReminder = internalAction({
  args: { eventId: v.id("events"), speakerId: v.id("speakers"), taskId: v.optional(v.id("onboarding_tasks")), dispatchKeyId: v.id("comms_dispatch_keys") },
  // Reuses the existing render/deliver/recordAttempt path from commsActions.sendReminder.
  // Writes dispatchedBy: "schedule:<kind>" and links commsLogId back onto the dispatch key.
});
```

**Why claim-then-send rather than send-then-record:** the claim is a mutation and therefore atomic.
Two overlapping passes cannot both claim the same `(eventId, speakerId, kind, windowStart)`.

**No email integration configured:** `eligibleSpeakers` checks for an `email_integrations` row for
the event and returns empty with a recorded reason, so the pass does not enqueue sends that are
guaranteed to fail (FR: acceptance criterion 4).

### New — `convex/commsActions.ts` `retry`

```ts
export const retry = action({
  args: { eventId: v.id("events"), commsLogId: v.id("comms_log") },
  handler: async (ctx, args) => {
    // assertEventOrganizerAction(ctx, args.eventId)
    // load the log row; assert row.eventId === args.eventId
    // assert row.status === "failed"          → a sent row is never retryable
    // assert (row.attemptCount ?? 1) < MAX_MANUAL_ATTEMPTS
    // re-derive context from row.submissionId / row.speakerId / row.templateId and re-invoke the
    // matching send path; write a NEW comms_log row with retryOfLogId = args.commsLogId
  },
});
```

Re-deriving from the linked records rather than replaying a stored payload is deliberate: a retry
should send the *current* truth (the session may have been rescheduled since the failure), and
storing rendered bodies in `comms_log` would put speaker PII in an append-only table.

### New — `convex/comms.ts` `listSchedules` / `saveSchedule`

Organizer-gated (`assertEventOrganizerAccess`). `saveSchedule` sets `activatedAt = Date.now()` on
the transition from disabled to enabled, and leaves it alone otherwise (NFR-004).

## Authorization

| Function | Guard |
|---|---|
| `crons` → `dispatchDue` | Internal. No identity; no public entry point. Not exposed over HTTP |
| `sendScheduledReminder` | `internalAction`, reachable only from the dispatcher |
| `retry` | `assertEventOrganizerAction` |
| `listSchedules` / `saveSchedule` | `assertEventOrganizerAccess` |
| `listLog` | unchanged — organizer-scoped |

No new environment secret. The scheduler runs inside Convex (NFR-001).

## UI

`src/pages/program/Communications.tsx`, regrouped into three sections. Copy and ordering only — no
new layout primitives, no dividers, no borders.

**1. Templates** — existing list, grouped by kind with a plain-language description of when each is
used.

**2. Automation** (new)

| State | Render |
|---|---|
| No schedules | "Reminders are sent manually" with an enable action |
| Enabled | Kind, offset, cooldown, `Last run 14:05 · 3 reminders dispatched` |
| Enabled, never run | "Scheduled — first pass runs within the hour" |
| Enabled, no email provider | Warning linking to Integrations; sends are not attempted |
| Just enabled | Explicit note: existing overdue tasks are not retro-reminded |

**3. Delivery log** — existing table plus a `Retry` action on `failed` rows only. A retried row
shows "Retried — see attempt 2"; the retry row shows "Retry of an earlier attempt". Both remain
visible; nothing is collapsed away.

**Loading / empty / error:** existing skeletons; empty log states name the reason ("No messages
sent yet") rather than a generic empty; a retry failure renders inline via `role="alert"` and the
new failed row appears in the log.

## Seed changes

1. Templates for every kind (currently only `Speaker reminder`), all `@seed.invalid`-safe.
2. `comms_log` rows with `channel: "calendar_invite"` for the scheduled seeded sessions — status
   `sent`, tied to the same speakers as the agenda fixtures.
3. One `failed` row with `attemptCount: 1` so the retry control has a live target in the demo.
4. One `comms_schedules` row, `enabled: false`, so the automation section demonstrates its
   configuration without the demo emitting mail.

**Item 4 matters:** an enabled schedule in a seeded demo would try to send to `@seed.invalid`
addresses on every hourly pass. Seeded schedules stay disabled.

## Risks

| Risk | Mitigation |
|---|---|
| A newly enabled schedule mails every historically overdue speaker | `activatedAt` baseline (NFR-004), surfaced in the UI |
| Two overlapping passes double-send | Atomic claim into `comms_dispatch_keys` before dispatch |
| Cron mails seeded `@seed.invalid` addresses forever | Seeded schedules are disabled; eligibility requires an `email_integrations` row |
| Retry re-sends stale content | Retry re-derives from live records rather than replaying a payload |
| Retry loops | `attemptCount` bound plus failed-only eligibility |
| "Sent" read as "delivered" | Copy says the provider accepted it; bounce tracking is explicitly out of scope |
</content>
