# Review & Scoring — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)

`convex/schema.ts:228`

```ts
submissions: defineTable({
  eventId: v.id("events"),
  formId: v.id("submission_forms"),
  idempotencyKey: v.optional(v.string()),
  speakerId: v.optional(v.id("speakers")),
  tagIds: v.optional(v.array(v.id("tags"))),
  trackId: v.optional(v.id("tracks")),
  sponsorId: v.optional(v.id("sponsors")),
  title: v.string(),
  status: v.union(
    v.literal("draft"), v.literal("pending"),
    v.literal("accept_queue"), v.literal("accepted"),
    v.literal("decline_queue"), v.literal("declined"),
    v.literal("withdrawn"),
  ),
  answers: v.any(),
  submittedAt: v.optional(v.number()),
  lastSpeakerEditAt: v.optional(v.number()),
  speakerEditCount: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_form", ["formId"])
  .index("by_form_idempotency", ["formId", "idempotencyKey"])
  .index("by_speaker", ["speakerId"]),
```

`evaluations` (`convex/schema.ts:245`) already stores `score: v.optional(v.number())`,
`comments: v.optional(v.string())`, and `criteriaScores`. **No change is needed there** — stars are
a rendering of the number that is already persisted.

### Required Changes

| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| submissions | EXTEND UNION | status | add `v.literal("maybe")` | Additive only. Every existing row keeps its current value. |

No index changes. No new tables. No column type changes.

### Migration

**None required.** Widening a Convex union literal is backward compatible: existing documents
already satisfy the wider type, and no document needs rewriting. Nothing writes `maybe` until the
new UI ships, so the deploy order (schema first, UI second) is safe in either direction.

Explicitly **not** doing a backfill — no existing `pending` row should be reinterpreted as `maybe`.
`maybe` means "a human looked at this and held it," which is information we do not have for any
existing row.

---

## Backend / API

### Affected Existing Endpoints

All of these are Convex functions, not REST routes.

| Function | File | Change |
|----------|------|--------|
| `submissions.setStatus` (or equivalent status mutation) | `convex/submissions.ts` | Accept `maybe` in its status validator |
| `submissions.list` | `convex/submissions.ts` | No signature change; returns `maybe` rows like any other |
| public submission endpoints | `convex/publicApi.ts` | Status validator + any status→string mapping must include `maybe` |
| category routing | `convex/categoryRouting.ts` | Routing rules that target a status must offer `maybe` |
| speaker-side editing rules | `convex/submissionEditing.ts` | Decide whether a speaker may edit a `maybe` submission — see Technical Decisions |
| demo seed | `convex/seed.ts` | Seed at least one `maybe` row so the state is visible in demo data |

### New Endpoints

**None.** Every mutation this feature needs already exists. The decision buttons call the same
status mutation the dropdown calls today; the star control writes the same `score` field the
numbered buttons write today.

### Validation & Business Logic

- The status mutation's server-side validator must be widened to include `maybe`. It must stay a
  closed union — do not loosen it to `v.string()`.
- Decision-email preparation must treat `maybe` the way it treats `pending`: not eligible. In
  `Abstracts.tsx` the Decision-email cell already gates on `status === "accepted" || status ===
  "declined"`, so `maybe` is excluded by that existing condition with no change. **Verify this
  rather than assuming it** — the same gate exists server-side and must also exclude `maybe`.
- Readiness (`src/lib/readiness.ts`) counts undecided submissions. `maybe` is undecided and must be
  counted as such, not treated as resolved.

---

## Frontend Components

### Modified Components

| File Path | Change |
|-----------|--------|
| `src/pages/program/Evaluation.tsx` | Swap the numbered-circle fieldset (lines ~1109–1132) for `StarRating`; replace the `View` dropdown with `ReviewViewSwitcher`; default to the reviewer queue when the user has unscored assignments |
| `src/pages/program/ScorecardForm.tsx` | Swap the per-criterion numbered buttons (lines ~36–49) for `StarRating`; text criteria are unchanged |
| `src/pages/program/Abstracts.tsx` | Add `DecisionButtons` to the status column and detail pane; add the "Maybe" filter tab; demote the status `<Select>`; rename "Add abstract" → "Add submission" |
| `src/components/shared/SubmissionStatusBadge.tsx` | Add the `maybe` variant |
| `src/components/forms/RoutingRulesEditor.tsx` | Offer `maybe` as a routing target |
| `src/data/types.ts` | Add `maybe` to the `SubmissionStatus` type |
| `src/lib/readiness.ts` | Count `maybe` as undecided |
| `src/lib/submission-editing.ts` | Handle `maybe` in the editability rules |
| `src/pages/dashboard/DashboardHome.tsx` | Include `maybe` in the awaiting-decision count |
| `src/pages/portal/portal-data.ts` | Map `maybe` to a speaker-facing label — see Technical Decisions |
| `packages/sdk/src/types.ts` | Add `maybe` to the published status type |
| `packages/mcp/src/server.ts` | Add `maybe` to the tool schema's status enum |

### New Components

**StarRating**
- File: `src/components/shared/StarRating.tsx`
- Props:
  - `value: number | undefined` (required) — current rating, `undefined` when unscored
  - `max: number` (required) — 5 or 10
  - `onChange: (value: number) => void` (optional) — omit to render read-only
  - `disabled: boolean` (optional) — default `false`
  - `label: string` (required) — accessible name, e.g. `"Score"` or the criterion label
  - `size: "sm" | "md"` (optional) — default `"md"`; `"sm"` for grid cells
- Location: reviewer scorecard in the Judging page's right detail pane; each numeric criterion row
  in `ScorecardForm`; read-only in the Submissions grid Rating column
- Elements:
  - A `radiogroup` of `max` star buttons, Lucide `Star` icon
  - Filled stars use `fill-current` in the accent colour; unfilled use `text-muted-foreground` with
    no fill
  - On hover, stars up to the hovered index preview as filled
  - A trailing text label showing `"{value} / {max}"`, or `"Not scored"` when `value` is `undefined`
  - Read-only mode: same stars, no hover preview, no focus ring, `aria-readonly`
  - No border, no shadow, no gradient on any part of the control
- Behavior:
  - Click star *n* → `onChange(n)`
  - Click the currently selected star → `onChange(n)` again (no clearing; clearing a submitted score
    is not a supported action and must not be invented here)
  - Keyboard: arrow left/right move the rating by one within `1..max`; Home sets 1; End sets `max`
  - `role="radiogroup"` with `aria-label={label}`; each star is `role="radio"` with `aria-checked`
    and `aria-label={"${label}: ${n} of ${max}"}`
  - At `max: 10` the control renders ten `size="sm"` stars on one row; it must not wrap
- Third-party: `lucide-react` `Star` only — already a dependency. No rating library.

**DecisionButtons**
- File: `src/components/shared/DecisionButtons.tsx`
- Props:
  - `status: SubmissionStatus` (required)
  - `onDecide: (next: SubmissionStatus) => void` (required)
  - `pending: boolean` (optional) — `true` while a mutation is in flight
  - `size: "sm" | "md"` (optional) — default `"sm"` for grid rows
- Location: Submissions grid, Status column (primary position, left of the demoted `<Select>`);
  and at the top of the submission detail pane
- Elements:
  - Three buttons in a row: **Approve** (Lucide `Check`), **Maybe** (Lucide `CircleDashed`),
    **Decline** (Lucide `X`)
  - Active button: accent background (`#40745C` Sage for Approve, `#F58E63` Coral for Maybe, dark
    red for Decline), dark text, `rounded-[6px]`, no border, no shadow
  - Inactive button: `bg-neutral-100`, muted text, no border
  - Disabled while `pending`, at 40% opacity
  - `size="sm"` shows icon only with the label as a tooltip; `size="md"` shows icon + text label
- Behavior:
  - Approve → `onDecide("accept_queue")`; Maybe → `onDecide("maybe")`; Decline →
    `onDecide("decline_queue")`
  - Clicking the currently active decision → `onDecide("pending")` (toggle off)
  - Rows already in a terminal state (`accepted`, `declined`, `withdrawn`, `draft`) render the
    buttons read-only — a shipped decision is not undone by a stray click
  - `aria-pressed` reflects the active decision
- Third-party: none

**ReviewViewSwitcher**
- File: inline in `src/pages/program/Evaluation.tsx` (too small and too coupled to warrant its own file)
- Location: Judging page toolbar row, left side — filters go left, actions right
- Elements:
  - Segmented control, two segments: `Evaluation plans` and `My reviewer queue`
  - The queue segment shows a count badge of outstanding (assigned and unscored) rows
  - Active segment: `bg-neutral-200`; inactive: transparent. No border, no shadow.
  - Rendered only when the signed-in user has at least one assignment
- Behavior: clicking a segment switches the view; the choice persists in component state for the
  session (not localStorage — the default should follow the user's actual workload each visit)
- Third-party: none

---

## State / Data Flow

**Decisions:**
Grid row → `DecisionButtons.onDecide` → `Abstracts.tsx` optimistic local `rows` update →
`repo.submissions.setStatus` → Convex mutation → on success the reactive query re-delivers the row;
on failure the local row reverts to its prior status and an inline error renders under the toolbar.

**Star scores:**
`StarRating.onChange` → `setScoreDraft` in `Evaluation.tsx` (or the criterion value in
`ScorecardForm`) → local draft only. Nothing is written until **Submit review** / **Update review**
is pressed — this is the existing behaviour and must be preserved. Then
`repo.evaluations.submit` → Convex → the aggregate rating recomputes and flows to the Submissions
grid Rating column via `createRows` in `Abstracts.tsx`.

**View default:**
On mount, `Evaluation.tsx` already loads `evaluations.myQueue`. Derive
`hasUnscoredAssignments = myQueue.some(row => !row.review)` and use it to pick the initial view.
This must not add a second query — the data is already fetched.

---

## Auth / Permissions

Unchanged. Every permission boundary this feature touches already exists:

- Setting a submission status is organizer-gated server-side. `DecisionButtons` is a new caller of
  an existing guarded mutation, not a new surface — it must not carry its own client-side gate as
  the enforcement point.
- `evaluations.myQueue` is scoped server-side to the signed-in Clerk account's email
  (`identity.subject` → reviewer email match). The view switcher only changes what renders; it must
  not pass a reviewer identity from the client.
- Blind review (`anonymized`) already strips speaker identity server-side before rows leave Convex.
  `StarRating` and the queue switcher must not reintroduce any speaker field into the reviewer view.

---

## Edge Cases & Error States

| Case | Behaviour |
|------|-----------|
| Status mutation fails | Row reverts to prior status; inline `text-destructive` message below the toolbar; no modal |
| Two rapid decision clicks | Buttons disabled while `pending`; the second click is dropped, not queued |
| Reviewer has no assignments | View switcher not rendered; plans view loads; no empty tab |
| Reviewer queue empty after scoring everything | Queue segment shows count 0 and the queue view renders "You're all caught up" — icon + heading + subtext inside a `bg-neutral-100 rounded-[12px] p-8` card |
| Plan uses a 10-point scale | Ten `size="sm"` stars in one row, no wrap |
| Existing evaluation with a legacy `score` and no `criteriaScores` | Stars fill to that score; unchanged data |
| Submission is `draft` or `withdrawn` | `DecisionButtons` read-only |
| Loading | Grid uses the existing `SkeletonList`; star control renders unfilled with the label "Not scored" |
| Speaker views a `maybe` submission in the portal | Shows as under review — never the word "maybe". See Technical Decisions. |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model `maybe` as a status literal, not a tag | New union literal | Chosen by Naya. A tag has no server-side meaning: nothing would stop a decision email going to a held submission, and there would be no Maybe tab or count. A status is enforceable. |
| Widen the union rather than add a `decision` column | Widen | A parallel column would create two sources of truth for the same question and every existing consumer would need to learn which one wins. |
| No migration or backfill | Additive only | No existing row means `maybe`; inventing that state for `pending` rows would be fabricating review history. |
| Stars in both scoring paths | Both | Assumed default — this specific sub-question was left unanswered when the plan was scoped. Two different scoring UIs in one product is worse than one mapping decision. **Flag on handoff.** |
| Whole stars only for input | Whole | Half-star input implies a precision reviewers do not have. The aggregate stays a decimal average. |
| Keep the status `<Select>` | Keep, demoted | It is the only way to reach `draft`, `withdrawn`, and the final `accepted`/`declined` states. Removing it would lose reachable functionality. |
| Speaker-facing label for `maybe` | "Under review" | A speaker must never be shown that they are the committee's maybe. This is a real product decision, not a copy detail. |
| View default follows workload, not a saved preference | Session state | A reviewer with work should land on their work. Persisting the choice would strand them on the plans view. |

---

## Dependencies

**Requires:** nothing. The evaluation pipeline is verified working as of 2026-08-16.

**Enables:**
- Product copy that is literally true of the app.
- Faster program-committee sessions — decision-per-click instead of decision-per-dropdown.
- #196 (auto-deploy on `main`) is what actually puts this in front of users; without it this ships
  to `main` and stops there.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| The status union is enumerated in 23 files; missing one leaves a silent gap | TypeScript exhaustiveness will catch most. Run the full `npm run typecheck` (it covers app, convex, worker, sdk, cli, and mcp tsconfigs) and treat any non-exhaustive switch as a blocker. |
| `maybe` leaks into the public API and MCP surface as a breaking change | It is additive — no existing value changes. Confirm SDK and MCP consumers accept an unknown-to-them status without throwing. |
| A speaker sees "maybe" in the portal | Explicit mapping to "Under review" in `portal-data.ts`, with a test asserting the string `maybe` never reaches speaker-facing output. |
| Optimistic decisions desync from the server | Revert-on-failure with an inline error; never leave the row showing a decision the server rejected. |
| Stars regress keyboard access versus the current buttons | The current numbered buttons are focusable and clickable by keyboard. The star control must be at least as operable — this is in the acceptance criteria, not an optional polish. |
| `pending` and `maybe` blur together in the UI | Distinct badge treatment in `SubmissionStatusBadge` and a separate filter tab with its own count. |
