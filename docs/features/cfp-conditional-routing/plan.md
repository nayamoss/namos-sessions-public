# CFP Conditional Logic, Category Routing, and Seeded Proof — Plan

**Status:** Planned — DO NOT IMPLEMENT YET
**Phase in `kill-my-saas-brief/plan.md`:** 1 (seed) and a small slice of 2 (provenance)
**Estimated effort:** ~0.5 day for the seed work, ~0.5 day for provenance

## Task breakdown

### T1 — Seed a conditional field (no schema change)

**Files:** `convex/seed.ts`

1. Add `const workshopLengthField = await ensureField("Workshop length", "dropdown", true, { options: [...] })`.
   `ensureField` currently accepts `type: "text" | "wysiwyg" | "dropdown" | "email"` — `dropdown`
   is already in the union, no signature change.
2. Patch the created field with `showIf: { fieldId: String(formatField), equals: "Workshop" }`.
   `ensureField` returns early for existing fields, so on a rerun patch the `showIf` explicitly
   rather than relying on the insert path.
3. Append `String(workshopLengthField)` to `cfpPatch.sections[0].fieldIds`.

**Verification:** open `/events/ai-engineer-sandbox-event/program/forms/<id>/edit`; the field shows
"Shown when Session format is Workshop".

### T2 — Seed submissions that actually match the routing rules

**Files:** `convex/seed.ts`

1. In the submission loop, derive format from the index: `index % 4 === 1 ? "Workshop" : index % 7 === 0 ? "Panel" : "Talk"`.
2. Include the workshop-length answer only on workshop records, matching the conditional contract.
3. Existing rows are patched only when their `answers` shape is stale (the loop already does this);
   extend that condition so a rerun repairs format values too.

**Verification:** the submission list shows workshop records carrying the sponsor and
`accept_queue` status the seeded rule specifies.

### T3 — Seed a reviewer-routing rule

**Files:** `convex/seed.ts`

Add `seed-ops-review` to `cfpPatch.routingRules` using `program-chair@seed.invalid`, which the
reviewer-progress fixture already creates. `cfpPatch` is applied on every run via `ctx.db.patch`,
so this lands on existing seeded events without a reset.

### T4 — Routing provenance (schema + server)

**Files:** `convex/schema.ts`, `convex/categoryRouting.ts`, `convex/publicForms.ts`,
`convex/submissions.ts`

1. `submissions.routingAppliedRuleIds: v.optional(v.array(v.string()))`.
2. `RoutingResult.appliedRuleIds: string[]`; accumulate in the matcher.
3. Write it in `publicForms.submit`.
4. Add `submissions.routingProvenance` query, guarded by `assertEventOrganizerAccess`.
5. Backfill seeded rows in `convex/seed.ts`.

**Idempotency:** `publicForms.submit` already dedupes on
`submissions.by_form_idempotency` (`convex/schema.ts:291`); provenance is written in the same
insert, so a retried submit cannot double-write it.

### T5 — Provenance UI

**Files:** `src/pages/program/Abstracts.tsx`, `src/data/repo.ts`, `src/data/types.ts`

Add a `Routed on arrival` block to the submission detail panel. Omit the section entirely when no
rules fired. No new card surface, no border, no divider — reuse the existing detail-panel section
pattern.

### T6 — Builder rule summaries

**Files:** `src/pages/program/SubmissionFormBuilder.tsx`, new `src/lib/routing-rule-summary.ts`

Pure function `summarizeRoutingRule(rule, fields, tags, tracks, sponsors) → string`. Rendered as a
muted line under each rule row. Unit tested independently of the component.

### T7 — Accessibility

**Files:** `src/components/shared/DynamicFormRenderer.tsx`

Wrap the field list in `aria-live="polite"` so an appearing conditional field is announced. Verify
focus stays on the select that triggered the change.

## Test cases

| ID | Type | Case | Expected |
|---|---|---|---|
| TC-1 | unit | `DynamicFormRenderer` with `showIf` unmet | Field absent from the DOM, not merely hidden |
| TC-2 | unit | Value typed into a conditional field, then the parent changes | Value excluded from the submitted payload |
| TC-3 | unit | Conditional field marked `required`, condition unmet | Validation passes |
| TC-4 | unit | Conditional field `required`, condition met, empty | Validation fails with the field's own message |
| TC-5 | unit | `categoryRouting` — two rules match | Both ids in `appliedRuleIds`, effects merged, tags deduped |
| TC-6 | unit | Rule matches but `assignTrackId` target missing | Track not applied; rule id still recorded |
| TC-7 | unit | No rule matches | `appliedRuleIds` empty → field written as `undefined`, not `[]` |
| TC-8 | contract | `submissions.routingProvenance` called by a reviewer | Throws organizer-access error |
| TC-9 | contract | `evaluations.myQueue` response shape | Contains no provenance key (extends `src/test/reviewer-queue.test.tsx`) |
| TC-10 | unit | `summarizeRoutingRule` with a deleted sponsor | Renders "(sponsor no longer exists)" |
| TC-11 | seed | `convex/seed.ts:demo` run twice | No duplicate fields, rules, or submissions (extends `src/test/demo-seed.test.ts`) |

Existing suites that must stay green: `dynamic-form-conditional`, `category-routing`,
`cfp-form-builder`, `form-validation`, `submission-editing`, `public-cfp-security-contract`,
`seed-security-contract`.

## Browser verification steps

1. `/events/ai-engineer-sandbox-event/program/forms` → open the seeded CFP → confirm the
   conditional field and both routing rules render with plain-language summaries.
2. Open the builder's public preview → select `Talk` → count fields → select `Workshop` → confirm
   exactly one additional field appears and the count is stable on repeated toggling.
3. Open the real public form at `/submit/ai-engineer-sandbox-event/<formId>` → submit a workshop
   proposal with a real conditional answer.
4. Return to `/program/abstracts` → find that submission → confirm it arrived with the sponsor and
   `accept_queue` status **and** shows "Routed on arrival" naming the rule.
5. Sign in as a reviewer → confirm the submission detail shows no provenance block.
6. Repeat step 3 with `Panel` → confirm the reviewer-routing rule created an assignment.
7. Keyboard-only pass of step 2: tab to the format select, change with arrow keys, confirm the new
   field is announced and focus is retained.

## Rollback

All changes are additive. Rolling back means dropping the optional schema field (Convex tolerates
an unread optional field) and reverting the seed. No data migration, no destructive step.
</content>
