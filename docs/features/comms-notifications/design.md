# Comms & Notifications — Completion Technical Design

> **Implementation correction (2026-08-12):** `AGENTS.md` forbids dialog/sheet overlays for this
> workflow. Any `SendDecisionDialog` or `ReminderDialog` language later in this document is stale.
> The shipped design uses the existing flex-sibling `DetailPane` on Abstracts and Speakers. The
> review, recipient list, calendar state, results, and retry controls render inline there.

## Database / Schema Changes

### Current Schema (affected tables)

```ts
comms_templates: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  kind: v.union(v.literal("submission_confirmation"), v.literal("acceptance"),
    v.literal("rejection"), v.literal("consolidated_decision"), v.literal("reminder"),
    v.literal("calendar_invite"), v.literal("custom")),
  subject: v.string(), body: v.string(),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_event", ["eventId"]),

comms_log: defineTable({
  eventId: v.id("events"),
  speakerId: v.optional(v.id("speakers")), submissionId: v.optional(v.id("submissions")),
  templateId: v.optional(v.id("comms_templates")),
  channel: v.union(v.literal("email"), v.literal("calendar_invite")),
  status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
  toEmail: v.string(), subject: v.string(),
  sentAt: v.optional(v.number()), error: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]).index("by_submission", ["submissionId"]),
```

`agenda_items` already carries `startTime`/`endTime`/`roomId`; `events` already carries a
`location` field and an `email_integrations` row resolved server-side by
`convex/emailDelivery.ts`. Nothing here needs a new column.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| agenda_items | ADD COLUMN | `calendarUid` | `v.optional(v.string())` | Stable UID across resends and schedule updates. Backfill: derive `sessionboard-${_id}` on first read if absent — no migration script needed, existing `.ics` already uses this exact scheme. |
| agenda_items | ADD COLUMN | `calendarSequence` | `v.optional(v.number())` | Defaults to 0. Incremented by `updateAgendaItem` whenever start/end/room/location/video changes. Required so Gmail/Outlook/Apple treat a reschedule as an update, not a new event (`design`, Journey section D). |

### Migration

No data migration script. Both fields are optional with safe fallback logic in the reader
(`calendarUid ?? "sessionboard-" + item._id`, `calendarSequence ?? 0`), so existing rows work
unchanged on first read and get a durable value written back on first calendar-relevant edit.

---

## Backend / API

### Affected Existing Endpoints

| Method | Path | Change |
|--------|------|--------|
| Convex mutation | `agenda:update` (or equivalent save handler) | On a change to start/end/roomId/location/videoUrl, increment `calendarSequence` and set `calendarUid` if absent |
| Convex query | `comms:log` (new or existing list query) | Confirm it's scoped `by_event` and returns rows for the admin send-log page — reuse the pattern from `evaluations:reviewerProgress` |

### Retired (do not extend — replace, then delete)

| File | Why |
|------|-----|
| Retired decision-email handler | Unauthenticated `ConvexHttpClient`, hardcoded copy, single-recipient. Replaced by `convex/commsActions.ts:sendDecision`. |
| Retired reminder-email handler | Same defects, plus zero callers in `src/` at retirement. Replaced by `convex/commsActions.ts:sendReminder`. |
| Retired calendar-invite wrapper | The unauthenticated client caused the silent calendar-attachment failure. Its pure `.ics`-building logic (`src/lib/calendar-invite-core.mjs`) is reused; the Convex-fetching wrapper is not. |

This mirrors the fix already applied to submission confirmation
(`convex/confirmationEmailActions.ts` replaced the pre-2026-08-10 browser/serverless path
was). Running server-side inside a Convex action gives `ctx.db`/`ctx.runQuery` direct,
already-authenticated access — there is no HTTP hop that can silently drop auth.

### New Backend Surface

**`convex/commsActions.ts`** (Node action, pattern copied from
`convex/reviewerRemindersActions.ts` — same file already proves this shape works):

| Function | Args | Returns | Notes |
|----------|------|---------|-------|
| `sendDecision` | `{ eventId, submissionId }` | `{ status, results: [{ speakerId, toEmail, status, error? }] }` | `assertEventAccessAction(ctx, eventId)` first. Loads the submission's speakers (primary + co-speakers), the resolved `comms_templates` row for `acceptance`/`rejection` (fallback to a built-in default if none saved), the scheduled agenda item if any, builds one `.ics` per recipient via `calendarAttachment()` from `src/lib/calendar-invite-core.mjs`, sends via `deliverEventEmail`, best-effort `recordDelivery` per recipient — sequential loop, one failure never blocks the rest, exactly like `reviewerRemindersActions.send`. |
| `sendReminder` | `{ eventId, speakerId, taskId? }` | `{ status, results: [...] }` | Same shape. Loads the speaker's outstanding task(s), the `reminder` template, attaches the same stable `.ics` (no duplicate calendar entry — Journey section C, item 4) if the speaker has a scheduled session. |
| `previewTemplate` (query, not action) | `{ eventId, kind, submissionId? , speakerId? }` | `{ subject, body }` resolved with real tokens | Backs the Communications preview (`Missing` row in USER_JOURNEY's coverage table) — replaces the current hardcoded preview. |

### Validation & Business Logic

- `assertEventAccessAction` (already exists, used by `reviewerRemindersActions.send`) is the
  only auth gate — no bespoke Clerk check needed, this closes the "no server-side identity
  verification" gap by construction rather than by adding a second check.
- Template resolution: look up `comms_templates` by `eventId` + `kind`; if none saved, fall back
  to the same copy `decision-email.mjs`/`reminder-email.mjs` hardcode today, so there's no
  regression for events that never touched Communications.
- Token resolution (`{{speakerName}} {{eventName}} {{sessionTitle}} {{portalUrl}}` plus new
  `{{scheduleTime}} {{location}} {{videoUrl}}` for calendar-aware templates) happens in one
  shared helper (`src/lib/comms-template-tokens.ts`, new) used by both `previewTemplate` and the
  two send actions — so preview and actual send can never diverge.
- Recipient resolution for `sendDecision` always re-reads speakers server-side from the
  submission, never trusts a client-supplied recipient list (same principle
  `reviewerRemindersActions.send` documents inline: "no submission id list leaves the browser").

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/program/Abstracts.tsx` | Replace immediate delivery with an inline detail-pane review + `commsActions.sendDecision`; render per-recipient results and retry only failed recipients |
| `src/pages/program/Speakers.tsx` | Add a "Message" action to the existing speaker detail pane with a "Task reminder" option, wired to `commsActions.sendReminder` |
| `src/pages/program/Communications.tsx` | Resolve saved/draft template tokens against a real event speaker/session context using the same helper as delivery |
| `convex/agenda.ts` (or wherever the agenda-item save mutation lives) | Increment `calendarSequence` on calendar-relevant field changes; warn the organizer in the save response when speakers will be re-notified |

### New Components

**`SendDecisionDialog`**
- File: `src/components/comms/SendDecisionDialog.tsx`
- Props: `{ eventId: Id<"events">, submission: SubmissionRow, open: boolean, onOpenChange: (open: boolean) => void, onSent: (results: DecisionResult[]) => void }`
- Location: Opened from Abstracts, from the existing "Send decision" row action — replaces the immediate fire-and-forget call
- Third-party: `Dialog` from `@radix-ui/react-dialog` (already a dependency) — this is a
  confirmation, not a list/table, so `Dialog` is correct per the layout rules, not `Sheet`
- Elements:
  - Dialog title: "Send decision to {n} recipient(s)"
  - Recipient list: one row per speaker/co-speaker — name, email, small muted label
    ("primary" / "co-speaker")
  - Template line: "Using: {template name}" (muted text, links to Communications if the
    organizer wants to edit first)
  - Calendar line: "Calendar invite will be attached" OR, if the submission isn't scheduled,
    "Not scheduled — sending without a calendar invite" (no toggle needed; this is
    informational, matching the Journey's "clearly offers Send without calendar invite" as a
    default behavior, not a separate control, since there's nothing to opt out of when there's
    no agenda item)
  - Primary button: "Send" (`bg-[#40745C]` sage, `rounded-[6px]`, no border) — disabled while
    sending, label changes to "Sending…"
  - Secondary button: "Cancel" (`bg-neutral-100`, no border)
  - After send: recipient list re-renders in place with a status chip per row —
    "Sent" (sage text), "Failed — {error}" (dark red text) — no modal close on partial failure;
    a "Retry failed" button appears if any row failed, calling `sendDecision` again scoped to
    only the failed recipient ids
  - Loading state: each recipient row shows a small spinner chip while its send is in flight
  - Empty state: N/A — dialog only opens when there is at least one valid recipient; if none
    have valid emails, the row action itself is disabled with a tooltip, per existing
    `isValidEmail` check in `Abstracts.tsx`
- Behavior: Confirm disables both buttons and starts the send loop; closing via the X or
  Cancel before confirming sends nothing; closing after a successful send calls `onSent` so
  Abstracts can mark `notified: true`

**`ReminderDialog`**
- File: `src/components/comms/ReminderDialog.tsx`
- Props: `{ eventId: Id<"events">, speaker: Speaker, task?: OnboardingTask, open: boolean, onOpenChange: (open: boolean) => void, onSent: () => void }`
- Location: Speakers page, opened from the detail pane's new "Message" → "Task reminder" action
- Elements:
  - Dialog title: "Send task reminder to {speaker name}"
  - Resolved preview: subject + body text with real tokens filled in (read-only, from
    `previewTemplate`)
  - Primary button: "Send reminder" (sage, `rounded-[6px]`)
  - Secondary button: "Cancel"
  - Result state: replaces the preview with "Sent" or "Failed — {error}" and a "Close" button
  - Loading state: primary button shows "Sending…" and disables
- Behavior: same confirm-once, no-double-send guarding as `SendDecisionDialog`
- Data: reads `commsActions.previewTemplate`, writes via `commsActions.sendReminder`

---

## State / Data Flow

- Templates: Communications form → `comms.saveTemplate` mutation (existing, unchanged) →
  `comms_templates` row → read back by `previewTemplate` and by the two send actions. This is
  the fix for "saved templates are not used by send handlers" — there is now exactly one
  template-reading code path shared by preview and send.
- Decision send: Abstracts row action → `SendDecisionDialog` (client state: dialog open,
  per-recipient result array) → `commsActions.sendDecision` Convex action → `comms_log` rows +
  provider send → dialog re-renders from the action's returned `results` array → `onSent`
  updates the row's `notified` flag in Abstracts' local state, matching the existing pattern
  used elsewhere in that file (see `updateTags`'s optimistic-then-reconcile shape).
- Reminder send: Speakers detail pane → `ReminderDialog` → `commsActions.sendReminder` →
  `comms_log` row → speaker's "last contacted" indicator (new, derived from a
  `comms.lastDeliveryForSpeaker` query filtered `by_speaker`, not client state — matches the
  Journey's persistence requirement that notified/last-contact indicators are derived from
  persisted delivery records).
- Schedule update: Agenda save mutation increments `calendarSequence` server-side → the next
  decision/reminder resend for that submission automatically carries the higher sequence,
  because `sendDecision`/`sendReminder` always re-read the agenda item at send time rather than
  caching it.

---

## Auth / Permissions

- Every new/changed send path is organizer-only, enforced by `assertEventAccessAction` inside
  the Convex action — same mechanism already used by `reviewerRemindersActions.send`, so there
  is no new auth pattern to review, just the existing one applied where it's currently missing.
- `previewTemplate` is a `query`, gated the same way via `assertEventAccess` (its query-side
  equivalent), consistent with every other event-scoped read in this codebase.
- No client input is trusted for recipient identity — speaker emails are always re-read
  server-side from the submission/speaker record, never accepted as a dialog prop that gets
  echoed back into the send call.

---

## Edge Cases & Error States

| Case | Behavior |
|------|----------|
| Provider not configured | `deliverEventEmail` throws `providerNotConfigured`; dialog shows "Delivery is unavailable — configure a provider" per recipient, with a link to Settings → Email Delivery. Matches existing confirmation-email degrade pattern. |
| Speaker has no valid email | Excluded from the recipient list before the dialog opens (reuse `isValidEmail`); organizer sees why in a muted note under that speaker's name |
| Submission not scheduled | No calendar invite attempted; dialog states this plainly, send proceeds |
| One of several recipients fails | Others still send (sequential loop, no early abort — same as `reviewerRemindersActions.send`); failed row gets a "Retry" affordance scoped to just that recipient |
| Double-click / double-confirm | Confirm button disables on click; the action itself is not idempotent-by-request-id, so the button-disable is the only guard — acceptable because a single organizer session can't issue two concurrent Convex action calls from one disabled button |
| Template deleted after being referenced in `comms_log` | `templateId` is `v.optional` — log row keeps its `subject`/`body`-independent record; no dangling reference to resolve at read time |
| Calendar-relevant edit with no scheduled recipients yet notified | `calendarSequence` still increments (source of truth stays simple); no email fires from the agenda save itself — resending is still organizer-triggered, matching "Out of Scope: no cron" |

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where the send logic runs | Convex Node action | Matches the precedent that already fixed confirmation email; eliminates the entire unauthenticated-HTTP-hop bug class instead of patching two call sites |
| Recipient trust boundary | Always re-read speakers/emails server-side | Prevents a stale or tampered client list from becoming the send list — same principle documented inline in `reviewerRemindersActions.send` |
| Calendar UID/sequence storage | New optional fields on `agenda_items`, computed lazily | Avoids a migration; keeps the existing `.ics` UID scheme (`sessionboard-${_id}`) as the fallback so nothing changes for already-scheduled items until they're next edited |
| Dialog vs. inline row action | `Dialog` confirmation before any send | Journey section 4B explicitly requires showing the recipient list and template before delivery — a fire-and-forget click cannot satisfy that |

## Dependencies

**Requires:** the already-shipped `email_integrations` + `emailDelivery.ts` provider
resolution (done), `comms_templates`/`comms_log` schema (done, no changes needed beyond the two
new `agenda_items` columns).

**Enables:** the admin send-log page referenced in `plan.md` Phase 10 (now trivial — `comms_log`
will finally have real decision/reminder rows to display); closes requirement #3 in
`docs/features/INDEX.md`.

## Risks & Mitigations

- **Risk:** real-provider verification (Gmail/Outlook/Apple Calendar) is still blocked on the
  external Resend/Cloudflare DNS issue documented in `INDEX.md` line 88. **Mitigation:** none of
  this plan's code changes require that to be unblocked to verify correctness — dialogs, auth
  gating, and `comms_log` writes are all verifiable with the provider unconfigured (degrade
  path) or against a sandbox sender; the three-client `.ics` check stays the final gate before
  this feature can move to `done`, exactly as `USER_JOURNEY.md` already states.
- **Risk:** retiring the legacy serverless handlers could break something still pointing at them.
  **Mitigation:** grep confirmed `decision-email.mjs` has exactly one caller
  (`Abstracts.tsx:688`) and `reminder-email.mjs` has zero — safe to retire both once the new
  Convex actions are wired and verified.
