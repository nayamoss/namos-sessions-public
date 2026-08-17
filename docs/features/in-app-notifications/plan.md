# In-App Notifications — Implementation Plan

## Phase 1: Schema + Core Backend

- [ ] T001: Add `notifications` table to `convex/schema.ts` per design.md (all fields, all 3
      indexes: `by_recipient`, `by_recipient_unread`, `by_event`)
- [ ] T002: Create `convex/notifications.ts` with the internal `notifyEvent` helper
      (try/catch-wrapped, never throws into the caller per FR-008)
- [ ] T003: Add `list` query (paginated, `by_recipient`, scoped to `identity.subject`)
- [ ] T004: Add `unreadCount` query (`by_recipient_unread`, scoped to `identity.subject`)
- [ ] T005: Add `markRead` mutation (asserts `recipientUserId === identity.subject` or org-wide
      organizer override)
- [ ] T006: Add `markAllRead` mutation (same auth rule, batch patch)
- [ ] T007: Create `convex/notificationEmailActions.ts` with `sendHighPriorityEmail`
      internalAction, calling `deliverEventEmail` from `convex/emailDelivery.ts`

## Phase 2: Wire Trigger Hookpoints

Each task is a one-line addition at the end of an existing, already-authorized handler — no
signature or return-shape changes, per design.md's risk mitigation.

- [ ] T008: `convex/eventMembers.ts` `add` → `notifyEvent(kind: "invite_sent")`, recipients =
      other organizers on the event
- [ ] T009: `convex/eventMembers.ts` `recordInviteOutcome` → `notifyEvent(kind:
      "invite_accepted" | "invite_declined")`, recipient = `invitedByUserId`; `invite_accepted`
      sets `highPriority: true`
- [ ] T010: `convex/eventMembers.ts` `removeAfterClerkRevoke` → `notifyEvent(kind:
      "member_removed")`, recipients = remaining organizers
- [ ] T011: `convex/submissions.ts` `submit` → `notifyEvent(kind: "submission_received")`,
      recipients = organizers
- [ ] T012: `convex/submissions.ts` `setStatus` (withdrawal path) → `notifyEvent(kind:
      "submission_withdrawn")`, recipients = organizers
- [ ] T013: `convex/evaluations.ts` `assign` / `assignByFilter` → `notifyEvent(kind:
      "reviewer_assigned")`, recipient = assigned reviewer only
- [ ] T014: `convex/evaluations.ts` `save` → `notifyEvent(kind: "evaluation_completed")`,
      recipients = organizers
- [ ] T015: `convex/submissions.ts` `decide` → `notifyEvent(kind: "decision_sent")`, recipients =
      organizers
- [ ] T016: `convex/comms.ts` `insertDeliveryLog` → when `args.status === "failed"`,
      `notifyEvent(kind: "comms_delivery_failed", highPriority: true)`, recipients = organizers

## Phase 3: Frontend UI (REQUIRED — never skip)

> ⚠️ A feature is NOT done until it is visible and usable in the UI. Every element below must
> exist exactly as specified — the implementing agent has no design intuition beyond this list.

### UI Spec

**NotificationBell** (rewrite `src/components/NotificationBell.tsx`)
- Location: `AppLayout.tsx` top bar, existing mount point (line ~393), unchanged position next
  to the `⌘K` search shortcut
- Elements:
  - Bell icon button (`lucide-react` `Bell`, keep existing button classes/size)
  - Unread badge: small circular badge, top-right corner of the bell, sage accent
    (`bg-[#40745C]`) background, white text, only rendered when `unreadCount > 0`; displays
    `unreadCount` up to 9, then `"9+"`
- Behavior:
  - Click toggles a `Popover` (Radix, already a dependency) containing `NotificationPanel`,
    anchored bottom-left of the bell
  - Badge count re-renders live from `useQuery(api.notifications.unreadCount, {})` — no manual
    refresh
- Data: `api.notifications.unreadCount`

**NotificationPanel** (new: `src/components/NotificationPanel.tsx`)
- Location: inside the `Popover` content opened by `NotificationBell`, `w-[380px]`
- Elements:
  - Header row: "Notifications" (`text-sm font-semibold`) left; "Mark all read" text button
    right, `text-xs text-muted-foreground hover:text-foreground`, hidden when unread count is 0
  - List container: `max-h-[420px] overflow-y-auto`, `space-y-1` between rows, no dividers
  - Each notification row (`p-3 rounded-[10px]`, `hover:bg-neutral-100`, clickable):
    - Leading icon by `kind`: `UserPlus` (member changes), `FileText` (submission activity),
      `ClipboardCheck` (review/decision activity), `AlertTriangle` (`comms_delivery_failed`,
      colored `text-red-600`)
    - Title text (`text-sm`, `font-semibold` when unread, `font-normal` when read)
    - Body text (`text-sm text-muted-foreground truncate`)
    - Relative timestamp (`text-xs text-muted-foreground`, e.g. "2h ago", via `date-fns`
      `formatDistanceToNow`, already a dependency)
    - Unread dot: `h-2 w-2 rounded-full bg-[#40745C]`, left edge of the row, only when unread
  - Empty state (unread and total both zero): `bg-neutral-100 rounded-[12px] p-8` card,
    centered — `Bell` icon (`size={40}`, `text-muted-foreground`), "You're all caught up"
    heading (`text-sm font-semibold`), "New activity on your events will show up here" subtext
    (`text-sm text-muted-foreground`), no CTA button
  - Loading state: 4 skeleton rows, `bg-neutral-100 rounded-[10px] h-14 animate-pulse`
  - Error state: `text-sm text-red-600 p-3` — "Couldn't load notifications", shown in place of
    the list if the query errors
- Behavior:
  - Click a row: calls `markRead({ notificationId })`, navigates to `linkPath` via React
    Router's `useNavigate`, then closes the popover (calls `onClose`)
  - Click "Mark all read": calls `markAllRead({})`, no navigation, panel stays open
  - Escape key or click outside: closes popover (default Radix `Popover` behavior)
- Data: `usePaginatedQuery(api.notifications.list, {}, { initialNumItems: 20 })`,
  `useMutation(api.notifications.markRead)`, `useMutation(api.notifications.markAllRead)`

### Tasks
- [ ] T017: Rewrite `NotificationBell.tsx` with the badge + popover per UI Spec above
- [ ] T018: Build `NotificationPanel.tsx` with every element listed (list, empty, loading, error
      states — all four, not just the happy path)
- [ ] T019: Wire row click → `markRead` + navigate to `linkPath` + close panel
- [ ] T020: Wire "Mark all read" → `markAllRead`, verify badge clears live
- [ ] T021: Verify full flow end-to-end in the running app: trigger each of the 9 event kinds
      from Phase 2 as a real user action, watch the bell update live with no refresh, open the
      panel, click through to the linked record, mark all read, confirm badge clears

> ⚠️ A feature is NOT done until it is visible and usable in the UI. The bell already exists in
> the app shell — this phase makes it real. Backend-only completion without this phase is not
> done.

## Task Dependencies

- T002–T007 depend on T001 (schema must exist first)
- T008–T016 each depend on T002 (need `notifyEvent` helper) and T007 for the `highPriority` ones
  (T009, T016)
- T017–T020 depend on T003–T006 (queries/mutations must exist)
- T021 depends on all of Phase 2 being wired (needs real triggers to verify against)

## Verification Checklist

- [ ] All acceptance criteria in `requirements.md` met
- [ ] Feature is accessible and usable in the UI — bell shows live unread count, panel opens,
      rows are clickable, mark-all-read works
- [ ] Each of the 9 trigger kinds (T008–T016) produces a real notification when exercised in the
      browser, not just asserted by a unit test against mocks
- [ ] `invite_accepted` and `comms_delivery_failed` each additionally produce a real email,
      verified with a real provider connection (Resend or SES)
- [ ] Two different organizer accounts on the same event: confirm mark-read/mark-all-read on one
      account never affects the other account's unread state
- [ ] No regressions to the 9 existing mutations/actions that gained a `notifyEvent` call —
      their existing return values, error behavior, and auth checks are unchanged
- [ ] Docs updated if needed (`docs/features/INDEX.md` entry for this feature)
