# Reviewer Assignment by Tag or Track — Technical Design

Companion to [`requirements.md`](./requirements.md). Read [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
and [`DESIGN-SYSTEM.md`](../../DESIGN-SYSTEM.md) first — this design adds nothing new to either.

---

## 1. Architecture at a glance

```
Evaluation.tsx  (Evaluation plans tab, "Assign by tag or track" card)
      │
      ├─ reads already on the page:  repo.submissions.list  (carries tagIds + trackId)
      ├─ reads added to the page:    repo.tags.list · repo.events.listTracks   (both already exist)
      │
      │        preview count = client-side count over submissions already in state
      │
      └─ repo.evaluations.assignByFilter({ eventId, evaluationPlanId, filter, reviewerUserIds, round })
               └─ convex  evaluations:assignByFilter   (mutation)
                        ├─ requireIdentity(ctx)
                        ├─ resolve filter → submissionIds        (server-side, authoritative)
                        └─ createAssignments(...)   ← shared helper, also called by `assign`
```

**Nothing is stored beyond `evaluation_assignments` rows.** The filter is a run-time argument, not
a saved rule.

---

## 2. Database / Schema Changes

**None.** `convex/schema.ts` is untouched. This is the load-bearing decision — see TD-1.

Existing tables and indexes used, all already present:

| Table | Index used | Purpose |
|---|---|---|
| `submissions` | `by_event` (`eventId`) | the candidate set; `tagIds` / `trackId` are filtered in the handler |
| `tags` | direct `get` | validate the tag belongs to this event |
| `tracks` | direct `get` | validate the track belongs to this event |
| `evaluation_plans` | direct `get` | plan ownership + round bound, exactly as `assign` does today |
| `evaluation_assignments` | `by_plan_submission_reviewer_round` | the existing idempotency lookup, reused unchanged |

### Compatibility with the three sibling plans

| Sibling | What it claims | Collision? |
|---|---|---|
| `evaluation-scorecards` (#56) | `evaluation_plans.criteria`, `evaluations.criteriaScores`; widens `savePlan` and `save` | **No.** This feature adds no plan field and touches neither mutation. |
| `blind-review` (#57) | `evaluation_plans.anonymized`; new `listReviewerQueue` query; widens `savePlan` | **No.** Different function, different table. Assignments created here flow into the blinded queue with no change — anonymization is a read-side projection and does not care how a row was created. |
| `reviewer-progress` (#59) | new `reviewerProgress` query (derived, no schema change); reminder email function | **No.** Progress is derived from `evaluation_assignments` + `evaluations`. Bulk-created rows are ordinary assignment rows and appear in progress automatically. |

The only shared file is `convex/evaluations.ts`, which all four features edit. Sequencing is in
§8 Dependencies.

---

## 3. Backend / API

### 3.1 The refactor that makes this additive

The per-pair write loop currently lives inline in `assign`. Lift it, unchanged in behaviour, into a
private helper in the same file, and have both entry points call it:

```ts
// convex/evaluations.ts — private, not exported as a Convex function.
async function createAssignments(
  ctx: MutationCtx,
  input: { eventId: Id<"events">; evaluationPlanId: Id<"evaluation_plans">;
           submissionIds: Id<"submissions">[]; reviewerUserIds: string[]; round: number },
): Promise<{ assignmentIds: string[]; created: number; skipped: number }> {
  const now = Date.now();
  const assignmentIds: string[] = [];
  let created = 0, skipped = 0;
  for (const submissionId of input.submissionIds) for (const reviewerUserId of input.reviewerUserIds) {
    const existing = await ctx.db.query("evaluation_assignments")
      .withIndex("by_plan_submission_reviewer_round", q => q
        .eq("evaluationPlanId", input.evaluationPlanId).eq("submissionId", submissionId)
        .eq("reviewerUserId", reviewerUserId).eq("round", input.round))
      .unique();
    if (existing) { assignmentIds.push(existing._id); skipped += 1; continue; }
    assignmentIds.push(await ctx.db.insert("evaluation_assignments", {
      eventId: input.eventId, evaluationPlanId: input.evaluationPlanId,
      submissionId, reviewerUserId, round: input.round, createdAt: now,
    }));
    created += 1;
  }
  return { assignmentIds, created, skipped };
}
```

`assign` then becomes: same validation as today, then
`return (await createAssignments(ctx, {...})).assignmentIds;`.

**Its public contract does not change** — same args, same `string[]` return, same idempotency, same
error messages. That is a hard requirement (FR-004): the manual path is verified working and is not
what this feature is about.

### 3.2 New endpoint

| Method | Name | Purpose |
|---|---|---|
| mutation | `evaluations:assignByFilter` | Resolve a single tag-or-track filter to submissions server-side, then create the same cross product `assign` creates. |

```ts
const assignmentFilter = v.union(
  v.object({ kind: v.literal("tag"),   tagId:   v.id("tags") }),
  v.object({ kind: v.literal("track"), trackId: v.id("tracks") }),
);

export const assignByFilter = mutation({
  args: {
    eventId: v.id("events"),
    evaluationPlanId: v.id("evaluation_plans"),
    filter: assignmentFilter,
    reviewerUserIds: v.array(v.string()),
    round: v.number(),
  },
  handler: async (ctx, args) => { /* below */ },
});
```

**Return shape** — an object, not the bare `string[]` that `assign` returns, because the UI has to
report what actually happened:

```ts
type AssignByFilterResult = {
  matchedSubmissionCount: number;  // submissions the filter resolved to, server-side
  reviewerCount: number;           // after trim + dedupe
  created: number;                 // rows inserted
  skipped: number;                 // pairs that already existed
  assignmentIds: string[];         // created + pre-existing, same ordering as `assign`
};
```

A discriminated union for the filter, rather than two optional ids, is deliberate: `v.union` makes
"both supplied" and "neither supplied" **unrepresentable at the validator boundary**, so FR-002 is
enforced by the type rather than by a hand-written check that can be forgotten.

### 3.3 Handler order of operations

1. `await requireIdentity(ctx)` — first statement, matching every other function in the file (FR-011).
2. Load the plan; reject if missing or `plan.eventId !== args.eventId`. Same message as `assign`.
3. Validate `round` is an integer in `1..plan.rounds`. Same message as `assign`.
4. Normalize reviewers: `[...new Set(args.reviewerUserIds.map(r => r.trim()).filter(Boolean))]`; reject empty; reject any longer than 120 chars. Identical rules to `assign` — copy them, do not invent new ones.
5. Load and validate the filter target:
   - `kind: "tag"` → `ctx.db.get(args.filter.tagId)`; reject if missing or `tag.eventId !== args.eventId` with `"Tag not found for this event."`
   - `kind: "track"` → same shape against `tracks`, `"Track not found for this event."`
6. Resolve matches:
   ```ts
   const candidates = await ctx.db.query("submissions")
     .withIndex("by_event", q => q.eq("eventId", args.eventId)).collect();
   const eligible = candidates.filter(s => s.status !== "draft" && s.status !== "withdrawn");
   const matched = args.filter.kind === "tag"
     ? eligible.filter(s => (s.tagIds ?? []).some(id => id === args.filter.tagId))
     : eligible.filter(s => s.trackId === args.filter.trackId);
   ```
7. If `matched.length === 0`, **return early** with `{ matchedSubmissionCount: 0, reviewerCount, created: 0, skipped: 0, assignmentIds: [] }`. Do **not** throw (FR-012) — an empty filter result is information, not a failure, and throwing would render it as a red error line.
8. Guard rail: if `matched.length * reviewerUserIds.length > 500`, throw before any write: `"This would create N review assignments. Narrow the filter or assign fewer reviewers at a time (limit 500)."` (FR-010). Convex mutations are transactional, so an over-large run fails whole rather than half-writing — but a 3,000-row transaction is an unnecessary way to discover that at 10pm on deadline night.
9. `createAssignments(ctx, { ..., submissionIds: matched.map(s => s._id), reviewerUserIds, round })`.
10. Return the result object.

**No `Promise.all` over `ctx.db.get` for the matched submissions** — they came out of the index
read already, so there is nothing to re-fetch. The `assign` mutation's per-id `get` + event check
exists only because *its* ids arrive from the client; ours never leave the server.

### 3.4 Affected existing endpoints

| Method | Name | Change |
|---|---|---|
| mutation | `evaluations:assign` | Body extracted into `createAssignments`. **No contract change.** |
| everything else in `evaluations.ts` | — | **Untouched.** |
| `tags:list`, `events:listTracks` | — | **Untouched.** Already exist, already `requireIdentity`-guarded, now called by one more page. |

### 3.5 Data adapter

One new **write** operation. Every file in the chain, named explicitly, because a missed adapter
file fails at runtime and not at compile time:

| File | Change |
|---|---|
| `src/data/types.ts` | Add `AssignmentFilter` and `AssignByFilterResult`. |
| `src/data/repo.ts` | Add `EvaluationAssignmentFilterWrite` and `assignByFilter(input): Promise<AssignByFilterResult>` to `EvaluationRepo`. |
| `src/data/transport.ts` | Add `"evaluations.assignments.assignByFilter"` to the `WriteOperation` union and the method to the `evaluations` block. |
| `src/data/convex/index.ts` | Map `"evaluations.assignments.assignByFilter" -> "evaluations:assignByFilter"`. It is a **write**, so it does not go near the `documentRows(...)` read-normalizer branch on line 28 — the return is a plain object, not a document row. |
| `src/data/airtable/index.ts` | Add the operation to the existing explicit rejection on line 9, alongside `evaluations.assignments.assign`. Rejecting loudly is the honest behaviour; a silent no-op would look like a working feature that assigns nothing. |

Types:

```ts
export type AssignmentFilter =
  | { kind: "tag"; tagId: TagId }
  | { kind: "track"; trackId: string };

export interface AssignByFilterResult {
  matchedSubmissionCount: number; reviewerCount: number;
  created: number; skipped: number; assignmentIds: string[];
}
```

---

## 4. Frontend Components

### 4.1 Modified files

| File | Change |
|---|---|
| `src/pages/program/Evaluation.tsx` | Load tags and tracks; add the `AssignByFilterCard`; render its result inline |
| `src/pages/program/AssignByFilterCard.tsx` | **New.** The whole surface |
| `src/data/*` | Per §3.5 |

### 4.2 UI Spec — `AssignByFilterCard`

- **File:** `src/pages/program/AssignByFilterCard.tsx`
- **Props:**
  - `tags: Tag[]` (required)
  - `tracks: Track[]` (required)
  - `submissions: Submission[]` (required — for the preview count only)
  - `plans: EvaluationPlan[]` (required)
  - `selectedPlanId?: string` (optional)
  - `onSelectPlan: (planId: string) => void` (required)
  - `reviewers: string[]` (required — the same derived list the existing card uses)
  - `disabled?: boolean` (optional)
  - `onAssign: (input: { evaluationPlanId: string; filter: AssignmentFilter; reviewerUserIds: string[]; round: number }) => Promise<AssignByFilterResult>` (required)
- **Location:** Evaluation page → "Evaluation plans" tab → a new `<section className="rounded-lg bg-card p-5">` immediately **below** the existing "Assign submissions" card. The manual card stays exactly as it is; this is a second, faster door to the same room.
- **Elements:**
  - Heading `Assign by tag or track` (`font-semibold`)
  - Helper text (`mt-1 text-sm text-muted-foreground`): "Assign every submission carrying one tag, or every submission in one track, to the reviewers you pick. Drafts and withdrawn submissions are skipped."
  - **Toolbar row** (`mt-4 flex flex-wrap items-end justify-between gap-3`) — filters left, actions right, per `DESIGN-SYSTEM.md`:
    - *Left group:*
      - Filter-kind control: a two-option radio group rendered as segmented buttons, `Tag` | `Track`, `role="radiogroup"` with `aria-label="Assignment filter type"`. Selected option `bg-muted font-medium`, unselected `text-muted-foreground`. `rounded-[10px]`, no border, no shadow.
      - Value select: shadcn `Select`, `className="w-52"`, `aria-label="Tag"` or `aria-label="Track"`, options from `tags` or `tracks`. Placeholder "Select tag" / "Select track". Switching the filter kind **clears the value** and swaps the option list.
      - Plan select (`w-52`) and Round select (`w-32`) — reuse the exact controls and `aria-label`s from the existing card so both cards stay in sync on plan and round.
    - *Right group:*
      - Reviewer multi-select: `fieldset` `className="rounded-md bg-background px-3 py-2"`, `aria-label="Reviewers for this assignment"`, one shadcn `Checkbox` + `Label` per reviewer, wrapping — the identical pattern already in the manual card.
      - Primary control (see Behavior for its three states), `variant="accent" size="sm"`.
  - **Preview line** (`mt-3 text-sm text-muted-foreground`), always rendered once a filter value and at least one reviewer are chosen:
    `12 submissions tagged “AI” × 3 reviewers = 36 review assignments for Round 1.`
    Numbers in `font-medium text-foreground`; the rest muted.
  - **Result line** (`mt-3 text-sm`), rendered after a completed run, replacing the preview line until the form changes: `Created 34 assignments. 2 already existed and were skipped.` Uses `text-[hsl(var(--success))]` for the created count, muted for the rest.
  - **Error line** (`mt-3 text-sm text-destructive`, `role="alert"`) for a rejected write.
- **Behavior:**
  - **Live preview** recomputes on every change to filter kind, filter value, reviewer set or round. Computed client-side over the `submissions` prop the page already holds — `tagIds.includes(tagId)` or `trackId === trackId`, minus `draft` and `withdrawn`. Zero network calls.
  - **Two-step inline confirmation** (FR-009). The primary control is a single button that walks three states in place, never an overlay and never `window.confirm`:
    1. **Idle** — label `Assign 36`, `variant="accent"`. Disabled when: no plan, no filter value, no reviewer, preview count is 0, or `disabled`.
    2. **Confirming** — clicking it swaps the button for two inline buttons in the same slot: `Confirm 36 assignments` (`variant="accent"`) and `Cancel` (`variant="ghost"`), with the preview line switching to `text-foreground` weight to draw the eye. Changing any input while confirming drops straight back to Idle — a stale confirmation must never survive a changed filter.
    3. **Working** — `Assigning…`, disabled, while the mutation is in flight.
  - On success: call the page's existing `load()` refetch so the assignment table, plan progress and stat cards update, then show the result line. Do **not** clear the filter — a chair usually runs several tags in a row and re-picking the plan and reviewers each time is the friction this feature exists to remove.
  - On failure: error line with the server's message; every control retains its value so nothing typed is lost.
  - **Zero matches** is not an error: preview reads `No submissions match this filter yet.` in muted text and the primary control is disabled.
- **Loading state:** while the page is loading, the card renders its controls disabled — the existing page-level pattern; no separate skeleton.
- **Empty states:**
  - No tags in the library: the Tag option is disabled and helper text reads "Create tags in Settings → Library first." with a `Link` to `/settings/library`.
  - No tracks configured: the Track option is disabled with the equivalent pointer to event settings.
  - Both empty: the card renders the heading and a single muted line — "Add tags or tracks before assigning in bulk." — and no controls.
- **Third-party:** none. shadcn `Select`, `Checkbox`, `Label`, `Button` and Lucide icons, all already in the repo.

### 4.3 Design system check

No `border` on any card, control or segmented button, in any state including hover and focus. No
`box-shadow`, no gradient, no `<hr>`, no `divide-*`, no `position: fixed`. Radii ≤ 14px — the card
keeps the page's `rounded-lg`, the segmented control is `rounded-[10px]`. Nothing blue: the primary
control uses the existing coral accent, the segmented selection is neutral `bg-muted`. Sections
separate by whitespace only. Page header still holds only the title. **No native browser dialog** —
the confirmation is the in-card state machine above, which is the repo's standing rule and the
reason `9a2e2e9` already replaced the editor's link `prompt()`.

---

## 5. State / Data Flow

`Evaluation.tsx` gains two reads inside its existing `Promise.all` in `load()`:
`repo.tags.list(scope)` and `repo.events.listTracks(scope)` → new `tags` / `tracks` state. Both
operations already exist in the repository and in the Convex adapter; nothing new is wired.

```
tags/tracks/submissions state ──▶ AssignByFilterCard props
                                        │
   filterKind · filterValue · reviewerIds · round  (card-local useState)
                                        │
                        previewCount = useMemo over submissions
                                        │
              [Assign N] ──▶ confirming ──▶ [Confirm N] ──▶ onAssign(...)
                                        │
                       repo.evaluations.assignByFilter ──▶ Convex
                                        │
                          result ──▶ load() refetch ──▶ result line
```

Card-local state resets to Idle on any input change. Page-level state is refetched, not patched —
the same post-write pattern `assignSelected` and `createPlan` already use.

Re-render triggers: filter kind/value change, reviewer set change, round change, plan change,
post-write refetch.

---

## 6. Auth / Permissions

`feat/clerk-backend` (merged, `43f91dd` / PR #54) added `requireIdentity(ctx)` to **every** function
in `convex/evaluations.ts`. `assignByFilter` calls it as its first statement — not because it is a
new rule, but because it is now the file's uniform rule and a function without it would be the odd
one out in a security review.

What that check does and does not give:

- **Does:** an unauthenticated caller cannot create assignments. Cross-event ids are rejected on the plan, the tag and the track, so an authenticated organizer cannot reach another event's data through this path.
- **Does not:** distinguish organizer from reviewer. There is no role model in the product — the app is explicitly not multi-tenant and `requireIdentity` proves identity, not authority. A reviewer with a valid session could call this mutation. That is true of `assign`, `savePlan` and `decideSubmission` today; this feature inherits the posture rather than inventing a partial one, which would drift from the other five functions in the file. When roles land, the guard is one line at the top of a helper shared by every organizer mutation.
- **Note for `listAssignments`:** it already refuses to return another reviewer's queue. Nothing here weakens that — bulk-created rows are ordinary rows and are subject to the same read guard.

---

## 7. Edge Cases & Error States

| Case | Behaviour |
|---|---|
| **Zero submissions match the filter** | Early return, `created: 0`. Preview says "No submissions match this filter yet.", confirm disabled. **Never an error line** (FR-012). |
| **A matched submission is already assigned to a selected reviewer** for this plan/round | The existing `by_plan_submission_reviewer_round` unique lookup finds it; no second row; counted in `skipped`; its id is still returned. Identical to `assign` today. |
| **Partial overlap** — some pairs exist, some do not | Mixed result line: "Created 34 assignments. 2 already existed and were skipped." |
| **Same bulk run twice (double-click)** | Second run reports `created: 0, skipped: N`. The Working state disables the button, so the common case never reaches the server twice. |
| **Tag or track deleted between page load and confirm** | `ctx.db.get` returns null → "Tag not found for this event." inline error. The stale select is corrected by the post-error refetch. |
| **Tag deleted while assigned to submissions** | The tags library already cascades the id out of `submissions.tagIds` on delete (issue #27), so a deleted tag simply matches nothing. |
| **Submission has no tags / no track** | Never matches a filter. Correct — an untagged submission is not "in" any tag. |
| **Draft or withdrawn submission carries the tag** | Excluded (FR-005). The preview count applies the same exclusion, so preview and result agree. |
| **Preview / server count disagree** | Possible if another organizer tags a submission between page load and confirm. The **server count is authoritative** and the result line reports it. If `result.matchedSubmissionCount !== previewCount`, the result line appends "(the filter matched N submissions when it ran)". Do not silently show the stale number. |
| **Over the 500-assignment cap** | Rejected before any write, with the count and the remedy in the message. Convex transactionality means nothing partial persists. |
| **Round exceeds the plan's rounds** | Same error and same bound check as `assign`. |
| **Reviewer name > 120 chars** | Same error as `assign`. Rules are copied, not re-derived. |
| **Airtable backend selected** | The adapter throws its existing explicit "does not yet provide … evaluation-plan lifecycle operations" error; the card surfaces it in the error line. |
| **Network failure mid-write** | Convex mutations are atomic — either all rows or none. Retrying is safe by construction because the pair lookup is idempotent. |

---

## 8. Technical Decisions

| ID | Decision | Choice | Rationale |
|---|---|---|---|
| TD-1 | Schema | **No change** | `submissions.tagIds` and `trackId` already exist and are already populated. A feature that ships with zero migration risk on deadline eve, and zero merge surface against #56/#57 which both edit `evaluation_plans`. |
| TD-2 | New mutation vs. widening `assign` | **New mutation, shared helper** | `assign` is verified working and is the only assignment path in the product. Widening it means every manual assignment inherits the risk of the bulk path's bugs. A second entry point over one shared write loop gives reuse without shared blast radius (FR-004). |
| TD-3 | Where the filter resolves | **Server-side** | A client-resolved filter is just `assign` with extra steps, and it means the browser decides which submissions count — one stale page and reviewers are assigned to the wrong set. The mutation owning resolution also makes the returned `matchedSubmissionCount` trustworthy. |
| TD-4 | Filter dimensionality | **Single: tag XOR track** | Modelled as a `v.union` so "both" and "neither" cannot be expressed. Combined filters multiply UI states for something two sequential runs already achieve. |
| TD-5 | Assignment semantics | **Full cross product, reusing `assign`'s** | Matching the existing mutation exactly means one mental model, one idempotency rule, one set of error messages. A different semantic for the bulk path would be a trap. |
| TD-6 | Preview computation | **Client-side, from data already loaded** | Zero extra network calls and zero extra adapter operations — a read op would cost five files and the read-normalizer branch for a number the page can already count. The server count is authoritative and any drift is reported. |
| TD-7 | Load balancing | **Out of scope, documented** | The literature treats balanced allocation as a fairness objective solved by optimization under load and COI constraints. Approximating that badly is worse than not shipping it; a chair splits reviewer sets across runs instead. |
| TD-8 | Conflict of interest | **Out of scope, hook point named** | There is no `reviewerUserId → speakers` mapping in the codebase. The correct hook is one filter step between §3.3 step 6 and step 9 — when reviewer identity resolves to an email, exclude submissions whose speaker matches. Named in one place so it lands in one place. |
| TD-9 | Draft / withdrawn exclusion | **Excluded** | Assigning a reviewer to a draft nobody has submitted, or to a withdrawn proposal, is work created for nothing. The preview and the server apply the identical predicate so the numbers agree. |
| TD-10 | Bulk cap | **500 assignments, hard reject** | Big enough for any plausible run of this event size; small enough that a wrong filter cannot produce a transaction nobody wants to inspect. The message names the number and the remedy. |
| TD-11 | Confirmation | **Inline three-state button** | Repo rule: no `window.confirm` / `alert` / `prompt`. `DESIGN-SYSTEM.md` prefers an inline confirmation panel and reserves `alert-dialog` for cases that genuinely need an overlay. A card-local state machine is also testable without a portal. |
| TD-12 | Return shape | **Object, not `string[]`** | The UI must distinguish created from skipped to honour FR-007 and to make the idempotency visible rather than mysterious. `assign` keeps its array. |

---

## 9. Dependencies

**Requires:**
- Tags library (#27) — **already on `main`**; `tags` table and `submissions.tagIds` exist and are populated.
- Tracks — **already on `main`** (`tracks` table, `events:listTracks`, `submissions.trackId`).
- Clerk backend auth (#54, merged at `43f91dd`) — `requireIdentity` is the pattern this follows.
- Base branch: `origin/main` at `5468c99`.

**Sequencing against the siblings.** Four features now edit `convex/evaluations.ts`:

| Branch | Touches in `evaluations.ts` | Overlap with this |
|---|---|---|
| `feature/56-evaluation-scorecards` | `savePlan`, `save` | none |
| `feature/57-blind-review` | `savePlan`, new `listReviewerQueue` | none |
| `improvement/59-reviewer-progress` | new `reviewerProgress` | none |
| **this** | `assign` (extract helper), new `assignByFilter` | — |

No two of the four modify the same function, so the conflicts are import-line and file-tail
adjacency, not semantic. Merge order does not matter; whoever lands second rebases. **The one rule:
do not develop two of them in the same working tree at the same time.**

**Enables:** conflict-of-interest exclusion (TD-8), saved routing rules that auto-assign on
submission via the unused `submission_forms.routingRules.reviewerUserIds`, and load-balanced
allocation, which becomes a swap of the cross-product step for an allocation step behind the same
mutation signature.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **There is no way to undo a bulk assignment.** No unassign mutation exists anywhere in the codebase, for either path. One wrong tag and a reviewer's queue holds a hundred submissions the chair now has to remove by hand — except there is no by-hand removal either. This is the largest risk the feature carries, and it is created *by* the feature: the manual path could only ever mis-assign what someone clicked. | Preview before write (FR-008), two-step inline confirmation (FR-009), 500-row cap (FR-010), and idempotency so a retry is never the cause. The result line reports exact counts so a mistake is noticed immediately rather than at the reviewer's next login. **Bulk unassign is the number-one follow-up issue and must be stated as such in the issue body and the README** — not implied by omission. |
| Preview and server counts drift (another organizer tags concurrently) | Server count is authoritative and is echoed back; the result line explicitly flags a mismatch rather than showing the stale preview. |
| The `assign` refactor breaks the verified manual path | The helper is a lift-and-shift with no behaviour change; `assign` keeps its exact args, return type and error strings. Regression check in the verification list runs the manual path before and after. |
| Adapter layer missed — fails at runtime, not compile time | §3.5 names every file. The Airtable adapter must *reject*, not no-op; a silent no-op looks like a working feature that assigns nothing. |
| Filter reads every submission in the event | Event-scoped `by_event` collect is the existing pattern across this codebase and the demo dataset is small. If submissions ever reach thousands, the fix is an index on `trackId`, not a redesign — noted, not pre-built. |
| Someone reads "assignment by tag or track" as automatic routing of *future* submissions | Requirements say run-time only, in Out of Scope. The README line must say "assign in bulk by tag or track", never "auto-assign". |
| UI drifts from the manual card on plan/round | Both cards share the page's `selectedPlanId` and the same round bound, and reuse the same control markup and `aria-label`s. |
| Scope creep into combined filters or a balancing slider | Both are named in Out of Scope with reasons. The `v.union` filter makes a combined filter a deliberate schema change rather than an easy accident. |
