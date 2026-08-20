# CFP Conditional Logic, Category Routing, and Seeded Proof — Design

**Last Updated:** 2026-08-17
**Status:** Planned — not implemented

## Current implementation (verified by reading source, 2026-08-17)

### Conditional logic

| Layer | Location | Behaviour |
|---|---|---|
| Storage | `convex/schema.ts:226` | `field_definitions.showIf?: { fieldId: string; equals: string }` |
| Authoring | `src/pages/program/SubmissionFormBuilder.tsx:449-490` | A per-field "always / shown when" select plus a value input; the source-field select at `:294` resolves `showIf.fieldId` against the field's `recordId` |
| Evaluation | `src/components/shared/DynamicFormRenderer.tsx:17` | `!field.showIf \|\| values[field.showIf.fieldId] === field.showIf.equals` |
| Builder preview | `src/components/forms/CfpPreviewPanel.tsx:77-86` | Carries `showIf` through to the preview renderer |
| Public projection | `src/data/types.ts:319`, `convex/publicForms.ts` | Public fields expose `showIf: { fieldKey, equals }` — an opaque key, never a document id |
| Public render | `src/pages/public/SubmissionPage.tsx:46` | Maps `fieldKey` back onto `DynamicField.showIf.fieldId` for the shared renderer |
| Portal render | `src/pages/portal/PortalTaskFormPage.tsx:14`, `PortalSubmissionEdit.tsx:65` | Same renderer, same semantics |
| Tests | `src/test/dynamic-form-conditional.test.tsx`, `src/test/submission-editing.test.ts:34`, `src/test/cfp-form-builder.test.tsx` | |

**Assessment:** complete and consistent across all four render surfaces. No change required.

### Category routing

`submission_forms.routingRules[]` (`convex/schema.ts:214-223`):

```ts
{ id, fieldId, equals,
  assignTagIds?: Id<"tags">[], assignTrackId?: Id<"tracks">, assignSponsorId?: Id<"sponsors">,
  setStatus?: "pending" | "accept_queue" | "accepted" | "maybe",
  reviewerUserIds?: string[] }
```

`convex/categoryRouting.ts` exports `normalizeRoutingRules` (dedupes and trims on save) and the
matcher that produces a `RoutingResult`. It is applied inside `convex/publicForms.ts:130`
(`submit`, an `internalMutation`). Covered by `src/test/category-routing.test.ts` and
`src/test/assignment-filter.test.ts`.

**Assessment:** complete. The only change is recording the outcome.

## Gap analysis

| Gap | Evidence | Kind |
|---|---|---|
| No conditional field in the demo | `convex/seed.ts:76-93` — the seeded CFP's two sections list four fields, none with `showIf` | Demo |
| Routing rule never fires | `convex/seed.ts` `cfpPatch.routingRules` matches `Workshop`; the 500-submission loop writes `[formatField]: "Talk"` unconditionally | Demo |
| No reviewer-routing example | `reviewerUserIds` is supported but unseeded | Demo |
| No routing provenance | `submissions` has no field recording which rules fired | **Product** |

## Schema change

One additive, optional field on `submissions` (`convex/schema.ts:274-291`):

```ts
// Which routingRules ids produced this submission's initial tags/track/sponsor/status/reviewers.
// Optional: rows created before routing provenance existed stay valid with no migration, and an
// organizer-set status change never writes here — this records arrival, not later edits.
routingAppliedRuleIds: v.optional(v.array(v.string())),
```

No index. It is read only when a single submission is already loaded.

## Convex signatures

**Changed — `convex/categoryRouting.ts`**

```ts
export type RoutingResult = {
  assignTagIds?: Id<"tags">[];
  assignTrackId?: Id<"tracks">;
  assignSponsorId?: Id<"sponsors">;
  setStatus?: RoutingStatus;
  reviewerUserIds?: string[];
  appliedRuleIds: string[];   // NEW — ordered, deduped, ids of every rule that matched
};
```

The matcher already iterates rules; it accumulates `rule.id` into `appliedRuleIds` when a rule
matches. Unresolvable references (a `assignTrackId` whose track was deleted) are skipped for the
assignment but the rule id is still recorded, with the skip surfaced in the UI as "rule matched,
target no longer exists".

**Changed — `convex/publicForms.ts:130` `submit`**
Writes `routingAppliedRuleIds: result.appliedRuleIds.length ? result.appliedRuleIds : undefined`
into the `submissions` insert. No new authorization; this path is already an `internalMutation`
called behind the edge CFP secret.

**New — `convex/submissions.ts` `routingProvenance`**

```ts
export const routingProvenance = query({
  args: { eventId: v.id("events"), submissionId: v.id("submissions") },
  // assertEventOrganizerAccess — organizer only. Never assertEventAccess: a reviewer on a
  // blinded plan must not learn sponsor/track identity through a rule name.
  handler: async (ctx, args) => /* → { ruleId, ruleLabel, effects: string[], unresolved: boolean }[] */
});
```

`ruleLabel` is derived server-side from the form's rule plus the referenced field's label
("Session format is Workshop"), so the client never has to join `field_definitions`.

## Authorization

| Surface | Guard | Rationale |
|---|---|---|
| `routingProvenance` | `assertEventOrganizerAccess` (`convex/functions.ts:121`) | Rule names can encode sponsor and track identity |
| Public CFP submit | unchanged — edge secret + Turnstile path | Already correct |
| `evaluations.myQueue` | unchanged | Must not gain a provenance field; blind-review projection removes keys entirely (`convex/evaluations.ts`) |
| Portal / embeds | no access | Provenance is internal program state |

## UI states

**Organizer submission detail** (`src/pages/program/Abstracts.tsx` detail panel):

| State | Render |
|---|---|
| Loading | Existing skeleton; no separate spinner for provenance |
| No rules fired | Section omitted entirely — not "No routing applied", which reads as a failure |
| Rules fired | `Routed on arrival` block: one line per rule, e.g. *"Session format is Workshop → sponsor Convex, status Accept queue"* |
| Rule target deleted | Same line with a muted suffix: *"(track no longer exists)"* |
| Error | Inline `role="alert"`; the rest of the detail panel still renders |

**CFP builder** (`SubmissionFormBuilder.tsx`): no structural change. Add a plain-language summary
line beneath each routing rule so a judge reading the builder understands the rule without decoding
selects. This is text only — no new controls, no layout change.

**Public CFP** (`SubmissionPage.tsx`): no change. Conditional fields already appear/disappear on
selection. Add `aria-live="polite"` to the section wrapper so an appearing field is announced.

## Seed changes (`convex/seed.ts`)

All additive and idempotent, following the existing `ensureField` / find-then-insert pattern.

1. `ensureField("Workshop length", "dropdown", true, { options: ["90 minutes", "half day", "full day"] })`
   with `showIf: { fieldId: String(formatField), equals: "Workshop" }`, appended to the
   `seed-abstract` section's `fieldIds`.
2. Change the submission loop so roughly one in four records writes
   `[formatField]: "Workshop"` and carries the workshop-length answer.
3. Add a second routing rule:
   `{ id: "seed-ops-review", fieldId: formatField, equals: "Panel", assignTrackId: trackIds[2], reviewerUserIds: ["program-chair@seed.invalid"] }`
   — this reuses the reviewer fixture already seeded for reviewer progress.
4. Backfill `routingAppliedRuleIds` on seeded workshop/panel submissions so provenance is visible
   without re-submitting through the public form.

## Risks

| Risk | Mitigation |
|---|---|
| Seeded submissions bypass `publicForms.submit`, so seeded provenance is asserted rather than produced | The verification gate requires one **live** submission through the public CFP, not a seeded row |
| A rule id is not stable if a rule is deleted and re-added | `routingProvenance` degrades to "rule no longer exists" rather than erroring |
| Rule names leak into a future public surface | Provenance is organizer-gated at the query, not filtered at the component |
</content>
