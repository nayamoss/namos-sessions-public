# Portal Tasks

**Phase 7 · ~3-4h** · Written Brief #6 · Screenshot: *Portal > Tasks* (brief p.23)

Routes: `/portals/tasks` (admin), `/portal/tasks` (speaker)

## Goal

Tasks speakers complete after acceptance, plus the admin view of who still owes what. Written
Brief #6 — *"real-time dashboard showing which speakers still have outstanding onboarding
tasks"* — is this feature plus the Speaker Tracking dashboard tab.

## Best code reuse in the whole build

Kanrei's `src/pages/Tasks.tsx` and `TaskDetailPage.tsx` map onto this almost 1:1:
- Status filter chips + list pattern → the task list
- `TASK_STATUS_TRANSITIONS` → identical shape for `pending → in_progress → done`
- list → detail routing → unchanged

Rename `use-tasks.ts` → `use-onboarding-tasks.ts`, swap `assignee`/`control` for
`speakerId`/`submissionId`. Do not rewrite these pages from scratch.

## Screens

**Admin** (`/portals/tasks`) — "Create tasks that can be assigned to your portals."
Tabs: All Tasks · Contact Tasks · Group Tasks · Submission Tasks (with counts). Search.
Cards show title, a `Manual` badge, and target chips (`Contact`, `Session`).
Real examples from the screenshot: *"Hotel and Travel Reservations"*, *"Presentation Upload"*.
`+ Add` → Add Task / Copy from…

**Speaker** (`/portal/tasks`) — sections **Submission Tasks** and **My Tasks**, tabs
All / My Tasks (N) / Submissions (N), Open All / Collapse All, Filter. Also surfaced as the
Tasks card on portal Home.

## Schema

```ts
onboarding_tasks: defineTable({
  // A task targets a contact, a group, or a submission — per the admin tabs
  targetType: v.union(v.literal("contact"), v.literal("group"), v.literal("submission")),
  submissionId: v.optional(v.id("submissions")),
  speakerId: v.optional(v.id("speakers")),
  title: v.string(),
  description: v.optional(v.string()),
  source: v.union(v.literal("manual"), v.literal("auto")),   // "Manual" badge in the UI
  linkedFormId: v.optional(v.id("submission_forms")),        // → portal-forms
  status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("done")),
  dueDate: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_speaker", ["speakerId"])
  .index("by_submission", ["submissionId"]).index("by_status", ["status"]),
```

## Auto-creation on acceptance

When `decideSubmission` moves a submission to `accepted`, create a default task set
(`source: "auto"`): Upload headshot · Confirm bio · Upload slides · Sign speaker agreement.
**Idempotent** — a retry must not duplicate (Airtable has no transactions).

## Real-time requirement

Written Brief #6 says *real-time*. On Convex this is a live query and free. Expose it through
a `useOutstandingTasks()` hook so the Airtable polling fallback stays isolated — see
[`ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Tasks

1. `OnboardingTasksRepo`: `listBySpeaker`, `listOutstanding`, `updateStatus`, `create`
2. Adapt `Tasks.tsx` / `TaskDetailPage.tsx`
3. Admin task list w/ target-type tabs, Add Task
4. Speaker task view (two sections, collapse/expand)
5. Auto-creation hook in `decideSubmission`
6. Task ↔ form linkage (see [portal-forms](../portal-forms/plan.md))

## Verification

- [ ] Accepting a submission creates the default set exactly once
- [ ] Speaker sees only their own tasks
- [ ] Marking done updates the admin outstanding view without a manual refresh
- [ ] Seed data leaves several accepted speakers with outstanding tasks (so the view isn't empty)

## Cut line

Keep: speaker task list, status transitions, auto-creation, admin outstanding view.
Droppable: Contact/Group task types (submission tasks are what matter), Copy from…,
task↔form linkage.
