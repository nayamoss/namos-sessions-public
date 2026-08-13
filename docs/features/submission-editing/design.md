# Submission Editing — Design

Companion to [`requirements.md`](./requirements.md). Implementation steps in [`plan.md`](./plan.md).

---

## 1. Database / Schema Changes

### 1.1 Current schema (verbatim, `convex/schema.ts:70-83`)

```ts
submissions: defineTable({
  eventId: v.id("events"),
  formId: v.id("submission_forms"),
  idempotencyKey: v.optional(v.string()),
  speakerId: v.optional(v.id("speakers")),
  tagIds: v.optional(v.array(v.id("tags"))),
  trackId: v.optional(v.id("tracks")),
  title: v.string(),
  status: v.union(v.literal("draft"), v.literal("pending"), v.literal("accept_queue"), v.literal("accepted"), v.literal("decline_queue"), v.literal("declined"), v.literal("withdrawn")),
  answers: v.any(),
  submittedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_event", ["eventId"]).index("by_form", ["formId"]).index("by_form_idempotency", ["formId", "idempotencyKey"]).index("by_speaker", ["speakerId"]),
```

Relevant neighbours, unchanged: `submission_forms` supplies `status` (`draft | open | closed`),
`closeDate`, `sections[]` (`{ key: "abstract" | "participant" | "portal", fieldIds: string[] }`),
`crossFieldLimits[]`; `field_definitions` supplies `label`, `type`, `required`, `maxChars`,
`options`, `showIf`.

### 1.2 Required changes

| Table | Field | Type | Required? | Why |
|---|---|---|---|---|
| `submissions` | `lastSpeakerEditAt` | `v.optional(v.number())` | New, optional | Distinguishes "the speaker changed the text" from "an organizer changed the status" — `updatedAt` is written by both `decide`, `setStatus`, and `setTags`, so it cannot carry this meaning. Drives the portal's "Edited <time>" line and, later, an organizer badge. |
| `submissions` | `speakerEditCount` | `v.optional(v.number())` | New, optional | Cheap edit-pressure signal for organizers and for the README's "we thought about the reviewer, not just the speaker" argument. Absent = never edited. |

**No index changes.** Every access path this feature needs already exists: `by_event` for the
portal list, and a direct `ctx.db.get(submissionId)` for the edit view.

**No change to `SubmissionStatus`.** The model is fixed.

### 1.3 Migration note

**None required.** Both fields are `v.optional`, so existing rows validate unchanged and Convex
needs no backfill. Read sites must treat `undefined` as "never edited" rather than defaulting to
`0` at write time — do not run a backfill mutation for cosmetic tidiness; it costs a deploy and
buys nothing.

Airtable: the two columns are additive and nullable there too. The Airtable adapter is permitted
to omit them (see §5, fail-closed).

### 1.4 Frontend type changes (`src/data/types.ts`)

```ts
export interface Submission {
  id: SubmissionId; eventId: EventId; formId: FormId; speakerIds: SpeakerId[]; tagIds: TagId[];
  trackId?: string; status: SubmissionStatus; title?: string; answers?: Record<string, unknown>;
  updatedAt?: number;
  lastSpeakerEditAt?: number;   // new
  speakerEditCount?: number;    // new
}
```

Plus one new pure model, colocated with the lock rule (§3.3):

```ts
export type SubmissionEditLockReason =
  | "under_review"        // accept_queue | decline_queue
  | "decision_recorded"   // accepted | declined
  | "submissions_closed"; // form closed, or closeDate passed
export type SubmissionEditability =
  | { editable: true; mode: "draft" | "submitted" }
  | { editable: false; reason: SubmissionEditLockReason; closedAt?: number };
```

---

## 2. Backend / API

### 2.1 Affected existing files

| File | Change |
|---|---|
| `convex/schema.ts` | Add the two optional fields to `submissions`. |
| `convex/submissions.ts` | Add `getForSpeaker` query + `updateBySpeaker` mutation. Extract nothing else; `submit`, `saveDraft`, `decide`, `setStatus`, `setTags` are untouched. |
| `convex/submissionEditing.ts` *(new)* | Ownership resolution + the shared editability rule + the shared answer validator, so the query and the mutation cannot drift. |
| `convex/publicFormValidation.ts` | Reuse `assertCrossFieldLimits` as-is. If its signature is public-flow-shaped, widen it rather than copying it. |
| `src/data/repo.ts` | Extend `SubmissionsRepo` with the two operations and their input/output types. |
| `src/data/convex/index.ts` | Add `"submissions.getForSpeaker": "submissions:getForSpeaker"` and `"submissions.updateBySpeaker": "submissions:updateBySpeaker"` to the operation map; normalize the returned document like `submissions.list` does (`speakerIds` from `speakerId`, `tagIds` default `[]`). |
| `src/data/airtable/index.ts` | Implement or fail closed with the established `does not yet provide` phrasing that `backendUnavailable()` already pattern-matches. |

### 2.2 New endpoints

| Name | Kind | Args | Returns | Enforces |
|---|---|---|---|---|
| `submissions.getForSpeaker` | query | `{ eventId: Id<"events">, submissionId: Id<"submissions">, speakerId: Id<"speakers"> }` | `{ submission: {...}, form: { title, sectionTitle, description?, fields: PortalEditField[], crossFieldLimits: [...] }, editability: SubmissionEditability }` or **throws** the neutral not-available error | Event scope; submission→speaker ownership; returns the lock verdict but still returns content (FR-007) |
| `submissions.updateBySpeaker` | mutation | `{ eventId, submissionId, speakerId, title: string, answers: Record<string,string>, submit: boolean }` | `{ status: SubmissionStatus, updatedAt: number, lastSpeakerEditAt: number, speakerEditCount: number }` | Ownership; editability (re-evaluated server side, **not** trusted from the client); unknown-field rejection; required (unless saving a draft with `submit:false`); `maxChars`; cross-field limits; `draft`→`pending` only when `submit:true` |

**`PortalEditField`** is the same shape `portalFormResponses.get` already returns
(`{ id, label, type, required, maxChars?, options?, showIf? }`). Reuse that shape verbatim so
`PortalTaskFormPage`'s `fieldType()` mapper is reusable without change.

**Field identity (Phase 0 verified).** `publicForms.get` mints opaque per-response `field-N` keys
for the unauthenticated browser, but `publicForms.submit` converts those transient keys before
storage. Live public-flow rows use an answer envelope whose `fieldValues` object is keyed by real
field-definition ids; portal form responses use the same real ids. Legacy seed and organizer draft
rows may still be flat semantic objects. `getForSpeaker` therefore returns real ids, reads
`answers.fieldValues` when present, treats unmatched legacy/deleted keys as archived answers, and
`updateBySpeaker` merges edited values back into the full envelope without dropping email,
participants, labels, or archived keys. The round-trip test locks this data-loss boundary.

### 2.3 Shared rule (`convex/submissionEditing.ts`)

```ts
const SPEAKER_EDITABLE = new Set(["draft", "pending", "withdrawn"]);

export function evaluateEditability(submission, form, now): SubmissionEditability {
  if (submission.status === "accept_queue" || submission.status === "decline_queue")
    return { editable: false, reason: "under_review" };
  if (submission.status === "accepted" || submission.status === "declined")
    return { editable: false, reason: "decision_recorded" };
  if (form.status !== "open")
    return { editable: false, reason: "submissions_closed", closedAt: form.closeDate };
  if (form.closeDate !== undefined && form.closeDate <= now)
    return { editable: false, reason: "submissions_closed", closedAt: form.closeDate };
  if (!SPEAKER_EDITABLE.has(submission.status))
    return { editable: false, reason: "under_review" };
  return { editable: true, mode: submission.status === "draft" ? "draft" : "submitted" };
}
```

Order matters: status locks are checked **before** the close-date lock, so an accepted speaker is
told "a decision has been recorded" rather than the less useful "submissions closed".

The mutation calls the same function and throws when `editable === false`. The client copy in
`src/lib/submission-editing.ts` is a *presentation* mirror only, used to render the list badge
before the detail query runs; it must never be the authority (NFR-002).

---

## 3. Frontend

### 3.1 Files

| File | Change |
|---|---|
| `src/pages/portal/PortalPages.tsx` | `PortalSubmissions` gains a per-row action zone. `usePortalSubmissions` unchanged. |
| `src/pages/portal/PortalSubmissionEdit.tsx` | **New.** The edit / read-only detail screen. |
| `src/pages/portal/PortalHome.tsx` | Add `<Route path="submissions/:submissionId/edit" element={<PortalSubmissionEditRoute />} />`, lazy, matching the existing `PortalFormRoute` pattern. |
| `src/lib/submission-editing.ts` | **New.** Client mirror of `evaluateEditability` + the reason → copy map. |
| `src/components/shared/DynamicFormRenderer.tsx` | **Unchanged.** Reused as-is. |

### 3.2 UI Spec — `/portal/submissions` (modified)

**Location:** existing page, existing `<section className="rounded-lg bg-card">` list. Each row
keeps its current left block (eyebrow "Submission", title, updated line) and its right-hand
`StatusPill`. The change is a third zone between them.

**Row, editable state**

- Left block (unchanged): eyebrow `Submission` (`text-xs text-muted-foreground`), title
  (`text-sm font-semibold`), meta line (`text-xs text-muted-foreground`).
- Meta line **gains** an edited marker when `lastSpeakerEditAt` is present:
  `Updated 11 Aug 2026 · Edited 2 hours ago`. Separator is a middle dot in the same text node —
  **not** a border, not a `divide-` utility.
- New middle zone: nothing. Keep the row's `flex flex-wrap items-center justify-between gap-4 p-5`.
- Right zone becomes `<div className="flex items-center gap-3">` containing the existing
  `StatusPill`, then the action.
- Action, editable: `<Button asChild variant="ghost" size="sm"><Link to={`/portal/submissions/${id}/edit`}>Edit</Link></Button>`.
  Label exactly **Edit**. Ghost variant — neutral background on hover, no border, no shadow, never blue.
- Accessible name: `Edit <submission title>` via `aria-label` on the Link, because "Edit" repeats
  down the list.

**Row, locked state**

- Action slot renders text, not a disabled button:
  `<span className="text-xs text-muted-foreground">Locked · under review</span>`.
  A disabled button invites clicking; a sentence explains.
- Copy map (single source, `src/lib/submission-editing.ts`):
  | reason | list copy | detail-page copy |
  |---|---|---|
  | `under_review` | `Locked · under review` | `This proposal is being reviewed, so it can no longer be changed. Email the organizers if something is wrong.` |
  | `decision_recorded` | `Locked · decision recorded` | `A decision has been recorded for this proposal, so it can no longer be changed.` |
  | `submissions_closed` | `Locked · submissions closed` | `Submissions closed on 15 September 2026, 11:59 PM EDT.` (event timezone, `Intl.DateTimeFormat` with `timeZone: event.timezone`) |

**Row, adapter-unsupported state** (Airtable fails closed): action slot renders
`Editing is not available on this backend.` (`text-xs text-muted-foreground`). No crash, no
disabled control, list still renders.

**Empty state:** unchanged — `No submissions yet.` at `p-5`.
**Loading state:** unchanged — `<SkeletonList rows={3} label="Loading submissions…" />`.
**Error state:** unchanged — `role="alert"` line above the section.

### 3.3 UI Spec — `/portal/submissions/:submissionId/edit` (new)

Full page inside the existing `PortalLayout`. **Not** a modal, **not** a `position: fixed` panel.
Outer container `<div className="space-y-4">`, matching every other portal page.

**A. Page header** — `<PageHeader title="Edit submission" />`. Title only. No subtitle, no
buttons, no breadcrumb inside the header component; that is the design system's rule and
`PageHeader` only accepts a title anyway.

**B. Toolbar row** — `<ContentToolbar ariaLabel="Submission editing actions" … />`

| Slot | Content |
|---|---|
| `search` (left) | Context block, not a search box: submission title (`text-sm font-medium truncate`) on line one; on line two `StatusPill` + `Updated <date>` + edited marker, all `text-xs text-muted-foreground`. This is the "filters left" position — here it carries the record's identity. |
| `utilities` (right group, order-2 on desktop) | `Cancel` — `<Button variant="ghost" size="sm">`, returns to `/portal/submissions`, guarded by the unsaved-changes dialog. Plus, when `mode === "draft"`, `Save draft` — `<Button variant="ghost" size="sm">`. |
| `primaryAction` (rightmost) | `mode === "draft"` → `Submit proposal`; `mode === "submitted"` → `Save changes`. Both `<Button variant="accent" size="sm">`. Accent is the project's coral token — dark text, radius from the token, no border, no shadow, **never blue**. Disabled while saving, label swaps to `Saving…`. |

**C. Status band** (conditional, directly under the toolbar, no wrapper card when absent)

- Success: `<p role="status" className="rounded-md bg-muted px-4 py-3 text-sm">Your changes were saved.</p>`
  — mirrors the profile page's existing saved banner exactly.
- Locked: `<p className="rounded-md bg-muted px-4 py-3 text-sm">` + the detail-page copy from the
  table above. Rendered for read-only mode.
- Adapter-unsupported: same shape, copy `Editing is not available on this backend. You can still read your submission here.`

**D. Form card** — `<section className="space-y-5 rounded-lg bg-card p-6">`
Radius `rounded-lg` = 8px in this project's token set, inside the 10-14px intent already used by
every other portal card; do **not** raise it here and create a one-off.

1. Section heading: form's abstract-section `title` (`text-base font-semibold`) and, if present,
   its `description` with tags stripped (`mt-1 text-sm text-muted-foreground`) — same treatment as
   `PortalTaskFormPage`.
2. **Title field** — `<Label htmlFor="submission-title">Title</Label>` + `<Input id="submission-title">`.
   Rendered explicitly and first, because `submissions.title` is a real column, not just an answer.
   Required marker ` *`. Reflects into the answers map only if the form's own title field
   duplicates it (mirror `SubmissionPage`'s `titleField` heuristic — reuse it, do not re-derive).
3. `<DynamicFormRenderer fields={fields} values={answers} onChange={…} />` — supplies labels,
   required markers, `showIf` visibility, per-field `maxChars` counters (`text-right text-xs
   text-muted-foreground`) and select options. **No modification to this component.**
4. Cross-field counters, one `<p>` per limit, immediately below the renderer:
   `{label}: {count} / {max} characters ({remaining} remaining)` — `text-xs text-muted-foreground`
   when valid, `text-xs text-destructive` when not. Byte-identical copy to `SubmissionPage.tsx:157`.
5. Note line, always present: `Co-presenters and availability are managed on their own portal pages.`
   with inline links to `/portal/profile` and `/portal/availability` (`underline underline-offset-4`,
   no button chrome).
6. Error list: reuse the `ErrorList` shape — `<div role="alert" className="mt-4 rounded-md
   bg-destructive/10 p-3 text-sm text-destructive">` with a `<ul className="list-disc space-y-1
   pl-5">`. One `<li>` per server or client validation failure. **Typed values are never cleared.**

**E. Read-only variant** (locked, or adapter-unsupported)
Same card, same order, but each answer renders as a definition row — reuse `ReviewSection`'s
`<dl>` treatment (`grid grid-cols-[10rem_1fr] gap-3`, label muted, value `text-foreground`). The
toolbar drops `Save`/`Save draft`/`Submit`; `primaryAction` becomes
`<Button asChild variant="ghost" size="sm"><Link to="/portal/submissions">Back to my submissions</Link></Button>`.

**F. Loading state** — `<SkeletonList rows={4} label="Loading your submission…" />` in place of the
form card. Header and toolbar render immediately with the title slot blank.

**G. Not-found / not-yours state** — no toolbar at all; a single card:
`<section className="rounded-lg bg-card p-8 text-center">` with
`That submission is not available on your portal.` (`font-medium`) and a
`Back to my submissions` ghost link beneath. **Identical wording whether the submission does not
exist or belongs to someone else** — do not leak existence.

**H. No speaker selected** — reuse the existing `PortalAccessRequired` component unchanged.

**I. Unsaved-changes dialog** — shadcn `alert-dialog`, the one sanctioned overlay in this project.
Title `Discard your changes?`; body `You have unsaved edits to this proposal.`; actions
`Keep editing` (ghost) and `Discard` (destructive). Triggered by Cancel and by portal nav clicks
while dirty. **Never `window.confirm`.**

**Design-rule self-check for this screen:** no `border`, no `box-shadow`, no `linear-gradient`, no
`<hr>`, no `divide-*`, no `position: fixed`, no blue button, radius ≤ 14px, `py-` never above 12,
`space-y-` never above 6, card padding `p-6`, grid gap n/a (single column).

### 3.4 State / Data flow

```
PortalIdentityProvider ──► { eventId, selectedSpeaker }
        │
PortalSubmissions ── repo.submissions.list({ eventId })
        │                 .filter(speakerIds.includes(speaker.id))     [existing]
        │            ── clientEditability(status)  → Edit link or lock text   [optimistic badge only]
        ▼  navigate /portal/submissions/:id/edit
PortalSubmissionEdit
   mount ─► repo.submissions.getForSpeaker({ eventId, submissionId, speakerId })
              ─► { submission, form:{fields,limits}, editability }        [server is authority]
   local  ─► title, answers, dirty, saving, errors[], savedMessage
   change ─► setAnswers / setTitle; dirty = true; clear errors and savedMessage
   save   ─► repo.submissions.updateBySpeaker({ …, submit })
              success ─► dirty=false; savedMessage; patch local status/updatedAt from the response
              failure ─► errors[] = [message]; values retained
   leave  ─► dirty ? AlertDialog : navigate
```

Only two round-trips total: the existing list query, then one detail query. No polling, no
subscription changes. The list is **not** refetched on return — the detail response carries the new
`status`/`updatedAt`, and the list re-runs its existing effect on mount anyway.

---

## 4. Auth / Permissions — Clerk is live

Real Clerk authentication is already the shipping boundary on `main`. `PortalIdentityProvider`
resolves the signed-in account through `speakers.getMine(eventId)`, which requires a
provider-verified email claim. A handoff value or client-supplied `speakerId` is never a credential.

Both new endpoints still take `speakerId` as an explicit scoping argument, but the server must
independently authenticate and authorize it. The one ownership helper is
`requireOwnSubmission(ctx, { eventId, submissionId, speakerId })` in
`convex/submissionEditing.ts`, and it must:

1. Call `requireIdentity(ctx)` / `ctx.auth.getUserIdentity()` and reject unauthenticated callers.
2. Load the submission and its speaker without leaking whether a mismatched submission exists.
3. Require `submission.eventId === eventId`, `submission.speakerId === speakerId`, and the speaker's
   `eventId === eventId`.
4. Apply the exact `assertOwnsSpeaker` rule from `convex/speakers.ts`: `identity.email` must match
   `speaker.email` case-insensitively and `identity.emailVerified` must be exactly `true`.
5. Throw the neutral `"That submission is not available on your portal."` for not-found,
   wrong-event, wrong-speaker, and failed ownership checks.

Both the query and mutation call this helper independently. The UI may use `selectedSpeaker` from
`PortalIdentityProvider` for routing and arguments, but never as the authority. No new auth
mechanism, local-storage fallback, or organizer bypass is introduced by this feature.

---

## 5. Adapter contract

`SubmissionsRepo` gains:

```ts
getForSpeaker(input: { eventId: EventId; submissionId: SubmissionId; speakerId: SpeakerId })
  : Promise<SubmissionEditView>;
updateBySpeaker(input: { eventId: EventId; submissionId: SubmissionId; speakerId: SpeakerId;
  title: string; answers: Record<string, string>; submit: boolean })
  : Promise<{ status: SubmissionStatus; updatedAt: number; lastSpeakerEditAt: number; speakerEditCount: number }>;
```

Both adapters must satisfy the shared contract suite. Airtable may throw
`new Error("The Airtable backend does not yet provide speaker submission editing.")` — the phrase
`does not yet provide` is what `backendUnavailable()` in `PortalPages.tsx` already matches, and the
portal renders the unsupported states in §3.2 / §3.3-C rather than an error page. **Fail closed,
never silently no-op**, and never fall back to local storage for a submission the way the profile
page does for a bio: a proposal that appears saved but is not is worse than a clear refusal.

---

## 6. Edge Cases

| # | Case | Behaviour |
|---|---|---|
| E-01 | Organizer accepts the submission while the speaker has the edit form open | Save fails server-side with "This proposal can no longer be edited."; the page re-fetches and re-renders read-only with the decision reason. The speaker's typed text stays visible in the error state long enough to copy. |
| E-02 | Form's `closeDate` passes mid-edit | Same as E-01, reason `submissions_closed`. |
| E-03 | `answers` contains a key whose field definition was deleted from the form since submission | Rendered read-only as an "Archived answer" row above the form fields, never dropped silently, never editable. The save payload preserves it verbatim. |
| E-04 | A form field was **added** since submission and is required | Renders empty; a non-draft save requires it. This is correct: a save is a fresh validation against the current form. |
| E-05 | `showIf` parent answer changes so a previously answered child hides | The hidden child's stored value is preserved in the payload, exactly as the public flow does. Hidden fields are exempt from required, never from `maxChars`. |
| E-06 | Submission has no `formId` match / form deleted | Not-found state (§3.3-G). |
| E-07 | Admin-created abstract (`createAdmin`) with `speakerId === undefined` | Never appears in the speaker's list (the existing filter already excludes it) and `getForSpeaker` returns the neutral not-available error. |
| E-08 | Submission with multiple `speakerIds` | The Convex row has a single `speakerId`; `speakerIds` is an adapter projection. Ownership is `submission.speakerId === speakerId`. Multi-speaker ownership is out of scope and must not be faked client-side. |
| E-09 | Two tabs editing the same submission | Last write wins. Acceptable — no locking, no versioning. Document it; do not build optimistic concurrency for a hackathon. |
| E-10 | Title emptied | Rejected client and server: "A submission title is required." — mirrors `submissions.submit`. |
| E-11 | Draft with an empty title, saving as draft | Allowed. `saveDraft` already permits it; drafts enforce `maxChars` and cross-field limits only. |
| E-12 | `withdrawn` submission edited | Allowed per FR-003, status unchanged. It stays withdrawn — editing is not a re-submit. Toolbar shows `Save changes`; a note reads `This proposal is withdrawn. Editing it does not resubmit it.` |
| E-13 | Cross-field limit exceeded only after a `showIf` field becomes visible | Counter recomputes on every keystroke from the visible-values map, same call as the public flow. |
| E-14 | Speaker switches identity in the portal dropdown while on the edit page | Effect keyed on `selectedSpeaker.id` re-runs the query; a mismatch resolves to the not-available state. |
| E-15 | Very large `answers` payload | Unchanged from submit — the same field `maxChars` bound applies, so no new size class. |

---

## 7. Technical Decisions

| # | Decision | Alternatives considered | Why this one |
|---|---|---|---|
| **TD-01** | **Editing locks at `accept_queue`.** Editable: `draft`, `pending`, `withdrawn`. Locked: `accept_queue`, `accepted`, `decline_queue`, `declined`. | (a) Lock only at `accepted`/`declined`, leaving the queues open. (b) Never lock; organizers cope. (c) Lock at `pending` — edit drafts only. | The queue states are, per `HANDOFF.md` §5, *"staging before a final decision — the actual review workflow."* An organizer has already acted on a queued submission: it has been read, likely scored, and moved. Text changing underneath a recorded score is a data-integrity bug that surfaces as a reviewer disagreeing with themselves. (a) draws the line after the damage. (b) is what the complaint research says competitors get wrong. (c) makes the feature nearly worthless — `pending` is where almost every submission lives during a CFP, and "edit your submission" that only works on drafts is not the documented Sessionboard behaviour. Locking at the first organizer action is the most conservative rule that still delivers the feature. |
| **TD-02** | **A closed form also locks editing**, independent of status. | Keep pending edits open after close. | pretalx's default is exactly this: speakers may edit after submitting, but editing stops when the CfP closes and the review phase begins. The deadline means something — a reviewer opening the pile the morning after close must be reading a frozen corpus. Matching the most widely deployed open-source CFP tool's default is the defensible choice with no user available to ask. |
| **TD-03** | **No organizer override toggle** in this feature. | Ship pretalx's `Allow speakers to edit their proposals` setting alongside. | Two ship-blockers for the price of one: a settings surface, a schema field, and a second matrix of states to test — for a knob nobody has asked for. The conservative default first; the toggle is a clean follow-up because the rule is already isolated in one function. |
| **TD-04** | **Reuse `FieldDefinition` + `DynamicFormRenderer` + `evaluateCrossFieldLimits`.** No parallel edit form. | Hand-write an edit form over the known abstract fields. | `portal-forms/plan.md` states the principle for this codebase: *"Don't build a second form engine — parameterize the first."* A parallel form would silently diverge on `showIf`, `maxChars`, and the cross-field counter — the very validation the host singled out. |
| **TD-05** | **A dedicated route (`/portal/submissions/:id/edit`), not an inline detail panel.** | Three-pane inline flex panel beside the list. | The design system reserves the inline panel for the *admin* three-pane surfaces; the portal is a simple single-column speaker view with its own shell, and every existing portal detail (`/portal/forms/:formId`) is already a route. Consistency with the portal beats consistency with the admin app here. The rule the panel decision protects — never `position: fixed`, never an overlay — is satisfied trivially by a route. |
| **TD-06** | **Editing covers the abstract section only.** Participants and availability excluded. | Full-fidelity edit of everything the public wizard collects. | Participants carry role min/max bounds and a separate write path; availability already has a dedicated portal page. Including them roughly doubles the validation surface and the test matrix for maybe 10% of the user value. Stated in the UI so it is a decision, not a hole. |
| **TD-07** | **Server re-validates everything; the client verdict is decoration.** | Trust the `editability` returned to the client. | NFR-002, and the public flow already sets this precedent (`publicForms.submit` re-validates a form it just served). The lock is a data-integrity control, and a control enforced only in the browser is not a control. |
| **TD-08** | **`lastSpeakerEditAt` + `speakerEditCount`, not a version history table.** | Full revision rows; or nothing at all (rely on `updatedAt`). | `updatedAt` is written by `decide`, `setStatus`, and `setTags`, so it cannot answer "did the speaker change the text?". Two optional scalars need no migration and no new table. Full history is a real feature with a real cost and no requirement behind it. |
| **TD-09** | **Reuse live Clerk ownership; add no second identity mechanism.** | Trust the client `speakerId`; add a lightweight edit token. | `main` already resolves portal identity by verified email. Reusing `requireIdentity` + `assertOwnsSpeaker` keeps submission editing aligned with profile and portal-form security and prevents spoofable unverified email claims. |
| **TD-10** | **Last write wins on concurrent edits.** | Optimistic concurrency via an `updatedAt` precondition. | Single-speaker-owned record, two-tab collision only. The precondition check is cheap but the *recovery UI* is not, and there is no budget for it before the deadline. Documented as E-09. |

---

## 8. Dependencies

**Requires**

- `PortalIdentityProvider`, Clerk route gating, and `speakers.getMine` verified-email resolution — **on `main`**, done.
- `DynamicFormRenderer`, `isFieldVisible` — on `main`, done.
- `evaluateCrossFieldLimits` (`src/lib/form-validation.ts`) — on `main`, done.
- `submission_forms.sections` / `field_definitions` populated by the form builder — on `main`.
- `ContentToolbar`, `PageHeader`, `SkeletonList`, `StatusPill`, shadcn `alert-dialog` — on `main`.
- Seed data containing at least one `draft`, one `pending`, one `accept_queue`, one `accepted`
  submission **owned by the demo speaker**, and one submission on a *closed* form — otherwise the
  lock states cannot be demonstrated and read as unbuilt (the same trap `HANDOFF.md` records for
  the Conflicts tab).

**Enables**

- Organizer "edited after submission" signal on the abstracts grid.
- `notifyAdminsOnUpdate` — the field already exists on `SubmissionFormWrite` with nothing writing to it.
- A future organizer-side edit-permission toggle (TD-03).
- Requirement #2 (self-service speaker portal) reaching parity with Sessionboard's documented
  participant capabilities.

**Blocks nothing.**

**Auth baseline:** the Clerk backend and frontend work is already merged into `main`; see §4.

---

## 9. Risks & Mitigations

| # | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|
| **R-01** | **Answer-envelope mismatch.** Public-flow rows store real-id values under `answers.fieldValues`, while legacy seed/draft rows can be flat. Reading or replacing the wrong layer can render blank fields or silently discard email, participants, labels, and archived answers. | Medium / **Severe** | Phase 0 inspected a live Convex snapshot. The edit view canonicalizes on real ids, the update merges into the existing envelope, the seed upgrades only legacy fixtures, and a round-trip unit test asserts untouched envelope data remains byte-for-byte equivalent. |
| **R-02** | **Auth regression.** A client-supplied `speakerId` accidentally becomes authoritative, or an unverified Clerk email claim is accepted. | Low / Severe | One `requireOwnSubmission` helper calls `requireIdentity`, loads the scoped speaker, and delegates to the canonical `assertOwnsSpeaker` verified-email check. Test unauthenticated, unverified-email, wrong-email, wrong-speaker, and wrong-event cases with the same neutral response. |
| **R-03** | **Existence leak.** Different errors reveal that another speaker's submission id is valid. | Medium / Medium | Map every not-found, event mismatch, speaker mismatch, and ownership mismatch to the exact same neutral portal error and return no content. |
| **R-04** | **Lock rule drifts** between the render path and the write path, so a speaker sees Edit and then a refusal. | Medium / Medium | One exported `evaluateEditability`; the client mirror is derived from the same reason enum and is presentation-only. Unit-test the matrix of 7 statuses × (form open / closed / past close date) once. |
| **R-05** | **Scope creep into participants, availability, and organizer notifications** — each is one small step from here. | High / Medium | TD-06 and the Out of Scope list are the contract. The note line in the UI (§3.3-D5) makes the boundary visible to the user, so it does not read as an omission. |
| **R-06** | **Editing an `accepted` submission is what a judge actually tries**, because Sessionboard's docs mention accepted-session speaker info — and they hit the lock and read it as missing. | Medium / Medium | The lock copy explains and points at the organizer; the *accepted*-speaker path Sessionboard actually documents is speaker info and documents, which already ships at `/portal/profile` and `SpeakerDocuments`. Link to those from the locked state so the path is not a dead end. |
| **R-07** | **Airtable adapter left throwing**, and a reviewer treats the contract suite as failing. | Medium / Low | Fail closed with the exact `does not yet provide` phrasing already matched by `backendUnavailable()`, assert that behaviour in the contract suite as the intended outcome, and note it in the adapter's README row. |
| **R-08** | **Deadline.** This is unplanned work against a fixed Wed Aug 12, 10PM PT deadline. | High / Medium | The cut line, in order: drop `speakerEditCount`; drop the edited marker; drop the draft `Submit proposal` path (FR-009 / US-04) and ship edit-only. The irreducible core is: Edit action on a `pending` row, a pre-filled form, one validated save, and the locked states. That alone closes the gap. |

---

## Sources

- [Sessionboard — 2026 Speaker Submission Guide](https://www.sessionboard.com/blog/the-2026-speaker-submission-guide-stop-guessing-start-designing)
- [Omnipress — Better Speaker Submissions Start with Smarter Abstract Setup](https://omnipress.com/blog/how-to-set-up-your-abstract-management-system-for-better-speaker-submissions/)
- [CTI Meeting Technology — Abstract Submission Portal Checklist (2026)](https://www.ctimeetingtech.com/abstract-submission-portal-checklist-requirements-organizers-forget/)
- [pretalx — Sessions & Proposals documentation](https://docs.pretalx.org/user/sessions/)
- [pretalx issue #333 — Issue when editing a submitted submission](https://github.com/pretalx/pretalx/issues/333)
- [pretalx issue #672 — Allow to save submissions in a draft state](https://github.com/pretalx/pretalx/issues/672)

**Research findings applied:** (1) pretalx lets speakers edit after submitting but locks editing
once the CfP closes and the review phase begins — the basis for TD-02. (2) pretalx exposes an
organizer setting to disable speaker editing entirely, drafts excepted — the shape of the future
toggle in TD-03, deliberately deferred. (3) Post-acceptance, the industry pattern shifts from
"edit the proposal" to "complete your speaker info" — a second collection round for accepted
speakers — which is why locking the proposal at acceptance is not a regression: it is the
documented lifecycle, and this repo already has the second round in profile + documents + portal
tasks. (4) Data continuity matters more than re-entry: accepted speakers should never re-fill what
they already gave, which is why the edit view rehydrates from the stored answers rather than
starting blank. (5) Structured, unambiguous fields beat free text — reusing the form builder's
field definitions rather than a bespoke edit form preserves that structure.
