# Speaker Operations Workspace — Technical Design

Companion to [`requirements.md`](./requirements.md). Ordered work lives in
[`plan.md`](./plan.md).

**GitHub issue:** [#70](https://github.com/nayamoss/takumi-talks/issues/70)

## Product and information architecture

The existing page is a reporting dashboard. The replacement is an operations queue:

```text
App header: Speakers
Content surface
└─ framed data table
   ├─ toolbar: Search speakers · View filter
   ├─ sticky column headings + compact striped rows
   └─ pagination footer
   └─ selected row → inline detail pane
      ├─ identity + accepted sessions
      ├─ explicit confirmation editor
      ├─ profile completeness (read-only)
      └─ onboarding tasks: create · start · complete
```

The table is the page. There are no `StatCard`s, ranking widgets, charts, or confirmation-mix
bars above it. Summary values are compact orientation signals and act as filter shortcuts where
appropriate.

## Current-system evidence

| Layer | Current evidence | Required change |
|---|---|---|
| Route/auth | `src/App.tsx:32-59` defines the auth wrapper but leaves both Dashboard speaker routes outside it | Put `/program/speakers` inside `RequireAuth`; keep only a compatibility redirect at the legacy path |
| Navigation | `src/components/AppLayout.tsx:22-39` puts Speaker Tracking in `DASHBOARD` | Move and rename it to `PROGRAM > Speakers` |
| Current UI | `src/pages/dashboard/SpeakerTracking.tsx:27-52` creates the report projection; the rest of the file renders cards, charts, and passive sections | Replace it with the queue and detail workflow; delete the false confirmation inference |
| Dashboard duplication | `src/pages/dashboard/DashboardHome.tsx:1-160` imports the same content behind `StatusTabs` | Remove the tab and full-page duplicate; retain at most a compact deep link |
| Speaker schema | `convex/schema.ts:51-69` stores profile/account status but no response status | Add optional persisted `confirmationStatus` |
| Task schema | `convex/schema.ts:131-145` already supports event/speaker scope, due dates, and three task states | Reuse without schema expansion |
| Speaker auth | `convex/speakers.ts:7-13` makes the organizer list private; `convex/speakers.ts:80-98` limits profile editing to the owning speaker | Add a separate organizer-only confirmation mutation; do not reuse profile editing |
| Task API | `convex/tasks.ts:26-64` creates event-validated tasks; `convex/tasks.ts:68-82` changes task state | Call these existing mutations from the selected-speaker pane |
| Convex auth | `convex/functions.ts:11-31` resolves Clerk identity and organizer database membership | Call `assertOrganizer` in the new mutation |
| Airtable bridge | `functions/api/data.ts:15-23` maps operations; `:32-48` verifies Clerk and the admin allowlist; `:113-125` implements task writes | Map and implement the confirmation operation with the same event-ownership check |
| Deployment | `wrangler.jsonc` serves `dist` through Cloudflare Workers with an SPA fallback | No deployment topology change or long-running function |
| Verification | `package.json:6-17` provides dev, build, typecheck, lint, test, check, and seed commands | Use the existing commands; add no package |

No AI SDK or model call participates in this feature. AI configuration, streaming, tool-call, and
prompt requirements are not applicable.

## Research findings (August 2026)

- Carbon's current data-table guidance puts search, filtering, settings, and global table actions
  in a table toolbar and recommends compact row sizes unless cells need multiple lines. This
  supports removing the card stack and putting a compact toolbar immediately above the queue.
- Material 3 identifies list-detail as the canonical layout for an explorable collection plus the
  selected item's details. Its responsive guidance shows summary and detail together on wider
  screens and one hierarchy level at a time on narrow screens.
- W3C APG distinguishes a native table from an interactive ARIA grid. This workflow does not need
  spreadsheet-style cell navigation, so it should keep semantic HTML table structure, expose
  explicit row activation, and avoid inventing incomplete grid keyboard behavior.
- 2026 speaker-management guidance from Accelevents and Sessionboard treats confirmation,
  profile readiness, and assigned tasks as distinct workflow states. Email delivery is a
  notification mechanism, not proof of confirmation.

Sources: [Carbon data table](https://carbondesignsystem.com/components/data-table/usage/),
[Material canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview),
[W3C table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/),
[Accelevents task management](https://support.accelevents.com/en/articles/10353205-task-management-for-speakers-and-sessions),
and [Sessionboard onboarding](https://learn.sessionboard.com/en/knowledge-base/7198497-new-client-onboarding-checklist).

### Navigation and routes

- Add canonical route `/program/speakers`.
- Keep `/dashboard/speakers` as `<Navigate replace>` to `/program/speakers`, preserving `location.search`.
- Move `Speakers` into the `PROGRAM` sidebar group after `Abstracts`.
- Remove `SpeakerTrackingContent` and the `StatusTabs` switcher from `DashboardHome`.
- Add one Dashboard nudge only when attention is required; it deep-links to the filtered queue.

## Data model

### Speaker confirmation

Add an optional field to stored speaker documents and a defaulted field to the application type:

```ts
type SpeakerConfirmationStatus = "awaiting" | "confirmed" | "declined";

interface Speaker {
  // existing fields
  confirmationStatus: SpeakerConfirmationStatus;
}
```

Existing records read as `awaiting`. A backfill is unnecessary because the default is applied at
the adapter boundary. New and updated records persist the explicit value.

Repository addition:

```ts
interface SpeakersRepo {
  // existing methods
  setConfirmationStatus(input: {
    eventId: EventId;
    speakerId: SpeakerId;
    status: SpeakerConfirmationStatus;
  }): Promise<void>;
}
```

Implement through `src/data/repo.ts`, `src/data/transport.ts`, `src/data/convex/index.ts`,
`convex/speakers.ts`, and `functions/api/data.ts`. The application `Speaker` type is required;
both adapters normalize a missing stored value to `awaiting`.

Exact mutation contract:

```ts
speakers.setConfirmationStatus({
  eventId: EventId,
  speakerId: SpeakerId,
  status: "awaiting" | "confirmed" | "declined",
}): Promise<void>
```

- Convex validator arguments use `v.id("events")`, `v.id("speakers")`, and a three-literal union.
  The handler calls `assertOrganizer`, reads `speakerId`, verifies `speaker.eventId === eventId`,
  patches `confirmationStatus` and `updatedAt`, and returns no payload.
- Airtable maps `speakers.setConfirmationStatus` to `Speakers`, loads the record before writing,
  returns 404 for an event mismatch, and PATCHes only canonical `confirmationStatus` plus
  `updatedAt`. The bridge may return the Airtable record internally; the repository contract
  intentionally resolves it as `void`.
- The Airtable endpoint remains protected by server-side Clerk verification and
  the Convex `organizers` table (`functions/api/data.ts`). A speaker portal caller cannot mutate
  this organizer-owned status.

Communication logs remain activity evidence only. Delete the current rule that maps `sent` to
`confirmed`.

## Read model

Create a pure projection helper outside the page component:

```ts
type SpeakerOperationsRow = {
  id: string;
  name: string;
  email?: string;
  confirmationStatus: SpeakerConfirmationStatus;
  profileState: "complete" | "bio_missing" | "headshot_missing" | "bio_and_headshot_missing";
  submissions: Array<{ id: string; title: string }>;
  tasks: OnboardingTask[];
  openTaskCount: number;
  overdueTaskCount: number;
  lastContactAt?: number;
};
```

Projection rules:

1. Start from every event-scoped speaker so manually added people remain visible.
2. Join submissions whose status is `accepted` and deduplicate session links by speaker id.
3. Ignore dangling submission speaker ids without crashing the roster.
4. Join all event tasks by `speakerId` and sort incomplete before completed, then due date.
5. Treat `pending` and `in_progress` as open; overdue means open with `dueDate < now`.
6. Derive profile state from `bio` and `headshotStorageKey`.
7. Join communication activity when a comm record exposes the same speaker id, but never derive
   confirmation from it.

Keep `now` as an explicit helper argument so overdue behavior is deterministic in tests.

## URL state

```text
q=<string>                normalized name/email search
view=all                  default, omitted from URL
view=needs-attention      open task OR incomplete profile OR awaiting response
view=overdue              overdueTaskCount > 0
view=awaiting             confirmationStatus === awaiting
view=profile-incomplete   profileState !== complete
selected=<speakerId>      opens inline detail pane
mode=add                  opens inline speaker-creation pane
hidden=<column,...>       hides optional roster columns
```

Unknown `view` values fall back to `all`. Changing search or view preserves `selected` only when
that speaker remains in the result; otherwise selection closes and focus returns to the filter.

## State and request flow

```text
RequireAuth + EventProvider
  -> repo.speakers/submissions/tasks/comms.list(eventId)
  -> projectSpeakerOperationsRows(..., now)
  -> URL q/view filters rows
  -> URL selected resolves one detail pane
  -> confirmation/task mutation
  -> scoped reload of affected collection(s)
  -> projection, table, and pane update together
```

Keep one page-level load state and separate action states for confirmation, task creation, and
each task-status write. An action failure must not invalidate successfully loaded page data.

## Frontend specification

### Toolbar

Use `ContentToolbar` as the first row inside the table surface:

- Search `Input`, labelled `Search speakers`, width `sm:w-72`.
- Styled app `Select`, labelled `Speaker view`, options All / Needs attention / Overdue /
  Awaiting response / Profile incomplete.
- Columns dropdown with checked visibility items; prevent hiding the final visible column.
- Add speaker is the toolbar primary action and opens the existing inline detail region.

The search input uses `h-9`; the view trigger uses `h-9 w-[11.5rem]`. At narrow widths the
existing `ContentToolbar` stacks them; both controls become full width without moving into the
page title row.

### Table

Use `DataGrid` with columns:

1. First name — identity with compact initial avatar.
2. Last name — its own sortable field.
3. Email — its own scannable contact field.
4. Confirmation — persisted status indicator.
5. Open tasks — count plus overdue treatment when non-zero.
6. Profile — Complete, Bio missing, Headshot missing, or Bio + headshot missing.
7. Sessions — accepted-session count; full titles appear in the pane.

Rows remain compact. Clicking a row writes `selected`. Render the native table as one framed data
surface with a sticky muted header, subtle row separators/striping, hover/selected states, and a
contained pagination footer. This pattern is adapted from the local Fio `DataTable`; it replaces
the earlier borderless list treatment. Extend `src/components/shared/DataGrid.tsx` only as needed
to accept an accessible row label, row ref/focus restoration, `aria-selected`, alignment, sortable
header buttons with `aria-sort`, a single consistent arrow per sortable header, and the embedded
table treatment. All seven columns sort locally; `sort` and `direction` preserve the choice in the
URL. Last name ascending is the default.

### Detail pane

Reuse `DetailPane`; do not use a modal or fixed sheet.

- Header: speaker name; email is passive metadata.
- `Accepted sessions`: linked titles to the relevant abstract detail when the route supports it.
- `Confirmation`: app `Select` plus Save. Disable Save when unchanged or saving.
- `Profile`: read-only completion list. Explain that speakers manage their own profile in the
  portal; do not impersonate or offer an unauthorized edit control.
- `Onboarding tasks`: each row shows title, due date, and state control. Provide an inline
  disclosure for `Add task` with title and optional date; successful creation collapses and clears
  the form.
- Use one action-local live region for success/error messages.

Desktop uses the existing shell's inline detail column. Below the shell's detail breakpoint, the
selected speaker replaces the queue body with a Back control so the table does not compete with a
cramped pane. The browser back button and pane Back/Close both clear only `selected` and preserve
`q` and `view`.

## Dashboard correction

Dashboard remains a quick orientation page. It must not import or render the operations queue.
Remove the `Today / Speaker Tracking` tabs. Add a nudge only when `needsAttention > 0`:

> 6 accepted speakers need onboarding attention → Review speakers

This requires the same pure summary projection or a small shared selector, not a second page-sized
component.

## Authorization

- Reads remain organizer-scoped through existing event repositories.
- `setConfirmationStatus` is organizer-only server-side and verifies speaker/event ownership.
- Task creation and status changes use existing organizer-gated task mutations.
- Never trust `speakerId` alone; every mutation includes or resolves `eventId`.
- The canonical page route is protected by `RequireAuth`; authorization is still enforced again
  at Convex/Airtable boundaries rather than relying on route protection.

## Edge cases

| Scenario | Behavior |
|---|---|
| No event | Configuration empty state with Event settings link |
| No accepted submissions | Workflow empty state with Abstracts link |
| Accepted submission references missing speaker | Skip broken row; do not crash the page |
| Co-speaker on two accepted submissions | One row, two session titles |
| Task without due date | Open but never overdue |
| Completed task with past due date | Not overdue |
| Existing speaker lacks confirmation field | Read as `awaiting` |
| Selected speaker disappears after reload | Close pane and remove `selected` |
| Confirmation save fails | Preserve previous status and show retryable inline error |
| Task creation is double-clicked | Disable while saving; append only the persisted result after reload |
| Airtable speaker belongs to another event | Return 404 and do not patch |
| Unknown Airtable confirmation value | Normalize to `awaiting`; never display an unchecked value |
| Direct unauthenticated route visit | Clerk auth boundary handles navigation; data APIs still reject the request |

## Testing strategy

### Unit

- Projection: accepted-only, deduplication, multiple submissions, task grouping/order, overdue
  boundary, profile state, communication not equal to confirmation.
- Filtering: normalized name/email search and every `view` predicate.
- Dashboard attention count from the same projected rows shown in the table.

### Component

- One framed data table replaces the summary strip, `StatCard`, and chart sections.
- Search and app `Select` synchronize URL parameters.
- Row selection opens the pane and close restores focus.
- Confirmation success/failure, task create validation/success/failure, task completion.
- No-event, no-accepted-speaker, filtered-empty, loading, and read-error states.
- Dashboard renders no Speaker Tracking tabs or duplicated workspace.

### Adapter/backend

- Convex organizer can update confirmation for a speaker in their event.
- Non-organizer and cross-event updates fail closed.
- Airtable field mapping round-trips all three statuses.
- Existing rows without the field normalize to `awaiting` in both adapters.

### Local browser

At desktop 1106×964 and a narrow mobile viewport:

1. Verify the table is visible in the first viewport and metrics are compact.
2. Search and exercise every filter; reload and confirm URL state survives.
3. Open a speaker, set confirmation, reload, and confirm persistence.
4. Create, start, and complete a task; verify counts update after each mutation.
5. Verify keyboard focus, pane close, empty states, and horizontal overflow.
6. Check console for runtime errors and inspect both light and dark themes if supported.

## Technical decisions

| Decision | Choice | Why |
|---|---|---|
| Product location | Program, not Dashboard | This is post-acceptance operational work, not passive overview reporting |
| Primary surface | Filterable table + detail pane | Organizers work person-by-person and need queue context preserved |
| Confirmation source | Explicit persisted field | Delivery proves contact, not agreement |
| Mutation surface | Existing repo abstraction | Convex and Airtable must remain behaviorally aligned |
| Reminder action | Out of scope | Current communications repository cannot send; a dead control would repeat the original defect |
| Route compatibility | Redirect old route | Avoid broken bookmarks while correcting IA |

## Risks and mitigations

- **Adapter drift:** add shared contract tests for defaulting and status round-trips.
- **Scope growth into CRM:** keep communication sending and profile editing out; the workspace owns
  readiness state and onboarding tasks only.
- **Dashboard duplication returning:** component test forbids `SpeakerTrackingContent` in
  `DashboardHome` and docs assign the queue to one canonical route.
- **All-zero demo:** browser verification requires seeded accepted speakers across every status and
  at least one overdue task; separately test the genuine empty state.
