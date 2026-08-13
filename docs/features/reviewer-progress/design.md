# Reviewer Progress Tracking + Bulk Reminders — Design

Companion to [`requirements.md`](./requirements.md). Read
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) and [`DESIGN-SYSTEM.md`](../../DESIGN-SYSTEM.md)
first — this design adds nothing new to either.


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

## 1. Architecture at a glance

```
Evaluation.tsx  (Evaluation plans tab, plan detail section)
      │
      ├─ repo.evaluations.reviewerProgress({ eventId, evaluationPlanId })
      │        └─ convex  evaluations:reviewerProgress   (query, derived)
      │        └─ airtable adapter equivalent
      │
      └─ convex reviewerRemindersActions:send   (organizer-authed)
               ├─ assertOrganizerAction()
               ├─ convex evaluations:reviewerProgress (server re-read, authoritative)
               ├─ deliverEventEmail()           ← convex/emailDelivery.ts (Resend | SES | fallback)
               └─ convex comms:recordDelivery   (one row per recipient, always)
```

Nothing is stored. The progress table is a projection; the reminder is a request/response.

---

## 2. Backend / API

### 2.1 Schema

**No schema change.** `convex/schema.ts` is untouched. This is the load-bearing decision — see
§7 TD-1.

Existing tables and indexes used, all already present:

| Table | Index used | Purpose |
|---|---|---|
| `evaluation_assignments` | `by_plan` (`evaluationPlanId`) | the denominator |
| `evaluations` | `by_event` (`eventId`) | the numerator, matched on `assignmentId` |
| `evaluation_plans` | direct `get` | plan name + event ownership check |
| `speakers` | `by_event` | email resolution fallback (FR-007b) |
| `events` | direct `get` | event name for the email body |
| `comms_log` | written via `comms:recordDelivery` | delivery audit |

### 2.2 New query — `convex/evaluations.ts` → `reviewerProgress`

```ts
export const reviewerProgress = query({
  args: { eventId: v.id("events"), evaluationPlanId: v.id("evaluation_plans") },
  handler: async (ctx, args) => { /* see algorithm below */ },
});
```

**Algorithm**

1. `plan = await ctx.db.get(args.evaluationPlanId)`. If missing **or**
   `plan.eventId !== args.eventId`, return `[]` (FR-005 — return empty, do not throw; a stale
   `selectedPlanId` in the UI must not blank the page with an error).
2. `assignments = ctx.db.query("evaluation_assignments").withIndex("by_plan", …).collect()`.
3. `reviews = ctx.db.query("evaluations").withIndex("by_event", …).collect()`; build
   `scoredAssignmentIds = new Set(reviews.filter(r => r.assignmentId && typeof r.score === "number").map(r => r.assignmentId))`.
   Mirrors the existing `reviewByAssignment` map in `Evaluation.tsx` — FR-003.
4. Group assignments by `reviewerUserId`; `assigned = group.length`,
   `completed = group.filter(a => scoredAssignmentIds.has(a._id)).length`.
5. `completionRate = assigned ? Math.round((completed / assigned) * 100) : 0`.
6. Resolve email (FR-007): if `reviewerUserId` matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, use it;
   else look it up in a `Map` built once from `speakers.by_event` keyed on lowercased `email`;
   else `emailResolved: false`.
7. Sort ascending by `completionRate`, then `reviewerUserId` (FR-004).

**Response shape**

```ts
type ReviewerProgressRow = {
  reviewerUserId: string;   // "Reviewer 2" | "chair@conf.dev"
  assigned: number;         // 9
  completed: number;        // 2
  outstanding: number;      // 7  (assigned - completed, precomputed for the email body)
  completionRate: number;   // 22  (integer 0..100)
  emailResolved: boolean;   // false
  toEmail?: string;         // present only when emailResolved
};
// query returns ReviewerProgressRow[]
```

`toEmail` is returned to the browser deliberately: it is an organizer-only surface behind the
same auth as every other `/program/*` query, and the UI needs it to explain *why* a Remind
button is disabled. It is never rendered as a mailto or copied into any public surface.

### 2.3 Organizer-gated Convex reminder action

A **new file**, not a change to `reminder-email.mjs`. That function's contract requires
`submissionId`, `speakerId`, `sessionTitle` and `portalUrl` and its body is speaker-task
prose; it is task-specific and cannot be reused as-is (see §7 TD-3).

**Request**

```
convex reviewerRemindersActions:send
```

```jsonc
{
  "eventId": "j57...",              // required
  "evaluationPlanId": "k91...",     // required
  "queueUrl": "https://…/program/evaluation",  // required, absolute
  // exactly one selector:
  "reviewerUserId": "chair@conf.dev",  // single-reviewer send
  "thresholdPercent": 50               // bulk send: completionRate < 50
}
```

Validation, in order, each returning `400` with `{ "error": "<message>" }`:
`eventId` / `evaluationPlanId` / `queueUrl` non-empty strings; exactly one of
`reviewerUserId` / `thresholdPercent` present; `thresholdPercent` an integer 1–100.
Non-`POST` → `405`. Unparseable body → `400`. Missing/invalid token → `401`; authenticated but
not in `EVENT_ADMIN_USER_IDS` → `403` (both from `requireOrganizer`, FR-016).

**Handler flow**

1. `const userId = await requireOrganizer(request)`.
2. Re-read progress **server-side** via `ConvexHttpClient.query("evaluations:reviewerProgress", { eventId, evaluationPlanId })`.
   The client-supplied threshold selects; the client never supplies the recipient list. A
   stale browser tab therefore cannot email a reviewer who has since finished.
3. Select recipients: single → the one row matching `reviewerUserId`; bulk → rows with
   `completionRate < thresholdPercent`. Then drop every row with `emailResolved === false`
   (FR-008).
4. For each recipient **sequentially** (batch size at demo scale is < 20; sequential keeps
   provider rate limits and `comms_log` ordering trivially safe):
   - build the message (§2.4),
   - `await deliverEventEmail(eventId, { to, subject, text })`,
   - `await recordDelivery({ … status: "sent" })`,
   - on throw: capture `error.message`, `recordDelivery({ … status: "failed", error })`,
     continue to the next recipient (FR-013).
5. If `deliverEventEmail` throws `"Email provider is not configured."` for the *first*
   recipient, still attempt and log the rest — each will fail identically and each gets its
   own `comms_log` row. Overall `status` becomes `"skipped"` when **every** failure is the
   not-configured error, so the UI can say "Email provider is not configured" instead of
   showing five identical red rows.

**Response — `200` when at least one send succeeded**

```jsonc
{
  "status": "sent",
  "requested": 3,
  "sent": 2,
  "failed": 1,
  "skippedNoEmail": 1,
  "results": [
    { "reviewerUserId": "chair@conf.dev", "toEmail": "chair@conf.dev", "status": "sent" },
    { "reviewerUserId": "pc@conf.dev",    "toEmail": "pc@conf.dev",    "status": "failed",
      "error": "Resend rejected the message (422)." },
    { "reviewerUserId": "Reviewer 2",     "status": "skipped", "reason": "No email on file" }
  ]
}
```

**Response — `202`** with the same body shape and `status: "failed"` (every attempt failed) or
`status: "skipped"` (provider not configured, or no recipient had an email). `202` rather than
`5xx` follows `decision-email.mjs` and `reminder-email.mjs`: the request was understood and
recorded; only delivery did not happen. **Email degrades, never blocks.**

`recordDelivery` writes `{ eventId, channel: "email", status, toEmail, subject, error }` and
omits `speakerId` / `submissionId` — a reviewer reminder is bound to neither, and both fields
are already `v.optional` in `comms_log`. **No `comms.ts` or schema change is required.** The
existing `recordDelivery` mutation already accepts this argument set.

> ⚠️ **`comms:recordDelivery` is a public mutation with no auth.** That is pre-existing (every
> retired serverless handlers called it unauthenticated) and this feature does not widen it, but it
> is noted here so the follow-up is not lost. Out of scope for this issue.

### 2.4 Message template (server-side, fixed)

```
Subject: Reviews outstanding for {eventName}

Hi {reviewerUserId},

You have {outstanding} of {assigned} assigned review{s} still to complete for
{eventName} ({planName}).

Open your reviewer queue: {queueUrl}

Thank you — the program committee.
```

Plain text only, matching the other transactional emails. No submission titles
(FR-010). `{s}` pluralises. `queueUrl` comes from the browser (it knows the deployed origin);
it is validated as a non-empty string and sent verbatim — it is organizer-supplied, and the
endpoint is organizer-authed.

### 2.5 Data adapter

`EvaluationRepo` in `src/data/repo.ts` gains one method:

```ts
reviewerProgress(input: EventScope & { evaluationPlanId: string }): Promise<ReviewerProgressRow[]>;
```

- **Convex** (`src/data/convex/index.ts`): add
  `"evaluations.reviewerProgress": "evaluations:reviewerProgress"` to the operation map. The
  response is a plain array of plain objects (not documents), so it needs **no** entry in the
  `documentRows(...)` id-mapping branch on line 28 — that branch is for rows carrying `_id`.
- **Airtable** (`src/data/airtable/`): fetch plan assignments and evaluations and run the same
  grouping in TypeScript. Extract steps 3–7 into a shared pure helper —
  `src/lib/reviewer-progress.ts`, exporting
  `computeReviewerProgress(assignments, reviews, speakerEmails): ReviewerProgressRow[]` — so
  both adapters and the unit tests use one implementation. This mirrors
  `src/lib/evaluation-score.ts`.

---

## 3. Frontend Components

### 3.1 Where it goes

`src/pages/program/Evaluation.tsx`, `surface === "plans"` branch, inserted **between** the
existing `<DataGrid rows={planRows}>` (line ~159) and the "Create evaluation plan" section.
It renders only when `selectedPlan` is set — it is the detail view for the currently selected
plan, which the plan-name button in the grid already sets via `selectPlan(row.id)`.

New component: `src/components/program/ReviewerProgressPanel.tsx`. Kept out of
`Evaluation.tsx` because that file is already 173 dense lines.

```
AppLayout title="Evaluation"            ← page header holds the title only. Unchanged.
  StatusTabs                            ← unchanged
  ContentToolbar                        ← unchanged
  StatCard × 4                          ← unchanged (aggregate stats stay)
  DataGrid (plans)                      ← unchanged
  ▼ ReviewerProgressPanel               ← NEW
  Create evaluation plan section        ← unchanged
  Assign submissions section            ← unchanged
```

### 3.2 UI Spec — `ReviewerProgressPanel`

**Container.** `<section className="rounded-lg bg-card p-5">` — identical to the sibling
"Create evaluation plan" and "Assign submissions" sections. `rounded-lg` is 8px in this repo's
token set, inside the 10–14px ceiling. **No border. No shadow. No gradient. No `<hr>`, no
`divide-*`.**

**Header row.** `flex flex-wrap items-end justify-between gap-3`.
- Left: `<h2 className="font-semibold">Reviewer progress</h2>` and beneath it
  `<p className="mt-1 text-sm text-muted-foreground">Completion is derived from assignments and
  submitted scores on this plan. Reminders are sent only when you press the button.</p>`
- Right (the toolbar cluster — filters left, actions right, per DESIGN-SYSTEM): the threshold
  input then the bulk button.

**Threshold input.**
```tsx
<label htmlFor="reminder-threshold" className="text-sm text-muted-foreground">Below</label>
<input id="reminder-threshold" type="number" min={1} max={100} step={5}
       value={threshold} onChange={…}
       className="h-9 w-20 rounded-md bg-background px-3 text-sm" />
<span className="text-sm text-muted-foreground">% complete</span>
```
Reuses the exact `inputClass` pattern already in `Evaluation.tsx` (`h-9 rounded-md
bg-background px-3 text-sm`) — **background contrast defines the field, no border, no hard
focus ring.** Clamped to 1–100 on blur; a cleared field falls back to `50`.

**Bulk action.** `<Button variant="secondary" size="sm">` — secondary, neutral background, no
border, **never blue**. Label: `Remind all below {threshold}%`. When some reviewers lack an
email, append the count: `Remind all below 50% (2 of 3 have an email)`.

Disabled when any of: `remindableCount === 0`; a send is in flight; `rows.length === 0`.
Disabled-state helper text renders as `text-xs text-muted-foreground` under the button:
- all complete → `Every reviewer on this plan is complete.`
- none resolvable → `No reviewer on this plan has an email address on file.`

**Table.** A plain `<table className="w-full text-sm">` in an
`<div className="mt-4 overflow-x-auto">`, matching the "Assign submissions" table already in
this file. `<thead>` row: `text-left text-muted-foreground` — **drop the `border-b`** that the
existing table uses; header/body separation is whitespace (`py-2`) only. Body rows carry **no
`border-b`**. Zebra striping is not used either; rows are separated by padding.

| Column | Content | Class |
|---|---|---|
| Reviewer | `reviewerUserId`; when `!emailResolved`, a second line `No email on file` | `p-2 font-medium` / second line `block text-xs text-muted-foreground` |
| Assigned | `assigned` | `p-2 tabular-nums` |
| Completed | `completed` | `p-2 tabular-nums` |
| Complete | `{completionRate}%` + progress meter | `p-2` |
| — | reminder cell (see below) | `p-2 text-right` |

**Progress meter.** Not a `<progress>` element (browser chrome varies and draws a border).
Two divs:
```tsx
<div className="mt-1 h-1.5 w-24 rounded-full bg-muted">
  <div className="h-1.5 rounded-full bg-[hsl(var(--success))]" style={{ width: `${rate}%` }} />
</div>
```
`bg-[hsl(var(--success))]` at 100%, `bg-primary` (the coral accent) below — the same success
token `Evaluation.tsx` already uses for "Complete". Accessible name via the numeric `{rate}%`
text that sits directly above it; the bars are `aria-hidden`.

**Reminder cell — three states, no dialogs (FR-014).**

1. *Idle*: `<Button variant="ghost" size="sm">Remind</Button>`.
   Disabled when `completionRate === 100` (title/`aria-describedby`: "Complete") or
   `!emailResolved` ("No email on file").
2. *Confirming*: the button is **replaced in place** by
   `<span className="text-xs text-muted-foreground">Send reminder?</span>` plus
   `<Button variant="accent" size="sm">Confirm send</Button>` and
   `<Button variant="ghost" size="sm">Cancel</Button>`. Inline, in the same cell, pushing
   nothing. **No `alert-dialog`, no overlay, no `window.confirm`** — a reminder is not
   destructive, so even the sanctioned overlay is unwarranted.
3. *Result*: `<span className="text-xs text-[hsl(var(--success))]">Reminded</span>` or
   `<span className="text-xs text-destructive">Could not send — {error}</span>`, with a
   `Remind again` ghost button beside it.

Only one row may be in the *confirming* state at a time — opening a second collapses the first.

**Bulk confirmation.** Identical inline pattern at the panel level: pressing
`Remind all below 50%` swaps that button for `Send 3 reminders?` + `Confirm send` + `Cancel`.

**Bulk result block.** Below the table, `<div className="mt-4 space-y-1 text-sm">`:
- `<p>Sent 2 of 3 reminders.</p>`
- then one `text-xs` line per non-sent recipient: `pc@conf.dev — Resend rejected the message (422).`
  and `Reviewer 2 — no email on file, not sent.`
- The block is `role="status"` `aria-live="polite"`, and clears when the plan selection changes.

**Loading / empty.**
- Loading: `<SkeletonList />` (existing shared component) in place of the table body.
- Empty: `<EmptyState>` (existing shared component) — `No reviewers assigned to this plan yet.`
  with body text `Assign submissions to reviewers below to start tracking completion.` The
  threshold control and bulk button are **not rendered** at all in this state (US-5).

**Responsive.** Below `md`, the header row wraps (`flex-wrap`) so the threshold control and
button stack under the heading; the table scrolls inside its own `overflow-x-auto` container.
The page body never scrolls horizontally.

**Dark mode.** Every colour is a token (`bg-card`, `bg-background`, `bg-muted`, `text-muted-
foreground`, `text-destructive`, `hsl(var(--success))`, `bg-primary`). No literal hex.

### 3.3 Design-rule self-check

| Rule | Compliance |
|---|---|
| No visible border on cards / buttons / inputs, incl. hover + focus | `bg-card` / `bg-background` contrast only; the repo's global `border-style: none !important` plus soft focus glow already enforce this — do not add `border-*` classes |
| No box-shadow | none used |
| No gradient | meter is two flat fills |
| No `<hr>` / divider / `divide-*` / gap+bg fake dividers | table header `border-b` deliberately dropped; separation is padding |
| `border-radius` ≤ 14px | `rounded-lg` (8px), `rounded-md` (6px); `rounded-full` only on the 6px-tall meter, which is not a card |
| No `position: fixed` panel | inline `<section>`, a flex/flow sibling |
| Never blue buttons | `accent` (coral) and `secondary`/`ghost` (neutral) only |
| Page header holds only the title | `AppLayout title="Evaluation"` untouched; all controls live in the working surface |
| Toolbar: filters left, actions right | threshold (filter) then button (action), in that order, in the right-hand cluster |
| No `window.confirm` / `alert` / `prompt` | inline confirmation states only |
| Heading sizes | `h2` at `font-semibold` default (~16px); no `text-3xl`+ |
| Spacing | `p-5` card, `gap-3`, `mt-4`; nothing above `py-12` |

---

## 4. State & Data Flow

**Local state in `ReviewerProgressPanel`** (no global store, no new context):

```ts
rows: ReviewerProgressRow[]            // from the query
loading: boolean
threshold: number                      // default 50
confirming: { kind: "row"; reviewerUserId: string } | { kind: "bulk" } | undefined
sending: string | "bulk" | undefined   // in-flight guard, disables all send buttons
rowResult: Map<string, { status: "sent" | "failed"; error?: string }>
bulkResult: ReminderResponse | undefined
error: string | undefined              // query/transport failure only
```

**Flows**

1. *Load / plan change* — `useEffect` on `[repo, eventId, selectedPlanId]` calls
   `repo.evaluations.reviewerProgress(...)`; resets `confirming`, `rowResult`, `bulkResult`.
2. *Score saved elsewhere on the page* — `Evaluation.tsx`'s existing `load()` already refetches
   on save. The panel takes a `refreshKey: number` prop that `Evaluation.tsx` bumps after
   `load()`, included in the effect deps (FR-006). No polling, no subscription.
3. *Single remind* — `Remind` → `confirming = { kind:"row", … }` → `Confirm send` →
   `sending = reviewerUserId` → `POST` → write `rowResult` → `sending = undefined` →
   refetch progress (a send does not change progress, but the refetch keeps the panel honest if
   the reviewer scored meanwhile).
4. *Bulk remind* — same shape with `sending = "bulk"`, writing `bulkResult` and also fanning
   each result into `rowResult` so per-row status stays consistent with the summary.
5. *Transport failure* (network down, non-JSON body) — set `error`, render
   `<p role="alert" className="text-sm text-destructive">`, leave the table rendered. Progress
   display never depends on the send path.

The panel is read-only with respect to Convex: it issues no mutations. The only write is the
`comms_log` row created server-side by the Convex action.

---

## 5. Auth & Permissions

| Surface | Guard |
|---|---|
| `/program/evaluation` route | existing organizer route protection — unchanged |
| `evaluations:reviewerProgress` query | same posture as the sibling `evaluations:listPlans` / `listAssignments` queries. It exposes reviewer identifiers and resolved emails, so it must not be added to any public/portal surface, and must not be reachable from `publicForms` or the speaker portal. |
| `POST /reviewer-reminder-email` | `requireOrganizer(request)` — Clerk `verifyToken` + membership of `EVENT_ADMIN_USER_IDS`. `401` without a token, `403` for a non-admin. This is **stricter** than `decision-email.mjs` / `reminder-email.mjs`, which are unauthenticated. Justified: this endpoint sends N emails from one call, so an open version is a spam amplifier. |
| Recipient selection | computed **server-side** from a fresh query. The client sends a threshold, never a recipient list — a compromised or stale client cannot direct mail at an arbitrary address. |
| `queueUrl` | organizer-supplied, behind the auth above. It is embedded in the email body, so it is never taken from an unauthenticated caller. |

The browser must attach the Clerk token: `Authorization: Bearer ${await getToken()}` from
`useAuth()`. This is the first `/program/*` fetch in the app to do so — the email-integration
admin functions already do it and are the reference implementation.

---

## 6. Edge Cases

| # | Case | Behaviour |
|---|---|---|
| E1 | **Zero reviewers on the plan** | `EmptyState`; threshold + bulk button not rendered; endpoint returns `202 status:"skipped"`, `requested: 0` if called anyway (US-5) |
| E2 | **All reviewers 100% complete** | Every per-row Remind disabled; bulk button **disabled** with "Every reviewer on this plan is complete." Server independently returns `requested: 0` — the disable is UX, not the enforcement (US-4) |
| E3 | **Reviewer with no resolvable email** (`"Reviewer 2"`) | Row renders with progress; Remind disabled, reason shown; excluded from bulk count and from the send; reported as `skipped / No email on file` (US-6) |
| E4 | **Per-recipient send failure** | Loop continues; that recipient gets `status:"failed"` + provider message; one `comms_log` `failed` row; batch still `200` if any other send succeeded (FR-013) |
| E5 | **Email provider not configured** | Every attempt fails with `"Email provider is not configured."`; batch collapses to `202 status:"skipped"` with one explanatory line, not N red rows; all attempts still logged |
| E6 | **`comms_log` write fails** | Swallowed — the provider result is returned unchanged. Same `try {} catch {}` posture as `decision-email.mjs`. A log outage never turns a sent email into a reported failure |
| E7 | **Plan deleted / belongs to another event** | Query returns `[]`; panel shows the empty state; endpoint returns `202 skipped` rather than throwing (FR-005) |
| E8 | **Assignment exists but the reviewer scored via an ad-hoc `evaluations` row with no `assignmentId`** | Not counted as complete. The reviewer looks behind. Documented in the panel description; matches how the aggregate stat already behaves — no divergence introduced |
| E9 | **Same reviewer assigned across two rounds of one plan** | Rounds are aggregated into one row for the plan. Per-round breakdown is out of scope; the outstanding count in the email is plan-wide |
| E10 | **Double-click on Confirm send** | `sending` guard disables all send buttons while a request is in flight. No idempotency key — a genuine duplicate request would send twice, which is an acceptable, visible, non-destructive outcome for a reminder (unlike `decideSubmission`, which must be idempotent) |
| E11 | **Reviewer assigned 0 submissions** | Cannot occur — rows are derived from assignments, so `assigned ≥ 1` always. `completionRate` still guards divide-by-zero (FR-002) |
| E12 | **Threshold set to 100** | Selects everyone below 100%, i.e. everyone not finished. Valid and intentional. `> 100` or `< 1` is clamped client-side and rejected `400` server-side |
| E13 | **Very long reviewer identifier** | `truncate` on the reviewer cell with the full value as `title`. `evaluations.assign` already caps reviewer strings at 120 chars |
| E14 | **Clerk token missing/expired in the browser** | `401` → inline `role="alert"` "Your session expired. Reload and try again." The table stays rendered |
| E15 | **Plan switched mid-send** | `sending` guard blocks a second send; the in-flight response is discarded if `evaluationPlanId` no longer matches (compare against a ref captured at request time) |

---

## 7. Technical Decisions

**TD-1 — Progress is computed, never stored.**
`reviewerProgress` derives everything from `evaluation_assignments` + `evaluations` at read
time. A `reviewer_progress` table or a counter on `evaluation_assignments` would need
maintaining on every score save, every assignment, every unassign — an entire staleness bug
class for zero benefit at demo scale (tens of assignments, two index reads). It also mirrors
exactly how the four existing `StatCard`s already work in `Evaluation.tsx`. *Rejected
alternative:* denormalised counters — premature, and Airtable's transaction-free model makes
counter drift near-certain.

**TD-2 — Reuse `_email-delivery.mjs`, do not add a third send path.**
`deliverEventEmail(eventId, email)` already resolves the per-event integration (Resend OAuth,
Resend API key, SES API, SES SMTP), falls back to `RESEND_API_KEY` / `RESEND_FROM_EMAIL`, and
records integration errors. Calling `new Resend(...)` directly — as `reminder-email.mjs` and
`decision-email.mjs` still do — would ignore any connected SES integration and quietly send
from the wrong sender. This feature uses the newer, better path. *Rejected alternative:*
copying the `reminder-email.mjs` Resend-direct pattern for consistency; consistency with a
weaker path is not a virtue.

**TD-3 — A new function file rather than extending `reminder-email.mjs`.**
Confirmed by reading it: `reminder-email.mjs` hard-requires `submissionId`, `speakerId`,
`sessionTitle` and `portalUrl`, attaches a calendar file via
`calendarAttachmentForSubmission`, and its copy is speaker-task prose. Its pattern (validate →
send → `recordDelivery` → `202` on failure) is reusable; its **contract is not**. Overloading it
would mean optional-ing four required fields and branching the body — a change that risks the
speaker-task reminder path, which is inside required requirement #3. New file, same shape.

**TD-4 — On demand only, no scheduler.**
No `convex/crons.ts`, no scheduled function, no deadline model. During a judged demo an
automatic send is an unbounded, unattended email generator pointed at seed data. Organizer
presses a button, organizer confirms, mail goes out. This also sidesteps the "who owns the
schedule window" question entirely. *Rejected alternative:* nightly digest to reviewers under
threshold — strictly more risk, no demo value.

**TD-5 — One email per reviewer, not per assignment.**
Finding R2 (EDAS offers both; per-reviewer is the humane default). A reviewer with 8
outstanding items gets one message naming "8 of 9", not 8 messages. Also caps blast radius: N
reviewers ⇒ at most N emails.

**TD-6 — Server-side recipient selection.**
The client sends `thresholdPercent`; the server re-runs `reviewerProgress` and picks. A stale
tab cannot mail someone who just finished, and no client-supplied address list ever reaches the
provider.

**TD-7 — Email resolution is read-only and degrades visibly.**
Reviewers are free-text strings today (`DEMO_REVIEWERS = ["Program committee", "Reviewer 1", …]`
in `Evaluation.tsx`, and `evaluation_assignments.reviewerUserId: v.string()`). Rather than add
a reviewer-directory table (schema change, conflicts with sibling work) or silently drop
unresolvable reviewers, the UI **shows** them, shows the progress, and shows exactly why they
cannot be reminded. The gap is visible instead of mysterious. This is the honest option, and it
is also the smallest.

**TD-8 — Organizer auth on the send endpoint despite sibling functions being open.**
`decision-email.mjs` and `reminder-email.mjs` are unauthenticated (pre-existing). A bulk
endpoint is a different risk class: one unauthenticated POST would send N emails. Using
`requireOrganizer` costs nothing — the helper already exists — and does not require changing
the older functions.

**TD-9 — Shared pure helper for the computation.**
`src/lib/reviewer-progress.ts` holds `computeReviewerProgress`, imported by the Convex query,
the Airtable adapter, and the unit tests. Mirrors `src/lib/evaluation-score.ts`. Prevents the
two adapters drifting on what "complete" means.

---

## 8. Dependencies

**Required, all already present — nothing is blocked:**

| Dependency | Where | Status |
|---|---|---|
| `evaluation_assignments` + `by_plan` index | `convex/schema.ts` | ✅ exists |
| `evaluations.assignmentId` + `by_assignment` index | `convex/schema.ts` | ✅ exists |
| `comms_log` with optional `speakerId` / `submissionId` | `convex/schema.ts` | ✅ exists — **no change needed** |
| `comms:recordDelivery` | `convex/comms.ts` | ✅ exists, accepts this arg set as-is |
| `deliverEventEmail`, `assertOrganizerAction` | `convex/emailDelivery.ts` | ✅ both exported |
| `EvaluationRepo`, both adapters | `src/data/repo.ts`, `src/data/convex`, `src/data/airtable` | ✅ exists, extended by one method |
| `StatCard`, `DataGrid`, `EmptyState`, `SkeletonList`, `Button` | `src/components/shared/`, `src/components/ui/` | ✅ exists — build no new primitives |

**Additive to the sibling `evaluation-scorecards` work.**
That plan adds a `criteria` field to `evaluation_plans` and (likely) per-criterion scores. This
feature:
- makes **no** change to `convex/schema.ts`, so it cannot conflict on the schema file;
- touches `convex/evaluations.ts` only by **appending** a new exported `query`, leaving
  `savePlan` / `assign` / `save` untouched;
- treats "complete" as *`evaluations.score` is a number* (FR-003). If scorecards later change
  how completion is recorded, the single point of change is
  `computeReviewerProgress` in `src/lib/reviewer-progress.ts` — deliberately isolated for
  exactly this reason (TD-9);
- touches `Evaluation.tsx` by inserting one `<ReviewerProgressPanel />` between two existing
  sections, the smallest possible diff surface in that file.

If both land, merge order does not matter. If scorecards lands first, re-verify only the
"complete" predicate.

**Environment.** No new variables. Uses the existing `CONVEX_URL`, `CLERK_SECRET_KEY` /
`CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`, `EVENT_ADMIN_USER_IDS`,
`EMAIL_INTEGRATION_*`, and the `RESEND_*` fallback. ⚠️ `EVENT_ADMIN_USER_IDS` must actually be
populated or every send returns `403` — see Risk 3.

---

## 9. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **1** | **Reviewers have no email addresses.** `reviewerUserId` is a free-text demo string (`"Reviewer 1"`), Clerk-backed reviewer identity is explicitly not wired (`Evaluation.tsx` says so on screen). With seed data as-is, **the bulk reminder may have zero valid recipients and the headline feature demos as a disabled button.** | High | High | FR-007 resolves emails from the string itself or a matching `speakers.email`. Row-level "No email on file" makes the gap legible rather than mysterious. **Seed data must include at least two reviewers whose `reviewerUserId` is a real email address** so the feature demos live — this is a verification-checklist item, not an optional nicety. |
| 2 | Bulk send emails real people during a demo | Medium | High | Organizer-triggered only (TD-4), inline confirmation before every send (FR-014), server-side recipient selection, and the recipient count printed in the confirmation text ("Send 3 reminders?") |
| 3 | `EVENT_ADMIN_USER_IDS` unset ⇒ every send `403` | Medium | Medium | Surface the `403` message verbatim inline ("An event administrator role is required.") so the cause is obvious in seconds; add the variable to the verification checklist and confirm it before demo |
| 4 | Provider unconfigured, feature looks broken | Medium | Medium | E5: collapse to one "Email provider is not configured" line, keep the progress table fully functional, log every attempt. Progress tracking has standalone value with email entirely absent |
| 5 | Conflict with `evaluation-scorecards` on `convex/evaluations.ts` | Medium | Low | Append-only new export; no edits to existing functions; completion predicate isolated in one helper (TD-9) |
| 6 | Provider rate limit on a large batch | Low | Medium | Sequential sends; per-recipient failures reported individually rather than aborting. If batches ever exceed ~50, revisit with chunking — noted, not built |
| 7 | Progress query cost grows with event size (`evaluations.by_event` collects all reviews) | Low | Low | Bounded by event, two index reads, no fan-out (FR-017). If it ever matters, `evaluations.by_assignment` allows a narrower read |
| 8 | A design-rule regression slips in via a table `border-b` copied from the sibling table in `Evaluation.tsx` | Medium | Low | Called out explicitly in the UI Spec (§3.2) and in the verification checklist; the repo's global `border-style: none !important` is a backstop but should not be relied on |
| 9 | Someone "improves" this later by adding a cron | Low | High | The exclusion is stated in `requirements.md` §5 as the first row and in TD-4 with reasoning, so the next agent has to argue against a written decision |
