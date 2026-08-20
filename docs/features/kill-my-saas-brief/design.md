# Kill My SaaS Brief — Requirement Traceability

**Last Updated:** 2026-08-17
**Method:** direct source inspection of `convex/`, `src/pages/`, `src/components/`, `src/test/`,
`convex/schema.ts`, `convex/seed.ts`, `src/App.tsx`, `netlify.toml`, `.env.example`, and the
existing `docs/features/` packages. Branch `main`, working tree clean.

## Status vocabulary — these four are never merged

| Status | Means |
|---|---|
| **SOURCE** | The behaviour exists in this repository's code and I read the code. |
| **DEMO** | The behaviour is reachable and visible in the seeded/hosted demo event. |
| **E2E** | The behaviour has an end-to-end test or a recorded browser run proving it. |
| **PLANNED** | A design document exists. No code. |

A row is commonly `SOURCE ✅ / DEMO ❌`. That is the central finding of this audit and it is not the
same thing as "unimplemented."

**Live/browser evidence for every row below is `NOT VERIFIED`.** This planning pass was
source-only; no browser session was run against a deployment. Filling that column is the first
item of the implementation order in `plan.md`, and no row may be reported `PASS` until it is
filled by an observed run.

---

## Requirement 1 — Custom CFP forms with conditional logic and category-based routing

| Field | Detail |
|---|---|
| **Existing implementation** | Conditional logic: `field_definitions.showIf: { fieldId, equals }` (`convex/schema.ts:226`); evaluated in `src/components/shared/DynamicFormRenderer.tsx:17`; authored in `src/pages/program/SubmissionFormBuilder.tsx:449-490`; previewed in `src/components/forms/CfpPreviewPanel.tsx:77-86`; projected to the public form as `showIf.fieldKey` (`src/data/types.ts:319`, `src/pages/public/SubmissionPage.tsx:46`). Routing: `submission_forms.routingRules[]` (`convex/schema.ts:214-223`) supporting `assignTagIds`, `assignTrackId`, `assignSponsorId`, `setStatus`, `reviewerUserIds`; applied by `convex/categoryRouting.ts`; consumed at submit in `convex/publicForms.ts:130`. |
| **Status** | SOURCE ✅ · DEMO ❌ · E2E partial (`src/test/dynamic-form-conditional.test.tsx`, `src/test/category-routing.test.ts`, `src/test/cfp-form-builder.test.tsx`, `src/test/form-validation.test.ts`) · PLANNED n/a |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | (a) The seeded CFP (`convex/seed.ts:76-93`) defines four fields and **no `showIf` field at all** — conditional logic is invisible in the demo. (b) The one seeded routing rule fires on `Session format == "Workshop"`, but every one of the 500 seeded submissions is written with `"Talk"` (`convex/seed.ts:~140`), so the rule has never fired on a seeded record. (c) A routed submission carries no visible provenance — nothing in the UI says "status set by rule X" or "reviewer assigned by rule X". (d) `reviewerUserIds` routing has no seeded example. |
| **Exact files to change** | `convex/seed.ts` (add a conditional field + workshop-format submissions + a reviewer-routing rule); `convex/schema.ts` (`submissions.routingAppliedRuleIds?: string[]`); `convex/categoryRouting.ts` (return applied rule ids); `convex/publicForms.ts` (persist them); `src/pages/program/Abstracts.tsx` + submission detail (render provenance); `src/data/types.ts`. |
| **Verification gate** | Public CFP at `/submit/:eventSlug/:formId`: select `Workshop`, observe a field appear that was absent for `Talk`; submit; observe the resulting submission carries the routed sponsor, `accept_queue` status, and a visible "routed by" attribution. |

## Requirement 2 — Speaker self-service portal: bio, headshot, slides, supporting documents

| Field | Detail |
|---|---|
| **Existing implementation** | Bio + links + headshot: `src/pages/portal/PortalPages.tsx:98` (`PortalProfilePage`) against `speakers.updateProfile`, `speakers.requestHeadshotUpload`, `speakers.saveHeadshot`, `speakers.getHeadshotUrl`; headshot persisted as `speakers.headshotStorageKey` (`convex/schema.ts:244`). Documents: `src/pages/portal/SpeakerDocuments.tsx` against `convex/speakerDocuments.ts` — `requestUpload` / `save` / `list` / `remove`, Convex storage ids, 10 MB cap, kinds `slides` and `supporting_doc`, table `speaker_documents` (`convex/schema.ts:253`). Portal nav at `src/pages/portal/PortalLayout.tsx:9-21`. |
| **Status** | SOURCE ✅ (speaker side) · DEMO ❌ · E2E partial (`src/test/speaker-documents.test.tsx`, `src/test/portal-identity-resolution.test.tsx`, `src/test/portal-handoff.test.tsx`) |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | (a) **No organizer can see a speaker's uploaded documents.** `convex/speakerDocuments.ts:12-31` (`requireScope`) calls `assertOwnsSpeaker`, which is speaker-only — unlike `agenda.listForSpeaker`, which uses `assertOrganizerOrOwnsSpeaker` (`convex/speakers.ts:216`). There is no organizer-facing documents view anywhere in `src/pages/program/Speakers.tsx`. (b) `speaker_documents` requires a `submissionId`; an invited speaker with no submission cannot upload anything. (c) The seed uploads no documents and deliberately clears legacy headshot keys (`convex/seed.ts:~128`), so the demo has zero files and zero photos. |
| **Exact files to change** | `convex/speakerDocuments.ts` (add an organizer-scoped `listForEvent` / widen `requireScope` on read paths only); `convex/schema.ts` (`speaker_documents.submissionId` → optional + `eventId` + `by_event` index); `src/pages/program/Speakers.tsx` + speaker detail panel (documents section); `convex/seed.ts` (seed documents and headshots); `src/data/repo.ts`, `src/data/types.ts`. |
| **Verification gate** | Portal: upload a slide deck and a supporting doc, reload, both persist with working download URLs. Organizer: open the same speaker's record and see both files listed with names, kinds, and timestamps, without impersonation. |

## Requirement 3 — Automated templated communications, reminders, per-speaker calendar invites

| Field | Detail |
|---|---|
| **Existing implementation** | Templates: `comms_templates` with seven kinds including `reminder` and `calendar_invite` (`convex/schema.ts:568-584`), edited at `src/pages/program/CommTemplateEditor.tsx`. Sends: `convex/commsActions.ts` — `sendDecision`, `sendReminder`, `sendConsolidatedDecision`. Calendar: ICS built in `convex/commsActions.ts:44-52` using `agenda_items.calendarUid` / `calendarSequence`, which `convex/agenda.ts:243-266` maintains and bumps only on calendar-relevant change; proven by `src/test/calendar-invite.test.ts`. Delivery: `convex/emailDelivery.ts` + `email_integrations` (Resend/SES, AES-256-GCM via `convex/credentialEncryption.ts`). Evidence: append-only `comms_log` (`convex/schema.ts:587`). Reviewer nudges: `convex/reviewerRemindersActions.ts`. Submitter confirmation with a capability token: `submission_confirmation_requests` + `convex/confirmationEmailActions.ts`. |
| **Status** | SOURCE ✅ · DEMO partial · E2E partial (`calendar-invite`, `comms-template-tokens`, `confirmation-email`, `email-delivery-auth`, `communications-templates`) |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | (a) Every send is a **manually invoked action**. There is no scheduler, no cron, and no due-date-driven reminder — "automated reminders" is currently "a reminder template an organizer can fire". (b) A `comms_log` row with `status: "failed"` has no retry path in the UI; the seed even plants one failed row (`convex/seed.ts:~230`) with nothing to do about it. (c) The seed writes zero `channel: "calendar_invite"` rows, so calendar invites are invisible in the demo. (d) Only one template (`Speaker reminder`) is seeded. |
| **Exact files to change** | `convex/crons.ts` (new); `convex/commsScheduler.ts` (new internal action); `convex/schema.ts` (`comms_schedules` table, `comms_log.attemptCount` / `lastAttemptAt`); `convex/commsActions.ts` (retry entry point); `src/pages/program/Communications.tsx` (Operations grouping, retry affordance); `convex/seed.ts`. |
| **Verification gate** | Fire a reminder to a seeded `@seed.invalid` speaker, observe a `comms_log` row; fire a calendar invite for a scheduled session, observe a `calendar_invite` row and a downloadable `.ics` with exactly one `BEGIN:VCALENDAR`; force a failure, observe the failed row and a working retry that does not duplicate a successful send. |

## Requirement 4 — Evaluation and scoring, multiple review rounds, optional AI assist

| Field | Detail |
|---|---|
| **Existing implementation** | `evaluation_plans` with `rounds`, `scoringScaleMax` (5\|10), weighted `criteria[]`, `anonymized`, `aiAssistEnabled` (`convex/schema.ts:308-324`). `evaluation_assignments` unique per `(plan, submission, reviewer, round)` (`convex/schema.ts:325-336`). `evaluations.criteriaScores[]` keyed by criterion id, never by array position (`convex/schema.ts:18-22`). Server: `convex/evaluations.ts` — `savePlan` (validates 1–5 rounds), `assign`, `assignByFilter`, `myQueue` (blind projection that **removes the key**, not just the value), `reviewerProgress`, `save`. UI: `src/pages/program/Evaluation.tsx`, `ScorecardForm.tsx`, `CriteriaEditor.tsx`, `AssignByFilterCard.tsx`. |
| **Status** | SOURCE ✅ · DEMO ❌ · E2E good (`evaluation-scorecards`, `evaluation-score`, `reviewer-queue`, `reviewer-progress`, `assignment-filter`, `evaluation-layout`) |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | (a) The rounds `Select` in `src/pages/program/Evaluation.tsx:726-733` offers only **1 or 2**, while `savePlan` accepts 1–5. (b) The seeded plan is `rounds: 1`, **no `criteria`**, `anonymized` unset, `aiAssistEnabled: false` (`convex/seed.ts:161`) — so the demo shows neither a weighted rubric nor multi-round review nor blind review, all three of which are built. (c) There is **no round-advancement workflow**: nothing promotes a submission from round 1 to round 2; a chair must hand-assign round 2. (d) `aiAssistEnabled` is a stored boolean with no reader anywhere in `src/` or `convex/` — a dead flag, honestly commented as a stub at `convex/schema.ts:313`. |
| **Exact files to change** | `src/pages/program/Evaluation.tsx` (rounds 1–5; round-advance action); `convex/evaluations.ts` (`advanceRound` mutation); `convex/seed.ts` (2-round plan, weighted criteria, blind plan, assignments across both rounds); optionally `convex/aiAssist.ts` (new, gated) — see `review-rounds-scoring/design.md` for the go/no-go. |
| **Verification gate** | Create a 2-round weighted plan; assign round 1; score with a rubric; advance a shortlist to round 2; observe round-2 assignments and that round-1 scores are not overwritten. On a blinded plan, confirm the reviewer payload contains no `speakerNames` key at all. |

## Requirement 5 — Drag-and-drop agenda, conflict detection, list/day/week/track/room views

| Field | Detail |
|---|---|
| **Existing implementation** | `src/pages/program/Agenda.tsx` (1,593 lines) with views `list`, `day`, `week`, `month`, `rooms`, `track`, `conflicts` (`Agenda.tsx:89-97`), view held in the URL. Drag-and-drop: native HTML5 in the room grid — `draggable` + `onDragStart` on the session article (`Agenda.tsx:1432-1444`), `onDragOver`/`onDrop` on each room×slot cell (`Agenda.tsx:1396-1419`), 15-minute snapping via `snapToAgendaInterval`. Keyboard equivalent: `src/pages/program/AgendaMoveControl.tsx`. Conflicts: `convex/agenda.ts:152-201` `detectConflicts` covers `room_overlap`, `speaker_overlap`, `track_overlap`, and `speaker_unavailable` (cross-referenced against `speaker_availability` in event-local time); re-run after every move (`Agenda.tsx:584-587`). Publishing is **blocked** on room/speaker overlap (`convex/agenda.ts:296-314`); track overlap stays informational. Every write is audited to `agenda_items_audit`. |
| **Status** | SOURCE ✅ (exceeds the brief — `month` is extra) · DEMO partial · E2E good (`agenda-conflicts`, `agenda-views`, `agenda-audit`, `agenda-session-form`, `calendar-schedule`, `speaker-availability`) |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | Demo only. The seed creates **3 agenda items** (`convex/seed.ts:~210`) against ~63 accepted submissions, so "scheduled vs accepted" reads as a near-empty schedule. Two of the three deliberately conflict, which is good, but week/track/room views have almost nothing to render. |
| **Exact files to change** | `convex/seed.ts` only. Plus `docs/features/agenda-scheduling/BRIEF-ADDENDUM-2026-08-17.md`. |
| **Verification gate** | Room grid: drag a session to a new room and time, observe persistence after reload and a new `agenda_items_audit` row. Drop it onto an occupied slot, observe the conflict banner and that `Publish` refuses with the room/speaker message. Confirm all five brief-named views render populated. |

## Requirement 6 — Real-time organizer dashboard for outstanding onboarding tasks

| Field | Detail |
|---|---|
| **Existing implementation** | `src/pages/dashboard/DashboardHome.tsx` subscribes reactively via `useRepoQuery` to submissions, agenda, speakers, tasks, comms, and forms, and derives `awaitingDecision`, `unscheduledAccepted`, `profileIncomplete`, `needsAttention` (`DashboardHome.tsx:216-289`) with per-item deep links. `src/pages/program/Readiness.tsx` projects five categories — schedule conflicts, speaker confirmations, tasks, decisions, comms delivery — each row carrying a `to` link (`src/lib/readiness.ts`). `src/lib/speaker-operations.ts` powers the speaker rollup. `src/pages/portal/TasksAdmin.tsx` is the organizer task queue. |
| **Status** | SOURCE ✅ · DEMO ❌ (it exists but is not what the landing page leads with) · E2E partial (`readiness.test.ts`, `speaker-operations.test.ts`, `analytics-workflows.test.ts`) |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | (a) The landing page's centre column is the agent composer; **all program state lives in a `w-72` right rail** that auto-collapses at ≤1024px (`DashboardHome.tsx:169-184`) and whose sections are individually collapsible and persisted. A judge on a laptop can legitimately see zero program state on first load. (b) `Readiness` is not in `quickAccess` (`DashboardHome.tsx:291-298`) — the single best judge-facing page is unreachable from the landing page. (c) There is a **known reactive defect**, documented in the code at `DashboardHome.tsx:388-397` and issues #211/#217: subscriptions can stay unresolved indefinitely and the socket drops roughly every 60s. "Real-time" cannot be claimed until that is measured. (d) No "as of" timestamp, so a stale rail is indistinguishable from a quiet event. |
| **Exact files to change** | `src/pages/dashboard/DashboardHome.tsx` (program-state header above the composer); new `src/components/dashboard/ProgramStateHeader.tsx`; `src/lib/program-state.ts` (new, extracted derivation + unit tested); `src/pages/program/Readiness.tsx` (link parity); `src/App.tsx` only if a route is added. |
| **Verification gate** | Load the landing page at 1280px and at 1024px; in both cases the first screenful states submissions-by-status, review completion, scheduled/accepted, and outstanding tasks. Click each figure and land on the filtered owning list. Complete a task in a second tab and observe the figure change without a manual reload — or, if it does not, report that honestly rather than claiming real-time. |

## Requirement 7 — Native one-way Accelevents export

| Field | Detail |
|---|---|
| **Existing implementation** | **None in source.** `grep -ril accelevents` across the repository returns only documentation: `docs/features/accelevents-integration/{requirements,design,plan,USER_JOURNEY}.md`, `docs/research/{competitors,customer-complaints}.md`, `docs/user-journeys/pages/integrations.md`, and passing mentions in `event-workspace-switching`, `public-api`, `speaker-operations`. No table, no function, no UI, no env var. |
| **Status** | PLANNED only |
| **Live/browser evidence** | NOT VERIFIED — nothing to verify |
| **Missing / incomplete** | Everything. **And the existing plan needs reconciling before it is built**, because it predates three architectural changes: (a) it gates on a server-only `EVENT_ADMIN_USER_IDS` allowlist (`design.md:161,435,495`) — that mechanism does not exist and contradicts both the `organizers`/`organizations` row-based model (`convex/schema.ts:38-66`) and the standing rule against env-var admin lists; the correct guard is `assertEventOrganizerAccess` from `convex/functions.ts:121`. (b) It proposes a bespoke `ACCELEVENTS_INTEGRATION_ENCRYPTION_KEY` + service secret + scheduler secret, when `convex/credentialEncryption.ts` and the `content_integrations` / `email_integrations` `credentialEnvelope` pattern (`convex/schema.ts:605-644`) are already the house standard. (c) It predates multi-tenant organizations, so its tenancy story is implicit. |
| **Exact files to change** | `convex/schema.ts` (four tables); `convex/accelevents.ts`, `convex/acceleventsActions.ts`, `convex/acceleventsMapping.ts` (new); `convex/crons.ts`; `src/pages/settings/Integrations.tsx`; `src/data/types.ts`; `.env.example`; plus reconciliation edits to the four existing docs. Detail in `accelevents-integration/BRIEF-RECONCILIATION-2026-08-17.md`. |
| **Verification gate** | A real disposable Accelevents event, real credentials, one run: a speaker is created remotely, a session is created remotely, and the session is **associated with that speaker**. Rerun with no changes → zero remote writes. A mocked or recorded run does not satisfy this gate. |

## Requirement 8 — Speaker-portal resource/wiki pages with safe HTML embeds

| Field | Detail |
|---|---|
| **Existing implementation** | **None.** `src/pages/portal/PortalPages.tsx` is the portal's dashboard/submissions/profile/files module, not a wiki. `src/pages/settings/Library.tsx` is a **tag** library, not a content library — it is not a reuse path. What does exist and should be reused: `src/components/editor/RichTextEditor.tsx` (TipTap StarterKit + Link), `src/components/shared/RichText.tsx` (the only sanctioned render path — `DOMPurify.sanitize` + prose classes, `RichText.tsx:17`), `src/lib/rich-text.ts` (`normalizeRichTextContent`, markdown→HTML fallback), `src/lib/strip-html.ts` (plain-text extraction with the multi-pass note about `<scr<script>ipt>`), and `dompurify@3.4.13` already in `package.json`. |
| **Status** | PLANNED only (building blocks SOURCE ✅) |
| **Live/browser evidence** | NOT VERIFIED — nothing to verify |
| **Missing / incomplete** | Table, CRUD, authorization, publication state, portal nav entry, portal route, and — the one genuinely new security decision — an **embed allowlist**. DOMPurify's default profile strips `<iframe>` entirely, so "safe HTML embed support" requires a deliberate, host-allowlisted `ADD_TAGS`/`ADD_ATTR` configuration applied on the **server at write time and again on the client at render time**. |
| **Exact files to change** | `convex/schema.ts` (`portal_resource_pages`); `convex/portalResourcePages.ts` (new); `src/lib/sanitize-embed-html.ts` (new, shared); `src/pages/portal/PortalResources.tsx` (new); `src/pages/portal/PortalLayout.tsx` (nav + title); `src/pages/program/PortalResourcesAdmin.tsx` (new); `src/App.tsx`; `convex/seed.ts`. |
| **Verification gate** | Author a page containing a heading, list, link, and one allowlisted embed; publish it; open it as a speaker and see it render. Author a page containing `<script>`, `onerror=`, and a non-allowlisted iframe host; confirm all three are stripped **in the stored value**, not merely hidden at render. |

## Requirement 9 — Mobile-friendly embeddable public speaker gallery and schedule itinerary

| Field | Detail |
|---|---|
| **Existing implementation** | `embeds` table with six views including `speaker_gallery` and `schedule_itinerary` (`convex/schema.ts:520-531`), per-view field toggles, theme, primary colour, date/time format, track filter. `src/components/embeds/EmbedRenderer.tsx` is responsive throughout (`sm:`/`lg:` breakpoints; gallery is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` at `EmbedRenderer.tsx:183`). Public route `/embed/:embedId` (`src/App.tsx:492`) with `Content-Security-Policy: frame-ancestors *` scoped to `/embed/*` in `netlify.toml`. Editor at `src/pages/cms/EmbedEditorPage.tsx` with live preview and a public-URL link; list at `src/pages/cms/EmbedsListPage.tsx` with a copy-iframe-snippet action (`iframeSnippet` in `src/lib/public-embed.ts`). Server projection `convex/publicEmbeds.ts:450` `getPublic` is published-only. Full attendee site at `/e/:eventSlug`. |
| **Status** | SOURCE ✅ · DEMO ❌ · E2E good (`public-embed-views`, `embed-renderer`, `public-embed-security-contract`, `public-embed-saved`, `attendee-site`) |
| **Live/browser evidence** | NOT VERIFIED |
| **Missing / incomplete** | Demo only, but badly: the seeded speaker gallery embed is created with **`enabled: false`** (`convex/seed.ts:~245`), so the brief's headline public surface is off by default; no `schedule_itinerary` embed is seeded at all; and because the seed clears headshots, a gallery that *is* enabled renders sixty empty avatars. Mobile behaviour has unit coverage but no recorded device-width run. |
| **Exact files to change** | `convex/seed.ts` (enable the gallery, add an itinerary embed, seed headshots). Plus `docs/features/public-embeds/BRIEF-ADDENDUM-2026-08-17.md`. |
| **Verification gate** | At a 390×844 viewport load both embeds directly and inside a third-party iframe: no horizontal scroll, filters operable, headshots present, itinerary readable. Confirm an unpublished session never appears. |

---

## Cross-cutting architectural decisions

**Authorization.** Every new server function uses the existing guards from `convex/functions.ts`:
`requireIdentity`, `assertEventAccess` (organizer **or** reviewer member), `assertEventOrganizerAccess`
(organizer only), `isEventOrganizer` for branching, and `assertOrganizerOrOwnsSpeaker` /
`assertOwnsSpeaker` from `convex/speakers.ts` for portal surfaces. No new allowlist mechanism, no
env-var admin list, no `VITE_`-visible authorization.

**Tenancy.** Every new table is `eventId`-scoped and inherits its organization through `events`
(`convex/schema.ts:154`). New optional fields on existing tables stay optional so Convex schema
validation passes against existing rows, matching the precedent set for
`organizers.organizationId` and `evaluation_plans.criteria`.

**Credentials.** The Accelevents API key uses `convex/credentialEncryption.ts` (`"use node"`,
AES-256-GCM, base64 32-byte key from env) and the `credentialEnvelope: { version: 1, iv,
ciphertext, tag }` shape already used by `email_integrations` and `content_integrations`. It is
never returned by any browser-reachable query.

**Sanitization.** One shared module, `src/lib/sanitize-embed-html.ts`, exporting a single DOMPurify
configuration. Applied twice: on write (server-side, so the stored value is already safe) and on
read (client-side, so a row written before a policy tightening cannot bypass it). `RichText.tsx`
keeps its current default profile; resource pages opt into the wider profile explicitly.

**Idempotency.** New sync paths follow the shape already used by `submissions.by_form_idempotency`
and `api_idempotency_keys`: a stable natural key plus a SHA-256 hash of the mapped source fields,
with no remote write when the hash is unchanged.

**Seeding.** `convex/seed.ts:demo` stays a single re-runnable `internalMutation` that fills gaps
without duplicating. Every added fixture follows the existing find-then-insert pattern and keeps
`@seed.invalid` addresses.

## What this design deliberately does not do

- It does not restructure `Agenda.tsx`, `Evaluation.tsx`, or `SubmissionFormBuilder.tsx`. They are
  large, but they are correct and tested; the brief gaps around them are seed and surfacing gaps.
- It does not replace the Operations Agent or the composer. `demo-first-organizer-experience/`
  moves program state above it, not the agent out of it.
- It does not add AI review to satisfy requirement 4. See `review-rounds-scoring/design.md` for the
  bar it must clear or stay a stub.
</content>
