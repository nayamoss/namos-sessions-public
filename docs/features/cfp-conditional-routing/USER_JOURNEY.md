# CFP Conditional Logic and Routing — User Journey

**Status:** Planned. This journey must be driven in a real browser before the feature is called
done; it is not a checklist to self-attest against.

---

## Journey A — Submitter meets a conditional form

**Persona:** a would-be speaker who has never seen this event before.
**Entry point:** `/submit/ai-engineer-sandbox-event/<formId>` — a public URL, no account.

| Step | Action | Expected |
|---|---|---|
| A1 | Load the page | Welcome message, section "Proposal", four visible fields: Session title, Session format, Abstract, Audience |
| A2 | Fill title and abstract | Character counters update; combined-limit warning respects the seeded 2,000-character cross-field limit |
| A3 | Open `Session format` and choose `Talk` | Field count unchanged — still four |
| A4 | Change `Session format` to `Workshop` | A fifth field, **Workshop length**, appears immediately; screen reader announces it; focus stays on the format select |
| A5 | Submit without answering Workshop length | Validation blocks with that field's own message |
| A6 | Change back to `Talk` | Workshop length disappears; the previously typed value is discarded and validation no longer blocks |
| A7 | Set `Workshop`, answer it, complete the speaker section, submit | Success page renders; confirmation email attempt is logged (`comms_log` row exists regardless of provider outcome) |

**Success state:** the submitter sees a form that adapts to their answer.
**Failure state:** the conditional field renders greyed out or always visible — that is a broken
implementation, not a styling choice.
**Recovery:** if the submit fails, the entered values are preserved and the error names the cause;
the submission is never silently lost (`submission_confirmation_requests` precedent,
`convex/schema.ts:661-673`).

## Journey B — Chair sees routing that already happened

**Persona:** program chair, first time reviewing the inbox.
**Entry point:** organizer landing page → "24 awaiting decision" → submission list.

| Step | Action | Expected |
|---|---|---|
| B1 | Sort or filter the list | Workshop-format submissions are visibly clustered in `Accept queue` |
| B2 | Open one | Detail panel shows the sponsor `Convex` attached and status `Accept queue` |
| B3 | Read the detail panel | A `Routed on arrival` block: *"Session format is Workshop → sponsor Convex, status Accept queue"* |
| B4 | Open a `Talk` submission | No `Routed on arrival` block at all — the section is absent, not an empty state |
| B5 | Open a `Panel` submission | Provenance names the reviewer-routing rule; the reviewer assignment exists in the evaluation surface |
| B6 | Delete the sponsor referenced by the rule, reload B2 | Provenance still renders, with "(sponsor no longer exists)"; nothing errors |

**Success state:** the chair can explain any routed submission without opening the database.

## Journey C — Chair authors a new rule

**Entry point:** organizer → Calls for papers → open the CFP → edit.

| Step | Action | Expected |
|---|---|---|
| C1 | Scroll to routing rules | Each existing rule shows a plain-language summary line |
| C2 | Add a rule: `Audience = Beginners` → assign tag `Intro track` | Summary line updates live as the selects change |
| C3 | Save | Rule normalized (`normalizeRoutingRules` trims and dedupes); form version unchanged |
| C4 | Submit a matching proposal through the public form | Tag applied on arrival; provenance names the new rule |
| C5 | Add a field condition: make a new field `Shown when Audience is Beginners` | Public preview reflects it without a reload |

**Failure and recovery:** saving a rule that references a field which no longer exists must fail
with a named error at save time, not silently persist a dead rule.

## Persistence checks

- The conditional answer is stored in `submissions.answers.fieldValues` under the field id and
  survives reload and speaker edit (`PortalSubmissionEdit` renders the same `showIf` contract).
- `routingAppliedRuleIds` survives an organizer status change — it records arrival, not current
  state, so a chair moving a submission out of `accept_queue` must not clear it.

## Cross-surface non-leak checks

| Surface | Must not show |
|---|---|
| Public CFP page | Any rule, rule name, or provenance |
| Public embeds / attendee site | Any rule, rule name, or provenance |
| Speaker portal (own submission) | Any rule, rule name, or provenance |
| Reviewer queue on a blinded plan | Provenance, and — as today — any speaker identity key |
</content>
