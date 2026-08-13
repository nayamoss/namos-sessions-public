# Public CFP Submission

**Phase 2 · ~5-6h · HIGHEST SCRUTINY IN THE BUILD**

Screenshot: *Public CFP Page* (brief p.15) · Route: `/submit/:eventSlug/:formId` · **Public**

## Why this feature is the priority

swyx annotated this path twice: **"make sure this works"** on the auto-redirect + success
page, and **"must have"** on the confirmation email. It's also the first thing any judge will
click, and it's the one screen where he gave a live public URL. If one thing is polished, it
is this.

## Screen

**5-step stepper: Welcome! → Account → Submission → Participant → Review.**

> **Account is step 2, inside the flow** — not a post-submit redirect. Getting this ordering
> wrong changes the whole data model, so it's called out explicitly.

Banner above the content: *"Form submissions will be accepted until September 15 at 11:59 PM
PDT. Submission Limit: 3 submissions per user."* Then the rendered welcome message (rich text
authored in the builder — headings, bullet lists, links to speaker T&Cs / FAQs / tips, dates
and deadlines).

Real reference URL from the brief:
`https://appv2.sessionboard.com/submit/ai-engineer-sandbox-event/b7d4d7cd-…`

## Flow

1. **Welcome** — rendered `welcomeMessage`, deadline + limit banner. If past `closeDate`,
   show a closed state instead of the form.
2. **Account** — Clerk sign-up/sign-in prefilled by email. From here the draft is owned by a
   real user, which resolves the drafts question (see Open Questions).
3. **Submission** — render the abstract section from the form config, honoring `showIf`
   conditional logic and the **live cross-field character counter**.
4. **Participant** — repeatable participant blocks bounded by `participantRoles` min/max.
   Also where [speaker-availability](../speaker-availability/plan.md) is collected.
5. **Review** — read-only summary, then Submit.

**After submit:** success page renders `successPageMessage`; if `autoRedirectToPortal`, count
down 10s then redirect to `/portal`. **Always render the portal link as text too** — if the
redirect or the email fails, the path must still be walkable.

## Validation — beat Sessionboard here

He sarcastically noted *"looks like it doesn't even have full validation."* Enforce, client
**and** server:
- required fields, email format, per-field `maxChars`
- participant count within role min/max
- `submissionLimit` per user, `closeDate` cutoff
- **cross-field combined character limits with a live counter** (the differentiator)

Server-side re-validation is mandatory — the public mutation is unauthenticated at step 1.

## Tasks

1. `submitToForm` public repo method — creates `submissions`, upserts `speakers` by email
   (dedup), attaches availability. **Idempotent** (Airtable has no transactions).
2. Standalone page shell: no `AppLayout`, no `AuthGuard`, own minimal chrome
3. Stepper + per-step validation gating
4. Dynamic field renderer (shared with [portal-forms](../portal-forms/plan.md))
5. `showIf` conditional evaluation
6. Live cross-field counter component
7. Success page + countdown redirect
8. Closed / limit-reached / draft-resume states
9. **Route-level code split** — this page must not ship the admin bundle
10. Apply category routing in the public mutation; never expose organizer routing rules in the public config

## Verification

- [ ] Full submit works end-to-end in an incognito window, no prior session
- [ ] Confirmation email arrives (see [comms-notifications](../comms-notifications/plan.md))
- [ ] Auto-redirect lands on the portal with the submission visible
- [ ] With email deliberately broken, the success page still shows a usable portal link
- [ ] Cross-field counter updates live and blocks over-limit submission
- [ ] Past-close-date shows the closed state
- [ ] Lighthouse run on this page; number recorded for the README
- [x] Retried sponsor submission creates one routed submission and one reviewer assignment on live Convex

## Open question

**Drafts vs. the stepper.** "Allow multiple draft submissions" implies drafts before an
account, but Account is step 2. Proposed resolution: drafts are keyed to the account created
at step 2 — anything before that is unsaved client state. Needs confirming before build.

## Cut line

Cannot be cut. If time collapses, this plus the confirmation email plus the portal landing is
the minimum viable submission.
