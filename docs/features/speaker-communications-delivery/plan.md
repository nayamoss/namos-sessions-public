# Communications, Reminders, and Calendar Invites — Plan

**Status:** Planned — DO NOT IMPLEMENT YET
**Phase in `kill-my-saas-brief/plan.md`:** 6, with the seed slice folded into Phase 1
**Note:** this introduces the **first cron in this codebase**. Treat the cron itself as a reviewable
change in its own right, not an incidental detail of the reminder feature.

## Task breakdown

### T1 — Seed communications evidence (Phase 1, do first, standalone)

**Files:** `convex/seed.ts`

1. Templates for all seven kinds, replacing the single `Speaker reminder` fixture.
2. `comms_log` rows with `channel: "calendar_invite"` linked to the seeded agenda items and their
   speakers.
3. One `failed` row with `attemptCount: 1`.
4. One `comms_schedules` row with `enabled: false`.

This alone moves requirement 3 from invisible to visible and ships without the cron.

### T2 — Schema

**Files:** `convex/schema.ts`

`comms_schedules`, `comms_dispatch_keys`, and the four optional `comms_log` fields. All additive;
no migration required because every new `comms_log` field is optional.

### T3 — Schedule CRUD

**Files:** `convex/comms.ts`, `src/data/repo.ts`, `src/data/types.ts`

`listSchedules`, `saveSchedule` (organizer-gated; sets `activatedAt` on the disabled→enabled
transition only).

### T4 — Dispatcher

**Files:** `convex/commsScheduler.ts` (new), `convex/crons.ts` (new)

Per `design.md`. Implementation notes:

- `dispatchDue` is an `internalAction`; every database touch goes through `runQuery` / `runMutation`.
- `claimDispatch` is the only place that inserts into `comms_dispatch_keys`, and it checks
  `by_key` first. It returns `false` rather than throwing when the key exists.
- `windowStart = Math.floor(now / (cooldownHours * 3_600_000)) * (cooldownHours * 3_600_000)`.
- Eligibility requires: task not `completed`, due date crossed by `offsetHours`,
  `task.updatedAt >= schedule.activatedAt`, speaker email non-empty, and an `email_integrations`
  row for the event.
- `recordRun` writes `lastRunAt` and a human-readable `lastRunSummary`.

### T5 — Retry

**Files:** `convex/commsActions.ts`, `src/pages/program/Communications.tsx`

`retry` action per `design.md`. It re-derives context; it does not replay a stored body.

### T6 — Communications page regrouping

**Files:** `src/pages/program/Communications.tsx`

Three sections — Templates, Automation, Delivery log. Retry on failed rows only. Copy states that
`sent` means the provider accepted the message.

### T7 — Docs

`docs/features/INDEX.md`, `docs/features/comms-notifications/` cross-reference,
`docs/deployment/production.md` (note that a cron now exists and what it does).

## Test cases

| ID | Type | Case | Expected |
|---|---|---|---|
| TC-1 | unit | `windowStart` for two times inside one cooldown window | Identical value |
| TC-2 | unit | `claimDispatch` twice with the same key | Second returns false; one row exists |
| TC-3 | unit | Eligibility with a completed task | Not eligible |
| TC-4 | unit | Eligibility with a task overdue **before** `activatedAt` | Not eligible (no retro-reminders) |
| TC-5 | unit | Eligibility with no `email_integrations` row | Not eligible; skip recorded |
| TC-6 | unit | Eligibility with an empty speaker email | Not eligible |
| TC-7 | unit | Dispatcher with 3 eligible speakers | 3 claims, 3 scheduled sends, `lastRunSummary` written |
| TC-8 | unit | Dispatcher run twice in one window | 3 claims total, not 6 |
| TC-9 | unit | `saveSchedule` disabled→enabled | `activatedAt` set to now |
| TC-10 | unit | `saveSchedule` enabled→enabled with a changed offset | `activatedAt` unchanged |
| TC-11 | contract | `retry` on a `sent` row | Rejected |
| TC-12 | contract | `retry` on a `failed` row from another event | Rejected |
| TC-13 | unit | `retry` on a `failed` row | New row with `retryOfLogId` and `attemptCount: 2`; original row unmodified |
| TC-14 | unit | `retry` past the attempt bound | Rejected with a stated reason |
| TC-15 | unit | ICS for a session re-sent after a room change | Same `UID`, `SEQUENCE` incremented (extends `calendar-invite.test.ts`) |
| TC-16 | unit | ICS content | Exactly one `BEGIN:VCALENDAR`; `text/calendar; charset=utf-8; method=REQUEST` (existing assertions preserved) |
| TC-17 | contract | `dispatchDue` reachable over HTTP | Not routed; `convex/http.ts` unchanged (extends `http-route-auth.test.ts`) |
| TC-18 | contract | `listSchedules` called by a reviewer | Organizer-access error |
| TC-19 | seed | Seed twice | No duplicate templates, log rows, or schedules |
| TC-20 | contract | Automated send | `comms_log.dispatchedBy` starts with `schedule:` |

Existing suites that must stay green: `calendar-invite`, `comms-template-tokens`,
`communications-templates`, `confirmation-email`, `email-delivery-auth`, `email-integration-form`,
`http-route-auth`, `notification-colors`, `seed-security-contract`.

## Browser verification steps

1. Communications page: confirm templates for every kind, and the log showing sent, queued, failed,
   **and calendar-invite** rows.
2. Send a decision to a seeded accepted speaker: two new rows appear (email + calendar invite);
   download the `.ics` and confirm one `BEGIN:VCALENDAR`.
3. Move that session to a different room on the agenda, re-send: `SEQUENCE` has incremented, `UID`
   is unchanged.
4. Click `Retry` on the seeded failed row: a new row appears linked to the original; the original is
   still there with its error.
5. Confirm no `Retry` control exists on a `sent` row.
6. Enable the reminder schedule on a scratch event with an email integration and a task overdue by
   more than the offset. Wait for the hourly pass (or invoke the dispatcher from the Convex CLI).
   Confirm exactly one reminder and one `comms_log` row with `dispatchedBy` starting `schedule:`.
7. Invoke the dispatcher again immediately: no second send.
8. Enable a schedule on an event with pre-existing overdue tasks: confirm nothing is retro-sent and
   the UI says so.
9. Disable the email integration and run the pass: no sends attempted; the skip is recorded.

## Rollback

The cron is removable by deleting `convex/crons.ts` — nothing else depends on it. `comms_schedules`
rows with `enabled: false` are inert. Retry is additive and never mutates existing evidence. The
seed changes are data only.
</content>
