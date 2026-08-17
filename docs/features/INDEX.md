# Feature Index

Single source of truth for what exists, what's building, and what's been cut.
**Every agent updates this file as part of the work it does.**

- Design system and page chrome: [`../DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md)
- Page-level user journeys: [`../user-journeys/README.md`](../user-journeys/README.md)
- Component audit: [`../COMPONENT-AUDIT.md`](../COMPONENT-AUDIT.md)
- Production deployment and the two-Convex-deployment trap: [`../deployment/`](../deployment/)

**Dead links removed 2026-08-17:** `/AGENTS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
`docs/CONTEXT.md` were linked from this header but have never existed in this repo. Two references
to `../ROADMAP.md` remain in the body below, kept as historical citations of a document that is
gone — build order and cut rationale now live in this file's tables.

**Status values:** `planned` · `in-progress` · `blocked` · `done` · `cut`
**Last updated:** 2026-08-17 — indexed 28 previously undocumented feature packages (rows 39-66
below; rows 65-66 landed on main from a parallel session during this same pass) and reconciled every one against its GitHub issue rather than against its plan doc's
`Status: In Review` header, which is a planning-workflow marker and never meant implementation
state. Shipped since the last index pass: multi-tenant organizations (#191/#192) and additive
event role tiers with team invitations (#146), replacing the deployment-wide `organizers` ACL; the
guided event creation wizard (#166/#169); app-shell and card-surface consolidation (#159/#161,
#162/#164); review and scoring improvements (#195/#198); the full developer platform — scoped API
tokens, audit log, idempotency, SDK, CLI, MCP server, billing allowances (#178 phases 1-5); Notion,
Airtable, and Sanity CMS sync (#216/#219/#220), all three converted from paste-a-token to OAuth
(#226/#232); public CFP page branding (#227); the `schedule_grid` embed view (#175/#177); CI/CD
automation with opt-in production deploys and a recovery runbook (#204/#206/#207/#210/#221/#222);
and the open-source mirror work — readiness gate, three code sync runs, and publishing `worker/`
(public PRs #14/#19/#21/#22/#24). Still open and now visible in the table: in-app notifications
(#158, the bell remains a dead stub). **Correction, same day:** rows 47-48 first stated that
evaluation scorecards and blind review had no tracking issue. Wrong — both shipped under #56 and
#57, closed 2026-08-11, and both are present in `convex/evaluations.ts`. The error came from
listing only the 100 most recent issues, which stopped at #133. Uncommitted work sitting on the working tree
(`convex/aiAssessments.ts`, `aiAssessmentActions.ts`, `commsInbox.ts`, `crm.ts`, `publicFeeds.ts`)
has **no** feature package and is deliberately not indexed until one exists.

**Prior update (2026-08-16):** (merged the attendee-site feature branch onto main: automatic responsive
public conference site at `/e/:eventSlug`, built on the published-only public embed projection,
with attendee privacy hardening — agenda descriptions and speaker associations fail closed through
each item's own accepted linked submission — see the attendee-site row below; fixed the shared
dashboard shell navigation regression that duplicated the Dashboard section's destination and
leaked Speaker Tracking into it; agenda scheduling #112 builder, accessible movement, continuous
grid, track conflicts, toolbar operations, and focused coverage implemented with authenticated
browser acceptance still pending at Clerk; speaker availability now uses the established
Clockwork/ServiceHQ day-column timetable interaction; onboarding browser annotations recorded for
the separate onboarding agent; confirmation delivery moved from a redirect-sensitive
browser/serverless call into a durable scheduled Convex action that uses the event's encrypted
Resend/SES integration and finalizes the pre-created comms log; provider-missing public CFP
submission browser-verified through the success page and visible portal link; real delivery
remains blocked because the accessible Resend account's only custom domain is failed and its DNS
zone is not in the accessible Cloudflare account, while the Convex deployment belongs to a
different dashboard identity and shell DNS policy prevented setting its delivery environment; task
templates and automated onboarding complete, browser-verified; readiness operations
browser-verified against live seeded data, including a fix so comms-delivery deep links land on
and highlight the exact record instead of the generic activity list; organizer onboarding wizard
browser-verified — a route-guard bug found during that verification, `/portal/*` incorrectly gated
by the onboarding redirect, was fixed and retested; CFP conditional-field authoring and runtime
regressions browser-verified, the CFP participant workflow widened and browser-verified at desktop
and mobile widths, and CFP participant availability redesigned as responsive day rows without
horizontal scrolling; organizer communication-template management added through the repository
boundary; form-template gallery and both create-form entry points implemented and
browser-verified end-to-end; public API planned as a post-demo platform feature, issue #73;
Public Events API (#93) implemented, live-verified including the full auth round-trip, rebased
onto latest `main`, and re-verified against the real production Convex deployment after reverting
an unauthorized events-table field rename introduced during implementation; remaining requirements
re-verified in real browsers against the seeded Convex app — speaker profile/headshot/slides/documents
persisted across reload, ownership and organizer-route boundaries held, multi-round and bulk
reviewer assignment fed visible scores, every Agenda view rendered the four seeded conflicts, and
speaker-task completion updated tracking without refresh; fixed speaker-document discovery to use
the speaker-scoped submission query and replaced its final native dropdown; refreshed measured
production performance; performance improvements Phase 1 reactive read foundation landed with
normalization parity coverage for all 31 read operations, and its own branch self-reported a
browser-verified signed-out WebSocket rejection check — re-verify independently before relying on
that claim; sponsor-management #104 implemented through the Convex, repository, task, routing,
seed, and three-pane UI layers, with authenticated browser walkthrough still pending; public
embeds and Accelevents integration restored to planned scope by Naya)

**Security planning update (2026-08-12):** Namos-plan packages added for SEC-WEB-001 through
SEC-WEB-003: public seeder containment, public-CFP abuse controls, and response headers.

**Agent-native planning update (2026-08-13):** a FULL Namos-plan package and issue #122 now
define an in-app, event-scoped Operations Agent with visible progress, clarification checkpoints,
source-linked readiness tools, and hash-bound approval before agent-attributed task creation. The
closed, unmerged external MCP spike in #66 is prior art only, not an implementation dependency.

**Branding maintenance update (2026-08-13):** the legacy Sentio favicon was replaced throughout
the web app with the Namos Sessions blue microphone icon, including SVG, ICO, PNG, and iOS assets.

**Comms completion update (2026-08-12):** saved-template decision/reminder delivery, co-speaker
fan-out, consolidated decisions, inline previews/confirmations, per-recipient retry, stable-sequence
calendar attachments, Resend/SES attachment transport, and send-log persistence are implemented.
Static verification passes. Live verification is blocked by sponsor-management rows in shared dev
whose schema has not merged, plus the existing unverified sender/calendar-client release gate.

---

## Build spine — never cut

**Corrected 2026-08-08.** The previous list of four omitted the speaker portal (requirement #2)
and onboarding tasks + dashboard (requirement #6), both of which are firm requirements. It also
allowed sub-parts named inside requirements 1-6 to be marked droppable — see the correction at
the top of [`../ROADMAP.md`](../ROADMAP.md) cut list.

**Rule: all six requirements ship. Nothing named in the text of requirements 1-6 is cuttable.**

### Deadline-critical blocker audit — 2026-08-11

Issue #66's agent-native MCP spike remains below the cut line. The protected requirements are
blocked by release evidence, not by that spike:

| Brief | Evidence already recorded | Next release gate |
|---|---|---|
| #1 CFP | Live submit, persistence, portal redirect, and category routing passed | Keep the deployed walkthrough in the final demo recording; confirmation delivery is tracked under #3 |
| #2 Speaker portal | Local Clerk-backed profile, ownership boundaries, headshot, slides, and document persistence all passed in headed browsers | Preserve the owned-submission and organizer-route denial checks in release evidence |
| #3 Comms | Template-driven decisions/reminders, co-speaker fan-out, consolidated sends, previews, logs, and versioned calendar attachments have local coverage | **External blockers:** merge the sponsor schema so shared dev accepts the comms functions; configure a verified sender; prove one real send and open the invite in Gmail, Apple Calendar, and Outlook |
| #4 Evaluation | Reviewer queue, multi-round assignment, tag bulk assignment, progress, and score → Abstracts rating all passed; AI remains a deliberate stub | Preserve the assignment → score → Abstracts rating flow in the final recording |
| #5 Agenda | List, Day, Week, Track, Rooms, and Conflicts all passed; the UI rendered one room clash, one double-booking, and two availability conflicts | Execute the event-scoped user journey: create, move, visible conflict, resolution, publish, refresh, and event isolation |
| #6 Tasks dashboard | Dashboard, 60-speaker tracking, and a task pending → in progress → done cycle passed locally | Preserve this flow in the final recording |

Local release evidence on this branch: `npm ci` is reproducible after repairing the stale
lockfile; `npm run check` passes both TypeScript projects, 34 test files / 150 tests, and the
production build. A localhost Codex Browser pass completed the five-step CFP (including required
validation, styled dropdown, review, submit, and Clerk-backed portal handoff), verified the public
agenda in the event timezone, and checked the CFP at 390px without horizontal overflow. The same
local pass saved a speaker profile, edited the owned proposal, saved availability, and opened the
speaker task list. It found and fixed unstable React keys, a duplicate editor extension, missing
speaker scope on availability, and organizer-only schedule reads. A second pass against a seeded
local Convex deployment verified the schedule fix, organizer Abstracts filtering, persisted reviewer
scoring, the Agenda conflict cycle, dashboard/speaker tracking, task completion, tag CRUD, and the
public agenda. The in-app browser did not surface the native file chooser, so positive
headshot/document upload remains unverified. That pass did fix speaker-scoped document discovery,
organizer demo-portal asset authorization, explicit file-input labels, and the last native
submission dropdown; a signed-in local speaker now reaches the upload controls without application
errors. A follow-up corrected port 8090 itself after its Vite process was found inheriting a stale
cloud `VITE_CONVEX_URL`; the exact `/portal/schedule` URL now uses the synchronized local functions
and renders without the `speakerId` validator error. A subsequent Codex Browser pass verified that
Home, Submissions, Profile, Availability, Schedule, and Tasks all render inside the same dashboard
shell as admin with speaker-specific navigation, one chrome title, working account links and sidebar
collapse, and no server error; focused coverage also verifies the shared mobile navigation drawer.
The complete earlier audit and recording are under
`test-artifacts/e2e-real-user-20260811-161914/` (gitignored). A 2026-08-12 follow-up under
`test-artifacts/e2e-real-user-20260812-120247/` re-ran the remaining checklist against the real
app. It confirmed positive headshot, slides, and supporting-document persistence in headed
Chromium after reload; verified the speaker could see only two owned submissions and was denied
another speaker's edit URL and organizer routes; exercised reviewer queues, two assignment rounds,
tag bulk assignment, progress, and score propagation; clicked every shipped Agenda view and saw
all four expected conflicts; and observed task completion update Speaker Tracking without refresh.
The seed completed repeatedly with stable 60-speaker/500-submission totals, while the Airtable
adapter and authentication contract suites passed 52 focused checks. This local evidence does not
replace provider or final release acceptance gates.

| # | Feature | Status | Est. | Brief | Why it's protected |
|---|---|---|---|---|---|
| 2 | [public-cfp-submission](./public-cfp-submission/plan.md) | `in-progress` | 5-6h | #1 | **Live-verified 2026-08-10**: full 5-step flow submitted against live Convex, persisted correctly, auto-redirected to portal, appeared in "My submissions." Category routing now applies server-side without exposing organizer rules: the sponsor proof received its tag, track, accept queue, and reviewer exactly once across a retried submit. Remaining: confirmation-email send proof (see #3). |
| 3 | [comms-notifications](./comms-notifications/plan.md) *(confirmation email)* | `in-progress` | 2-3h | #3 | Historical status: the browser-triggered delivery path was later replaced by the scheduled Convex action described in the current row below. |
| 5 | [abstracts-grid](./abstracts-grid/plan.md) | `in-progress` | 5-6h | #4 | **Live-verified 2026-08-10** at 501 real rows: pagination, tabs, inline status editing all work. Found + fixed a real bug: withdrawn/draft rows rendered a blank status control. |
| 29 | [portal-redirect-fixes](./portal-redirect-fixes/plan.md) | `in-progress` | 4-6h | #1, #2, #4 | #108 corrects the CFP → speaker-portal handoff and custom-labelled abstract display. Focused regressions pass; the clean-session and organizer browser journeys remain the completion gate. |
| 8 | [agenda-scheduling](./agenda-scheduling/plan.md) *(builder + movement + conflicts)* | `in-progress` | 6-8h | #5 | Issue #112 implementation now includes the real session builder/editor, conflict click-through, continuous 15-minute Rooms grid, pointer drag plus keyboard/touch Move, track-overlap information, persistence toasts/rollback, working sort/filter/export/print/duplicate actions, and seeded track overlap. TypeScript, lint, 10 focused tests, and all 356 tests pass. Authenticated browser acceptance remains open because the available browser stopped at Clerk; see `test-artifacts/e2e-real-user-20260812-192822/REPORT.md`. |

---

## All features, in build order

| # | Feature | Status | Est. | Brief | Cut rank | Notes |
|---|---|---|---|---|---|---|
| 0 | [data-adapter](./data-adapter/plan.md) | `in-progress` | 3-4h | — | never | Kanrei prune and adapter boundary landed; Airtable mode now obtains a Clerk session token and the server verifies an explicit admin allowlist before any Airtable request. Unsupported scoped operations still fail closed. |
| 0a | [three-pane shell](../DESIGN-SYSTEM.md) | `in-progress` | large | #18 | never | Admin and speaker routes now use one shared dashboard shell: identical floating sidebar, title chrome, unified content surface, collapse behavior, spacing, and account placement, with role-specific navigation and account links. Actions, search, utilities, and status tabs remain inside each page's content surface. Public routes continue to use `PublicLayout`; focused component coverage protects the shared composition contract. The 2026-08-13 regression fix removed a duplicate Dashboard-section destination while preserving Speakers under Program; portal-provider coverage passes once the preceding navigation assertion no longer aborts cleanup. Full mobile navigation remains. |
| 0b | [event-settings](./event-settings/plan.md) | `in-progress` | 2h | — | never* | Event Details now creates rooms/tracks without synthetic record IDs and deletes persisted rows through the adapter; persisted event saves reject invalid IANA timezones and inverted dates. Image storage and live agenda-time proof remain. |
| 1 | [submission-form-builder](./submission-form-builder/plan.md) | `in-progress` | 6-8h | #1 | never* | Builder now rehydrates and persists scoped form sections, field definitions, submission limits, configurable cross-field rules, and ordered category-routing rules over existing event tags, tracks, statuses, and reviewers. **Live-verified 2026-08-12**: multiline dropdown options remain editable, `Show only if` persists, and the public renderer hid/showed the dependent field for Talk/Workshop; focused regressions cover both interactions. Sponsor routing was previously verified live. |
| 2 | [public-cfp-submission](./public-cfp-submission/plan.md) | `in-progress` | 5-6h | #1 | **never** | Config-driven 5-step form resolves and submits server-side from slug/form id; repeatable, role-bounded participant blocks plus required, per-field, cross-field, and category-routing rules are revalidated server-side. **Live-verified 2026-08-12**: conditional visibility, closed state, individual/combined counters, over-limit validation, one-submission enforcement, five-step review/submit, success copy, visible portal link, timed redirect, and a dedicated 5xl submission shell that keeps participant availability usable without squeezing the page. Authenticated portal landing and real confirmation delivery remain gated by Clerk/provider configuration. |
| 3 | [comms-notifications](./comms-notifications/plan.md) *(confirmation)* | `blocked` | 2-3h | #3 | **never** | Public submission now creates the queued log and schedules delivery entirely server-side; the action atomically claims the one-time request, resolves the encrypted event provider, and records `sent` or `failed`, so redirects cannot drop the send. Browser proof with no provider reached the success page and showed the portal link; `npm run check` passes 55 files / 348 tests. **External blocker:** Resend is accessible and a sending-only key was created, but `namos.io` is failed in Resend and its DNS zone is absent from the accessible Cloudflare account; the target Convex deployment is owned by a different dashboard identity, and shell DNS policy blocked its environment API. No real confirmation arrived, so this remains blocked rather than falsely marked done. |
| 4 | [speaker-portal](./speaker-portal/plan.md) | `in-progress` | 5-6h | #2 | never* | Identity is Clerk-email-matched only — the earlier demo speaker impersonation picker was removed from the production app (2026-08-13); an unmatched account now sees a "No speaker profile found" notice, never another speaker's data. Profiles, image-only headshots, slides, and supporting documents persist through scoped Convex storage flows. The speaker experience uses the shared dashboard shell with portal-specific navigation. **Browser-verified 2026-08-12:** profile edits, a PNG headshot, slides, and a supporting document all survived reload; owned submissions loaded while another speaker's edit URL and organizer routes were denied. The submissions toolbar now exposes **New submission**, backed by a server-filtered chooser for the event's open, unexpired public CFP forms. [`USER_JOURNEY.md`](./speaker-portal/USER_JOURNEY.md) now defines the authoritative UI-to-persistence QA path. Remaining journey gaps: enforce supported document types beyond the file picker, guard duplicate profile saves, warn before abandoning dirty profile edits, add inline document-load retry, and retain a repeatable configured/deployed browser run. |
| 4a | [submission-editing](./submission-editing/plan.md) | `done` | 3-4h | #2 | never* | Speaker-owned draft/pending/withdrawn proposals reopen against their original form; review, decision, and CFP-close locks are enforced server-side through Clerk verified-email ownership. Live seed verification confirmed canonical answer envelopes plus open/closed fixtures; lint, 131 tests, build, and Convex validation pass. |
| 5 | [abstracts-grid](./abstracts-grid/plan.md) | `in-progress` | 5-6h | #4 | **never** | Queue controls, persisted organizer-added abstracts, filtered CSV export, and browser-local column preferences are built; no 500-row proof yet |
| 6 | [evaluation-scoring](./evaluation-scoring/plan.md) | `in-progress` | 6-8h | #4 | 5 | Event-scoped plans and idempotent multi-round assignments drive the reviewer queue, and scored reviews feed the Abstracts rating. **Browser-verified 2026-08-12:** queue admission, two assignment rounds, tag bulk assignment, reviewer progress, and a changed score surfacing immediately in Abstracts all passed. The AI-review affordance remains a deliberate stub. |
| 7 | [portal-tasks](./portal-tasks/plan.md) | `in-progress` | 3-4h | #6 | never* | Speaker/admin task lists persist status changes; linked form submission completes the matching task. **Live-verified 2026-08-10**: 12 real tasks, correct status pills and source badges, interactive Start task. |
| 8 | [agenda-scheduling](./agenda-scheduling/plan.md) | `in-progress` | 6-8h | #5 | 7,8 | List/Day/Week/Track/Rooms/Conflicts use one fetched dataset and persisted availability-aware results. Issue #112 adds a submission-aware session builder/editor, continuous 15-minute room grid, drag plus accessible Move control, informational track overlaps, working sort/filter/export/print/duplicate-day controls, and persistence feedback. **Verification 2026-08-12:** typecheck, lint, 10 focused tests, and all 356 repository tests pass. The real browser reached Clerk but lacked an organizer session, so the full authenticated journey, reload persistence, and event switching remain unverified and status stays `in-progress`. |
| 9 | [speaker-availability](./speaker-availability/plan.md) | `in-progress` | 2h | — | 10 | Organizer availability grid, public participant collection, and selected demo-speaker portal editing persist availability. The researched scheduling-canvas editor uses date columns, click/drag range painting, whole-day shortcuts, conference hours by default, optional overnight hours, and compact exact-hour state cells. Legacy day-part records remain compatible. Clerk-backed speaker identity and live verification remain. |
| 10 | [comms-notifications](./comms-notifications/plan.md) *(decisions, reminders, `.ics`)* | `blocked` | 4-5h | #3 | 3,9 | Saved templates now drive branded decision/reminder sends; agenda co-speakers are resolved server-side; combined multi-submission decisions are supported; organizers review real recipients/content/calendar state inline before sending; failures are visible and retryable per recipient; every provider/calendar attempt is persisted; stable UID + incrementing sequence and Resend/SES attachments are implemented; dead unauthenticated legacy handlers are removed. Typecheck, lint, all 354 tests, and the production build pass. **Live blocker reproduced:** shared Convex rejects deployment because parallel sponsor-management rows contain `targetType: "sponsor"`/`sponsorId` but that schema is not on main. Real provider and Gmail/Apple/Outlook opening remain unverified. |
| 11 | [portal-forms](./portal-forms/plan.md) | `in-progress` | 3-4h | #8 | 6 | Admin forms use the shared field library; selected speakers submit linked forms, responses persist, and configured confirmations are provider-gated and logged. **Live-verified 2026-08-10**: real seeded form, list/edit/duplicate render correctly. |
| 12 | [dashboard](./dashboard/plan.md) | `done` | 2-3h | #6 | 2 | Dashboard is the concise Today overview with event-derived counts and agenda/review/speaker-attention nudges. The duplicated Speaker Tracking report was removed in favor of the operational Program workspace. |
| 13 | [public-embeds](./public-embeds/plan.md) | `done` | 12-16h | #9 | restored | Saved event-scoped embed definitions, organizer CMS list/editor, five styled responsive views, safe server projection, preview/code modes, enable/disable, filters, field options, and legacy routes shipped in #119. **Production-verified 2026-08-13:** the enabled agenda rendered directly and inside a foreign-origin iframe at `app.your-project.example`; `/embed/*` received scoped `frame-ancestors *`, organizer routes did not, and the live payload contained no forbidden private keys. |
| 14 | Seed data script | `in-progress` | deliverable | — | never | Re-runnable fixture completes the published event, CFP, portal task/form, queues, conflicts, availability, evaluation, and comms scenarios. Re-run three times on 2026-08-12 with stable event/form ids and stable totals (60 speakers, 500 submissions); Agenda continued to show exactly the four intended conflict examples. |
| 15 | [datagrid-pagination](./datagrid-pagination/plan.md) | `in-progress` | 1h | — | high | Shared client-side pagination is implemented for Abstracts, Agenda, and Communications; local tests pass, while 500-row browser proof awaits a configured Convex environment. |
| 16 | [tags-library](./tags-library/plan.md) | `done` | 3-4h | — | never | Event-scoped CRUD, cascading delete, Settings Library UI, and durable Abstracts assignment are code-complete. Live Convex CLI CRUD/assignment passed; browser verification remains Naya's gate. Personas remain below the cut line. |
| 17 | [speaker-operations](./speaker-operations/plan.md) | `done` | 6-8h | #6 | never* | Program > Speakers is the single roster workspace: organizers can add speakers manually, scan separate first/last/email fields in a sortable and configurable table, persist explicit confirmation, create/complete speaker-scoped tasks, write/delete private speaker notes, and review a date-grouped activity feed in the inline detail pane. The existing core workspace was **live-verified 2026-08-11** in the local Codex browser across desktop and mobile; notes/timeline are covered by typecheck, focused UI tests, and production build. |
| 18 | [reviewer-progress](./reviewer-progress/plan.md) | `in-progress` | 4-5h | #4 | 6 | Per-reviewer assigned/completed/percent for an evaluation plan is derived at read time (no new table, no counters) and rendered on `/program/evaluation`. Organizers remind one reviewer or everyone below a threshold; recipients are selected server-side, one email per reviewer, every attempt logged to `comms_log`. Sends go through the Convex email action layer (`convex/emailDelivery.ts`), deliberately on demand only, with no cron. |
| 19 | [reviewer-assignment-by-filter](./reviewer-assignment-by-filter/plan.md) | `done` | 3-4h | #4 | 6,16,18 | Organizers assign every submission carrying one tag, or every submission in one track, to a set of reviewers in one action. The filter resolves server-side (`evaluations:assignByFilter`) so no submission id list leaves the browser; the write is idempotent per plan/submission/reviewer/round through the same shared helper the manual `assign` path now uses. A live client-side preview states matched × reviewers = total before any write, a two-step inline confirm gates it, and a 500-row cap refuses an over-broad run — all load-bearing, because **there is no bulk-unassign anywhere in this product. That is the number-one follow-up issue.** Drafts and withdrawn submissions are excluded by both the preview and the server. Schema-neutral. |
| 20 | [ui-consistency](./ui-consistency/plan.md) | `done` | 2h | — | — | Product tables use `DataGrid`; generic fields, section cards, empty states, status badges, and segmented controls now have canonical shared implementations. The unused alternate table API is removed, visible native controls and hardcoded neutral product palettes are migrated, and source-audit tests prevent these component families from drifting again. |
| 21 | [keyboard-layer](./keyboard-layer/plan.md) | `done` | 2-3h | — | high | Admin-only command palette, guarded `g` sequences, and `?` help dialog. The shared `⌘/` sidebar listener remains on `DesktopSidebar`, preserving speaker-portal behavior. Automated coverage only at merge time — no real-browser hand test (the review worktree had no VITE_CLERK_PUBLISHABLE_KEY); browser-verified separately before merge. |
| 22 | [organizer-onboarding-wizard](./onboarding-wizard/plan.md) | `done` | large | — | high | Four-step `/onboarding` flow, completion guard, shared Resend/SES form, and validated CSV speaker/past-talk import. Browser-verified end-to-end: claim → conference save → email skip → CSV upload with mixed valid/invalid rows → import (persisted speakers + linked submissions confirmed) → Finish → dashboard, re-entry into `/onboarding` after completion, and duplicate-email re-import reporting. A route-guard bug found during verification (`/portal/*` nested inside the onboarding redirect, which would have locked speakers out of the portal) was fixed and retested. `npm run check` passes (246 tests). |
| 23 | [task-templates](./task-templates/plan.md) | `done` | 4-6h | #85 | high | Event-scoped templates are seeded for six speaker archetypes; organizers can create, edit, default, delete, and apply templates. Acceptance applies the event's default template on accept, preserving the legacy four-task fallback when none is configured. Browser-verified end-to-end against a live Convex deployment: template CRUD, set-default, delete-blocked-while-default, Copy from… apply with collision skip, and automatic default-template application on submission acceptance (correct due-date offset resolved, legacy fallback not used once a default is set). |
| 24 | [readiness-operations](./readiness-operations/plan.md) | `done` | 3-4h | — | high | Client-side five-signal readiness punch list (agenda conflicts, speaker confirmations, overdue tasks, undecided proposals, failed comms), with event-day filtering and source-record links. **Browser-verified 2026-08-12** against live seeded data (~500 sessions, 60 speakers): all five categories populate, day filter correctly scopes date-attributable items while non-date-specific items stay visible with a note, and every item link lands on and highlights its real source record. A bug found during verification — comms-delivery links landed on the generic activity list instead of the failed record — was fixed (the page now switches to the matching status tab and scrolls the row into view) and retested. `npm run check` passes (251 tests). |
| 25 | [form-templates](./form-templates/plan.md) | `done` | 3-4h | #89 | high | All 12 static templates, the organizer-only atomic creation operation, and gallery entry points for both CFP and portal forms are implemented. Browser-verified end-to-end: both galleries render all 6 templates each, template pick pre-fills the wizard correctly (including Panel Discussion's Moderator/Panelist role counts and Travel & Logistics' 5 fields), forms save, and "Start from blank" is unchanged on both pages. T009/T010 mutation-plan coverage for template validity and field dedupe shipped in #94. |
| 26 | [public-api](./public-api/plan.md) | `planned` | 40-55h | beyond brief | post-demo | Versioned REST/OpenAPI surface for the whole app. Phase A delivers safe public event/schedule reads; private administration follows only with scoped PATs, event grants, idempotency, audit logs, and shared domain services. |
| 27 | [public-events-api](./public-events-api/plan.md) | `done` | 1-2d | #93 | — | Versioned Bearer-authenticated Events endpoint, organizer key management through the repository boundary, and a responsive three-column API reference with section navigation and request/response examples. Live organizer generate/copy/last-used/revoke flow, signed-out docs, exact 200 response contract, and revoked/missing/malformed/unknown structured 401 responses all passed; re-verified against the real production Convex deployment after reverting an unauthorized events-table field rename introduced during implementation. |
| 28 | [performance-improvements](./performance-improvements/plan.md) | `in-progress` | 12-16h | #67 | high | The client's stated reason for leaving Sessionize/Sessionboard is that both are extremely slow, and this app currently reproduces that architecture: `ConvexHttpClient` (one-shot HTTP, no cache) consumed by hand-rolled `useEffect` fetching in all 20 pages, a serial `events.list()` waterfall on every mount, a full six-query reload after every mutation, and an `AppLayout` that unmounts the whole shell on every navigation. Five phases, each independently shippable. **Phase 1 (reactive read foundation) implemented:** backend-agnostic reactive reads, Convex WebSocket/query caching, Airtable TanStack Query caching, and normalization parity coverage for all 31 read operations. The branch self-reports T009 (signed-out `ConvexReactClient` probe to organizer-gated `events:list` rejected by `requireIdentity`) as browser-verified 2026-08-11 — re-verify independently before relying on that claim. Phases 2+3 (persistent shell + event scope) are the cheapest perceived-speed win and are worth landing next. |
| 29 | [sponsor-management](./sponsor-management/plan.md) | `done` | 8-10h | #104 | high | Convex-only sponsor tiers, records, multiple contacts, primary-contact enforcement, shared onboarding tasks/templates, and CFP fast-track routing are implemented. **Authenticated browser verification 2026-08-13:** tier/sponsor creation, two contacts and primary swap, template tasks and completion, persisted CFP routing, verified public submission, Accept Queue sponsor link, exact Abstracts handoff, guarded deletion, reload/new-session persistence, desktop, 390px, and dark mode all passed. CRM pipeline/renewal/ROI reporting, public logo walls, and Airtable parity remain deliberately out of scope. |
| 30 | [event-workspace-switching](./event-workspace-switching/plan.md) | `done` | 8-10h | #105 | never | URL-slug event routing, indexed active-event resolution, sidebar switching, event landing/create/duplicate flows, event-scoped membership, organization and event team management, and the full `events[0]` sweep are implemented. **Authenticated browser verification 2026-08-13:** create/switch/reload/copied URL, owner/admin team roles, disposable reviewer isolation/removal, and duplication of forms/tracks/comms without submissions/speakers/agenda/evaluations passed. Verification fixes covered admin onboarding, scoped Abstracts fields, sanitized load errors, and legacy membership-schema compatibility; affected flows were retested. |
| 31 | [portal-redirect-fixes](./portal-redirect-fixes/plan.md) | `in-progress` | 4-6h | #1, #2, #4 | never | P0 #108 fixes the public CFP → portal handoff and organizer abstract display. The documented [user journey](./portal-redirect-fixes/USER_JOURNEY.md) is the completion gate. Stable abstract-field mapping, visible conflicting-Clerk-session feedback, and focused regressions are implemented; clean-session and organizer browser flows remain required before this is done. |
| 32 | [accelevents-integration](./accelevents-integration/plan.md) | `planned` | 12-16h | #7 | restored | **Restored by Naya on 2026-08-12.** One-way accepted speaker + scheduled session sync only; credentialed Accelevents sandbox contract proof is the first hard gate. |
| 33 | [security-public-seed-boundary](./security-public-seed-boundary/plan.md) | `planned` | 1-2h | security audit | never | SEC-WEB-001: make the privileged demo seeder internal-only while preserving operator CLI idempotency. |
| 34 | [security-public-cfp-abuse-controls](./security-public-cfp-abuse-controls/plan.md) | `planned` | 1-2d | security audit | never | SEC-WEB-002: move public submission behind rate-limited, anti-bot-verified edge enforcement without breaking retries. |
| 35 | [security-response-headers](./security-response-headers/plan.md) | `planned` | 4-8h | security audit | never | SEC-WEB-003: deploy and runtime-verify CSP and baseline browser security headers with an explicit embed policy. |
| 36 | [agent-native-operations](./agent-native-operations/plan.md) | `planned` | 40-60h | #122 | high | Event-scoped Operations Agent for readiness synthesis, inspectable durable runs, clarification, and exact task proposals with explicit hash-bound approval. No stubs or pre-baked agent runs/results: release verification must use the real runtime, tools, model, approval mutation, and task writes. Convex-only in v1; direct email sends, schedule writes, decisions, scoring, deletes, and configuration changes remain out of scope. |
| 37 | [attendee-site](./attendee-site/requirements.md) | `done` | 8-12h | beyond brief | high | Automatic responsive public conference site at `/e/:eventSlug`, built on the published-only public embed projection. Day/track/room navigation, search, deep-linked session details, speaker profiles, live state, event-scoped local favorites, calendar links, freshness metadata, and focused route coverage ship together. Descriptions and per-session speaker associations now require that agenda item's own accepted linked submission; unprovable organizer-added associations fail closed. Deep-linked sessions select their real day, event navigation resets page state, and opaque session/speaker keys prevent UI collisions. `npm run check` passes 407 tests and the production build; seeded browser proof awaits a configured `VITE_CONVEX_URL`. |
| 38 | [onboarding-personalization](./onboarding-personalization/plan.md) | `planned` | 4-6h | #160 | medium | Inserts a 2-question identity step (solo/team, referral source, both skippable) between Welcome and conference setup, and collapses conference setup down to just a conference name — timezone, dates, slug, and event type become smart defaults behind an optional "Customize details" disclosure instead of blocking fields. Also ships the `DateTimeField` time-input clipping fix (prod bug: fixed 120px width clipped the native 12-hour time control). |
| 39 | [multi-tenant-organizations](./multi-tenant-organizations/requirements.md) | `done` | large | #191 | never | Adds a real tenant boundary. The deployment-wide `organizers` ACL — a row in which implicitly granted access to *every* event in the database — is replaced by organization-scoped authorization (#192). This was the prerequisite for unrelated people signing up on one deployment. |
| 40 | [admin-role-tiers](./admin-role-tiers/requirements.md) | `done` | large | #146 | never | Three additive tiers a Clerk identity can hold in any combination: application admin, event owner/admin, event reviewer. Event creation no longer requires a global organizer row, so a normal customer can create and own a conference, and reviewers no longer inherit event-management writes through the broad `assertEventAccess` helper. Follow-up #149 fixed pending-invite removal; #148 ported Beeconomy's Clerk-backed invitation CRUD. |
| 41 | [event-creation-wizard](./event-creation-wizard/plan.md) | `done` | large | #166 | high | Guided Basics → CFP → Branding → Team flow (#169) replacing the bare 4-field inline `EventEditor`. Gets an organizer from "I need to run a conference" to "event exists, CFP is live" in one sitting, saving the draft event at the end of step 1 so partial progress survives. Known open follow-up: **#224 — re-entering `/onboarding` renames the existing event instead of creating a new one.** |
| 42 | [app-shell-consistency](./app-shell-consistency/plan.md) | `done` | 4-6h | #162 | — | Follow-up audit to row 43 covering the rest of the shell — sidebar, content shell, detail panel, buttons, repeated primitives — for the same edit-one-place property. Shipped in #164 alongside the dead-sidebar and button-guard fixes. |
| 43 | [card-component-consolidation](./card-component-consolidation/plan.md) | `done` | 4-6h | #159 | — | `src/components/ui/card.tsx` was imported in exactly one file while 4 wrapper components and 31 pages hand-rolled their own surfaces. Consolidated in #161, with #171 fixing invisible light-mode card surfaces and #172 routing `CommTemplateEditor` panels through the canonical contract. |
| 44 | [design-system-reuse](./design-system-reuse/plan.md) | `done` | 2-3h | #143 | — | Adapts the owned Clockwork and ServiceHQ schedule patterns into the Agenda Rooms view — compact identity column plus repeated work columns, native drag vocabulary, borderless `gap-px` grid — without importing their shadows or side stripes, which would break this app's borderless system. |
| 45 | [cfp-branding](./cfp-branding/plan.md) | `done` | 4-6h | #227 | — | Organizer logo and accent color on the public CFP page, using the `events` table's previously unused `logoStorageKey` and `theme` columns. Closes the parity gap with SessionBoard's branded `submit/<event>/<form>` pages. Related open issue: **#173 — event logo upload for Branding.** |
| 46 | [review-scoring-improvements](./review-scoring-improvements/plan.md) | `done` | 6-8h | #195 | — | Star ratings, one-click approve/maybe/decline, and a findable reviewer queue (#198). Written after a 2026-08-16 audit drove the whole judging pipeline in a real browser and confirmed it end to end — this package is UX on top of a working flow, not a repair. |
| 47 | [evaluation-scorecards](./evaluation-scorecards/plan.md) | `done` | 8-12h | #56 | — | Before this, a reviewer recorded exactly one number — `evaluations.score` was a bare optional number and `scoringScaleMax` was constrained to 5 or 10, so a chair could not say *what* was being scored. Now an evaluation plan carries ordered weighted criteria (`number` and `text` types), reviewers score each one through `ScorecardForm`, chairs define them through `CriteriaEditor`, and the organizer grid sorts by the weighted total. Legacy single-score reviews still render, labelled as such, and a plan with zero criteria behaves exactly as before. Issue #56 closed 2026-08-11; `evaluation-scorecards.test.tsx` passes 13 tests. **That gap is now closed: browser-verified in production 2026-08-17** — per-criterion star and text inputs render, a scored review prefills, and the weighted total recomputes live (`Total 3.00 / 5` → `5.00 / 5` → back), matching the FR-006 formula by hand. Nothing was saved. |
| 48 | [blind-review](./blind-review/plan.md) | `done` | 6-8h | #57 | — | Written when a `grep -ri` for "anonym" or "blind" over `convex/` and `src/` returned zero matches. Now a plan carries `anonymized`, and the projection happens **server-side** in `convex/evaluations.ts` — `projectForReviewer` drops speaker records and `stripIdentifyingAnswers` scrubs identity fields from submission answers before the payload leaves Convex, so the reviewer queue never receives the names in the first place. It **fails closed**: an assignment whose plan can't be resolved is treated as anonymized. Organizer surfaces are unaffected. Issue #57 closed 2026-08-11. **Payload-verified in production 2026-08-17**, which is what the plan demanded: calling `evaluations:myQueue` directly returned five rows for one caller, and the row on the anonymized plan omits `speakerNames` **entirely** (key absent, not empty) while non-anonymized rows in the same response carry it — so the flag, not an empty dataset, causes the difference. No `@`, `speakerId`, `headshot`, `bio`, or `firstName` anywhere in the payload. T021-T025 were **already covered** by `reviewer-queue.test.tsx` and simply never ticked; the one real gap, T022 (organizer surfaces), now has a structural test asserting `anonymized` is readable in exactly two backend files, so no organizer query can consult it. The README now states this is a query-layer projection, not a privacy guarantee, and names the free-text-abstract limitation. 20 tests pass. |
| 49 | [in-app-notifications](./in-app-notifications/plan.md) | `planned` | 8-12h | #158 | — | `NotificationBell.tsx` is still a non-functional placeholder — a bell icon with no data source, unread state, or persistence, as its own comment admits. Convex `notifications.ts` (`list`, `unreadCount`, `markRead`, `markAllRead`) already exists and is consumed by the iOS app; the web bell is the gap. **Open.** |
| 50 | [dashboard-composer-voice](./dashboard-composer-voice/plan.md) | `done` | 6-8h | #174 | — | Finishes the chat-first Dashboard composer ported from Imori: real dictation and voice chat plus corrected rail defaults. Follow-ups all closed — #193 (Alt+V shortcut, voice extended to the Operations Agent page), #197 (capture-phase window listener, matching Imori), #205 (ElevenLabs `get_signed_url` is GET), #211 (cache-wrapped `useQuery`), #217 (wedged status check no longer permanently disables the button). A 2026-08-17 fix also stopped an unresolved access check from deleting the composer outright. |
| 51 | [developer-platform](./developer-platform/plan.md) | `done` | 40-60h | #178 | — | Five phases, all merged: scoped API tokens, audit log, and idempotency (#179), typed TypeScript REST SDK (#180), `namos-sessions` CLI (#186), `namos-sessions-mcp` server (#188), and managed AI billing allowances (#189). MCP's first live end-to-end connection caught three real API bugs, fixed in #190. Supersedes the single flat unscoped `api_keys` table shipped with #93. Rate limiting for `/api/v1/events` was tracked and closed separately as #201. |
| 52 | [cli-workspace-resolution-fix](./cli-workspace-resolution-fix/plan.md) | `done` | 1-2h | #187 | — | Real GitHub Actions CI failure on PR #186 — the CLI could not resolve `@namos-sessions/sdk` in test/CI — confirmed from `gh run view --log-failed` on the actual run rather than inferred. |
| 53 | [notion-cms-sync](./notion-cms-sync/plan.md) | `done` | 12-16h | #213 | — | Per-event Notion connection importing speakers and/or submissions from an organizer-pointed database, on the shared `content_integrations` table and `contentIntegrationsActions.ts` module. Implemented in #216 and converted from paste-a-token to OAuth in #226/#232. The parent feature issue #213 is **still open** and should be closed or re-scoped. |
| 54 | [airtable-cms-sync](./airtable-cms-sync/plan.md) | `done` | 8-12h | #214 | — | Same shape as row 53 for organizers who track CFP/speaker data in Airtable, built on the module Notion shipped. Implemented in #219, OAuth in #226/#232. |
| 55 | [sanity-cms-sync](./sanity-cms-sync/plan.md) | `done` | 12-16h | #215 | — | Different in kind from rows 53-54: Sanity is an *outbound* publish target for a public event website, not an inbound import. Implemented in #220 with a hard content boundary — only `isPublished: true` sessions and `confirmationStatus: "confirmed"` speakers ever leave the app. |
| 56 | [public-embeds-schedule-grid](./public-embeds-schedule-grid/plan.md) | `done` | 4-6h | #175 | low | Sixth public embed view — a day-by-day timetable with rooms as columns and time slots as rows, alongside `agenda`, `schedule_itinerary`, `session_list`, `speaker_gallery`, and `speaker_list`. Merged in #177. |
| 57 | [ci-cd-improvements](./ci-cd-improvements/plan.md) | `done` | 12-16h | #204 | — | Releases were manual, unrecorded, and non-atomic — `npm run deploy` ran from a developer's laptop and Convex/Cloudflare could silently drift. Now: lint and worker-types run in CI (#207), main deploys on merge (#206) with production auto-deploy made opt-in and off by default (#222), Wrangler config is validated so a placeholder can't pass green (#221, after #194 shipped a scaffold placeholder to prod), and every deploy emits a migration summary against a recovery runbook (#210). Related infrastructure closeouts: Convex behind Cloudflare WAF/bot protection (#199) with an incident runbook (#225), and spend alerting (#202). |
| 58 | [worker-types-nondeterminism](./worker-types-nondeterminism/plan.md) | `done` | 1-2h | #208 | low | `npm run check:worker-types` produced different output per machine because `wrangler types` reads local `.env`/`.env.local` and emits whatever it finds as a literal. Fixed in #209. |
| 59 | [oss-readiness](./oss-readiness/plan.md) | `done` | 4-8h | — | — | Release gate, not a feature: the read-only repo audit (git history plus working tree) that had to pass before the public mirror existed. Two blockers, everything else should-fix. No runtime behavior touched. |
| 60 | [public-repo-sync](./public-repo-sync/requirements.md) | `done` (recurring) | 2-4h/run | — | — | Recurring operation, not a one-time feature: ports application code from this private repo to the public `namos-sessions-public` mirror. Runs to date — public PRs #14, #19, #21, and #22. Private `main` keeps moving between runs, so each run must resolve `origin/main`'s live tip itself rather than trusting a SHA written into the requirements doc. |
| 61 | [public-worker-mirror](./public-worker-mirror/requirements.md) | `done` | 2-3h | — | — | The first two sync runs excluded `worker/` wholesale as "live Clerk/Convex/Sentry endpoints." Reading the source showed that was too conservative — `worker/index.ts` is 62 lines whose only literal domains sit inside a CSP header sent to every visitor anyway. Published to the public repo in its PR #24; local commits also stopped future syncs from re-excluding the directory. |
| 62 | [security-audit-2026-08-12](./security-audit-2026-08-12/README.md) | `done` | — | — | never | Tracker index for the cross-application audit (canonical findings live in the marketing repo). All three web findings shipped: SEC-WEB-001 seeder internalization (#153/#181), SEC-WEB-002 public CFP abuse controls (#154/#184), SEC-WEB-003 response headers (#155/#185), closed out in #156. See rows 33-35 for the individual plan packages. |
| 63 | [form-builder-review](./form-builder-review/FINDINGS.md) | `done` (investigation) | — | #142 | — | Investigation only, deliberately not implemented. Finding: the organizer edits a fixed 7-category settings wizard while the public form has 5 hardcoded stages — they cannot add, rename, reorder, or preview public steps. "It already uses `WizardShell`" doesn't answer the complaint, because that makes the *configuration* multi-step, not the form. High confidence on the mismatch, medium on the replacement UI; a fix crosses schema, builder, renderer, validation, and migration, so it needs owner confirmation before anyone builds it. |
| 64 | [forge-self-host-research](./forge-self-host-research/requirements.md) | `done` (research) | — | — | — | Research doc, no deployment and none proposed. SmolForge self-hosting means thirteen independently released Workers plus multiple D1 databases, R2, and Durable Objects — a genuine infrastructure project, not a quick deploy. Hosted alpha registration is closed regardless. |
| 65 | [account-menu-imori-parity](./account-menu-imori-parity/plan.md) | `done` | 4-6h | #228 | — | The account dropdown exposed only namos-specific navigation plus a theme toggle and sign out. Adds Imori's What's New, Take a tour, Feedback, and Shortcuts entries — the affordances that let a new or returning user get unstuck without opening a support channel — while keeping every namos-specific item, which has no Imori equivalent and must not be dropped. Merged as #230. |
| 66 | [settings-modal-refactor](./settings-modal-refactor/plan.md) | `done` | 6-8h | #229 | — | Settings were 9 separately routed pages, each a full navigation away from whatever the organizer was doing. Now a Claude.ai-style modal overlay reachable from any page, with Imori's grouped sidebar nav and card content inside this app's design system. Deep links still resolve — `/events/:slug/settings/event` lands on the right tab inside the overlay instead of as a standalone page. Merged as #231. |

**Total estimate:** ~156-216h including the attendee site, post-demo public API, restored public
embeds + Accelevents integration, and the agent-native operations foundation, against a deadline
of Wed Aug 12, 10PM PT.

---

## Written brief coverage

The 9 numbered requirements from the competition doc, mapped to where each is satisfied.

| # | Requirement | Feature | Status |
|---|---|---|---|
| 1 | CFP forms w/ conditional logic + category routing | submission-form-builder, public-cfp-submission, form-templates | `in-progress` |
| 2 | Self-service speaker portal (bios, headshots, slides, docs, proposal editing) | speaker-portal, submission-editing, form-templates | `in-progress` |
| 3 | Automated templated comms + calendar invites | comms-notifications | `blocked` |
| 4 | Submission evaluation + scoring, multi-round, optional AI | evaluation-scoring | `in-progress` (AI stubbed) |
| 5 | Drag-and-drop schedule + conflict detection, multiple views | agenda-scheduling | `in-progress` (implemented; authenticated browser acceptance pending) |
| 6 | Real-time outstanding speaker-task dashboard | portal-tasks + speaker-operations | `done` |
| 7 | One-way Accelevents integration | [accelevents-integration](./accelevents-integration/plan.md) | `planned` as owner-requested scope despite the original strikethrough |
| 8 | ~~Resource/wiki pages in the portal w/ HTML embed~~ | — | `cut` (struck through) |
| 9 | ~~Embeddable mobile-friendly gallery + itinerary~~ | public-embeds | `done` as owner-restored scope; production framing verified 2026-08-13 |

**Beyond the brief:** [speaker-availability](./speaker-availability/plan.md) — Pretalx parity,
completes conflict detection; [public-api](./public-api/plan.md) — a versioned, scoped,
documented integration API to pursue after the judged demo (issue #73, planning only). Plus
three cheap differentiators in [`../ROADMAP.md`](../ROADMAP.md) (consolidated decision emails,
speaker detail view, unconditional export). Also
[public-events-api](./public-events-api/plan.md) — `GET /api/v1/events` + API-key management +
public docs page (issue #93), `done` — see requirement coverage above. And
[outbound-event-webhooks](./outbound-event-webhooks/plan.md) — push events to
Airtable/Zapier/a website the moment they change, issue #96, `planned`, deliberately sequenced
after #93 (2026-08-12).

---

## Cut log

Record anything cut, when, and why. This is source material for the README, which is where the
"best subjective judgment calls" tiebreaker gets argued.

| Feature / scope | Cut | Reason | Date |
|---|---|---|---|
| Payments & fees step | full | swyx wrote **"NOT NEEDED"** on the screenshot | 08-08 |
| Multi-language | full | *"We only care about English"* | 08-08 |
| Marketing / CRM / CMS | full | *"only going to use the program side"* | 08-08 |
| AI-assisted review | to stub | *"I don't care about the AI workflow thing"* | 08-08 |
| Accelevents integration | to CSV stub | No API access; deadline. Pattern demonstrated, not certified | 08-08 |
| Airtable as demo backend | to adapter + tests | Free tier caps at ~1k API calls/**month**; demo uptime can't depend on a quota | 08-08 |
| Dashboard builder / AI prompt / template gallery | full | A product in itself, inside a screen he marked optional | 08-08 |
| CMS embeds admin route | full | Requirement #9 is struck through; protect time for requirements 1-6 | 08-09 |
| Scheduled/automatic reviewer reminders | full | Reminders are organizer-triggered only. An unattended scheduler firing at seed addresses during judging is the one failure mode this feature must not have; the button + inline confirmation keeps every send accountable | 08-11 |

**Restoration note (08-12):** Naya explicitly requested embeds. The historical cut remains above
as evidence of the earlier competition decision; `public-embeds` is now planned owner-requested
stretch scope and must follow its new FULL plan before implementation.

**Restoration note (08-12):** Naya explicitly requested the native Accelevents integration. The
historical cut remains above as evidence of the earlier competition decision;
`accelevents-integration` is now planned owner-requested scope and must follow its FULL plan.
