# Reviewer Progress Tracking + Bulk Reminders — Implementation Plan

**Est. ~4-5h** · Surface: `/program/evaluation` · Additive to
[`evaluation-scoring`](../evaluation-scoring/plan.md)

Read first: [`requirements.md`](./requirements.md) · [`design.md`](./design.md) ·
[`AGENTS.md`](../../../AGENTS.md) · [`DESIGN-SYSTEM.md`](../../DESIGN-SYSTEM.md)

**No schema change. No cron. No new email send path.**


> **Implementation correction (2026-08-11).** The serverless send path described below was
> **not** built that way. The application deploys on Cloudflare Workers, while the
> the comms/email-integration work has already ported all send logic into Convex Node actions.
> Reviewer reminders therefore ship as:
>
> - `convex/emailDelivery.ts` (`"use node"`) — the shared encryption + provider-send layer,
>   extracted from `convex/emailIntegrationsActions.ts` so there is exactly one implementation.
>   Exposes `deliverEventEmail(ctx, eventId, message)`, which resolves the per-event
>   Resend/SES integration and falls back to `RESEND_API_KEY` / `RESEND_FROM_EMAIL`.
> - `convex/reviewerRemindersActions.ts` → `send` — the organizer-gated action. Auth is
>   `assertOrganizerAction` (the same `organizers` table row every other surface checks) rather
>   than `EVENT_ADMIN_USER_IDS`, which no longer exists. Recipient selection is still
>   server-side from a fresh `evaluations:reviewerProgress` read, still one email per reviewer,
>   still logs every attempt through `comms:recordDelivery`.
> - The batch result shape (`status` / `requested` / `sent` / `failed` / `skippedNoEmail` /
>   `results[]`) is unchanged; it is an action return value instead of an HTTP body, so the
>   `200` vs `202` distinction becomes the `status` field alone.
>
> Everything else below — the derived query, the row shape, the UI spec, the edge cases, the
> "no cron, ever" decision — is as built.

---

## Phase 1 — Shared computation helper (~45m)

**T1.1** Create `src/lib/reviewer-progress.ts`:

```ts
export type ReviewerProgressRow = {
  reviewerUserId: string;
  assigned: number;
  completed: number;
  outstanding: number;
  completionRate: number;   // integer 0..100
  emailResolved: boolean;
  toEmail?: string;
};

export function computeReviewerProgress(
  assignments: Array<{ id: string; reviewerUserId: string }>,
  reviews: Array<{ assignmentId?: string; score?: number }>,
  speakerEmails: string[],
): ReviewerProgressRow[];
```

- Build `scoredAssignmentIds` from reviews with an `assignmentId` **and** a numeric `score`
  (FR-003 — an ad-hoc review with no `assignmentId` counts for nobody).
- Group by `reviewerUserId`; `completionRate = assigned ? Math.round(completed/assigned*100) : 0`.
- Email resolution (FR-007): `reviewerUserId` if it matches
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, else a case-insensitive hit in `speakerEmails`, else
  `emailResolved: false`.
- Sort by `completionRate` asc, then `reviewerUserId` asc (FR-004).
- Pure. No Convex imports. Mirrors `src/lib/evaluation-score.ts`.

**T1.2** Unit tests in `src/test/reviewer-progress.test.ts`: zero assignments; all complete;
mixed; ad-hoc review excluded; email-shaped reviewer id; speaker-email match; unresolvable;
sort order stability; multi-round aggregation into one row (E9).

---

## Phase 2 — Convex query (~30m)

**T2.1** Append `reviewerProgress` to `convex/evaluations.ts` — **append only**, do not touch
`savePlan`, `assign`, or `save` (keeps the diff disjoint from `evaluation-scorecards`).

```ts
export const reviewerProgress = query({
  args: { eventId: v.id("events"), evaluationPlanId: v.id("evaluation_plans") },
  handler: async (ctx, args) => { /* … */ },
});
```

- `get` the plan; return `[]` if missing or `plan.eventId !== args.eventId` (FR-005).
- `evaluation_assignments.withIndex("by_plan")` + `evaluations.withIndex("by_event")` +
  `speakers.withIndex("by_event")` — three collects, no per-row fan-out (FR-017).
- Delegate to `computeReviewerProgress`; map assignment `_id` → `id` before passing in.

**T2.2** No `convex/schema.ts` edit. No `convex/comms.ts` edit — `recordDelivery` already
accepts `{ eventId, channel, status, toEmail, subject, error }` with `speakerId` /
`submissionId` omitted.

---

## Phase 3 — Data adapter (~30m)

**T3.1** `src/data/repo.ts`: add to `EvaluationRepo`

```ts
reviewerProgress(input: EventScope & { evaluationPlanId: string }): Promise<ReviewerProgressRow[]>;
```

**T3.2** `src/data/convex/index.ts`: add `"evaluations.reviewerProgress": "evaluations:reviewerProgress"`
to the operation map. **Do not** add it to the `documentRows(...)` branch — the response is
plain objects without `_id`.

**T3.3** Airtable adapter: fetch plan assignments + evaluations + speaker emails, call the same
`computeReviewerProgress`. One implementation, two adapters (TD-9).

---

## Phase 4 — Convex send action (~1h)

**T4.1** Create `convex/reviewerRemindersActions.ts`; do not reuse the retired speaker-task
reminder handler (speaker-task specific, and inside required requirement #3; TD-3).

Import `assertOrganizerAction` and `deliverEventEmail` from `convex/emailDelivery.ts`.

**T4.2** Validation → `requireOrganizer(request)` → server-side re-read of
`evaluations:reviewerProgress` via `ConvexHttpClient` → select recipients (single
`reviewerUserId`, or `completionRate < thresholdPercent`) → drop `emailResolved === false`.
The client never supplies a recipient list (TD-6).

**T4.3** Sequential per-recipient loop: build message → `deliverEventEmail` →
`comms:recordDelivery` (`sent` / `failed` with the provider message) → **continue on failure**
(FR-013). `recordDelivery` wrapped in `try {} catch {}` — a log outage never changes the
provider result (E6).

**T4.4** Response exactly as `design.md` §2.3: `200` when ≥1 sent, `202` with
`status: "failed"` or `"skipped"`; body always
`{ status, requested, sent, failed, skippedNoEmail, results[] }`.

**T4.5** Message template — `design.md` §2.4. Plain text, no submission titles, one email per
reviewer regardless of outstanding count (TD-5).

**T4.6** Tests in `src/test/reviewer-reminder-email.test.ts`, following the existing
`src/test/calendar-email-attachment.test.ts` pattern of importing the `.mjs` handler directly:
non-POST → 405; bad JSON → 400; both selectors / neither → 400; threshold out of range → 400;
no token → 401; provider unconfigured → 202 `skipped` with every attempt logged; one failing
recipient among three → 200, `sent: 2`, `failed: 1`, three `recordDelivery` calls.

---

## Phase 5 — Frontend UI (REQUIRED) (~1.5h)

New component `src/components/program/ReviewerProgressPanel.tsx`, rendered from
`src/pages/program/Evaluation.tsx` in the `surface === "plans"` branch, **between** the plans
`<DataGrid>` and the "Create evaluation plan" section, only when `selectedPlan` is set.
`Evaluation.tsx` passes `eventId`, `plan`, and a `refreshKey` it bumps after its existing
`load()` so progress refreshes when a score is saved (FR-006).

### UI Spec (authoritative — build exactly this)

**Container** — `<section className="rounded-lg bg-card p-5">`, identical to the sibling
sections in this file. **No border, no shadow, no gradient, no `<hr>`, no `divide-*`.**

**Header row** — `flex flex-wrap items-end justify-between gap-3`
- Left: `<h2 className="font-semibold">Reviewer progress</h2>` +
  `<p className="mt-1 text-sm text-muted-foreground">Completion is derived from assignments and
  submitted scores on this plan. Reminders are sent only when you press the button.</p>`
- Right (filters left, actions right): threshold control, then the bulk button.

**Threshold control**
```tsx
<label htmlFor="reminder-threshold" className="text-sm text-muted-foreground">Below</label>
<input id="reminder-threshold" type="number" min={1} max={100} step={5}
       value={threshold} onChange={…}
       className="h-9 w-20 rounded-md bg-background px-3 text-sm" />
<span className="text-sm text-muted-foreground">% complete</span>
```
Same `inputClass` shape already used in `Evaluation.tsx`. Background contrast defines the
field — **no border, no hard focus ring.** Clamp 1–100 on blur; empty → `50`.

**Bulk action** — `<Button variant="secondary" size="sm">Remind all below {threshold}%</Button>`.
Neutral, no border, **never blue**. When some reviewers lack an email, append
`(2 of 3 have an email)`.
Disabled when `remindableCount === 0`, a send is in flight, or `rows.length === 0`. Helper text
below in `text-xs text-muted-foreground`:
- all complete → `Every reviewer on this plan is complete.`
- none resolvable → `No reviewer on this plan has an email address on file.`

**Table** — `<div className="mt-4 overflow-x-auto"><table className="w-full text-sm">`.
`<thead>` row is `text-left text-muted-foreground` with **no `border-b`**; body rows have **no
`border-b`**. Separation is padding (`p-2`) only — do not copy the `border-b` from the
"Assign submissions" table above it.

| Column | Content | Class |
|---|---|---|
| Reviewer | `reviewerUserId`; if `!emailResolved`, second line `No email on file` | `p-2 font-medium` / `block text-xs text-muted-foreground` |
| Assigned | `assigned` | `p-2 tabular-nums` |
| Completed | `completed` | `p-2 tabular-nums` |
| Complete | `{completionRate}%` above the meter | `p-2` |
| — | reminder cell | `p-2 text-right` |

**Progress meter** — not `<progress>` (draws browser chrome/border):
```tsx
<div className="mt-1 h-1.5 w-24 rounded-full bg-muted" aria-hidden>
  <div className="h-1.5 rounded-full bg-[hsl(var(--success))]" style={{ width: `${rate}%` }} />
</div>
```
`--success` at 100%, `bg-primary` (coral accent) below. The `{rate}%` text above carries the
accessible value.

**Reminder cell — three inline states. No dialogs.**
1. *Idle* — `<Button variant="ghost" size="sm">Remind</Button>`; disabled at 100%
   ("Complete") or `!emailResolved` ("No email on file").
2. *Confirming* — the button is **replaced in the same cell** by
   `<span className="text-xs text-muted-foreground">Send reminder?</span>` +
   `<Button variant="accent" size="sm">Confirm send</Button>` +
   `<Button variant="ghost" size="sm">Cancel</Button>`. **No `window.confirm`, no
   `alert-dialog`, no overlay, no `position: fixed`.** Only one row confirming at a time.
3. *Result* — `text-xs text-[hsl(var(--success))]` `Reminded` or
   `text-xs text-destructive` `Could not send — {error}`, plus a `Remind again` ghost button.

**Bulk confirmation** — same inline swap at panel level:
`Send 3 reminders?` + `Confirm send` + `Cancel`.

**Bulk result block** — `<div className="mt-4 space-y-1 text-sm" role="status" aria-live="polite">`:
`Sent 2 of 3 reminders.` then one `text-xs` line per non-sent recipient
(`pc@conf.dev — Resend rejected the message (422).`,
`Reviewer 2 — no email on file, not sent.`). Clears on plan change.

**Loading / empty** — `<SkeletonList />` while loading; `<EmptyState>` with
`No reviewers assigned to this plan yet.` / `Assign submissions to reviewers below to start
tracking completion.` In the empty state the threshold control and bulk button are **not
rendered**.

**Responsive** — header wraps below `md`; the table scrolls in its own `overflow-x-auto`
container; the page body never scrolls horizontally.

**Dark mode** — tokens only (`bg-card`, `bg-background`, `bg-muted`, `text-muted-foreground`,
`text-destructive`, `hsl(var(--success))`, `bg-primary`). No literal hex.

**Page header** — `AppLayout title="Evaluation"` is untouched; it holds only the title. All
controls stay inside the working surface.

### State

```ts
rows, loading, threshold (default 50),
confirming: { kind: "row"; reviewerUserId } | { kind: "bulk" } | undefined,
sending: string | "bulk" | undefined,   // guards double-click (E10)
rowResult: Map<string, { status; error? }>,
bulkResult, error
```

Send calls attach `Authorization: Bearer ${await getToken()}` from Clerk `useAuth()`.
`401` → inline `role="alert"` "Your session expired. Reload and try again."; `403` → surface the
server message verbatim. The table stays rendered through every send failure.

---

## Phase 6 — Seed + verification support (~30m)

**T6.1** ⚠️ **Risk 1 mitigation.** Seed data currently assigns reviewers as demo strings
(`"Reviewer 1"`). Ensure at least **two** seeded `evaluation_assignments` use a
`reviewerUserId` that is a real email address, and keep at least one non-email reviewer so the
"No email on file" state is demonstrable. Without this the headline feature demos as a
disabled button.

**T6.2** Seed at least one reviewer at 100% and one under 50%, so both the disabled and the
active reminder states are visible on a fresh demo.

**T6.3** Confirm `EVENT_ADMIN_USER_IDS` includes the demo organizer's Clerk user id, or every
send returns `403` (Risk 3).

---

## Phase 7 — Docs (~15m)

**T7.1** Add the feature row to `docs/features/INDEX.md` **in the same commit as the
implementation** (AGENTS.md Rule 1).

**T7.2** Note in the README cut log: reminders are on-demand only, deliberately — automatic
scheduled reminders were excluded to avoid unattended sends. The tiebreaker rewards documented
judgment calls.

---

## Task Dependencies

```
T1.1 computeReviewerProgress
 ├─→ T1.2 helper tests
 ├─→ T2.1 convex query ──→ T3.2 convex adapter ─┐
 └─────────────────────→ T3.3 airtable adapter ─┤
                          T3.1 repo interface ──┴─→ Phase 5 UI (table half)
                                                        │
T2.1 ──→ T4.2 recipient selection ──→ T4.3 send loop ──→ T4.4 response ──┬─→ Phase 5 UI (send half)
                                                          T4.5 template ─┘
                                      T4.6 function tests
Phase 5 ──→ Phase 6 seed ──→ Phase 7 docs
```

- **T1.1 blocks everything.** Write it first.
- Phases 2/3 (read path) and Phase 4 (send path) are independent after T1.1 and T2.1 — the
  progress table can be built and demoed with the Remind buttons disabled.
- Phase 6 blocks a *live* demo of the reminder, not the implementation.
- Nothing here blocks or is blocked by `evaluation-scorecards`: no schema edit, append-only in
  `convex/evaluations.ts`, single-insert diff in `Evaluation.tsx`.

---

## Verification Checklist

### Progress query
- [ ] A plan with 3 reviewers × 4 submissions shows 3 rows with `assigned: 4` each
- [ ] Scoring one assignment moves that reviewer to `1 / 4 · 25%` without a page reload
- [ ] Rows are ordered least-complete first, stably
- [ ] An `evaluations` row with no `assignmentId` does not count toward anyone (E8)
- [ ] A plan id from another event returns `[]` and renders the empty state, no error (E7)
- [ ] Same reviewer across rounds 1 and 2 appears as one aggregated row (E9)
- [ ] Both adapters (Convex, Airtable) return identical shapes for the same fixture

### Reminder send
- [ ] Single Remind sends exactly one email and writes exactly one `comms_log` row
- [ ] A reviewer with 7 outstanding gets **one** email saying "7 of 9", not seven emails (M2)
- [ ] Bulk at threshold 50 selects only reviewers strictly under 50%
- [ ] One bad address among three → `200`, `sent: 2`, `failed: 1`, **three** `comms_log` rows,
      per-recipient errors listed (M3)
- [ ] Reviewer with no resolvable email is never sent to, is excluded from the count, and is
      reported as `skipped / No email on file` (E3)
- [ ] With `RESEND_API_KEY` and any integration removed: `202 skipped`, one explanatory line,
      progress table still fully functional, all attempts logged (E5)
- [ ] `POST` without an `Authorization` header → `401`; a non-admin Clerk user → `403`
- [ ] A stale tab requesting a reviewer who has since hit 100% does not send (server re-read)
- [ ] Recipient list is never accepted from the client — grep the function for any
      client-supplied `toEmail`

### UI + design rules
- [ ] `grep -rn "window.confirm\|window.alert\|window.prompt" src/` returns nothing (M6)
- [ ] No `border-`, `shadow-`, `divide-`, `<hr>`, or gradient class in
      `ReviewerProgressPanel.tsx`
- [ ] The table has no `border-b` on `<thead>` or body rows
- [ ] No blue button anywhere in the panel; primary confirm uses the coral accent
- [ ] Confirmation is inline in the cell — no overlay, no `position: fixed`, nothing covers
      content
- [ ] `border-radius` ≤ 14px on every container (`rounded-lg` / `rounded-md`; `rounded-full`
      only on the 1.5px-tall meter)
- [ ] `AppLayout title="Evaluation"` unchanged — page header holds only the title
- [ ] Threshold (filter) sits left of the bulk button (action) in the right-hand cluster
- [ ] Zero reviewers → `EmptyState`, threshold and bulk button not rendered (E1)
- [ ] All reviewers 100% → bulk button disabled with "Every reviewer on this plan is
      complete."; all per-row Remind buttons disabled (E2)
- [ ] Double-clicking Confirm send fires one request (E10)
- [ ] Readable in light and dark mode; no literal hex colours
- [ ] Below `md` the header wraps and only the table scrolls horizontally

### No-regressions
- [ ] `convex/schema.ts` diff is empty
- [ ] `convex/comms.ts` diff is empty
- [ ] The existing speaker-task reminder behavior and tests still pass
- [ ] No `crons.ts`, no scheduled function, no `ctx.scheduler` call added (M5)
- [ ] Existing four `StatCard`s on `/program/evaluation` still render the same numbers
- [ ] `npm run typecheck` and `npm run lint` clean; `npx convex dev --typecheck` clean
- [ ] `docs/features/INDEX.md` updated in the same commit as the implementation
