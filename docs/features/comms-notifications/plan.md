# Comms & Notifications — Completion Plan

**Completes brief requirement #3, tracked `in-progress` in `docs/features/INDEX.md` rows 73/88/96.**

The authoritative organizer-to-speaker flow and QA contract is
[`USER_JOURNEY.md`](./USER_JOURNEY.md). This plan is not complete, and this feature must not
move to `done`, until that journey is reachable and passes through the running app.
[`design.md`](./design.md) has the concrete file-level design; this doc is the task sequence.

Confirmation email is done — do not touch `convex/confirmationEmailActions.ts` or
`convex/publicForms.ts`'s confirmation path. This plan covers everything downstream: decisions,
reminders, calendar invites, and template wiring.

## Why the current handlers are broken, not just untested

Verified directly against this repo on 2026-08-12:
- The retired calendar-invite wrapper called `agenda:list` / `events:listRooms` /
  `events:get` through a bare `ConvexHttpClient` with no auth token. All three require
  `assertEventAccess`. The call throws, is swallowed, and the calendar attachment silently
  never appears.
- `decision-email.mjs` and `reminder-email.mjs` log delivery through the same unauthenticated
  client calling `comms:recordDelivery`, which also requires `assertEventAccess` — same silent
  failure, so `comms_log` has zero rows for decisions or reminders today.
- Both handlers hardcode subject/body; `comms_templates` edits in Communications have no effect.
- `reminder-email.mjs` has no caller anywhere in `src/` — there is no UI path to it.
- `Abstracts.tsx:sendDecision` sends to one `toEmail` only — co-speakers are never notified —
  and has no pre-send confirmation or per-recipient result.

## Phase 1: Backend — replace the broken send path

- [x] T001: Add `calendarUid`/`calendarSequence` optional fields to `agenda_items` in
      `convex/schema.ts`; increment `calendarSequence` in the agenda-item save mutation when
      start/end/roomId/location/videoUrl changes; default `calendarUid` to
      `sessionboard-${_id}` when absent (matches the existing `.ics` UID scheme, no migration
      needed)
- [x] T002: Add `src/lib/comms-template-tokens.ts` — one shared token-resolution function used
      by preview and both send actions, so they can never diverge
- [x] T003: Create `convex/commsActions.ts` with `sendDecision` (multi-recipient, template-
      driven, `.ics`-attaching) and `sendReminder`, both gated by `assertOrganizerAction` and
      modeled directly on `convex/reviewerRemindersActions.ts` — same sequential
      loop-with-best-effort-logging shape
- [x] T004: Add context-specific preview queries to `convex/comms.ts`,
      gated by `assertEventAccess`, using the same token resolver as T002
- [ ] T005: Unit-test T001–T004 the way `src/test/calendar-email-attachment.test.ts` already
      tests `.ics` structure, but this time with an authenticated mock context so the auth
      boundary itself is exercised, not bypassed

## Phase 2: Frontend UI (REQUIRED — never skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI. The elements below are the
> full spec — do not build less than what's listed.

### UI Spec

**Decision send review** (inline in the existing Abstracts `DetailPane`; overlays are forbidden
by `AGENTS.md`)
- Location: Program → Abstracts, opened from the existing per-row "Send decision" action
  (replaces its current immediate fire-and-forget `fetch`)
- Elements:
  - Title: "Send decision to {n} recipient(s)"
  - Recipient rows: name, email, "primary"/"co-speaker" muted label
  - Template line: "Using: {template name}" (muted, links to Communications)
  - Calendar line: "Calendar invite will be attached" or "Not scheduled — sending without a
    calendar invite"
  - Primary button "Send" (sage `#40745C`, `rounded-[6px]`, no border), Secondary "Cancel"
    (`bg-neutral-100`, no border)
  - Per-recipient result chips after send: "Sent" / "Failed — {error}" with a loading spinner
    chip while in flight
  - "Retry failed" button appears only if ≥1 recipient failed, scoped to just those recipients
- Behavior: Confirm disables both buttons; Cancel/X before confirm sends nothing; a successful
  send calls `onSent` so the Abstracts row's `notified` flag updates
- Data: `commsActions.sendDecision` via Convex

**Reminder send review** (inline in the existing Speakers `DetailPane`)
- Location: Program → Speakers, new "Message" action in the existing speaker detail pane →
  "Task reminder" option
- Elements:
  - Title: "Send task reminder to {speaker name}"
  - Read-only resolved preview (subject + body from `previewTemplate`)
  - Primary button "Send reminder" (sage, `rounded-[6px]`), Secondary "Cancel"
  - Result state replaces the preview with "Sent" or "Failed — {error}" + "Close"
- Behavior: same confirm-once guard as `SendDecisionDialog`
- Data: `commsActions.previewTemplate` (read) + `commsActions.sendReminder` (write)

**Communications page** (`src/pages/program/Communications.tsx`)
- Change only: wire the existing template preview UI to `commsActions.previewTemplate` instead
  of its current hardcoded preview — no new layout elements, this is a data-source fix

### Tasks

- [x] T006: Build the inline decision review with every element in the UI Spec above
- [x] T007: Wire `Abstracts.tsx`'s "Send decision" action to open the inline review instead
      of calling the retired decision-email endpoint directly; remove the old single-string
      `decisionFeedback` state in favor of the dialog's per-recipient results
- [x] T008: Build the inline reminder review with every element in the UI Spec above
- [x] T009: Add the task-reminder entry point to the Speakers detail pane, wired
      to `ReminderDialog`
- [x] T010: Wire Communications' template preview to the shared delivery token resolver with a real event speaker/session context
- [x] T011: Add a "last contacted" indicator on the Speakers list/detail pane, derived from
      persisted successful `comms_log` rows rather than transient send state
- [ ] T012: Verify the full flow in the browser: edit a template → send a decision to a
      submission with a co-speaker → see per-recipient results → confirm rows in `comms_log`
      via the admin send-log view or a direct query

## Phase 3: Retire the broken path

- [x] T013: Delete the retired decision-email, reminder-email, and calendar-invite handlers after
      the replacement passed typecheck, unit tests, and build (grep confirmed:
      `decision-email.mjs` has exactly one caller, `Abstracts.tsx:688`; `reminder-email.mjs` has
      zero — safe to remove both)
- [x] T014: Update `docs/features/INDEX.md` row 96 to reflect the new architecture and current
      verification status

## Task Dependencies

T001 → T003 (sequence field must exist before the send action can read/write it) · T002 → T003, T004
(shared token resolver) · T003, T004 → T006–T010 (UI needs the backend calls to exist) · T006–T011 →
T012 (nothing to verify until it's wired). The dead serverless path was removed after static verification;
live provider proof remains the release gate rather than a reason to retain known-broken handlers.

## Verification Checklist

Execute [`USER_JOURNEY.md`](./USER_JOURNEY.md) sections A–D end to end through the product UI.
The checks below supplement that journey; they do not replace it.

- [ ] Editing and saving a template changes the next sent decision/reminder's actual content
- [ ] A decision send to a submission with a co-speaker delivers to both addresses separately
- [ ] Every decision/reminder send attempt — sent or failed — produces a `comms_log` row
      (currently zero; this is the core regression this plan fixes)
- [ ] `.ics` attachment is present on a real decision send and opens correctly in Gmail, Apple
      Calendar, and Outlook
- [ ] A schedule update (start/end/room/location/video) resends with the same UID and a higher
      sequence, updating the existing calendar event rather than duplicating it
- [ ] With the provider unconfigured, sends degrade visibly (dialog states delivery is
      unavailable) rather than silently failing
- [ ] Feature is accessible and usable in the UI — no send path requires the Convex dashboard,
      or a direct function call
- [ ] No regressions to the confirmation-email path (untouched by this plan; re-run its existing
      tests as a smoke check)

## Cut line

Unchanged from the original plan: submission confirmation stays. Below that, in cut order —
admin alerts → reminders → `.ics` → consolidated decisions → plain decision emails. This plan
implements everything above the cut line except admin alerts, which stay explicitly out of scope.
