# Submission Editing — Requirements

**Feature:** Speaker can edit their own submission after submitting
**Phase:** slots beside [speaker-portal](../speaker-portal/plan.md) (Phase 4) · **Est. 3-4h**
**Routes:** `/portal/submissions` (modified), `/portal/submissions/:submissionId/edit` (new)
**Related:** [public-cfp-submission](../public-cfp-submission/plan.md) · [portal-forms](../portal-forms/plan.md)

---

## Problem Statement

Sessionboard's own participant documentation (`learn.sessionboard.com/participants/overview`)
lists, as the **first** thing a participant does in the portal: view their submitted proposal,
**edit an existing submission after submission**, save drafts, and add or edit speaker info for
accepted sessions.

Today `PortalSubmissions` in `src/pages/portal/PortalPages.tsx` renders a read-only list: title,
"Updated <date>", and a status pill. There is no path back into the submission. A speaker who
mistypes a title, pastes a truncated abstract, or wants to fix a co-presenter's name has exactly
one recourse — email the organizer. The public CFP flow at `/submit/:eventSlug/:formId` only ever
*inserts*; `convex/submissions.ts` has no speaker-owned update mutation at all.

This is the most obvious gap a judge testing the participant point of view will hit, and it sits
directly on the spine the host called out: requirement #2, self-service speaker portal, annotated
*"update your own bio data"* and *"you being able to update your own biography. **This is a very
important part**"* (walkthrough 7:27). Bio editing shipped. The proposal itself did not.

Editing is also the natural home for the validation differentiator already built
(`evaluateCrossFieldLimits`) — a live counter that works on the way in but is unreachable on the
way back is half a feature.

---

## User Stories

### US-01 — Fix a mistake in a pending proposal

**As a** speaker who has submitted a proposal that is still awaiting review
**I want** to reopen and correct my answers
**So that** reviewers evaluate what I meant to say

- **GIVEN** I am identified in the portal as speaker S and submission X is mine with status
  `pending`, and X's form is `open` and past no close date
  **WHEN** I open `/portal/submissions`
  **THEN** row X shows an **Edit** action.
- **GIVEN** I click **Edit** on X
  **WHEN** the edit page loads
  **THEN** every field from the form's abstract section renders pre-filled with my stored answers,
  in the form's own field order, honouring `showIf` conditional visibility.
- **GIVEN** I change the title and one long-text answer
  **WHEN** I press **Save changes**
  **THEN** the change persists, I see "Your changes were saved.", and returning to
  `/portal/submissions` shows the new title and a refreshed "Updated" date.
- **GIVEN** I clear a required field
  **WHEN** I press **Save changes**
  **THEN** the save is refused, an error list names each offending field, and nothing is written.

### US-02 — Editing is locked once an organizer has acted

**As an** organizer
**I want** proposals to stop changing the moment my team starts acting on them
**So that** a score, an acceptance, or a published schedule slot never refers to text that has
since been rewritten

- **GIVEN** submission X has status `accept_queue`, `accepted`, `decline_queue`, or `declined`
  **WHEN** the speaker views `/portal/submissions`
  **THEN** row X shows no Edit action, and shows the plain-language reason
  "Locked — this proposal is under review" / "Locked — a decision has been recorded".
- **GIVEN** the speaker deep-links to `/portal/submissions/<X>/edit` anyway
  **WHEN** the page loads
  **THEN** it renders the submission read-only with the same lock reason and a
  **Back to my submissions** link — never an editable form.
- **GIVEN** a client somehow posts an update for a locked submission
  **WHEN** the mutation runs
  **THEN** the server rejects it with "This proposal can no longer be edited." and writes nothing.

### US-03 — Editing closes with the call for proposals

**As an** organizer
**I want** edits to stop when my CFP closes
**So that** the corpus reviewers work from is frozen at the deadline, exactly as pretalx behaves
by default

- **GIVEN** submission X is `pending` but its form's `closeDate` has passed, or the form's status
  is no longer `open`
  **WHEN** the speaker views the submission
  **THEN** it is read-only with the reason "Locked — submissions closed on <date, event timezone>".

### US-04 — Finish and submit a saved draft

**As a** speaker with a `draft` submission
**I want** to reopen it, finish it, and submit it
**So that** a saved draft is not a dead end

- **GIVEN** submission X has status `draft`
  **WHEN** I open its edit page
  **THEN** I see both **Save draft** and **Submit proposal**.
- **GIVEN** I press **Submit proposal** with all required fields and cross-field limits satisfied
  **THEN** X moves `draft` → `pending`, `submittedAt` is stamped, and the row's pill reads
  Pending.
- **GIVEN** I press **Save draft** with a required field empty
  **THEN** it saves — drafts are exempt from required-field validation but never from `maxChars`
  or cross-field limits.

### US-05 — A speaker can only edit their own submission

**As a** speaker
**I want** the portal to refuse anyone else's submission
**So that** the portal is not a lateral read of other people's proposals

- **GIVEN** submission Y belongs to a different speaker
  **WHEN** I deep-link to `/portal/submissions/<Y>/edit`
  **THEN** I see "That submission is not available on your portal." and no submission content —
  the same message whether Y exists or not.

### US-06 — I can see that I changed something

**As a** reviewing organizer
**I want** to know a proposal was edited after it was submitted
**So that** I am not silently reading different text from the person who scored it yesterday

- **GIVEN** a speaker saved an edit to a submitted proposal
  **WHEN** the record is read
  **THEN** `lastSpeakerEditAt` and an incremented `speakerEditCount` are present on the row, and
  the portal renders "Edited <relative time>" under the title.

---

## Functional Requirements

| ID | Requirement |
|---|---|
| **FR-001** | A speaker identified by the existing portal identity (`usePortalIdentity`) can open an edit view for any submission whose `speakerIds` contains their id. |
| **FR-002** | The edit view is generated from the submission's own `formId` — the same `FieldDefinition` set, section order, `showIf` rules, `maxChars` and `crossFieldLimits` as the public flow. No parallel field model, no bespoke edit form. |
| **FR-003** | **Editability rule.** A submission is editable if and only if **all** hold: (a) status ∈ `draft`, `pending`, `withdrawn`; (b) its form's `status` is `open`; (c) its form has no `closeDate` or the `closeDate` is in the future. Anything else is read-only. |
| **FR-004** | Statuses `accept_queue`, `accepted`, `decline_queue`, `declined` are permanently non-editable by the speaker. No override, no organizer toggle, in this feature. |
| **FR-005** | Editing never changes status, except the single explicit `draft` → `pending` transition triggered by **Submit proposal** (FR-009). No other transition is reachable from the portal. |
| **FR-006** | Server-side re-validation is mandatory and authoritative: unknown field keys rejected, required fields enforced for non-draft saves, `maxChars` enforced always, cross-field combined limits enforced always. Client validation is a convenience only. |
| **FR-007** | The read-only variant of the edit page renders the submitted answers with the lock reason. A locked submission is still *viewable* — locking removes the ability to write, not the ability to read. |
| **FR-008** | Every lock reason is plain language and states the cause: under review / decision recorded / submissions closed on <date>. Never a bare "not allowed". |
| **FR-009** | A `draft` submission offers **Save draft** (no required-field enforcement) and **Submit proposal** (full enforcement, sets `status: "pending"` and `submittedAt`). A `pending` or `withdrawn` submission offers **Save changes** only. |
| **FR-010** | Saving stamps `updatedAt`, `lastSpeakerEditAt`, and increments `speakerEditCount`. The stored `answers.email` written by the original submit path is preserved verbatim and is not editable from this screen. |
| **FR-011** | Navigating away with unsaved changes prompts an in-app confirmation (`alert-dialog`) — never `window.confirm`. |
| **FR-012** | `/portal/submissions` list rows gain an **Edit** action when editable and a muted lock reason when not. The page keeps its existing layout otherwise. |
| **FR-013** | The feature works through the `SubmissionsRepo` adapter interface. The Airtable adapter may fail closed with the existing `does not yet provide` message; the portal surfaces that as a disabled Edit action with an explanation, never a crash. |
| **FR-014** | Participant-section answers and availability are **not** editable here (see Out of Scope) — the edit view covers the abstract section only, and says so. |

---

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| **NFR-001** | **Speed is graded.** The edit page must be reachable in ≤1 additional network round-trip beyond the submission list, and must be route-code-split like the rest of `/portal/*`. Target interactive under 1s on the seeded Convex deployment. |
| **NFR-002** | Authorization is a **server** property. Every new query and mutation independently verifies that the submission belongs to the speaker and the event; the client never supplies the verdict. |
| **NFR-003** | The lock evaluation lives in one shared pure function used by both the query (to render) and the mutation (to enforce). Two copies of this rule is a defect. |
| **NFR-004** | No new dependencies. Reuses `DynamicFormRenderer`, `evaluateCrossFieldLimits`, `SkeletonList`, `PageHeader`, `ContentToolbar`, `StatusTabs` primitives already present. |
| **NFR-005** | UI obeys the project design rules absolutely: no borders, no shadows, no gradients, no dividers, no blue buttons, radius 10-14px, page header carries the title only, toolbar has context left and actions right. |
| **NFR-006** | Writes must be safe to retry — the update mutation is a patch by id and therefore naturally idempotent for identical payloads (Airtable has no transactions). |
| **NFR-007** | Every date shown renders in `events.timezone`, never the browser's. |
| **NFR-008** | Errors degrade: a failed save leaves the user's typed values in the form. Never clear the form on error. |

---

## Out of Scope

- **Participant / co-presenter editing** and availability editing from this screen. Participants
  are a separate write path with role min/max bounds; availability already has
  `/portal/availability`. Adding them here doubles the validation surface for a feature whose
  value is 90% in the abstract fields.
- **Organizer-facing "allow speakers to edit" toggle** and any per-event override of FR-003. The
  conservative default ships first; the toggle is a follow-up.
- **Edit history / diff view.** A counter and a timestamp only (FR-010). Storing prior versions is
  a separate schema conversation.
- **Organizer notification on edit.** `notifyAdminsOnUpdate` already exists on `SubmissionFormWrite`
  and is the correct future home; wiring it is [comms-notifications](../comms-notifications/plan.md)
  work, not this.
- **Withdrawing or un-withdrawing** a submission from the portal. Status changes other than the
  `draft` → `pending` submit are not exposed.
- **Any new Clerk / auth architecture.** Real Clerk authentication is already live. This feature
  reuses `requireIdentity`, `assertOwnsSpeaker`, and `speakers.getMine`; broad auth changes remain
  out of scope.
- **Changing the SubmissionStatus model.** It is fixed.

---

## Success Metrics

| Metric | Target |
|---|---|
| A judge following the participant walkthrough can submit → land in the portal → edit the title → see it change | Works first try, no reload |
| Locked states | All four organizer-acted statuses render read-only with a reason, verified on seeded data |
| Server enforcement | Direct mutation call against a locked submission is rejected; nothing written |
| Cross-speaker isolation | Deep-link to another speaker's submission id returns the neutral not-available message |
| Validation parity | Every rule the public flow enforces is enforced on edit — verified by the same limit fixture |
| Time to interactive on `/portal/submissions/:id/edit` | < 1s on the seeded deployment |
| Regression | `/portal/submissions` read-only behaviour and the public submit flow unchanged |
