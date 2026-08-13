# Submission Editing — Implementation Plan

**Est. 3-4h** · Requirements: [`requirements.md`](./requirements.md) · Design: [`design.md`](./design.md)

Do not start Phase 2 before Phase 0 is answered — Phase 0 decides the shape of every payload
below.

---

## Phase 0 — Verify the answer-key shape (BLOCKING, ~15m)

The single severe risk (design §9, R-01) was the boundary between the browser's opaque `field-N`
keys, stored public answer envelopes, and legacy flat rows. Guessing wrong renders every field
blank and a save wipes the proposal.

- [x] Read a live Convex snapshot. Public-flow rows store
      `{ email, fieldValues, fieldLabels, participantFieldLabels, participantValues }`, with
      `fieldValues` keyed by real field-definition ids. Legacy seeded rows store flat semantic
      keys (`title`, `abstract`, `track`, `email`).
- [x] Read `submissions.saveDraft` and `submissions.createAdmin`: they accept/store legacy flat
      answer objects; admin-created rows have no speaker and are therefore never portal-editable.
- [x] Canonicalize `getForSpeaker` / `updateBySpeaker` on real field-definition ids inside
      `answers.fieldValues`, preserving the complete envelope plus unknown/archived legacy keys.
      Write the evidence at the top
      of `convex/submissionEditing.ts` as a comment with the evidence.
- [x] The public browser payload uses opaque keys transiently, but `publicForms.submit` converts
      them to real ids before storage. No shared opaque-key extraction is needed. If that changes,
      extract the `fieldKeyById` construction out of
      `convex/publicForms.ts` into a shared helper. **One construction, used twice** — never a
      second, similar-looking mapping.

---

## Phase 1 — Schema (~10m)

- [ ] `convex/schema.ts`: add `lastSpeakerEditAt: v.optional(v.number())` and
      `speakerEditCount: v.optional(v.number())` to `submissions`.
- [ ] No index changes. No migration — both fields optional; existing rows validate unchanged.
- [ ] `src/data/types.ts`: add the same two optional fields to `Submission`; add
      `SubmissionEditLockReason` and `SubmissionEditability` (design §1.4).
- [ ] `npx convex dev` / typecheck clean.

---

## Phase 2 — Backend (~1h)

- [ ] New `convex/submissionEditing.ts`:
  - [ ] `requireOwnSubmission(ctx, { eventId, submissionId, speakerId })` — loads the submission,
        requires the Clerk identity, asserts the event/submission/speaker relationship, then uses
        `assertOwnsSpeaker` for verified-email ownership. It throws the **neutral**
        `"That submission is not available on your portal."` for not-found, not-yours, wrong-event,
        unverified-email, and unauthenticated ownership failures.
  - [ ] `evaluateEditability(submission, form, now)` exactly as design §2.3 — status locks checked
        *before* the close-date lock.
  - [ ] `assertAnswers({ form, fields, answers, title, requireRequired })` — unknown-key rejection,
        required (skipped when saving a draft), `maxChars`, and cross-field limits via the existing
        `assertCrossFieldLimits`. Widen that helper's signature if needed; do not copy it.
- [ ] `convex/submissions.ts` — **append only**, do not reorder or reformat existing exports:
  - [ ] `getForSpeaker` query → `{ submission, form: { title, sectionTitle, description?, fields, crossFieldLimits }, editability }`.
        Returns content even when locked (FR-007). Fields use the `portalFormResponses.get` shape.
  - [ ] `updateBySpeaker` mutation → re-runs `requireOwnSubmission` + `evaluateEditability` +
        `assertAnswers`; patches `title`, `answers` (preserving `answers.email` and any archived
        keys), `updatedAt`, `lastSpeakerEditAt`, `speakerEditCount + 1`; when `submit === true` and
        status is `draft`, also sets `status: "pending"` and `submittedAt`. Returns the new
        `{ status, updatedAt, lastSpeakerEditAt, speakerEditCount }`.
- [ ] Confirm no other mutation's behaviour changed.

---

## Phase 3 — Adapters (~30m)

- [ ] `src/data/repo.ts`: extend `SubmissionsRepo` with `getForSpeaker` and `updateBySpeaker`
      plus their input/output types (design §5).
- [ ] `src/data/convex/index.ts`: add both operations to the map
      (`"submissions.getForSpeaker": "submissions:getForSpeaker"`,
      `"submissions.updateBySpeaker": "submissions:updateBySpeaker"`); normalize the returned
      submission the way `submissions.list` already does (`speakerIds` from `speakerId`,
      `tagIds` default `[]`).
- [ ] `src/data/airtable/index.ts`: implement, or fail closed with
      `"The Airtable backend does not yet provide speaker submission editing."` — the phrase
      `does not yet provide` is what `backendUnavailable()` matches. **Never a silent no-op, never
      a localStorage fallback** for submission content.
- [ ] Extend the adapter contract suite to cover both operations for both implementations,
      asserting the Airtable throw as the intended outcome if unimplemented.

---

## Phase 4 — Frontend UI (REQUIRED)

Design rules are absolute here: **no borders, no shadows, no gradients, no `<hr>`, no `divide-*`,
no `position: fixed` panels, no blue buttons, radius ≤ 14px, page header carries the title only,
toolbar puts context left and actions right.** Self-check before each commit: "does this create a
visible line anywhere?"

### 4a. Shared client rule (~10m)

- [ ] New `src/lib/submission-editing.ts`: a presentation mirror of `evaluateEditability` plus the
      reason → copy map. **Presentation only** — never the authority (NFR-002).

| reason | list copy | detail-page copy |
|---|---|---|
| `under_review` | `Locked · under review` | `This proposal is being reviewed, so it can no longer be changed. Email the organizers if something is wrong.` |
| `decision_recorded` | `Locked · decision recorded` | `A decision has been recorded for this proposal, so it can no longer be changed.` |
| `submissions_closed` | `Locked · submissions closed` | `Submissions closed on <date, event timezone>.` |

### 4b. `/portal/submissions` list (~30m) — `src/pages/portal/PortalPages.tsx`

- [ ] Keep the row's existing `flex flex-wrap items-center justify-between gap-4 p-5` and its left
      block (eyebrow `Submission`, title `text-sm font-semibold`, meta `text-xs text-muted-foreground`).
- [ ] Meta line gains an edited marker when `lastSpeakerEditAt` is set:
      `Updated 11 Aug 2026 · Edited 2 hours ago`. Middle dot **inside the same text node** — not a
      border, not `divide-*`.
- [ ] Right zone becomes `<div className="flex items-center gap-3">`: existing `StatusPill`, then
      the action slot.
- [ ] **Editable:** `<Button asChild variant="ghost" size="sm"><Link to={`/portal/submissions/${id}/edit`} aria-label={`Edit ${title}`}>Edit</Link></Button>`.
      Label exactly `Edit`. Ghost — no border, no shadow, never blue.
- [ ] **Locked:** text, not a disabled button —
      `<span className="text-xs text-muted-foreground">Locked · under review</span>` (copy per 4a).
- [ ] **Adapter unsupported:** `<span className="text-xs text-muted-foreground">Editing is not available on this backend.</span>`.
- [ ] Empty / loading / error states unchanged (`No submissions yet.` at `p-5`;
      `<SkeletonList rows={3} label="Loading submissions…" />`; `role="alert"` line above the section).

### 4c. New route (~10m)

- [ ] `src/pages/portal/PortalHome.tsx`: add
      `<Route path="submissions/:submissionId/edit" element={<PortalSubmissionEditRoute />} />`,
      lazy, matching the existing `PortalFormRoute` pattern. Route-level code split (NFR-001).

### 4d. `PortalSubmissionEdit.tsx` (~1h) — full UI spec

Full page inside `PortalLayout`. Outer `<div className="space-y-4">`. **Not a modal. Not a fixed
panel.**

**A. Page header**
- [ ] `<PageHeader title="Edit submission" />` — title only, no subtitle, no buttons.

**B. Toolbar** — `<ContentToolbar ariaLabel="Submission editing actions" … />`
- [ ] `search` slot (left) = context block, not a search box: submission title
      (`text-sm font-medium truncate`); line two = `StatusPill` + `Updated <date>` + edited marker,
      all `text-xs text-muted-foreground`.
- [ ] `utilities` (right group): `Cancel` — `<Button variant="ghost" size="sm">` → `/portal/submissions`,
      guarded by the unsaved-changes dialog. Plus, when `mode === "draft"`, `Save draft`
      (`variant="ghost" size="sm"`).
- [ ] `primaryAction` (rightmost): `Submit proposal` when `mode === "draft"`, else `Save changes`.
      `<Button variant="accent" size="sm">` — coral accent token, dark text, no border, no shadow,
      **never blue**. Disabled while saving; label swaps to `Saving…`.

**C. Status band** (conditional, directly under the toolbar, no wrapper when absent)
- [ ] Success: `<p role="status" className="rounded-md bg-muted px-4 py-3 text-sm">Your changes were saved.</p>`
- [ ] Locked: same shape, detail-page copy from 4a.
- [ ] Adapter unsupported: same shape, `Editing is not available on this backend. You can still read your submission here.`

**D. Form card** — `<section className="space-y-5 rounded-lg bg-card p-6">`
- [ ] Section heading = the form's abstract-section `title` (`text-base font-semibold`); optional
      `description` tag-stripped (`mt-1 text-sm text-muted-foreground`), same treatment as
      `PortalTaskFormPage`.
- [ ] **Title field first**, explicitly: `<Label htmlFor="submission-title">Title</Label>` +
      `<Input id="submission-title">`, required marker ` *`. `submissions.title` is a real column.
      Reuse `SubmissionPage`'s `titleField` heuristic if the form duplicates it — do not re-derive.
- [ ] `<DynamicFormRenderer fields={fields} values={answers} onChange={…} />` — **unmodified**.
      Supplies labels, required markers, `showIf` visibility, per-field `maxChars` counters
      (`text-right text-xs text-muted-foreground`), select options.
- [ ] Cross-field counters below the renderer, one `<p>` per limit, copy byte-identical to
      `SubmissionPage.tsx:157`:
      `{label}: {count} / {max} characters ({remaining} remaining)` —
      `text-xs text-muted-foreground` when valid, `text-xs text-destructive` when not.
- [ ] Scope note, always present: `Co-presenters and availability are managed on their own portal
      pages.` with inline links to `/portal/profile` and `/portal/availability`
      (`underline underline-offset-4`, no button chrome).
- [ ] Error list: `<div role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm
      text-destructive">` wrapping `<ul className="list-disc space-y-1 pl-5">`, one `<li>` per
      failure. **Typed values are never cleared on error** (NFR-008).

**E. Read-only variant** (locked, or adapter unsupported)
- [ ] Same card and order, answers rendered as `ReviewSection`'s `<dl>` treatment
      (`grid grid-cols-[10rem_1fr] gap-3`, muted label, `text-foreground` value).
- [ ] Toolbar drops Save / Save draft / Submit; `primaryAction` becomes
      `<Button asChild variant="ghost" size="sm"><Link to="/portal/submissions">Back to my submissions</Link></Button>`.
- [ ] When the reason is `decision_recorded`, add links to `/portal/profile` and `/portal/tasks`
      so an accepted speaker has somewhere to go (design §9, R-06).

**F. Loading** — `<SkeletonList rows={4} label="Loading your submission…" />` in place of the card;
header and toolbar render immediately with the title slot blank.

**G. Not-found / not-yours** — no toolbar; a single
`<section className="rounded-lg bg-card p-8 text-center">` with
`That submission is not available on your portal.` (`font-medium`) and a ghost
`Back to my submissions` link. **Identical copy for both cases** — do not leak existence.

**H. No speaker selected** — reuse `PortalAccessRequired` unchanged.

**I. Unsaved-changes dialog** — shadcn `alert-dialog` (the only sanctioned overlay). Title
`Discard your changes?`; body `You have unsaved edits to this proposal.`; `Keep editing` (ghost)
and `Discard` (destructive). Fired by Cancel and by portal nav while dirty. **Never `window.confirm`.**

**J. Archived answers** (E-03) — any stored key with no current field definition renders read-only
above the form under `Archived answer`, is never editable, and is preserved verbatim in the payload.

**Design self-check before commit**
- [ ] No `border`, no `box-shadow`, no `linear-gradient`, no `<hr>`, no `divide-*`
- [ ] No `position: fixed` panel; the edit view is a route, not an overlay
- [ ] No blue button; primary is the accent token
- [ ] Radius ≤ 14px; card padding `p-6`; `space-y-` ≤ 6; `py-` ≤ 12
- [ ] Every date rendered in `events.timezone`, never the browser's

---

## Phase 5 — Tests (~30m)

- [ ] Unit: `evaluateEditability` across all 7 statuses × (form open / form closed / closeDate past).
      Assert status locks win over the close-date lock.
- [ ] Unit: `assertAnswers` — unknown key rejected; required enforced only when `requireRequired`;
      `maxChars` always; cross-field limits always; hidden `showIf` children exempt from required
      but not from `maxChars`.
- [ ] Integration: public submit → `getForSpeaker` → `updateBySpeaker` round-trip; **untouched
      answers come back byte-identical** (the R-01 guard).
- [ ] Integration: `updateBySpeaker` against an `accepted` submission is rejected and writes nothing.
- [ ] Integration: another speaker's `submissionId` returns the neutral error with no content.
- [ ] Integration: `draft` + `submit: true` → `pending` with `submittedAt` stamped; `draft` +
      `submit: false` with an empty required field succeeds.
- [ ] Component: locked row renders lock text and **no** Edit link; editable row renders the link.
- [ ] Adapter contract suite green for both implementations.

---

## Phase 6 — Seed + verification data (~15m)

Locked states that cannot be demonstrated read as unbuilt — the same trap `HANDOFF.md` records for
the Conflicts tab.

- [ ] Seed guarantees, **all owned by the demo speaker**: one `draft`, one `pending`, one
      `accept_queue`, one `accepted`, and one `pending` submission on a **closed** form.
- [ ] Keep the primary CFP form `open` with a future `closeDate` so the happy path works for judges.
- [ ] Seed remains idempotent and re-runnable.

---

## Task Dependencies

```
Phase 0 (answer-key shape)   ← BLOCKING, nothing starts before this
      │
      ▼
Phase 1 (schema + types)
      │
      ▼
Phase 2 (submissionEditing.ts → getForSpeaker → updateBySpeaker)
      │
      ▼
Phase 3 (repo interface → convex adapter → airtable fail-closed → contract suite)
      │
      ├─────────────┐
      ▼             ▼
Phase 4a        Phase 5 (backend tests can run in parallel with UI)
(client rule)
      │
      ├──► 4b (list actions)   ─┐
      └──► 4c (route) ──► 4d ───┴──► Phase 5 (component tests)
                                          │
                                          ▼
                                     Phase 6 (seed)
```

- 4b and 4c/4d both depend on 4a (shared copy map) and Phase 3 (adapter surface).
- Phase 5's backend tests need only Phase 2; its component tests need 4b/4d.
- Phase 6 can be written any time after Phase 1 but is verified last.

---

## Verification Checklist

**Functional**
- [ ] Submit a proposal through the public flow → auto-redirect lands in the portal → the new
      submission shows an **Edit** action.
- [ ] Edit the title, save, return to the list: new title and refreshed "Updated" date visible.
- [ ] Every field pre-fills with the stored answer, in form order, with `showIf` honoured.
- [ ] Clear a required field → save refused, the field is named, nothing written, typed values
      still on screen.
- [ ] Exceed a cross-field limit → live counter turns destructive and the save is refused.
- [ ] `draft` shows both **Save draft** and **Submit proposal**; submitting moves it to `pending`
      with a Pending pill.
- [ ] `withdrawn` is editable, stays withdrawn, and shows the "does not resubmit it" note.
- [ ] `accept_queue`, `accepted`, `decline_queue`, `declined` all render read-only with the correct
      reason and no Edit action in the list.
- [ ] A `pending` submission on a **closed** form is read-only with the close date in the **event**
      timezone.
- [ ] Deep-linking to a locked submission's edit URL renders read-only, never a form.
- [ ] Deep-linking to another speaker's submission id shows the neutral message with no content.
- [ ] Navigating away dirty raises the in-app dialog; `Discard` leaves, `Keep editing` stays.

**Server enforcement**
- [ ] `updateBySpeaker` called directly against an `accepted` submission → rejected, row unchanged.
- [ ] Called with an unknown field key → rejected.
- [ ] Called with a `speakerId` that does not own the row → neutral rejection.
- [ ] Called twice with an identical payload → same result, no duplicate side effects.

**Data integrity**
- [ ] `answers.email` written by the original submit path survives an edit unchanged.
- [ ] Untouched answers are byte-identical after a round-trip (R-01).
- [ ] `lastSpeakerEditAt` set and `speakerEditCount` incremented on save; `updatedAt` moves;
      `status` unchanged except the draft submit.
- [ ] An organizer `setStatus` / `decide` still does **not** set `lastSpeakerEditAt`.

**Design rules**
- [ ] No border, shadow, gradient, `<hr>`, or `divide-*` introduced anywhere in the diff.
- [ ] No `position: fixed` panel; edit view is a route.
- [ ] Primary action is the accent token, not blue; secondary actions are ghost.
- [ ] Page header holds only the title; toolbar is context-left / actions-right.
- [ ] Radius ≤ 14px, `space-y-` ≤ 6, `py-` ≤ 12, card padding `p-6`.

**Non-functional**
- [ ] Edit page interactive in < 1s on the seeded deployment; exactly one extra round-trip.
- [ ] Route is code-split; the admin bundle is not pulled into `/portal`.
- [ ] Airtable mode: list still renders, Edit reads "not available on this backend", nothing crashes.
- [ ] `npm run lint`, typecheck, and the full test suite clean; gitleaks clean.
- [ ] `docs/features/INDEX.md` updated in the same commit as the implementation.
