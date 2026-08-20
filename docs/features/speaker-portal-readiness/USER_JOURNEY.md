# Speaker Portal Documents, Onboarding, and Readiness — User Journey

**Status:** Planned. Must be driven in a browser as both a speaker and an organizer; the two-sided
nature of this requirement is exactly what a single-persona walkthrough would miss.

---

## Journey A — Speaker completes their onboarding

**Persona:** an accepted speaker who just received an acceptance email.
**Entry point:** `/portal` after signing in with the address on their speaker record.

| Step | Action | Expected |
|---|---|---|
| A1 | Sign in and land on `/portal` | "Welcome back, <first name>". Submissions card, profile card, and a task list |
| A2 | Read the task list | Each task shows title, due date, and source ("Created from acceptance" / "Manual task" / "Created by Operations Agent"). Overdue items are visibly marked |
| A3 | Click `Complete form` on the slides task | Lands on `/portal/forms/:formId?task=:taskId` with the linked form |
| A4 | Complete and submit the form | Confirmation; returning to Home shows the task reflecting completion |
| A5 | Open Profile | Bio (rich text, 5,000-char counter), salutation/honorific/pronouns/gender, four link fields, headshot uploader |
| A6 | Upload a headshot | Preview updates immediately; reload persists it; the public speaker gallery now shows it |
| A7 | Open Files | Upload a slide deck (`slides`) and a supporting document (`supporting_doc`) |
| A8 | Reload Files | Both persist with working download links resolved fresh, not from a stored URL |
| A9 | Attempt an 11 MB file | Rejected with the size message; nothing is written |
| A10 | Open Schedule | Only this speaker's **published** sessions, with room and track names |
| A11 | Open Availability | Mark a morning unavailable; the organizer's agenda conflict view later reflects it |

**Success state:** every onboarding obligation is visible and satisfiable in one place.
**Failure state:** a task that links nowhere, or an upload that disappears on reload.
**Recovery:** an upload that fails mid-flight leaves no partial row and shows a named error; the
speaker can retry without duplicating.

## Journey B — Speaker with no submission

**Persona:** an invited keynote who never used the CFP.

| Step | Action | Expected |
|---|---|---|
| B1 | Sign in, open Files | No submission select is rendered; copy explains files attach to the speaker profile |
| B2 | Upload a deck | Succeeds; row written with `eventId` and no `submissionId` |
| B3 | Reload | File persists under "Speaker files" |
| B4 | Open Submissions | Empty state offering open CFPs, not an error |

**Failure state to avoid:** today's behaviour, where the submission select is empty and there is no
way to upload at all.

## Journey C — Organizer checks who has sent slides

**Persona:** program operations lead, three weeks out.
**Entry point:** organizer landing page → "43 outstanding speaker tasks" → speaker list.

| Step | Action | Expected |
|---|---|---|
| C1 | Open the speaker list | A `Files` column shows per-speaker counts |
| C2 | Apply `?view=missing-files` | Only speakers with no uploads, with an accepted session |
| C3 | Open one speaker | Detail panel shows bio, headshot, confirmation status, tasks, availability, **and a documents section** |
| C4 | Read the documents section for a speaker who uploaded | File name, kind, upload date, working download |
| C5 | Look for an upload or delete control | There is none — organizer access is read-only here, by design |
| C6 | Open a speaker with no uploads but a slides task | "No files uploaded yet · Slides requested — due 5 Sep" |
| C7 | Send a reminder from this record | A `comms_log` row is written; the speaker's portal task is unchanged (a reminder is not a completion) |

**Success state:** the organizer answers "who is behind on slides?" without asking anyone.
**Failure state:** the current state — the question is unanswerable inside the product.

## Journey D — Readiness rollup

**Entry point:** organizer landing page → Readiness.

| Step | Action | Expected |
|---|---|---|
| D1 | Open Readiness | Categories: Schedule, Speakers, Tasks, Abstracts, Communications |
| D2 | Filter by event day | Rows narrow to that day |
| D3 | Click a "missing files" row | Lands on the speaker list already filtered to `?view=missing-files` |
| D4 | Click a schedule-conflict row | Lands on the agenda conflicts view with that conflict identifiable |
| D5 | Click a failed-communication row | Lands on the communications log at that failure |
| D6 | Resolve one item in another tab, return, refresh | The row is gone |

**Every readiness row must link to the record that produces it.** A row that only states a problem,
with no route to the thing causing it, fails this journey.

## Authorization checks (must all be attempted)

| Attempt | Expected |
|---|---|
| Organizer of event A opens a speaker of event B | Blocked |
| Reviewer opens any speaker's documents | Blocked — reviewer is not organizer for this scope |
| Organizer calls `requestUpload` / `save` / `remove` directly | Rejected — write paths are speaker-only |
| Signed-out request for a resolved document URL | Fails |
| Public embed / attendee site / scoped API token | No document reachable by any route or scope |
| Speaker A opens speaker B's documents | Blocked |

## Persistence checks

Headshot, documents, task state, availability, and profile edits all survive reload and a
sign-out/sign-in cycle. Documents specifically must resolve to a **freshly generated** URL on each
read — an expiring URL persisted into the row is a defect
(`convex/schema.ts:257-261` states this contract).
</content>
