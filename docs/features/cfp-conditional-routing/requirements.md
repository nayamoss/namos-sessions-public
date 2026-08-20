# CFP Conditional Logic, Category Routing, and Seeded Proof — Requirements

**Type:** Improvement (surfacing + seeding) with one small additive schema change
**Status:** Planned — not implemented
**Priority:** High (brief requirement 1)
**Last Updated:** 2026-08-17
**Related packages:** `submission-form-builder/`, `form-builder-review/`, `public-cfp-submission/`,
`cfp-branding/`, `form-templates/`, `reviewer-assignment-by-filter/`

## Problem Statement

Conditional CFP logic and category-based routing are **already built and unit-tested** in this
codebase. `field_definitions.showIf` drives per-field visibility everywhere a form is rendered —
the public CFP, the portal task form, the submission editor, and the builder preview — and
`submission_forms.routingRules[]` assigns tags, tracks, sponsors, status, and reviewers at submit
time through `convex/categoryRouting.ts`.

None of it is visible in the demo. The seeded CFP has no conditional field. The one seeded routing
rule keys off `Session format == "Workshop"`, and every seeded submission is written with `"Talk"`,
so the rule has never fired against a seeded record. A judge inspecting this event concludes the
capability is absent.

There is also a genuine product gap underneath the demo gap: when a rule *does* fire, the
resulting submission carries no evidence of it. A submission that arrived in `accept_queue` with a
sponsor attached looks identical to one an organizer moved there by hand. That is a real
traceability defect, not just a demo problem — an organizer cannot audit why a proposal was routed.

## User Stories

**As a submitter** I want the form to ask only the questions relevant to what I selected **so that**
a lightning-talk proposal is not asked for workshop AV requirements.

**As a program chair** I want submissions to land pre-sorted by category **so that** I am not
hand-triaging every proposal into a track.

**As a program chair** I want to see *why* a submission has the status, track, sponsor, or reviewer
it has **so that** I can trust the routing and correct a bad rule.

**As a judge evaluating this product** I want conditional logic and routing to be demonstrable in
under a minute **so that** I do not have to take the feature list on faith.

### Acceptance Criteria

- GIVEN the seeded CFP WHEN a submitter selects `Session format = Talk` THEN the workshop-specific
  field is not rendered and is not required.
- GIVEN the same form WHEN the submitter changes the selection to `Workshop` THEN the
  workshop-specific field appears immediately without a page reload and participates in validation.
- GIVEN a submitter switches back from `Workshop` to `Talk` after typing into the conditional field
  THEN the field is hidden and its value is not submitted or validated.
- GIVEN a routing rule matching `Session format = Workshop` WHEN a matching submission is created
  through the public CFP THEN the configured tags, track, sponsor, status, and reviewer assignments
  are applied in one write.
- GIVEN a routed submission WHEN an organizer opens it THEN the UI names which rule produced the
  routing outcome.
- GIVEN a routing rule that references a deleted tag, track, or sponsor WHEN a submission matches
  THEN the submission is still created and the unresolvable part of the rule is skipped, not fatal.
- GIVEN the seeded demo event WHEN an organizer opens the CFP builder THEN at least one conditional
  field and at least two routing rules — one status/sponsor rule and one reviewer rule — are
  present and described in plain language.

## Functional Requirements

- FR-001: Do not rebuild conditional logic or routing. Both exist; this package seeds, surfaces, and
  makes them auditable.
- FR-002: Persist which routing rules were applied to a submission, by rule id, at submit time.
- FR-003: Render that provenance in the organizer submission view in plain language ("Status set to
  Accept queue by rule *Workshop fast-track*"), never as a raw id.
- FR-004: Seed a conditional field, workshop-format submissions, and a reviewer-routing rule into
  `convex/seed.ts:demo`, following its existing idempotent find-then-insert pattern.
- FR-005: Routing provenance is organizer-visible only. It must not leak into the public CFP, the
  speaker portal, the public embeds, or the blinded reviewer projection.
- FR-006: The public form's conditional projection continues to use `showIf.fieldKey` (the opaque
  public key), never a `field_definitions` document id.

## Non-Functional Requirements

- NFR-001 (compatibility): `submissions.routingAppliedRuleIds` is optional. Rows written before this
  change stay valid with no migration, matching the precedent for `evaluation_plans.criteria`.
- NFR-002 (security): Provenance must not be readable through `evaluations.myQueue` on a blinded
  plan; rule names can encode sponsor or track identity.
- NFR-003 (accessibility): A field appearing or disappearing on selection change must be announced,
  and focus must not be lost from the control that triggered it.
- NFR-004 (performance): No additional round trip. Conditional evaluation stays client-side in
  `DynamicFormRenderer`; provenance is computed in the existing submit mutation.

## Out of Scope

- Multi-condition logic (`AND`/`OR`, `not equals`, ranges). Today's model is a single
  `{ fieldId, equals }`. Extending it is a separate, larger piece of work and is not required by
  the brief.
- Rule ordering/priority UI. Rules currently all evaluate; conflicting rules are the author's
  problem.
- Routing on anything other than an exact field-value match.
- Any change to the public CFP's branding, abuse controls, or Turnstile flow.

## Success Metrics

- A judge observes a field appear on selection change within 60 seconds of opening the public CFP.
- 100% of seeded workshop-format submissions carry the routed sponsor and status.
- An organizer can name the rule responsible for any routed submission without reading the database.
</content>
