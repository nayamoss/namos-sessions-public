# Kill My SaaS Brief — Implementation Order, Status, and Handoff

**Last Updated:** 2026-08-17
**Issues:** #249 seed · #250 dashboard · #251 speaker docs · #252 portal wiki · #253 review rounds · #254 comms · #255 routing provenance · #256 Accelevents · #257 browser verification
**State:** PLANNING COMPLETE, 2026-08-20. No code written, no branch, no commit, no issue. All six open decisions resolved (§3). Next action is Phase 0 and needs no further input.

---

## 1. Prioritized implementation order

Ordered by dependency first, judge-visible value second. Phases 0–2 are the ones that move the
demo from "has the machinery" to "proves the machinery"; they are cheap relative to their effect.

### Phase 0 — Establish live evidence (blocking, do first)

Nothing below can be honestly reported until the `Live/browser evidence` column in
`design.md` is filled in. Every row currently reads `NOT VERIFIED`.

0.1 Run the app against a Convex deployment with the demo seed applied (`npm run seed:demo`).
0.2 Walk all nine requirements in a browser and record, per row: observed / not observed / broken.
0.3 Specifically measure the reactive-subscription defect documented at
    `src/pages/dashboard/DashboardHome.tsx:388-397` and issues #211/#217. If subscriptions still
    stall, "real-time dashboard" (requirement 6) is `BLOCKED`, not `PARTIAL`, and that changes the
    scope of Phase 2.
0.4 Update the matrix. **Do not proceed to Phase 3+ before this is done** — the Accelevents build
    is the most expensive item here and must not start while the cheap gaps are unmeasured.

**Deliverable:** a filled matrix. **Owner decision:** none.

### Phase 1 — Seed the demo into a judgeable state (`convex/seed.ts`)

Highest value per line of code in the entire program. One file, no schema change, no new surface.
Every item below turns an already-built, already-tested capability from invisible into obvious.

| # | Change | Proves brief requirement |
|---|---|---|
| 1.1 | Add a `showIf` conditional field to the seeded CFP (e.g. `Workshop length` shown only when `Session format == Workshop`) | 1 |
| 1.2 | Write a share of seeded submissions with `Session format: "Workshop"` so the existing routing rule actually fires | 1 |
| 1.3 | Add a second routing rule using `reviewerUserIds` | 1 |
| 1.4 | Seed speaker headshots and `speaker_documents` rows (slides + supporting doc) | 2, 9 |
| 1.5 | Seed `calendar_invite` `comms_log` rows and 3–4 templates covering every kind | 3 |
| 1.6 | Change the seeded evaluation plan to `rounds: 2` with weighted `criteria[]`; add a second, `anonymized: true` plan; assign reviewers across both rounds | 4 |
| 1.7 | Expand seeded agenda from 3 items to a populated multi-day, multi-room, multi-track schedule (keeping the deliberate conflict pair) | 5 |
| 1.8 | Reduce the judge-facing submission count to a comprehensible number, or partition the 500-row pagination fixture onto a separate seeded event | 6 |
| 1.9 | Enable the seeded `speaker_gallery` embed and add a `schedule_itinerary` embed | 9 |

**Deliverable:** a demo event where eight of nine requirements are visible without new features.
**Decided (D-1, 2026-08-20):** reduce to ~40 submissions; 500-row fixture moves to the draft event.

### Phase 2 — Demo-first organizer landing page

Depends on Phase 0.3. This is the single change that most closes the gap against Greenroom.
Scope: a program-state header above the composer, every figure linking to its owning record list,
`Readiness` promoted into quick access. The agent stays.

**Deliverable:** `demo-first-organizer-experience/`. **Proves:** requirement 6.

### Phase 3 — Organizer visibility into speaker documents

Small, real, and currently a genuine hole: no organizer can see a speaker's uploaded files. Also
makes `speaker_documents.submissionId` optional so an invited speaker without a submission can
upload. Server guard widening only on read paths.

**Deliverable:** part of `speaker-portal-readiness/`. **Proves:** requirement 2, feeds 6.

### Phase 4 — Portal resource/wiki pages

Wholly new but self-contained: one table, one Convex module, one shared sanitizer, one portal
route, one organizer admin route. The only novel risk is the embed allowlist policy.

**Deliverable:** `portal-resource-pages/`. **Proves:** requirement 8.
**Decided (D-3, 2026-08-20):** fixed host allowlist, exact match, https only.

### Phase 5 — Review rounds surfacing and the AI-assist decision

UI-only for rounds (1–5 in the select, a round-advance action). The AI-assist question is a
go/no-go, not a build-by-default.

**Deliverable:** `review-rounds-scoring/`. **Proves:** requirement 4.
**Decided (D-2, 2026-08-20):** no AI assist; remove the dead flag. Rounds work only.

### Phase 6 — Scheduled reminders and comms recovery

Adds the first cron in the codebase plus a retry path for failed `comms_log` rows. Deliberately
after Phase 1 because Phase 1.5 already makes communications *visible*; this makes them *automatic*.

**Deliverable:** `speaker-communications-delivery/`. **Proves:** requirement 3.

### Phase 7 — Accelevents one-way export

Last, and largest. Reconcile the existing plan first (its auth model is wrong for this codebase),
then build. Not complete without a real disposable-event run.

**Deliverable:** `accelevents-integration/` reconciliation + build. **Proves:** requirement 7.
**Decided (D-4, 2026-08-20):** build the surface; report PARTIAL until a real run proves it.

### Phase 8 — Mobile validation and the judge walkthrough

Recorded device-width runs of the gallery, itinerary, portal, and public CFP; then the
requirement-by-requirement walkthrough document that ships with the entry.

**Deliverable:** `public-embeds/` addendum + `kill-my-saas-brief/USER_JOURNEY.md`.
**Proves:** requirement 9, and the entry as a whole.

---

## 2. Requirement status table

Status reflects **source inspection only**, as of 2026-08-17. Live evidence is unfilled for every
row, which is why no row can currently be reported as a verified PASS.

| # | Requirement | Status | Basis |
|---|---|---|---|
| 1 | CFP conditional logic + category routing | **PARTIAL** | Implemented and unit-tested; zero conditional fields and zero fired routing rules in the seeded demo |
| 2 | Speaker portal — bio, headshot, slides, docs | **PARTIAL** | Speaker side complete; organizers cannot see uploaded documents at all; documents require a submission; nothing seeded |
| 3 | Templated comms, reminders, calendar invites | **PARTIAL** | Templates, ICS generation, encrypted providers and append-only logging all present; no scheduler, no retry path, no seeded calendar invites |
| 4 | Evaluation, scoring, multiple rounds, optional AI | **PARTIAL** | Rounds/rubrics/blind review all built and tested; UI caps rounds at 2; seeded plan uses none of it; no round-advance workflow; AI flag is a dead stub |
| 5 | Drag-and-drop agenda, conflicts, views | **PASS (source)** | All five brief views plus month and conflicts; HTML5 DnD with a keyboard fallback; four conflict reasons; publish gated on blocking conflicts; audited. Demo underpopulated |
| 6 | Real-time organizer dashboard | **PARTIAL** | Derivations and deep links exist; they live in an auto-collapsing rail behind an agent composer; "real-time" unproven given the known subscription defect |
| 7 | Accelevents one-way export | **MISSING** | Zero source. Existing plan needs reconciling — it gates on a non-existent `EVENT_ADMIN_USER_IDS` allowlist |
| 8 | Portal resource/wiki pages with safe HTML | **MISSING** | No table, no route, no UI. DOMPurify, TipTap and `RichText` exist as building blocks |
| 9 | Mobile-friendly public gallery + itinerary | **PARTIAL** | Views, responsive renderer, public URL, iframe snippet and CSP all present; seeded gallery is disabled, no itinerary seeded, no headshots, no device-width evidence |

Summary: **0 verified PASS · 1 source-PASS · 6 PARTIAL · 2 MISSING · 0 BLOCKED**
(Requirement 6 may become BLOCKED after Phase 0.3.)

---

## 3. Decisions — RESOLVED 2026-08-20

Naya declined to arbitrate these individually, so the recommended option is taken as the decision
in each case. Any of them can be overridden later; none of them now blocks implementation.

**D-1 — Demo scale. DECIDED: reduce.**
Primary demo event goes to ~40 submissions / 20 speakers; the 500-row pagination fixture moves to
the seeded `namos-sessions-draft` event so `datagrid-pagination` coverage is kept. Original note:
The seed writes 500 submissions and 60 speakers. That is a pagination fixture, not a demo; a judge
cannot read it. Recommendation: keep the primary demo event at roughly 40 submissions / 20 speakers
and move the 500-row fixture to the existing `namos-sessions-draft` seeded event so the
`datagrid-pagination` coverage is not lost. Needs your call because it changes what "the demo
event" means for every other doc and screenshot.

**D-2 — AI assist. DECIDED: option (a), remove the dead flag.**
Review stays human-only and is described that way. `review-rounds-scoring/plan.md` T5 Branch A
applies; Branch B and `evaluation_ai_suggestions` are not built. Revisit only if Phases 0-4 land
early. Original note:
`evaluation_plans.aiAssistEnabled` is stored and read by nothing. Three options: (a) delete the
flag and state plainly that review is human-only; (b) keep it, surfaced as a disabled "coming soon"
control; (c) build an optional per-submission suggestion, clearly labelled, never written to
`evaluations` without an explicit human accept. Recommendation: **(c) only if Phase 0–4 land
early**, otherwise (a). The brief says AI must not displace the human workflow; adding it for
checkbox coverage is the failure mode to avoid.

**D-3 — Resource-page embed allowlist. DECIDED: fixed host allowlist.**
`PORTAL_EMBED_ALLOWED_HOSTS` as written in `portal-resource-pages/design.md`: youtube-nocookie.com,
youtube.com, player.vimeo.com, docs.google.com, loom.com. Exact host match, https only, code-defined,
not user-configurable. Original note:
"Safe HTML embed support" means deciding which iframe hosts are permitted. Recommendation: an
explicit host allowlist covering YouTube, Vimeo, Google Slides/Docs preview, and Loom, with
everything else stripped — no user-configurable host list in v1. Needs your call because widening
it later is easy and narrowing it later breaks published pages.

**D-4 — Accelevents proof credentials. DECIDED: pending credentials; report PARTIAL until proven.**
The gate is a real disposable Accelevents event with real credentials. You need to either provide
them or accept that requirement 7 ships as `PARTIAL — integration surface built, remote contract
unverified`. Per the brief's own observation about the competitor, an unverified surface must not
be reported as complete.

**D-5 — Landing-page change scope. DECIDED: header inside DashboardHome only.**
Planning rule 10 says not to change shared layout or styling unless a required flow needs it.
Requirement 6 needs it. Recommendation: add a program-state header inside `DashboardHome` only —
no change to `AppLayout`, the sidebar, card surfaces, or the design system. Confirm you agree that
this is the one permitted exception.

**D-6 — Accelevents reconciliation. DECIDED: amend, do not replace. Already done.**
The existing four-document package is good work whose auth model no longer matches the codebase.
Recommendation: keep the documents, add a dated reconciliation document, and amend the specific
contradicted sections rather than rewriting. Confirm you would rather amend than replace.

---

## 4. Handoff — DO NOT IMPLEMENT YET

This package is planning output only. As of this document:

- No code has been written or modified. `git status --short --branch` was clean at the start of this
  pass and only files under `docs/features/` have been added since.
- No branch has been created, no commit made, no push performed, no deployment triggered.
- No GitHub issue has been created. Issue creation is explicitly deferred; when it happens it goes
  through `/namos-plan`, with the standard three labels (type + impact + `status:triage`).
- No schema change has been applied to any Convex deployment.
- No secret has been added to `.env.example`; the names proposed in the feature packages are
  proposals, not entries.

**The next action is Phase 0**, which is read-only browser verification against a seeded
deployment. It requires no code change and produces the evidence every other phase depends on.

**Decisions D-1 through D-6 are resolved** (see §3, 2026-08-20). Nothing is blocked. Phase 0 is the
next action and needs no further input.
</content>
