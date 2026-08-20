# Demo-First Organizer Experience — User Journey

**Status:** Planned. The success criterion here is measured in seconds, so this journey must be
walked with a timer, not read.

---

## Journey A — First fifteen seconds

**Persona:** a judge who has never seen Namos, signed in as an organizer of the seeded event.
**Entry point:** `/events/ai-engineer-sandbox-event/dashboard`.

| Step | Action | Expected |
|---|---|---|
| A1 | Page loads | Figure skeletons appear immediately at the correct height — no layout shift when values arrive |
| A2 | Values resolve | Four groups: submissions, review, schedule, speakers |
| A3 | Read the header aloud | Four true statements about this event's condition, e.g. *"38 submissions, 24 awaiting decision. 60 of 84 reviews complete, 2 reviewers behind. 11 of 14 accepted sessions scheduled, 1 blocking conflict. 43 outstanding speaker tasks, 6 overdue."* |
| A4 | Note the "as of" line | A timestamp, not a claim of live-ness |
| A5 | Look below | The agent composer, still present and usable |
| A6 | Look right | The rail, still present, now secondary |

**Success state:** a stranger can describe the event's state in under fifteen seconds.
**Failure state:** the current behaviour — "Good morning / What should we work on?" and nothing
else.

## Journey B — Every number is a claim you can check

| Step | Click | Lands on | Verified |
|---|---|---|---|
| B1 | `38 submissions` | `/program/abstracts` unfiltered | Count matches |
| B2 | `24 awaiting decision` | `/program/abstracts?status=awaiting` | List length matches; statuses are pending / accept_queue / maybe / decline_queue |
| B3 | `60 / 84 reviews complete` | `/program/evaluation` | Assignment total matches 84 across all rounds |
| B4 | `2 reviewers behind` | `/program/evaluation?view=progress` | Exactly two reviewers below the bar |
| B5 | `11 / 14 accepted scheduled` | `/program/agenda` | 11 accepted submissions have agenda items |
| B6 | `1 blocking conflict` | `/program/agenda?view=conflicts` | Exactly one room or speaker overlap; `Publish` refuses |
| B7 | `43 outstanding tasks` | `/portals/tasks` | Count matches |
| B8 | `6 overdue` | `/portals/tasks?view=overdue` | Six tasks past due and not completed |
| B9 | `5 incomplete profiles` | `/program/speakers?view=profile-incomplete` | Five speakers missing a bio or headshot |

**Every filter must apply on load**, not after an interaction. A link that lands on an unfiltered
page and expects the judge to filter has failed this journey.

## Journey C — The numbers are honest

| Step | Action | Expected |
|---|---|---|
| C1 | Load with a slow or throttled connection | Unresolved figures show `—` and announce "not yet known". **Never** `0` |
| C2 | Let a resolved figure genuinely be zero | Renders `0`, visually distinct from `—` |
| C3 | Leave the page open past the stale threshold | `Last confirmed 14:07 · refresh` |
| C4 | Click refresh | Figures re-resolve; the timestamp updates |
| C5 | Complete a task in a second tab, return | Either the figure updates automatically, or the stale indicator appears. **Record which** |
| C6 | Interrupt the connection mid-session | Figures hold their last confirmed values with the stale indicator; they do not drop to zero |

C1 and C6 exist because collapsing "unknown" into "empty" once made an event with 529 submissions
render "No submissions yet" (`DashboardHome.tsx:209-215`). That regression must not return through
a new component.

## Journey D — First-run event

**Persona:** an organizer who just created an event.

| Step | Action | Expected |
|---|---|---|
| D1 | Open the dashboard | No wall of zeroes. The three setup steps: Create a CFP → Manage submissions → Judge submissions |
| D2 | Follow "Create a CFP" | `/program/forms?new=true` |
| D3 | Publish a CFP, return | The header replaces the setup steps with real figures |

## Journey E — Nothing was taken away

| Step | Action | Expected |
|---|---|---|
| E1 | Type in the composer and send | Agent run starts; timeline renders |
| E2 | Press the dictation button | Records; transcript appends to the textarea |
| E3 | Press `Alt+V` | Voice panel toggles |
| E4 | Press the right-panel shortcut | Rail toggles |
| E5 | Open run history | Previous runs listed and selectable |
| E6 | Collapse a rail section, reload | Preference remembered |
| E7 | Open quick access | Now includes `Readiness` |

**Failure state:** any regression here. This change adds a header; it removes nothing.

## Journey F — Small screens

| Step | Viewport | Expected |
|---|---|---|
| F1 | 1280px | Four groups in one row |
| F2 | 1024px | Header intact; the rail auto-collapses as it does today, and that no longer hides program state |
| F3 | 768px | Groups stack vertically; no horizontal scroll; header still not collapsible |
| F4 | 390px | Readable and tappable; figure links have adequate hit targets |

## Journey G — Authorization

| Attempt | Expected |
|---|---|
| Reviewer opens the dashboard | Aggregate counts visible (they reveal nothing a reviewer cannot already see); organizer-only pages behind the links still enforce their own guards |
| Non-member requests `dashboard.programState` | Rejected |
| Rollup payload inspected | Counts only — no submission titles, speaker names, or email addresses |
</content>
