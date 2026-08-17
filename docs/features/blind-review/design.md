# Blind / Anonymous Review — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

```ts
// convex/schema.ts
evaluation_plans: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  rounds: v.number(),
  scoringScaleMax: v.union(v.literal(5), v.literal(10)),
  // The evaluator UI deliberately leaves this as a visible stub. No AI score is generated.
  aiAssistEnabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]),

speakers: defineTable({
  eventId, email, firstName, lastName, bio, salutation, honorific, pronouns, gender,
  linkedinUrl, xUrl, facebookUrl, websiteUrl, headshotStorageKey, status, createdAt, updatedAt,
}).index("by_event", ["eventId"]).index("by_event_email", ["eventId", "email"]),

submissions: defineTable({
  eventId, formId, idempotencyKey, speakerId, tagIds, trackId, title, status,
  answers: v.any(), submittedAt, createdAt, updatedAt,
}) /* … */,
```

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| evaluation_plans | ADD FIELD | `anonymized` | `v.optional(v.boolean())` | Optional so existing plans stay valid; absent === not anonymized |
| — | none | — | — | No new table, no new index, no change to `speakers`, `submissions` or `evaluations` |

**Compatibility with the sibling `evaluation-scorecards` design.** That plan adds
`evaluation_plans.criteria: v.optional(v.array(criterion))` and
`evaluations.criteriaScores`. This design adds a single new key, `anonymized`, alongside them
and redefines nothing that plan claims. The merged table is:

```ts
evaluation_plans: defineTable({
  eventId: v.id("events"),
  name: v.string(),
  rounds: v.number(),
  scoringScaleMax: v.union(v.literal(5), v.literal(10)),
  aiAssistEnabled: v.boolean(),
  criteria: v.optional(v.array(criterion)),   // from evaluation-scorecards (#56)
  anonymized: v.optional(v.boolean()),        // this feature
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]),
```

The scorecards `design.md` names this feature explicitly under **Enables**: *"blind/anonymous
review (needs a per-plan flag next to `criteria`)"*. That is the flag.

### Migration

**None runs.** `anonymized` is optional, so every existing `evaluation_plans` row remains valid
the instant the schema deploys. Plans created before this change read as `undefined`, which
FR-001 treats as "not anonymized". There is no backfill and no destructive step.

---

## Backend / API

### The problem the backend has to solve

Today the reviewer queue is assembled **entirely on the client**. `Evaluation.tsx` issues five
parallel unfiltered reads on mount:

```ts
const [nextPlans, nextAssignments, nextSubmissions, nextSpeakers, nextReviews] = await Promise.all([
  repo.evaluations.listPlans(scope), repo.evaluations.listAssignments(scope),
  repo.submissions.list(scope), repo.speakers.list(scope), repo.evaluations.list(scope),
]);
```

then builds `speakerNameById` and joins it into every queue row. **Every speaker name for the
whole event is already in the browser before a single queue row renders.** No amount of
conditional JSX can satisfy FR-005 against that, which is why FR-006 requires a dedicated
server-side query rather than a UI change.

### New Endpoints

| Method | Name | Purpose |
|--------|------|---------|
| query | `evaluations:listReviewerQueue` | The complete, already-projected reviewer queue for one reviewer. The single read backing the "My reviewer queue" tab. |

```ts
// convex/evaluations.ts
export const listReviewerQueue = query({
  args: { eventId: v.id("events"), reviewerUserId: v.string() },
  handler: async (ctx, args) => { /* see projection below */ },
});
```

**Return shape** — a projection type, not a database row:

```ts
type ReviewerQueueRow = {
  assignmentId: string;
  evaluationPlanId: string;
  submissionId: string;
  round: number;
  anonymized: boolean;        // echoed from the plan so the UI can render the badge
  title: string;
  track: string;
  abstract: string;
  answers: Record<string, unknown>;   // identity keys removed when anonymized
  speaker?: string;           // ABSENT (undefined) when anonymized
  speakerId?: string;         // ABSENT when anonymized
  headshotUrl?: string;       // ABSENT when anonymized
  review?: { id: string; score?: number; comments?: string; criteriaScores?: ... };
};
```

This mirrors an established precedent in this codebase. `src/data/types.ts` already carries
projection-only read models with the comment *"These are deliberately projection-only types for
unauthenticated embeds. They contain no record ids, email addresses, internal statuses, or draft
data."* (`PublicEmbedSpeaker`, `PublicSubmissionFormConfig`). `ReviewerQueueRow` is the same idea
applied to the reviewer surface.

### Exactly which fields get stripped, and where

Stripping happens in **one** place: a private helper in `convex/evaluations.ts`, called from
`listReviewerQueue` before the rows are returned. Nothing else in the codebase strips anything.

| Field | Source | Anonymized plan | Open plan |
|-------|--------|-----------------|-----------|
| `speaker` (display name) | `speakers.firstName` + `lastName` | **omitted** | included |
| `speakerId` | `submissions.speakerId` | **omitted** | included |
| speaker email | `speakers.email` | **never joined at all** | not in the queue today either |
| speaker bio | `speakers.bio` | **never joined** | not in the queue today either |
| `headshotUrl` / `headshotStorageKey` | `speakers.headshotStorageKey` | **omitted; the storage URL is never resolved** | included |
| social links | `speakers.*Url` | **never joined** | not in the queue today either |
| `answers` keys matching the identity key list | `submissions.answers` | **deleted from the object** | included |
| `title`, `track`, `abstract`, `round`, `answers` (rest) | submissions / assignment | **included** | included |
| the reviewer's own `review` | `evaluations` | included | included |

The identity key list for `answers` is a constant in `convex/evaluations.ts`:

```ts
const IDENTIFYING_ANSWER_KEYS = [
  "name", "firstName", "lastName", "fullName", "speakerName",
  "email", "emailAddress", "company", "organization", "affiliation",
  "linkedin", "twitter", "x", "website", "headshot", "bio",
];
```

Matching is case-insensitive on the answer key. This is a **best-effort key filter, not a
guarantee** — see Edge Cases.

Written as code, so the implementer has no room to interpret:

```ts
// The one and only stripping site. Called before return, never after.
function projectForReviewer(row: FullQueueRow, anonymized: boolean): ReviewerQueueRow {
  if (!anonymized) return row;
  const { speaker: _s, speakerId: _i, headshotUrl: _h, ...rest } = row;
  return { ...rest, answers: stripIdentifyingAnswers(row.answers) };
}
```

Destructuring-and-omitting, not `speaker: undefined` — an explicit `undefined` key still serializes
as present in some transports and invites a later "just read it from the payload" regression.

### Affected Existing Endpoints

| Method | Name | Change |
|--------|------|--------|
| mutation | `evaluations:savePlan` | Accept optional `anonymized: v.optional(v.boolean())`; persist it. On update, patch it. |
| query | `evaluations:listPlans` | Returns the new field. No signature change. Organizer-facing — never stripped. |
| query | `evaluations:list` | **Unchanged.** Organizer-facing. |
| query | `evaluations:listAssignments` | **Unchanged.** Organizer-facing; still backs the assignment table. |
| mutation | `evaluations:save` | **Unchanged.** Anonymization affects reads only (FR-008). |
| query | `speakers:list` | **Unchanged.** It is an organizer query; the reviewer queue simply stops calling it. |

### Validation & Business Logic

- `savePlan`: `anonymized` is a plain boolean. Nothing to validate beyond the type. Coerce absent to omitted rather than to `false`, so the field only ever appears on plans a chair actually touched.
- `listReviewerQueue`: `reviewerUserId` must be non-empty after trim. Assignments are read via the existing `by_reviewer` index, then filtered to `args.eventId` — the same defensive pattern `listAssignments` already uses.
- The plan is loaded per assignment to read `anonymized`; cache plans in a `Map` inside the handler so one plan is fetched once per call, not once per row.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/program/Evaluation.tsx` | Add the "Anonymize this plan" toggle to the plan form; replace the client-side queue join with the new `reviewerQueue` read; render the Blinded badge and the hidden-speaker byline |
| `src/data/types.ts` | Add `ReviewerQueueRow`; add `anonymized?: boolean` to `EvaluationPlan` |
| `src/data/repo.ts` | Add `reviewerQueue(scope: EventScope & { reviewerUserId: string }): Promise<ReviewerQueueRow[]>` to `EvaluationRepo`; add `anonymized?: boolean` to `EvaluationPlanWrite` |
| `src/data/transport.ts` | Carry the new operation and the new plan field |
| `src/data/convex/index.ts` | Map `"evaluations.reviewerQueue" -> "evaluations:listReviewerQueue"`; confirm the row normalizer handles the projection shape (it is **not** a `_id`-bearing Convex document — this is the single most likely runtime break) |
| `src/data/airtable/index.ts` | Mirror the operation; the Airtable adapter must strip the same fields, or the Airtable backend silently leaks what Convex hides |

### New Components

**AnonymizeToggle** *(inline, not a separate file)*
- Location: Evaluation page → "Evaluation plans" tab → the "Create evaluation plan" card, on the row below the name / rounds / scale fields, beneath the scorecards `CriteriaEditor` when that lands
- Elements:
  - `Checkbox` with `Label` "Anonymize this plan" (`text-sm font-medium`)
  - Helper text below: "Reviewers will not see speaker names, headshots or contact details for any round of this plan. Organizer views are unaffected." (`text-sm text-muted-foreground`)
- Behavior: controlled by `newPlanAnonymized` state beside the existing `newPlanName` / `newPlanRounds` / `newPlanScale`; included in the `savePlan` call. Default off.
- Third-party: none — existing shadcn `Checkbox` and `Label`.

**BlindedBadge**
- File: `src/components/shared/BlindedBadge.tsx`
- Props: `{ className?: string (optional) }`
- Location: two places — (1) the reviewer-queue card header, next to the reviewer select; (2) the active review panel header, on the same line as the round label
- Elements: Lucide `EyeOff` icon size 14, label "Blinded", rendered as `inline-flex items-center gap-1.5 rounded-[10px] bg-muted px-2 py-1 text-xs font-medium text-muted-foreground`
- No border, no shadow. Background contrast only.
- Third-party: none.

### Modified UI in the reviewer queue

- **Queue grid subtitle** — today: `Round 1 · Ada Lovelace · AI Track`. When anonymized: `Round 1 · Speaker hidden · AI Track`, with "Speaker hidden" in `text-muted-foreground`.
- **Active review panel byline** — today: `{speaker} · {track}`. When anonymized: `Speaker hidden — blinded review · {track}` (`text-sm text-muted-foreground`).
- **Plans grid** — add an "Anonymized" indicator to the existing plans `DataGrid`: the `BlindedBadge` in the `name` cell when `plan.anonymized`, nothing otherwise. This is organizer-facing, so it shows the state; it does not hide anything.
- **Toolbar** — unchanged in structure. Page header holds only the title; the `StatusTabs` and `ContentToolbar` rows below keep filters left and the primary action right, per the design system.

### Design system compliance

No `border` on any card, button, input or badge, including hover and focus. No `box-shadow`, no
gradient, no `<hr>`, no `divide-*`, no fixed-position panel. Radii stay at or below 14px — the
badge is `rounded-[10px]`, cards keep the page's existing `rounded-lg`. Nothing blue: the badge is
neutral `bg-muted`, and the toggle uses the existing accent. Sections separate by whitespace only.

---

## State / Data Flow

Plan configuration: chair toggles the checkbox → `newPlanAnonymized` state in `Evaluation.tsx` →
`repo.evaluations.savePlan({ …, anonymized })` → Convex `evaluation_plans.anonymized` →
`listPlans` → the plans grid badge.

Reviewer queue: reviewer selected in the demo dropdown → `repo.evaluations.reviewerQueue({ eventId,
reviewerUserId })` → Convex `listReviewerQueue` → **projection applied server-side** → already-safe
rows land in `queueRows` state → rendered.

The `queueRows` `useMemo` that joins `speakerNameById`, `submissionById` and `reviewByAssignment`
is **deleted**. So are the queue tab's dependencies on `submissions` and `speakers` state — those
two loads stay only because the *plans* tab's assignment table needs them, and that table is
organizer-facing. If the reviewer queue is ever split onto its own route
(`/program/evaluation/queue`, as `evaluation-scoring/plan.md` anticipates), those loads must not
follow it.

Re-render triggers: reviewer selection change, active assignment change, post-save refetch.

---

## Auth / Permissions

The app has **no authorization today**. `ctx.auth` and `getUserIdentity` appear in zero Convex
functions, and the reviewer is picked from a demo dropdown (`DEMO_REVIEWERS`). This has to be
stated plainly rather than papered over:

**What this feature does guarantee.** For an anonymized plan, the reviewer queue's own network
response contains no identity. A reviewer who opens devtools, reads the payload, or scripts against
the queue operation gets nothing back. That is FR-005 and it is real and testable.

**What it does not guarantee, yet.** Because `speakers:list` is unauthenticated like every other
query, someone who knows the operation name can still call it directly. This feature deliberately
does **not** try to fix that — reviewer roles are the in-flight `feat/clerk-backend` work. Adding a
half-authorization check here would conflict with that branch on the same file.

The design is nonetheless written so the guarantee **completes automatically** when identity lands:
`listReviewerQueue` already takes `reviewerUserId` as its scoping argument, so the Clerk work
substitutes `identity.subject` for the client-supplied value in one line, and the same projection
is then a real boundary. Until then, describe it in the README as *"anonymization is enforced at
the query layer; role-based access lands with authentication"* — accurate, and not a claim the
build cannot support.

Organizer surfaces are never anonymized (FR-007). The rule for the implementer: only
`listReviewerQueue` projects. If a second query starts stripping, there are two places to audit and
they will drift.

---

## Edge Cases & Error States

- **The abstract names its own author.** *"In my work at Acme, I…"* survives the projection untouched. This is the acknowledged first-pass limitation, and it matches the external literature: conferences that run double-blind rely on author-side anonymization instructions, because no server-side filter catches prose. Mitigation is a line of helper text in the CFP builder, not code. Documented in Out of Scope, and it must be named in the README rather than quietly omitted.
- **A CFP answer field asks "Which company do you work for?" under a custom key** like `q_employer`. The `IDENTIFYING_ANSWER_KEYS` list does not match it, so it leaks. Per-field marking is out of scope; the key list is best-effort.
- **Plan toggled from anonymized to open mid-round.** Names appear on the next read. No history is rewritten. Reviews already recorded stay valid and unattributed-to-a-name in exactly the way they were.
- **Plan toggled open → anonymized after reviewing started.** Names disappear on the next read. Any reviewer who already saw a name obviously still remembers it; the flag is not retroactive and must not be described as if it were.
- **Assignment whose plan was deleted.** `listReviewerQueue` cannot read `anonymized`. **Fail closed: treat a missing plan as anonymized.** A blinded row shown by mistake costs nothing; a leaked name cannot be un-leaked.
- **Submission with no speaker** (`speakerId` absent). Renders "Unassigned" today. Under anonymization it renders "Speaker hidden" like every other row — the two states must be indistinguishable, or the absence itself becomes a signal.
- **Loading** — skeleton rows, matching the existing `SkeletonList` usage on the page.
- **Empty** — no assignments for this reviewer: the existing `DataGrid` empty state, "No assignments for this reviewer."
- **Query failure** — the existing inline `role="alert"` `text-sm text-destructive` line at the top of the page. **The queue must render nothing rather than falling back to the old client-side join** — a fallback path that reassembles names from `speakers.list` would defeat the entire feature on its worst day.

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope of the flag | Per evaluation plan | Reuses an existing table; no new table, no round-config UI, no conflict with the sibling scorecards plan which took the same decision for `criteria`. Sessionboard is per-round; per-plan captures the graded behaviour at a fraction of the cost. A chair needing mixed rounds creates two plans. |
| Enforcement point | Server-side projection in one Convex query | FR-005. A UI-only hide is defeated by one devtools tab, and this is a fairness feature — a fairness feature that can be trivially bypassed is worse than none, because it invites trust it has not earned. |
| New query vs. widening `listAssignments` | New query, `listReviewerQueue` | `listAssignments` is organizer-facing and backs the assignment table. Making one query serve both an organizer and a reviewer means one wrong boolean leaks everything. Separate query, separate audience, one stripping site. |
| Field type | `v.optional(v.boolean())` | Optional keeps every existing row valid with zero migration, consistent with how the scorecards plan added `criteria`. |
| Identity in `answers` | Case-insensitive key denylist | Cheap, catches the common CFP fields, honest about being partial. Per-field organizer marking is the correct long-term answer and is explicitly deferred. |
| Missing plan | Fail closed (treat as anonymized) | Asymmetric cost. Over-hiding is a cosmetic bug; under-hiding is the failure the feature exists to prevent. |
| Single-blind, not double | Reviewers see nothing about the speaker; speakers see nothing about reviewers already | Speakers have no review-visibility surface in this product, so double-blind is already the effective state and costs zero code. |
| Headshot | Never resolve the storage URL server-side when anonymized | Resolving and then omitting still burns a storage call and risks the URL being logged. Do not fetch what must not be sent. |

## Dependencies

**Requires:**
- Nothing hard-blocking. The feature stands alone against `origin/main`.
- **Sequencing:** `feature/56-evaluation-scorecards` (issue #56) edits `evaluation_plans` and both
  `savePlan` and `save` in `convex/evaluations.ts`. Build this **after or alongside** it and rebase
  onto it, never before. The two touch the same table definition and the same plan form.
- `feat/clerk-backend` is also editing `convex/evaluations.ts`. Both sibling plans say the same
  thing: land Clerk first where possible, then rebase. Do not develop three branches in parallel
  against one file.

**Enables:** reviewer conflict-of-interest handling, per-field identifying marking, and an honest
"blinded review workflow options" line in the README against the Sessionboard CFP page.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **The feature is claimed as a privacy guarantee it cannot deliver while every query is unauthenticated.** `speakers:list` remains callable by anyone who knows the name, so a determined reviewer recovers identity regardless of the projection. This is the biggest risk in the feature — not a broken build, but a true-sounding claim the code does not support. | Never write "reviewers cannot see speaker identity" in the README. Write "the reviewer queue is projected server-side; role-based access lands with authentication." Design `listReviewerQueue` so the Clerk branch upgrades it to a real boundary in one line. |
| Free-text abstracts naming their own author defeat anonymization entirely | Named in Out of Scope, surfaced as CFP helper text, stated in the README. External guidance treats author-side anonymization as unavoidable — no reviewed conference claims otherwise. |
| The client-side join is left in as a "fallback" and silently re-leaks names | The queue tab must not read `speakers` state at all. Verification requires reading the network payload, not the DOM — a DOM check passes even when the join is still there. |
| Adapter layer missed — fails at runtime, not compile time | The task list names every adapter file. The Airtable adapter must apply the same projection, or one backend leaks what the other hides. Contract test covers both. |
| Merge conflict with `feature/56-evaluation-scorecards` on `evaluation_plans` and the plan form | Additive field only, no redefinition of `criteria`. Rebase onto #56; do not develop in parallel. |
| Over-stripping breaks the non-anonymized path | FR and regression test: a plan without the flag behaves exactly as today. |
| The `answers` denylist creates false confidence | Documented as best-effort in requirements, design and README. It is a convenience filter, not a boundary. |
