# Architecture patterns worth stealing

Actionable technical guidance for the Sessionboard-clone build. Each section ends with a
**Decision** line — what to actually do given a Wed Aug 12 deadline.

---

## 1. Multi-tenancy: org → event → submission scoping

The plan (§1) already uses `organizationId` + `eventId` on every table with a `by_org` index.
That's the right shape. Three refinements:

**1a. Scope on `eventId`, not `organizationId`, for every program query.**
An org runs multiple events, sometimes concurrently, sometimes annual editions of the same one.
Every listing query the user sees is "this event's submissions", never "this org's submissions".
Make `by_event` the primary index and `by_org` the fallback for CRM-ish cross-event views.
Sessionboard's separately-priced "org-level Speaker CRM" is precisely the cross-event view — you
get it free by keeping `speakers` org-scoped while everything else is event-scoped. Keep that
asymmetry deliberately; it's a feature, not an inconsistency.

**1b. Enforce the scope in one place, not in every function.**
Convex: keep the `requireOrgId(ctx.identity)` wrapper pattern from `convex/tasks.ts` (plan §3).
Airtable path: the tenant filter must be applied inside the Cloudflare Pages Function, derived from
the verified Clerk session — never from a client-supplied `orgId` parameter. Airtable has **no
server-side auth rules and no row-level security**; if the function trusts a body param, the whole
multi-tenant model is decorative.

**1c. Clerk Organizations map 1:1 to your `organizations` table.**
Use Clerk orgs for membership/roles (admin, reviewer, speaker) and mirror the org id. Reviewer
scoping — "this reviewer sees only Track X" — should live in your own
`evaluation_assignments` table, not in Clerk metadata; Pretalx does track-restricted reviewer
*teams* plus per-proposal assignment
([pretalx review docs](https://docs.pretalx.org/user/review/)), and you want both axes queryable.

> **Decision:** add `.index("by_event", [...])` as the primary index everywhere it's missing;
> derive tenant scope server-side only; keep `speakers` org-scoped on purpose.

---

## 2. Schedule / agenda conflict detection

### The math
Two half-open intervals `[s1,e1)` and `[s2,e2)` overlap iff `s1 < e2 && s2 < e1`. Plan §4 already
has this. Correct, and no library needed.

### The algorithm — don't do the O(n²) double loop
For a conference-sized program (hundreds of sessions, tens of rooms) O(n²) is genuinely fine, but
sweep-line is barely more code and reads better in a demo:

```
events = sessions.flatMap(s => [{t: s.start, d: +1, s}, {t: s.end, d: -1, s}])
sort by t, with -1 before +1 at equal t   // touching intervals must NOT conflict
walk, maintaining an active set; any +1 arriving while the active set is non-empty
is a conflict against every member of that set
```
Run one sweep **per resource key**: once per `roomId`, once per `speakerId`. Same function, different
grouping key. That's the whole thing.
Reference: [sweep line for interval problems](https://coderraj07.medium.com/mastering-the-line-sweep-algorithm-for-interval-problems-298c4dc562aa),
[interval scheduling](https://en.wikipedia.org/wiki/Interval_scheduling).

Interval trees are the right answer only when intervals arrive one-by-one and you must answer
"does this conflict?" online at scale. You don't. Skip them.

**Edge case that will bite:** sort `end` events before `start` events at the same timestamp, or
back-to-back sessions (10:00–11:00, 11:00–12:00) will report as conflicts. This is the #1 bug in
naive implementations.

### Which conflict classes to detect
Pretalx flags four ([schedule docs](https://docs.pretalx.org/user/schedule/)):
1. Same-room overlap ← plan has this
2. Speaker double-booked across rooms ← plan has this
3. Session scheduled **outside room availability** ← plan does NOT have this
4. Session scheduled **when a speaker is unavailable** ← plan does NOT have this

(3) and (4) require availability data, which the plan doesn't model at all. See §6 below — this is
the biggest gap found in this research.

Two cheap extras worth adding to the Conflicts tab, both pure functions over the same query:
- **Unscheduled accepted sessions** — accepted but no room/time. The plan's dashboard nudge line
  already hints at this ("1 accepted sessions still need a time slot").
- **Room capacity vs. expected demand** — if `submissions.capacity` exceeds `rooms.capacity`.
  One comparison, reads as thoughtful.

### Surfacing
Plan §4 Risk #1 is right: conflict detection is a pure function, not a UI concern. One
`detectConflicts(eventId)` returning `{ itemIdA, itemIdB, reason, severity }[]`, rendered as the
Conflicts tab and as a count badge on every other tab. Do not recompute per row.

### Schedule versioning — steal this from Pretalx
Pretalx keeps a private **WIP schedule** and publishes named **released versions**; releasing
snapshots the current state and forks a new WIP
([docs](https://docs.pretalx.org/user/schedule/)). Public consumers only ever see a release.

Full versioning is too much for the weekend. The **1-hour version** that captures 80% of the value:
a boolean `isPublished` on `agenda_items` (the plan already has it) plus a single
**"Publish schedule"** action that flips all confirmed items and, in the same action, emails only
the speakers whose `startTime`/`roomId` changed since the last publish. Store
`lastPublishedSnapshot` as a JSON blob on the event; diff against it. That gets you
"notify speakers of schedule changes" — the actual user-visible payoff of versioning — without a
version table.

> **Decision:** sweep-line grouped by resource key, end-before-start tie-break, four conflict
> classes (add availability once §6 lands), plus unscheduled-accepted. Fake versioning with a
> published snapshot diff.

---

## 3. Dynamic / conditional form builder

### JSON-schema-driven vs. custom field config
**Use a custom field config, not JSON Schema.** Reasons specific to this build:
- JSON Schema's conditional keywords (`if`/`then`/`allOf`, `dependentSchemas`) are notoriously
  verbose and painful to *generate from a visual builder* — you'd be writing a JSON Schema compiler
  as well as a form builder.
- `@rjsf/core` (react-jsonschema-form) brings its own widget system and fights shadcn/ui theming.
  Wrong trade for a UI-scored hackathon.
- Your field config is already specified in plan §1 (`submission_forms.fields[]`) and it maps
  cleanly to Airtable single-select types. Keep it.

**The pattern that works:** config array → runtime **zod** schema → `react-hook-form` +
shadcn `<Form>` components. This is the documented mainstream approach
([shadcn RHF docs](https://ui.shadcn.com/docs/forms/react-hook-form),
[building dynamic forms in React/Next.js, Smashing 2026](https://www.smashingmagazine.com/2026/03/building-dynamic-forms-react-next-js/),
[Wasp: advanced RHF + zod + shadcn](https://wasp.sh/blog/2025/01/22/advanced-react-hook-form-zod-shadcn)).

```ts
function buildSchema(fields: FieldConfig[], values: Record<string, unknown>) {
  const shape = Object.fromEntries(
    fields.filter(f => isVisible(f, values)).map(f => [f.id, baseZodFor(f)])
  );
  return z.object(shape).superRefine(applyCrossFieldLimits(fields));
}
```

Three things this gets right that matter here:
- **Conditional fields must be removed from the schema when hidden, not just hidden in the DOM** —
  otherwise a hidden required field blocks submit with an invisible error. The documented gotcha is
  exactly this: a field flipping optional↔required under a condition requires regenerating the
  schema ([Keyhole: deriving required fields from zod](https://keyholesoftware.com/inferring-fields-zod-with-react-hook-form/)).
  Rebuild the schema from `watch()`ed values; memoize on a hash of the dependency values.
- **`superRefine` is where cross-field character limits live.** It has access to the whole form
  value, which is exactly what a "combined length of several fields" rule needs
  ([Tim James: forms with zod + RHF](https://timjames.dev/blog/building-forms-with-zod-and-react-hook-form-2geg)).
  Pair it with a live `<CombinedCounter>` reading the same `watch()` values so counter and validator
  can't disagree.
- **Same schema builder runs server-side.** Import `buildSchema` in the Cloudflare Pages Function /
  Convex mutation and re-parse. One implementation, two enforcement points. This is the concrete
  "our validation is real, theirs isn't" proof — put a rejected `curl` in the README.

### Conditional model: copy Pretalx, not a generic rule engine
Pretalx scopes field visibility by **track and session type**, not by arbitrary field-value
predicates ([CfP docs](https://docs.pretalx.org/user/cfp/)). e.g. "workshop prerequisites appears
only for the Workshop session type." That covers most real cases, is trivial to build a UI for, and
is trivial to explain.

**Support both, cheaply:** keep the planned `showIf: { fieldId, equals }` (it's already in the
schema) and treat "track" / "session type" as just another field id. One code path, two mental
models.

### Shared field library
Plan §0a screen 10 correctly identified `field_definitions` as first-class. Build it as:
`{ id, orgId, label, type, constraints, locked }`, and have a form's `fields[]` store
`{ definitionId, order, required, showIf, overrides }`. The "search existing fields" popover in the
screenshots is then a query over `field_definitions`, and both form builders share it for free.
Note that Pretalx makes the same split at a different axis: **per-session vs per-speaker
questions** — add a `scope: "submission" | "participant"` discriminator to `field_definitions`, it
costs nothing and it's how the Participant Information step (§0a screen 3 step 4) should be driven
rather than hardcoding the five participant fields.

> **Decision:** custom config → runtime zod → RHF + shadcn. Rebuild schema on watched-value change.
> `superRefine` for cross-field limits. Share the builder with the server. Add
> `scope: submission|participant` to `field_definitions`.

---

## 4. Calendar invite delivery (`.ics` / RFC 5545)

Plan §4 Risk #2 (emailed `.ics`, no OAuth) is correct and is exactly what Pretalx does — it attaches
an iCal file to the schedule-release notification
([pretalx schedule docs](https://docs.pretalx.org/user/schedule/)). But the plan's "~50-100 lines,
easy" framing understates the client quirks. These are the ones that actually break:

**Required properties.** `UID` and `DTSTAMP` are the only strictly-required VEVENT properties;
`DTSTART` is required whenever no `METHOD` is set
([add-to-calendar-pro on ICS in email](https://add-to-calendar-pro.com/articles/ics-file-generation-for-email-marketing-453efa1d)).

**Invitation vs. "add to calendar" are different artifacts.**
- A real *invitation* (Outlook shows Accept/Decline) needs **`METHOD:REQUEST` inside the file**,
  an `ORGANIZER`, an `ATTENDEE` line containing the recipient's address, **and** the MIME
  Content-Type on the attachment set to `text/calendar; charset=utf-8; method=REQUEST`
  ([Postmark](https://postmarkapp.com/support/article/1101-how-do-i-send-calendar-invites-with-postmark),
  [Nodemailer calendar events](https://nodemailer.com/message/calendar-events)).
  Missing the Content-Type parameter is *the* reason Outlook shows a raw attachment while Gmail
  works fine — that's the entire content of
  [resend-node#198](https://github.com/resend/resend-node/issues/198).
- A plain "add to calendar" file omits `METHOD` and is simpler and more robust. **For a hackathon
  demo, ship this one.** Speakers accepting/declining their own session invitation is semantically
  weird anyway.

**Provider support is the real constraint — check before you commit.** Resend/SendGrid/Mailgun have
all had trouble letting you set an attachment's Content-Type parameter. SendGrid supports
`type: 'text/calendar; method=REQUEST'`; Nodemailer has a first-class `icalEvent` option;
Postmark documents the full ContentType string. If the existing wired provider can't set the
attachment content type, either send `METHOD`-less (works everywhere as a file) or switch to
Nodemailer-over-SMTP for this one send.

**Structure rules that silently break things:**
- **`VALARM` must come after all event properties.** New Outlook (post-2023 rewrite) enforces
  RFC 5545 strictly and will silently strip `LOCATION` if a VALARM appears early. Files that worked
  in Classic Outlook now fail.
- **Keep the message simple**: text + html + exactly one calendar part. Extra attachments or complex
  multipart/alternative structures make clients render the invite wrong or not at all (Nodemailer
  docs say this explicitly).
- **CRLF line endings, 75-octet line folding**, escape `,` `;` `\` in TEXT values.
- **Timezones:** either emit UTC (`DTSTART:20260912T170000Z`) or ship a correct `VTIMEZONE` block.
  A malformed VTIMEZONE produces hour-shifted events, and nobody notices until the speaker misses
  their slot. **For the weekend: emit UTC.** Your `agenda_items` times are already epoch millis.
- **Gmail inline rendering is genuinely unreliable** — "sometimes renders a nice inline card,
  sometimes doesn't; depends on file structure and sender reputation." Don't debug this; the
  attachment still works.
- **Attachments hurt deliverability.** Also worth offering a plain "Add to calendar" link.

**Reschedule semantics — this is the differentiator (see complaints Theme 7).**
Reuse the **same `UID`** per agenda item and increment **`SEQUENCE`** on every change. Clients then
*update* the existing event instead of creating a duplicate. Cancellation = same UID,
`STATUS:CANCELLED` + `METHOD:CANCEL`. Store `icsUid` and `icsSequence` on `agenda_items`. This is
~10 lines and it's the thing that makes the feature feel real rather than demo-grade.

**Library:** the [`ics`](https://www.npmjs.com/package/ics) npm package handles folding/escaping and
is small; it's fine. Hand-rolling is also fine at this size — but if you hand-roll, get CRLF and
75-octet folding right or Outlook will reject the file.

> **Decision:** `ics` package, UTC times, no `METHOD` for the default send, stable UID +
> incrementing SEQUENCE, single calendar part per email, VALARM last (or omitted). Verify the email
> provider can set the attachment Content-Type *before* attempting a `METHOD:REQUEST` invitation.

---

## 5. Airtable as an application backend

### Hard numbers ([official docs](https://support.airtable.com/docs/managing-api-call-limits-in-airtable))
| Limit | Value |
|---|---|
| Rate limit | **5 req/sec per base**, all plans |
| Token ceiling | 50 req/sec across all traffic for one PAT |
| Monthly cap — Free | **1,000 calls/month**, one-time 30-day grace, then blocked |
| Monthly cap — Team | 100,000/month, then throttled to 2 req/sec |
| Monthly cap — Business/Enterprise | none |
| 429 penalty | **wait 30 seconds** before retrying |
| Batch write | **10 records per request** (→ ~50 records/sec sustained) |
| List page size | **100 records per page**, cursor via `offset` |
| Records per base | 1,200 (Free) / 50,000 (Team & Pro tiers) |

**The Free-plan 1,000 calls/month is a demo-killer.** A judge clicking around a polling UI will
exhaust it in an afternoon. Confirm which plan the host team's base sits on, and if it's Free,
either get moved to their Team base or aggressively cache. This is the single most likely way the
submission breaks live in front of a judge.

### Gotchas that change your interface design
1. **No eager loading, no joins.** Linked-record fields return arrays of record IDs, not the linked
   records. Naive rendering of a submissions grid = N+1, which at 5 req/sec is fatal
   ([Airtable performance analysis](https://dev.to/hacubu/how-to-use-airtable-as-a-production-database-analyzing-airtable-performance-41e9)).
   **Fix:** fetch each table once per page load and join in memory. `listSubmissions` should do
   `GET submissions` + `GET speakers` + `GET forms` (3 calls, paginated) and stitch. Plan §0 already
   says "never N+1 per row" — this is the concrete implementation of that rule.
2. **Attachment URLs expire ~2 hours after first external access.**
   ([Airtable support](https://support.airtable.com/docs/airtable-attachment-url-behavior),
   [community](https://community.airtable.com/automations-8/how-to-solve-the-problem-of-airtable-attachment-urls-expiring-after-2-hours-45254)).
   **Never store or cache an Airtable attachment URL** — headshots and uploaded slides must be
   re-fetched from the API on each render, or mirrored to R2/Convex storage. A demo built on Friday
   will show broken headshots on Wednesday. This is a real risk to the speaker portal.
3. **Writes need `typecast: true`** to accept string values into single-select / linked-record
   fields (it creates missing select options rather than erroring). Without it, every enum write
   fails until the option exists.
4. **No transactions.** Plan §0 already flags this. `decideSubmission` must be idempotent — key the
   auto-created onboarding tasks on a deterministic `(submissionId, taskTemplateId)` and check
   existence before insert.
5. **No server-side auth, no row-level security.** All calls through the Cloudflare Pages Function,
   PAT in a Worker secret. Already in plan §0 — this is the non-negotiable one.
6. **`filterByFormula` is slow and easy to get wrong**, and large page sizes can time out
   independently of rate limits. At conference scale, fetch-all-and-filter-in-memory is both faster
   and simpler.
7. **No dev/prod separation.** Schema changes hit live data
   ([WeWeb community](https://community.weweb.io/t/development-vs-production-app-with-airtable-backend-is-it-possible-or-is-this-a-key-downside-of-airtable/8081)).
   Duplicate the base for demo vs. scratch before you start editing fields.

### Concrete batching strategy for the adapter
- One `AirtableClient` in the Worker with a **token-bucket limiter at 4 req/sec** (headroom under 5)
  and a queue. Every repo method goes through it. On 429, back off **30s**, not exponentially from
  100ms.
- **Cache per request, not per user.** A single Worker invocation serving `listSubmissions` should
  fetch each referenced table at most once.
- **Batch writes in chunks of 10.** Bulk decision application (accept 40 submissions) = 4 requests,
  not 40. Bulk apply is also the right UX (Pretalx's pending-state model, competitors.md).
- **Polling interval ≥ 30s**, and only on the currently visible page. Plan §0 puts liveness behind
  `useOutstandingTasks()` — keep that, and make the poll interval a single constant so you can dial
  it down if the base is on a Free plan.

> **Decision:** token bucket at 4/s in the Worker; fetch-whole-tables-and-join; `typecast: true` on
> every write; never persist attachment URLs; chunk writes at 10; 30s polling ceiling; verify the
> host base's plan tier before demo day.

---

## 6. The missing feature: speaker availability

Called out separately because it's the one table-stakes CFP feature the plan has no representation
of at all.

Pretalx collects **speaker availability during submission**, treats room and speaker availability
as **scheduling constraints**, greys out unavailable windows in the editor, and uses the
**intersection** of availabilities for multi-speaker sessions
([schedule docs](https://docs.pretalx.org/user/schedule/), [CfP docs](https://docs.pretalx.org/user/cfp/)).

Every conference organizer hits this within an hour of scheduling: a speaker can only be there
Tuesday afternoon. Without it, the Conflicts tab detects two of the four real conflict classes and
the agenda is scheduled against wishful thinking.

**Minimum viable version (~2 hours):**
```ts
availabilities: defineTable({
  organizationId, eventId,
  subjectType: v.union(v.literal("speaker"), v.literal("room")),
  subjectId: v.string(),          // speakerId or roomId
  start: v.number(), end: v.number(),
})
  .index("by_event", ["eventId"])
  .index("by_subject", ["subjectType", "subjectId"]),
```
- Collect on the public CFP Participant step as day-part checkboxes (Day 1 AM/PM, Day 2 AM/PM),
  not a calendar widget. Two columns of checkboxes, done.
- Editable in the speaker portal Profile screen (fits the "update your own data" annotation).
- Feed into `detectConflicts` as reason `"speaker_unavailable"` / `"outside_room_availability"`.
- Grey out unavailable cells in the Rooms grid view if that view exists.

If time is short, ship *collection + the conflict rule* and skip the visual greying. The conflict
row in the Conflicts tab is the demo-able part.
