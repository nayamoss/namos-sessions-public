# Feature Index

Single source of truth for what exists, what's building, and what's been cut.
**Every agent updates this file as part of the work it does.**

- Product overview: [`../../PRODUCT.md`](../../PRODUCT.md)
- Contributing: [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Component audit: [`../COMPONENT-AUDIT.md`](../COMPONENT-AUDIT.md)
- Deployment: [`../deployment/`](../deployment/)

**Dead links removed 2026-08-17:** `/AGENTS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
`docs/CONTEXT.md`, and `docs/DESIGN-SYSTEM.md` were linked from this file but are not present in
this repository — they were never carried across by a sync run. Remaining body references to them
are historical citations, not navigable links.

**Status values:** `planned` · `in-progress` · `blocked` · `done` · `cut`
**Last updated:** 2026-08-17 (public mirror pass). This repository is the open-source mirror of
the private `namos-sessions-webapp`; application code arrives here through periodic sync runs, so
this index tracks the features present *in this repo*, not every package planned upstream.

Since the previous entry: three code sync runs landed (PRs #14, #19, #21/#22) and the Cloudflare
CFP edge Worker was published (PR #24) after a source read showed the earlier blanket exclusion of
`worker/` was over-cautious — its only literal domains sit inside a CSP header already sent to
every visitor. Repository hygiene: the demo impersonation speaker picker was removed from the
portal (#12), the Communications page was split into Templates/Test/Activity tabs (#13), one-click
deploy support was added for Cloudflare/Netlify/Vercel/Railway/DigitalOcean (#10), the maintainer's
live custom domain was removed from the public `wrangler` config (#9), and a non-project contact
address was dropped from README/SUPPORT (#16). Feature-status corrections in the table below:
sponsor management, event workspace switching, and all three SEC-WEB security packages are now
`done` upstream and present in synced code. Rows 37-39 index three feature packages that were
already in `docs/features/` but had no entry.

Open in this repo: dependency bumps (#17, #20) and four contributor-friendly follow-ups — a
Windows setup note (#7), inline retry for failed speaker-document loads (#6), a dirty-profile
warning (#5), and document file-type validation beyond the picker (#4).

**Prior update (2026-08-13):** (fixed the shared dashboard shell navigation regression that duplicated the Dashboard section's destination and leaked Speaker Tracking into it; agenda scheduling #112 builder, accessible movement, continuous grid, track conflicts, toolbar operations, and focused coverage implemented with authenticated browser acceptance still pending at Clerk; speaker availability now uses the established Clockwork/ServiceHQ day-column timetable interaction; onboarding browser annotations recorded for the separate onboarding agent; confirmation delivery moved from a redirect-sensitive browser/serverless call into a durable scheduled Convex action that uses the event's encrypted Resend/SES integration and finalizes the pre-created comms log; provider-missing public CFP submission browser-verified through the success page and visible portal link; real delivery remains blocked because the accessible Resend account's only custom domain is failed and its DNS zone is not in the accessible Cloudflare account, while the Convex deployment belongs to a different dashboard identity and shell DNS policy prevented setting its delivery environment; task templates and automated onboarding complete, browser-verified; readiness operations browser-verified against live seeded data, including a fix so comms-delivery deep links land on and highlight the exact record instead of the generic activity list; organizer onboarding wizard browser-verified — a route-guard bug found during that verification, `/portal/*` incorrectly gated by the onboarding redirect, was fixed and retested; CFP conditional-field authoring and runtime regressions browser-verified, the CFP participant workflow widened and browser-verified at desktop and mobile widths, and CFP participant availability redesigned as responsive day rows without horizontal scrolling; organizer communication-template management added through the repository boundary; form-template gallery and both create-form entry points implemented and browser-verified end-to-end; public API planned as a post-demo platform feature, issue #73; Public Events API (#93) implemented, live-verified including the full auth round-trip, rebased onto latest `main`, and re-verified against the real production Convex deployment after reverting an unauthorized events-table field rename introduced during implementation; remaining requirements re-verified in real browsers against the seeded Convex app — speaker profile/headshot/slides/documents persisted across reload, ownership and organizer-route boundaries held, multi-round and bulk reviewer assignment fed visible scores, every Agenda view rendered the four seeded conflicts, and speaker-task completion updated tracking without refresh; fixed speaker-document discovery to use the speaker-scoped submission query and replaced its final native dropdown; refreshed measured production performance; performance improvements Phase 1 reactive read foundation landed with normalization parity coverage for all 31 read operations, and its own branch self-reported a browser-verified signed-out WebSocket rejection check — re-verify independently before relying on that claim; sponsor-management #104 implemented through the Convex, repository, task, routing, seed, and three-pane UI layers, with authenticated browser walkthrough still pending; public embeds and Accelevents integration restored to planned scope by Naya)

**Security planning update (2026-08-12):** Namos-plan packages added for SEC-WEB-001 through
SEC-WEB-003: public seeder containment, public-CFP abuse controls, and response headers.

**Agent-native planning update (2026-08-13):** a FULL Namos-plan package and issue #122 now
define an in-app, event-scoped Operations Agent with visible progress, clarification checkpoints,
source-linked readiness tools, and hash-bound approval before agent-attributed task creation. The
closed, unmerged external MCP spike in #66 is prior art only, not an implementation dependency.

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
| 4 | [speaker-portal](./speaker-portal/plan.md) | `in-progress` | 5-6h | #2 | never* | The signed-in Clerk account's verified email is the only identity boundary — no picker or other mechanism lets one account view another speaker's portal data; an unmatched account sees a "no speaker profile found" notice. Owned profiles, image-only headshots, slides, and supporting documents persist through scoped Convex storage flows. The speaker experience uses the shared dashboard shell with portal-specific navigation. **Browser-verified 2026-08-12:** profile edits, a PNG headshot, slides, and a supporting document all survived reload; owned submissions loaded while another speaker's edit URL and organizer routes were denied. The submissions toolbar now exposes **New submission**, backed by a server-filtered chooser for the event's open, unexpired public CFP forms. [`USER_JOURNEY.md`](./speaker-portal/USER_JOURNEY.md) now defines the authoritative UI-to-persistence QA path. Remaining journey gaps: enforce supported document types beyond the file picker, guard duplicate profile saves, warn before abandoning dirty profile edits, add inline document-load retry, and retain a repeatable configured/deployed browser run. |
| 4a | [submission-editing](./submission-editing/plan.md) | `done` | 3-4h | #2 | never* | Speaker-owned draft/pending/withdrawn proposals reopen against their original form; review, decision, and CFP-close locks are enforced server-side through Clerk verified-email ownership. Live seed verification confirmed canonical answer envelopes plus open/closed fixtures; lint, 131 tests, build, and Convex validation pass. |
| 5 | [abstracts-grid](./abstracts-grid/plan.md) | `in-progress` | 5-6h | #4 | **never** | Queue controls, persisted organizer-added abstracts, filtered CSV export, and browser-local column preferences are built; no 500-row proof yet |
| 6 | [evaluation-scoring](./evaluation-scoring/plan.md) | `in-progress` | 6-8h | #4 | 5 | Event-scoped plans and idempotent multi-round assignments drive the reviewer queue, and scored reviews feed the Abstracts rating. **Browser-verified 2026-08-12:** queue admission, two assignment rounds, tag bulk assignment, reviewer progress, and a changed score surfacing immediately in Abstracts all passed. The AI-review affordance remains a deliberate stub. |
| 7 | [portal-tasks](./portal-tasks/plan.md) | `in-progress` | 3-4h | #6 | never* | Speaker/admin task lists persist status changes; linked form submission completes the matching task. **Live-verified 2026-08-10**: 12 real tasks, correct status pills and source badges, interactive Start task. |
| 8 | [agenda-scheduling](./agenda-scheduling/plan.md) | `in-progress` | 6-8h | #5 | 7,8 | List/Day/Week/Track/Rooms/Conflicts use one fetched dataset and persisted availability-aware results. Issue #112 adds a submission-aware session builder/editor, continuous 15-minute room grid, drag plus accessible Move control, informational track overlaps, working sort/filter/export/print/duplicate-day controls, and persistence feedback. **Verification 2026-08-12:** typecheck, lint, 10 focused tests, and all 356 repository tests pass. The real browser reached Clerk but lacked an organizer session, so the full authenticated journey, reload persistence, and event switching remain unverified and status stays `in-progress`. |
| 9 | [speaker-availability](./speaker-availability/plan.md) | `in-progress` | 2h | — | 10 | Organizer availability grid, public participant collection, and selected demo-speaker portal editing persist availability. The researched scheduling-canvas editor uses date columns, click/drag range painting, whole-day shortcuts, conference hours by default, optional overnight hours, and compact exact-hour state cells. Legacy day-part records remain compatible. Clerk-backed speaker identity and live verification remain. |
| 10 | [comms-notifications](./comms-notifications/plan.md) *(decisions, reminders, `.ics`)* | `blocked` | 4-5h | #3 | 3,9 | Saved templates now drive branded decision/reminder sends; agenda co-speakers are resolved server-side; combined multi-submission decisions are supported; organizers review real recipients/content/calendar state inline before sending; failures are visible and retryable per recipient; every provider/calendar attempt is persisted; stable UID + incrementing sequence and Resend/SES attachments are implemented; dead unauthenticated legacy handlers are removed. Typecheck, lint, all 354 tests, and the production build pass. **Live blocker reproduced:** shared Convex rejects deployment because parallel sponsor-management rows contain `targetType: "sponsor"`/`sponsorId` but that schema is not on main. Real provider and Gmail/Apple/Outlook opening remain unverified. |
| 11 | [portal-forms](./portal-forms/plan.md) | `in-progress` | 3-4h | #8 | 6 | Admin forms use the shared field library; selected speakers submit linked forms, responses persist, and configured confirmations are provider-gated and logged. **Live-verified 2026-08-10**: real seeded form, list/edit/duplicate render correctly. |
| 12 | [dashboard](./dashboard/plan.md) | `done` | 2-3h | #6 | 2 | Dashboard is the concise Today overview with event-derived counts and agenda/review/speaker-attention nudges. The duplicated Speaker Tracking report was removed in favor of the operational Program workspace. |
| 13 | [public-embeds](./public-embeds/plan.md) | `planned` | 12-16h | #9 | restored | **Restored by Naya on 2026-08-12.** The historical `cut` decision (requirement #9 struck through) is reversed. Existing safe agenda/speaker feeds remain, but the feature now requires saved embed definitions, a discoverable CMS list/editor, five styled views, preview/code modes, enable/disable, filters, field options, and deployed iframe proof — see `docs/features/public-embeds/`. Tracked in [#119](https://github.com/nayamoss/namos-sessions-webapp/issues/119). |
| 14 | Seed data script | `in-progress` | deliverable | — | never | Re-runnable fixture completes the published event, CFP, portal task/form, queues, conflicts, availability, evaluation, and comms scenarios. Re-run three times on 2026-08-12 with stable event/form ids and stable totals (60 speakers, 500 submissions); Agenda continued to show exactly the four intended conflict examples. |
| 15 | [datagrid-pagination](./datagrid-pagination/plan.md) | `in-progress` | 1h | — | high | Shared client-side pagination is implemented for Abstracts, Agenda, and Communications; local tests pass, while 500-row browser proof awaits a configured Convex environment. |
| 16 | [tags-library](./tags-library/plan.md) | `done` | 3-4h | — | never | Event-scoped CRUD, cascading delete, Settings Library UI, and durable Abstracts assignment are code-complete. Live Convex CLI CRUD/assignment passed; browser verification remains Naya's gate. Personas remain below the cut line. |
| 17 | [speaker-operations](./speaker-operations/plan.md) | `done` | 6-8h | #6 | never* | Program > Speakers is the single roster workspace: organizers can add speakers manually, scan separate first/last/email fields in a sortable and configurable table, persist explicit confirmation, and create/complete speaker-scoped tasks in the inline detail pane. **Live-verified 2026-08-11** in the local Codex browser across desktop and mobile. |
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
| 29 | [sponsor-management](./sponsor-management/plan.md) | `done` | 8-10h | #104 | high | Convex-only sponsor tiers, records, multiple contacts, primary-contact enforcement, shared onboarding tasks/templates, and CFP fast-track routing are implemented. Sponsor nav/route gating, three-pane management UI, Tasks admin target support, form-builder sponsor routing, idempotent seed fixtures, focused tests, full typecheck/lint/build, and live Convex schema/seed validation pass. `USER_JOURNEY.md` now traces the exact organizer → public submitter → organizer flow, and sponsor detail exposes linked CFP responses with their routed status and an exact Abstracts handoff. Final authenticated browser walkthrough is pending because the available browser session reached Clerk sign-in and no signed-in Chrome connection was available. CRM pipeline/renewal/ROI reporting, public logo walls, and Airtable parity remain deliberately out of scope. |
| 30 | [event-workspace-switching](./event-workspace-switching/plan.md) | `done` | 8-10h | #105 | never | URL-slug event routing, indexed active-event resolution, sidebar switching, event landing/create/duplicate flows, event-scoped membership, organization and event team management, single-event entry routing, and the full 17-page `events[0]` sweep are implemented. The authoritative [user journey](./event-workspace-switching/USER_JOURNEY.md) covers owner, event-member, organization-team, duplication, failure-recovery, and persistence flows. Duplication copies forms/tracks/comms templates while remapping copied track routing and excluding instance data; new-event team copying is transactional. Typecheck, 355 tests, lint (warnings only), and production build pass. The full authenticated journey remains pending because the available browser reached Clerk sign-in and no connected signed-in Chrome session was available. |
| 31 | [portal-redirect-fixes](./portal-redirect-fixes/plan.md) | `in-progress` | 4-6h | #1, #2, #4 | never | P0 #108 fixes the public CFP → portal handoff and organizer abstract display. The documented [user journey](./portal-redirect-fixes/USER_JOURNEY.md) is the completion gate. Stable abstract-field mapping, visible conflicting-Clerk-session feedback, and focused regressions are implemented; clean-session and organizer browser flows remain required before this is done. |
| 32 | [accelevents-integration](./accelevents-integration/plan.md) | `planned` | 12-16h | #7 | restored | **Restored by Naya on 2026-08-12.** One-way accepted speaker + scheduled session sync only; credentialed Accelevents sandbox contract proof is the first hard gate. |
| 33 | [security-public-seed-boundary](./security-public-seed-boundary/plan.md) | `done` | 1-2h | security audit | never | SEC-WEB-001: make the privileged demo seeder internal-only while preserving operator CLI idempotency. |
| 34 | [security-public-cfp-abuse-controls](./security-public-cfp-abuse-controls/plan.md) | `done` | 1-2d | security audit | never | SEC-WEB-002: move public submission behind rate-limited, anti-bot-verified edge enforcement without breaking retries. |
| 35 | [security-response-headers](./security-response-headers/plan.md) | `done` | 4-8h | security audit | never | SEC-WEB-003: deploy and runtime-verify CSP and baseline browser security headers with an explicit embed policy. |
| 36 | [agent-native-operations](./agent-native-operations/plan.md) | `planned` | 40-60h | #122 | high | Event-scoped Operations Agent for readiness synthesis, inspectable durable runs, clarification, and exact task proposals with explicit hash-bound approval. No stubs or pre-baked agent runs/results: release verification must use the real runtime, tools, model, approval mutation, and task writes. Convex-only in v1; direct email sends, schedule writes, decisions, scoring, deletes, and configuration changes remain out of scope. |

| 37 | [evaluation-scorecards](./evaluation-scorecards/plan.md) | `planned` | 8-12h | #4 | — | A reviewer records exactly one number: `evaluations.score` is a bare optional number and `evaluation_plans.scoringScaleMax` is constrained to 5 or 10, so a program chair cannot say *what* is being scored. This package adds weighted multi-criterion scorecards. No tracking issue yet. |
| 38 | [oss-readiness](./oss-readiness/plan.md) | `done` | 4-8h | — | — | The release gate that produced this repository: a read-only audit of git history and working tree before the source went public. Two blockers, the rest should-fix; no runtime behavior touched. |
| 39 | [security-audit-2026-08-12](./security-audit-2026-08-12/README.md) | `done` | — | — | never | Tracker index for the cross-application security audit. All three web findings shipped upstream and are present in synced code — SEC-WEB-001 seeder internalization, SEC-WEB-002 public CFP abuse controls, SEC-WEB-003 response headers. See rows 33-35 for the plan packages. |

**Total estimate:** ~148-204h including the post-demo public API, restored public embeds + Accelevents
integration, and the agent-native operations foundation, against a deadline of Wed Aug 12, 10PM PT.

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
| 9 | ~~Embeddable mobile-friendly gallery + itinerary~~ | public-embeds | `planned` as owner-requested stretch scope despite the original strikethrough |

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
