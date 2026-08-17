# Blind / Anonymous Review — Requirements

**Type:** Feature
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-11

## Problem Statement

Nothing in this codebase can hide a speaker's identity from a reviewer. `grep -ri "anonym\|blind"`
over `convex/` and `src/` returns zero matches. The reviewer queue in
`src/pages/program/Evaluation.tsx` does the opposite of anonymizing: it builds a `speaker` string
for every row by joining `repo.speakers.list()` against `submission.speakerIds`, then renders that
name in the queue grid subtitle *and* again in the active review panel header.

Two Sessionboard pages the host named as primary interest describe this feature directly. The Call
for Papers page lists "blinded review workflow options". The abstract-management page says each
round has "its own scorecard, anonymization settings" and advertises "anonymous review
capabilities".

Requirement 4 ("submission evaluation workflows") is graded and unstruck, and sits second in the
host's stated priority order — *"we have to evaluate them and put them on the schedule and
communicate them and make them show up."* Blind review is the one named evaluation capability with
no code behind it at all.

The external picture agrees on why it matters: double-blind review, even imperfectly implemented,
measurably reduces the effect of implicit bias on accept/reject decisions, and the standard advice
is to strip identity at the system level rather than trusting authors or reviewers to do it by
hand.

## User Stories

**As a** program chair **I want to** turn on anonymized review for an evaluation plan **so that**
my committee scores the substance of a proposal without seeing whose name is on it.

**Acceptance Criteria:**
- GIVEN I am editing an evaluation plan WHEN I enable "Anonymize this plan" and save THEN the flag persists on that plan and applies to every round and every assignment under it
- GIVEN a plan is anonymized WHEN a reviewer opens their queue THEN no speaker name, headshot or email appears anywhere in the queue list or the review panel
- GIVEN a plan is anonymized WHEN I view the organizer surfaces — the Abstracts grid, the assignment table, submission detail — THEN I still see every speaker name exactly as I do today
- GIVEN a plan is not anonymized WHEN a reviewer opens their queue THEN the queue behaves exactly as it does today, speaker names included

**As a** reviewer **I want to** be told the round is blinded **so that** I understand why the
speaker is missing and do not report it as a bug.

**Acceptance Criteria:**
- GIVEN an anonymized plan WHEN I open my queue THEN a "Blinded" badge appears on the queue surface with explanatory helper text
- GIVEN an anonymized plan WHEN I open a submission THEN the byline reads "Speaker hidden — blinded review" in muted text rather than being silently absent

**As a** security-minded chair **I want** anonymization enforced by the server **so that** a
reviewer cannot recover the name by opening the browser devtools network tab.

**Acceptance Criteria:**
- GIVEN an anonymized plan WHEN a reviewer's queue loads THEN the response payload for the queue contains no speaker name, email, bio, headshot key or speaker record id
- GIVEN an anonymized plan WHEN I inspect the network tab THEN there is no separate client-side request that fetches the full speaker list for the queue to join against

## Functional Requirements

- FR-001: `evaluation_plans` stores an optional boolean `anonymized`. Absent or `false` means the current, non-blinded behaviour.
- FR-002: Anonymization is configured **per evaluation plan**, and applies to all rounds and all assignments under that plan.
- FR-003: When a plan is anonymized, the reviewer-facing queue must not expose: speaker display name, first/last name, email, bio, headshot storage key or resolved headshot URL, social links, or the speaker record id.
- FR-004: The reviewer-facing queue continues to expose everything a reviewer needs to judge the work: submission title, track name, abstract, the submission's non-identifying answers, round number, assignment id, and the reviewer's own prior score and comments.
- FR-005: **Anonymization is enforced server-side, not in the UI.** The Convex query that backs the reviewer queue must strip identifying fields before returning. Hiding fields with CSS, conditional JSX, or a client-side filter is explicitly non-compliant. A reviewer reading the raw response in devtools must not be able to recover the identity.
- FR-006: A new dedicated query supplies the reviewer queue. The queue must stop assembling itself from the unfiltered `speakers.list` and `submissions.list` calls it uses today, because a client-side join cannot satisfy FR-005.
- FR-007: Organizer surfaces are **never** anonymized. The Abstracts grid, the assignment table on the Evaluation page, submission detail, and the agenda all render speaker names regardless of any plan's `anonymized` value.
- FR-008: A reviewer scoring a blinded submission saves through the existing `evaluations:save` path unchanged. Anonymization affects reads, never writes.
- FR-009: The reviewer surface displays a "Blinded" badge and helper text whenever the active plan is anonymized, so absent identity reads as intentional rather than broken.
- FR-010: Toggling `anonymized` takes effect on the next queue read. No migration, no backfill, no rewriting of already-recorded reviews.

## Non-Functional Requirements

- NFR-001: No data migration runs. `anonymized` is optional, so every existing plan row stays valid the moment the schema deploys.
- NFR-002: The new read operation is reflected in **every** adapter file. A missed adapter file fails at runtime rather than compile time.
- NFR-003: The stripping logic lives in one place — a single projection function in the Convex query — so there is exactly one code path to audit.
- NFR-004: The queue query must not become slower than the current three parallel list calls it replaces. It reads assignments by index and fetches only the submissions it needs.

## Out of Scope

- **Per-round anonymization.** Sessionboard scopes anonymization settings per round; this ships per plan, matching the sibling scorecards decision. A chair who needs a blinded round one and an open round two creates two plans.
- **Per-field identifying marking.** The organizer cannot mark an arbitrary CFP answer field as identifying. The first pass hides name, headshot, email and bio only. See Risks in `design.md` — a free-text abstract that names its own author is not caught.
- **Anonymizing the reviewer to the speaker.** This is single-blind by choice: speakers already never see reviews.
- **Scrubbing uploaded documents.** PDF and slide metadata is untouched.
- **Automated identity-leak detection** in abstract text.
- **Reviewer conflict-of-interest declarations** and recusal.
- **Enforcing reviewer authorization.** Reviewer identity comes from a demo dropdown today. Real identity is the in-flight `feat/clerk-backend` work; this feature must not depend on it or duplicate it.

## Success Metrics

- A chair enables anonymization on a plan, a reviewer opens the queue, and no speaker name is visible anywhere — verified in the browser.
- The queue's network response, read in the devtools network tab, contains no speaker name, email or record id. This is the acceptance test for FR-005 and cannot be satisfied by reading the rendered DOM.
- The organizer's Abstracts grid still shows every speaker name while the same plan is anonymized.
- A non-anonymized plan behaves byte-for-byte as it does today: no regression in the existing queue.
