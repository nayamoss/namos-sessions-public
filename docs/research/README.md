# Sessionboard clone — research

Research for the **Kill My SaaS 1** submission (@swyx / Latent Space, $10k, due Wed Aug 12 2026
10PM PT). Scope: the **program** side of Sessionboard only.

Companion to — and deliberately not a rewrite of — the implementation plan at
`../sessionboard-clone/docs/features/sessionboard-clone/plan.md`. Section references below
(§0, §0a, §1, §2, §4) point into that plan.

| File | What's in it |
|---|---|
| `competitors.md` | 11 products, pricing where published, Pretalx as the OSS reference implementation |
| `customer-complaints.md` | Pain points by theme, sourced, each with a "can we beat this in a weekend" verdict |
| `architecture-patterns.md` | Multi-tenancy, conflict detection, form builder, `.ics`, Airtable-as-backend |

---

## Top 10 findings

**1. There is no public complaint corpus for Sessionboard.** Capterra: **0 reviews**. No substantive
G2 page. No r/eventprofs threads. swyx's two claims — slow, weak validation — are the only direct
evidence and cannot be corroborated or refuted publicly. → Don't write "users report Sessionboard
is slow" anywhere. Write "the host reports," then **measure and show it**.

**2. Sessionboard's pricing page is currently broken.** All three tiers — Professional, Enterprise,
*and* Tailored — render **"$249 per month"** ([verified 2026-08-08](https://www.sessionboard.com/pricing)).
Every CTA is "Request a Demo." A pricing page that shows the same placeholder for a custom
white-label tier is a fair, verifiable one-liner for the README.

**3. The $40k figure is not publicly derivable — but the mechanism is.** Sessionboard bills per
**accepted speaker** (not per submission), prices org-level Speaker CRM **separately**, and gates
SSO / custom email domain / custom portal styling behind Enterprise. Frame it that way. Also note
what the $40k buys that we're *not* building: sponsor/exhibitor ops, SMS, doc generation, SSO,
white-labeling, 15+ integrations.

**4. Pretalx's docs are the best available spec for this domain.** Apache-2.0, Django, 9 years of
real organizer requirements written down. [docs.pretalx.org](https://docs.pretalx.org/) — read
`/user/cfp/`, `/user/review/`, `/user/schedule/`. Several of its models are strictly better than
what's in plan §1 and cost hours, not days, to adopt.

**5. Speaker availability is the missing table-stakes feature.** Pretalx collects it **at submission
time**, treats it as a hard scheduling constraint, and uses the *intersection* for multi-speaker
sessions. The plan has no representation of it. Without it the Conflicts tab catches 2 of the 4
real conflict classes. ~2 hours to add. This is the #1 "an organizer would immediately notice"
gap found.

**6. The category's deepest structural complaint is speaker-vs-submission.** From the best public
CFP teardown ([Paper Cuts on PaperCall](https://www.westerndevs.com/conference/services/Paper-Cuts-My-Review-Of-PaperCall/)):
communication is tied to talks, not people; a speaker with 3 submissions and mixed outcomes gets 3
disconnected emails; organizers can't search a speaker to see what else they proposed. Two small
additions beat every competitor here.

**7. Emailed `.ics` is validated — but the plan understates the quirks.** Pretalx does exactly this
(iCal attached to schedule-change notifications), so Risk #2's approach is right. But: the
attachment MIME type must carry `method=REQUEST` for Outlook to treat it as an invitation (this is
[resend-node#198](https://github.com/resend/resend-node/issues/198) in its entirety); `VALARM` must
come *after* event properties or New Outlook silently strips `LOCATION`; a bad `VTIMEZONE` shifts
everything by hours. **Ship UTC times and no `METHOD`** — simplest thing that works everywhere.

**8. Airtable's Free-plan cap is 1,000 API calls/month and it will kill the demo.** 5 req/sec per
base is the known limit; the *monthly* cap is the sleeper. Team = 100k/month then throttled to 2/s.
Confirm which plan the host team's base is on before demo day.

**9. Airtable attachment URLs expire ~2 hours after first external access.** Never store or cache
one. Speaker headshots and uploaded slides must be re-fetched from the API on render, or mirrored to
R2. A portal built Friday shows broken images Wednesday.

**10. Sweep-line beats the double loop, and the tie-break is where bugs live.** Group by resource
key (room, then speaker), sort events, process `end` before `start` at equal timestamps — otherwise
back-to-back sessions (10–11, 11–12) false-positive as conflicts. That single ordering rule is the
most common implementation bug in this feature.

---

## What this means for plan.md

Concrete, ordered by score-per-hour. Nothing here relitigates the stack, the two-backend adapter,
or the cut list.

### Add (small, high payoff)

**A1 — Speaker availability. §1 schema, §0a screen 3 step 4, §5 `detectConflicts`.**
New `availabilities` table (`subjectType: speaker|room`, `subjectId`, `start`, `end`). Collect on
the public CFP Participant step as day-part **checkboxes** (Day 1 AM/PM…), not a calendar widget.
Editable in the portal Profile screen — fits the "update your own bio data" annotation. Two new
conflict reasons: `speaker_unavailable`, `outside_room_availability`. ~2 hrs. Schema in
`architecture-patterns.md` §6.

**A2 — Per-speaker consolidated decision email. §2 Phase 3 + Phase 6.**
Group pending decisions by speaker and send **one** email covering all of that speaker's
submissions. Every competitor gets this wrong. ~30 lines on the comms action.

**A3 — Speaker detail view. §2 Phase 2.**
One route showing a speaker + all their submissions + statuses + outstanding tasks, linked from any
submission row. Directly answers the loudest structural complaint in the category.

**A4 — Reschedule `.ics` with stable UID + incrementing SEQUENCE. §4 Risk #2.**
Store `icsUid` and `icsSequence` on `agenda_items`. Same UID + `SEQUENCE+1` makes clients *update*
rather than duplicate. `STATUS:CANCELLED` + `METHOD:CANCEL` for removals. ~10 lines, huge perceived
polish, and it's the feature speakers actually thank you for.

**A5 — Unconditional export. §0a screen 7 (`... Options`).**
Export from **every** tab including Drafts, with no status change required and no gating. This
directly quotes a named competitor complaint. Also serves as the anti-lock-in argument.

**A6 — `scope: "submission" | "participant"` on `field_definitions`. §0a correction 4.**
Pretalx splits questions into per-session and per-speaker. Adding the discriminator lets the
Participant Information step (screen 3 step 4) be data-driven instead of hardcoding five fields —
same builder, zero extra UI.

### Change (corrections to what's already planned)

**C1 — `submissions.status` union. §1 vs §0a correction 1.**
The two disagree: §1 still has `draft|submitted|under_review|accepted|rejected|waitlisted`, while
§0a correction 1 (correctly) replaces it with
`draft|pending|accept_queue|accepted|decline_queue|declined|withdrawn`. **§1's block was never
updated.** Fix it in §1 before Phase 0 — every index, tab, and filter derives from it. Pretalx
independently arrived at the same "pending state, apply in bulk" model, so this is the right one.

**C2 — Primary index should be `by_event`, not `by_org`. §1.**
Every user-facing program query is event-scoped, never org-scoped. Keep `speakers` org-scoped on
purpose — that asymmetry *is* Sessionboard's separately-priced cross-event Speaker CRM, free.

**C3 — Conditional logic: scope by track/session-type, not just field-value. §1 `showIf`.**
Pretalx scopes visibility by track and session type, which covers most real cases and is far easier
to build a UI for. Keep the planned `showIf: {fieldId, equals}` and treat track/type as field ids —
one code path, two mental models.

**C4 — Per-session-type close dates, not one global close date. §0a screen 3 step 6.**
Pretalx supports a global CfP deadline *plus* per-session-type overrides, plus fields that become
required after a date, plus access codes that extend the deadline for invited speakers. The last
one is how keynote invites work inside a CFP tool. If only one of these fits: **access codes**, as a
`submission_forms.accessCodes[]` array — it's how an organizer says "submit after the deadline" to
one person without reopening the form.

**C5 — Airtable adapter specifics. §0.**
Token bucket at **4 req/sec** (headroom under 5) with a queue in the Worker; **30-second** backoff
on 429, not exponential-from-100ms; `typecast: true` on every write or enum/linked writes fail;
chunk batch writes at **10**; fetch whole tables once per request and join in memory rather than
`filterByFormula`; **never persist attachment URLs**; polling ceiling ≥30s and only for the visible
page. Details in `architecture-patterns.md` §5.

**C6 — `.ics` specifics. §4 Risk #2.**
Emit UTC (times are already epoch millis), omit `METHOD` for the default send, one calendar part per
email and no other attachments, `VALARM` last or omitted, CRLF + 75-octet folding. Only attempt a
true `METHOD:REQUEST` invitation if the wired email provider can set the attachment
Content-Type parameter — verify that first.

**C7 — Fake schedule versioning with a published snapshot. §5 Phase 5.**
Full WIP-vs-released versioning is too much. Store `lastPublishedSnapshot` (JSON) on the event, and
have "Publish schedule" diff against it to email only speakers whose slot actually moved. ~1 hour,
gets the entire user-visible payoff of versioning.

### Sharpen (the validation story — this is the win condition)

**S1 — Share one zod schema builder between client and server. §2 Phase 1.**
`buildSchema(fields, values)` runs in the browser *and* in the Cloudflare Function / Convex
mutation. Put a rejected `curl` in the README. This is the concrete, checkable proof of "their
validation is weak, ours isn't" — an assertion is worth nothing here, a reproducible artifact is.

**S2 — Hidden conditional fields must leave the schema, not just the DOM.**
A hidden-but-required field blocks submit with an invisible error. Rebuild the schema from
`watch()`ed values, memoized on a dependency hash. This is *the* documented failure mode of dynamic
RHF + zod forms.

**S3 — Draft autosave + unsaved-changes guard on the public CFP form.**
Losing a long abstract is the universal CFP horror story. Cheap, and it demos in five seconds.

**S4 — Cross-field counter and validator must read the same `watch()` values.**
`superRefine` for the rule, one `<CombinedCounter>` component for the display. If they diverge,
the differentiating feature becomes the embarrassing bug.

**S5 — Seed ~500 submissions and put timing numbers in the demo.**
Grid render and public-form time-to-interactive. swyx said Sessionboard is slow; a number is
evidence, "it's fast" is a claim. This is the cheapest credibility purchase available.

### Explicitly do not add

- Full JSON Schema / `@rjsf` form engine — verbose conditionals, fights shadcn theming, and you'd
  be writing a schema compiler behind the visual builder.
- Interval trees — sweep-line is correct at conference scale and far less code.
- Real Google Calendar / Microsoft Graph OAuth — already correctly ruled out in §4.
- Sponsor/exhibitor/CRM/SMS/doc-generation — out of scope; name them in the README as what the $40k
  buys that this doesn't, which is more credible than pretending parity.
