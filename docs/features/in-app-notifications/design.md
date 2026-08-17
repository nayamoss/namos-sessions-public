# In-App Notifications — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

```ts
// convex/schema.ts — relevant existing tables
organizers: defineTable({
  userId: v.string(), email: v.string(),
  role: v.union(v.literal("owner"), v.literal("admin")),
  onboardingCompletedAt: v.optional(v.number()), createdAt: v.number(),
}).index("by_userId", ["userId"]).index("by_email", ["email"]),

event_members: defineTable({
  eventId: v.id("events"), userId: v.string(), email: v.string(),
  role: v.union(v.literal("organizer"), v.literal("reviewer")),
  invitedByUserId: v.string(), clerkInvitationId: v.optional(v.string()),
  inviteEmailStatus: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
  inviteError: v.optional(v.string()), invitedAt: v.optional(v.number()), createdAt: v.number(),
}).index("by_event", ["eventId"]).index("by_userId", ["userId"])
  .index("by_email", ["email"]).index("by_event_userId", ["eventId", "userId"])
  .index("by_event_email", ["eventId", "email"]),

comms_log: defineTable({
  eventId: v.id("events"), speakerId: v.optional(v.id("speakers")),
  submissionId: v.optional(v.id("submissions")), templateId: v.optional(v.id("comms_templates")),
  channel: v.union(v.literal("email"), v.literal("calendar_invite")),
  status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
  toEmail: v.string(), subject: v.string(), sentAt: v.optional(v.number()),
  error: v.optional(v.string()), createdAt: v.number(),
}).index("by_event", ["eventId"]).index("by_speaker", ["speakerId"]).index("by_submission", ["submissionId"]),
```

No existing table represents a per-user notification. There is nothing to migrate — this is a
net-new table.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| `notifications` | CREATE | `eventId` | `v.id("events")` | scopes the row to an event |
| `notifications` | CREATE | `recipientUserId` | `v.string()` | Clerk `identity.subject` — matches `event_members.userId` / `organizers.userId` |
| `notifications` | CREATE | `kind` | union (see below) | drives icon + copy on the client |
| `notifications` | CREATE | `title` | `v.string()` | short line, rendered directly, no client-side formatting logic |
| `notifications` | CREATE | `body` | `v.optional(v.string())` | one-line detail, e.g. submitter name |
| `notifications` | CREATE | `linkPath` | `v.optional(v.string())` | in-app route to navigate to on click, e.g. `/events/:slug/program/abstracts?submission=...` |
| `notifications` | CREATE | `relatedId` | `v.optional(v.string())` | id of the underlying record (submission/member/comms_log), untyped string since it varies by kind |
| `notifications` | CREATE | `readAt` | `v.optional(v.number())` | unset = unread |
| `notifications` | CREATE | `emailedAt` | `v.optional(v.number())` | set only for high-priority kinds that also emailed; lets QA verify fan-out happened |
| `notifications` | CREATE | `createdAt` | `v.number()` | |
| `notifications` | CREATE INDEX | `by_recipient` | `["recipientUserId", "createdAt"]` | primary read path: this user's feed, newest first |
| `notifications` | CREATE INDEX | `by_recipient_unread` | `["recipientUserId", "readAt"]` | unread-count query without scanning read rows |
| `notifications` | CREATE INDEX | `by_event` | `["eventId"]` | admin/debug lookups only |

```ts
notifications: defineTable({
  eventId: v.id("events"),
  recipientUserId: v.string(),
  kind: v.union(
    v.literal("invite_sent"),
    v.literal("invite_accepted"),
    v.literal("invite_declined"),
    v.literal("member_removed"),
    v.literal("submission_received"),
    v.literal("submission_withdrawn"),
    v.literal("reviewer_assigned"),
    v.literal("evaluation_completed"),
    v.literal("decision_sent"),
    v.literal("comms_delivery_failed"),
  ),
  title: v.string(),
  body: v.optional(v.string()),
  linkPath: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  readAt: v.optional(v.number()),
  emailedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_recipient", ["recipientUserId", "createdAt"])
  .index("by_recipient_unread", ["recipientUserId", "readAt"])
  .index("by_event", ["eventId"]),
```

### Migration

Pure additive `defineTable` — Convex creates the table on next deploy, no backfill needed since
there is no prior data to migrate. No existing table's shape changes.

---

## Backend / API

### Affected Existing Mutations/Actions (each gets one added call — no signature changes)

| File | Function | Trigger (kind) | Recipients |
|------|----------|-----------------|------------|
| `convex/eventMembers.ts` | `add` | `invite_sent` | organizers on the event (excluding the inviter) |
| `convex/eventMembers.ts` | `recordInviteOutcome` | `invite_accepted` \| `invite_declined` | the `invitedByUserId` organizer |
| `convex/eventMembers.ts` | `removeAfterClerkRevoke` | `member_removed` | remaining organizers on the event |
| `convex/submissions.ts` | `submit` (or the internal path it calls) | `submission_received` | all event_members with role `organizer` |
| `convex/submissions.ts` | `setStatus` (withdrawal path) | `submission_withdrawn` | organizers |
| `convex/evaluations.ts` | `assign` / `assignByFilter` | `reviewer_assigned` | the assigned reviewer only |
| `convex/evaluations.ts` | `save` (evaluation submission) | `evaluation_completed` | organizers |
| `convex/submissions.ts` | `decide` | `decision_sent` | organizers (fired once decision is confirmed, not on send — the actual send goes through `commsActions.ts` and produces its own `comms_delivery_failed` if it fails) |
| `convex/comms.ts` | `insertDeliveryLog` (shared by `recordDelivery` + `recordDeliveryInternal`) | `comms_delivery_failed` (only when `args.status === "failed"`) | organizers on the event |

Every one of these is a single added call: `await notifyEvent(ctx, {...})` — see below. None of
them change their existing args, return shape, or auth check.

### New Internal Module: `convex/notifications.ts`

**`internal` helper — `notifyEvent` (not a Convex function, a plain async function imported by
the files above, same pattern as `deliverEventEmail` in `emailDelivery.ts`)**

```ts
async function notifyEvent(ctx: MutationCtx, args: {
  eventId: Id<"events">;
  kind: NotificationKind;
  title: string;
  body?: string;
  linkPath?: string;
  relatedId?: string;
  recipientUserIds: string[]; // resolved by the caller from event_members/organizers
  highPriority?: boolean; // triggers email fan-out
}): Promise<void>
```

Wrapped in `try/catch` internally (FR-008) — a notification-write failure logs via
`console.error` and returns, it never throws back into the caller's mutation.

### New Query Functions (`convex/notifications.ts`)

| Function | Type | Args | Returns |
|----------|------|------|---------|
| `list` | query | `{ paginationOpts }` | paginated notifications for `ctx.auth` identity, newest first, via `by_recipient` |
| `unreadCount` | query | `{}` | `number` — count of rows for this user with `readAt` unset, via `by_recipient_unread` |
| `markRead` | mutation | `{ notificationId: v.id("notifications") }` | patches `readAt`; asserts `recipientUserId === identity.subject` |
| `markAllRead` | mutation | `{}` | patches every unread row for this user |

### New Action (`convex/notificationEmailActions.ts`)

| Function | Type | Purpose |
|----------|------|---------|
| `sendHighPriorityEmail` | internalAction, scheduled via `ctx.scheduler.runAfter(0, ...)` from `notifyEvent` when `highPriority: true` | Resolves the recipient's email (from `organizers`/`event_members`), calls `deliverEventEmail(ctx, eventId, { to, subject, text })` from `convex/emailDelivery.ts`. Failure here does not affect the in-app notification, which is already committed. |

### Validation & Business Logic

- Recipient resolution always goes through the same membership tables `assertEventAccess`
  already trusts (`event_members` by event, `organizers` for org-wide) — never a client-supplied
  user list.
- `markRead`/`markAllRead` assert `recipientUserId === identity.subject` (or org-wide organizer,
  matching `assertOrganizer`'s existing override) before any patch — one user can never mark
  another user's notification read.
- `comms_delivery_failed` notifications read `args.status === "failed"` off the exact same
  validated payload `insertDeliveryLog` already writes to `comms_log` — no duplicate validation.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/components/NotificationBell.tsx` | Replace the static stub with a real component wired to `api.notifications.unreadCount` and a popover panel |
| `src/components/AppLayout.tsx` | No structural change — `<NotificationBell />` is already mounted at line 393; it just stops being inert |

### New Components

**`NotificationBell`** (rewrite of the existing stub)
- File: `src/components/NotificationBell.tsx`
- Props: none (reads current identity implicitly via Convex `useQuery`)
- Location: `AppLayout.tsx` top bar, same slot it already occupies, next to the search shortcut
- Elements:
  - Bell icon button (unchanged `lucide-react` `Bell`, existing size/classes)
  - Unread badge: small circular count badge top-right of the bell, sage accent background,
    only rendered when `unreadCount > 0`; shows "9+" above 9
  - On click: opens `NotificationPanel` as a `Popover` anchored to the bell (not a fixed overlay)
- Behavior: badge count updates live via Convex subscription — no manual refresh, no polling
- Data: `useQuery(api.notifications.unreadCount, {})`

**`NotificationPanel`**
- File: `src/components/NotificationPanel.tsx`
- Props: `{ onClose: () => void }`
- Location: rendered inside the `Popover` opened by `NotificationBell`, anchored top-right under
  the bell, `w-[380px]`
- Elements:
  - Header row: "Notifications" title (`text-sm font-semibold`) left, "Mark all read" text
    button right (disabled/hidden when unread count is 0)
  - Scrollable list (`max-h-[420px] overflow-y-auto`), each row:
    - Leading icon (per `kind` — `UserPlus` for member changes, `FileText` for submissions,
      `ClipboardCheck` for review/decision, `AlertTriangle` for `comms_delivery_failed`)
    - Title (`text-sm`, bold if unread)
    - Body (`text-sm text-muted-foreground`, one line, truncated)
    - Relative timestamp (`text-xs text-muted-foreground`, e.g. "2h ago")
    - Unread indicator: small filled dot, sage accent, left of the row when `readAt` is unset
  - Empty state: inside a `bg-neutral-100 rounded-[12px] p-8` card — `Bell` icon (size 40,
    muted), "You're all caught up" heading, "New activity on your events will show up here"
    subtext, no CTA button (nothing to do from an empty inbox)
  - Loading state: 4 skeleton rows (`bg-neutral-100 rounded-[10px] h-14 animate-pulse`)
  - Error state: inline `text-sm text-red-600` under the header — "Couldn't load notifications"
- Behavior:
  - Clicking a row: calls `markRead`, then navigates to `linkPath` (React Router), closes panel
  - "Mark all read": calls `markAllRead`, badge clears immediately (optimistic — Convex
    reactivity confirms it)
  - Clicking outside or Escape: closes the popover (standard Radix `Popover` behavior, already
    used elsewhere in this codebase via `@radix-ui/react-popover`)
- Data: `useQuery(api.notifications.list, { paginationOpts })` (usePaginatedQuery from
  `convex/react`), `useMutation(api.notifications.markRead)`, `useMutation(api.notifications.markAllRead)`

---

## State / Data Flow

1. A triggering mutation/action (e.g. `submissions.decide`, `eventMembers.recordInviteOutcome`)
   runs its existing logic, then calls `notifyEvent(ctx, {...})` with the resolved recipient
   list.
2. `notifyEvent` inserts one `notifications` row per recipient; if `highPriority`, it schedules
   `sendHighPriorityEmail` via `ctx.scheduler.runAfter(0, ...)`.
3. Convex's reactive query system pushes the new row to every subscribed client automatically —
   `NotificationBell`'s `useQuery(api.notifications.unreadCount, {})` and any open
   `NotificationPanel`'s `useQuery(api.notifications.list, ...)` re-render with no client code
   changes, no polling, no websocket wiring beyond what `convex/react` already provides.
4. Clicking a row or "Mark all read" calls a mutation, which patches `readAt`; the same
   reactivity pushes the updated unread count back to the bell.

---

## Auth / Permissions

- Reads (`list`, `unreadCount`) filter by `recipientUserId === identity.subject` via the
  `by_recipient` index — a user can only ever query their own notifications, there is no
  eventId-scoped read path that could leak another user's rows.
- Writes (`markRead`, `markAllRead`) re-assert `recipientUserId === identity.subject` before
  patching (or org-wide `organizers` override, consistent with `isOrganizer`'s existing
  precedent elsewhere in this codebase).
- `notifyEvent` itself is never called from the client — it is only invoked server-side from
  inside already-authorized mutations/actions, so it inherits whatever access check the
  triggering function already performed (e.g. `submissions.decide` already calls
  `assertEventOrganizerAccess` before `notifyEvent` runs).

---

## Edge Cases & Error States

- **Notification insert fails** (schema mismatch, transient error): caught inside `notifyEvent`,
  logged, swallowed — the triggering mutation still succeeds and returns normally (FR-008).
- **Email fan-out fails** (`sendHighPriorityEmail` action errors): the in-app notification row
  already exists and is unaffected; the action's own error is caught the same way
  `deliverEventEmail`'s existing callers already handle provider failures — logged, not thrown
  back into a UI flow that has nothing to do with sending mail.
- **Recipient list is empty** (e.g. no other organizers on a single-owner event): `notifyEvent`
  no-ops after resolving zero recipients — no error, no wasted write.
- **User navigates away before `markRead` mutation resolves**: mutation still completes
  server-side (fire-and-forget from the client's perspective, same as every other `useMutation`
  call in this app) — the row is marked read even if the panel already closed.
- **Panel open with zero notifications**: renders the empty state described above, not a blank
  list.
- **Deleted/inaccessible linked record** (e.g. a submission is later deleted): `linkPath`
  navigation still works, the destination page shows its own existing not-found state — this
  feature does not need to special-case stale links.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fan-out timing | Synchronous per-recipient insert inside the triggering mutation | Event-scoped team sizes are small (organizers/reviewers per event, not public followers) — matches NFR-002, avoids queue infrastructure this app has no other use for |
| Email transport | Reuse `deliverEventEmail` from `convex/emailDelivery.ts` | Already handles per-event integration resolution, encrypted credentials, and RESEND_* fallback — building a second email path would duplicate all of that |
| Read/unread model | `readAt: v.optional(v.number())` timestamp, not a boolean | Matches the timestamp-or-unset pattern already used elsewhere in this schema (`sentAt`, `onboardingCompletedAt`) and gives "when was this read" for free |
| Recipient resolution | Server-resolves from `event_members`/`organizers`, never client-supplied | Matches every other authorization boundary in this codebase (`assertEventAccess`) — a client-supplied recipient list would be a trust boundary violation |

## Dependencies

**Requires:** none — additive schema change, no other in-flight feature blocks this.
**Enables:** future notification preferences/mute controls (out of scope here) can be layered on
top of the `notifications` table without a schema change, by adding a filter at read time.

## Risks & Mitigations

- **Risk:** adding `notifyEvent` calls into nine existing mutations touches sensitive, already-
  working code paths (invites, decisions, comms delivery).
  **Mitigation:** every call is additive and wrapped in its own try/catch (FR-008) — it cannot
  change the return value or throw a new error into the existing function. Each hookpoint is a
  one-line addition at the end of the existing handler, not a rewrite.
- **Risk:** email fan-out for `comms_delivery_failed` could itself fail silently if the event's
  own email integration is the thing that's broken (the same outage that caused the failure).
  **Mitigation:** `sendHighPriorityEmail` falls back to the RESEND_* environment default the same
  way `resolveEventIntegration` already does for other sends — an organizer's own email doesn't
  depend on the same broken per-event integration.
